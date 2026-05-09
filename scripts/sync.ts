import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveCategories } from "./categories.js";
import { deriveFormats } from "./formats.js";
import { extractDescriptions, makeAnthropicClient } from "./descriptions.js";
import {
    fetchPagesForFiltering,
    findInPage,
    PAGE_FILTERABLE,
    type PageCache,
} from "./doc-pages.js";
import { shouldExclude, smartDedupDated } from "./filters.js";
import { fetchLiteLLMCatalog, type NormalizedLiteLLMModel } from "./litellm.js";
import { PROVIDERS, PROVIDER_IDS } from "./providers.js";
import { compareByVersionThenPrice } from "./sort.js";
import type {
    Catalog,
    Enrichment,
    Localized,
    Model,
    ModelCategory,
    ProviderCatalog,
    ProviderId,
} from "./types.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENRICHMENT_PATH = resolve(ROOT, "enrichment.json");
const OUTPUT_PATH = resolve(ROOT, "models.json");

async function readJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const content = await readFile(path, "utf8");
        if (content.trim() === "") return fallback;
        return JSON.parse(content) as T;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
        throw err;
    }
}

function deriveDisplayName(label: string): string {
    const stripped = label
        .replace(/-\d{8}$/, "")
        .replace(/-\d{4}-\d{2}-\d{2}$/, "")
        .replace(/-\d{2}-\d{4}$/, "")
        .replace(/-\d{4}-\d{2}$/, "")
        .replace(/-\d{3,}$/, "");            // -001, -002, -2402, -20240307
    const parts = stripped.split(/[-_/]/).filter(Boolean);
    const merged: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const next = parts[i + 1];
        if (/^\d+$/.test(part) && next && /^\d+$/.test(next)) {
            merged.push(`${part}.${next}`);
            i++;
            continue;
        }
        merged.push(part);
    }
    const name = merged
        .map((part) => {
            if (/^\d+b$/i.test(part)) return part.toUpperCase();   // 14b → 14B (before generic digit rule)
            if (/^\d/.test(part)) return part;
            if (/^v\d+/i.test(part)) return part.toLowerCase();
            const lower = part.toLowerCase();
            if (lower === "gpt") return "GPT";
            if (lower === "chatgpt") return "ChatGPT";
            if (lower === "tts") return "TTS";
            if (lower === "hd") return "HD";
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(" ");
    return name.replace(/^Dall E\b/, "DALL-E");
}

function previousModelByLabel(previous: Catalog | null, providerId: ProviderId): Map<string, Model> {
    const map = new Map<string, Model>();
    if (!previous) return map;
    const providerEntry = previous.find((p) => p.provider === providerId);
    if (!providerEntry) return map;
    for (const m of providerEntry.models) map.set(m.label, m);
    return map;
}

function buildModel(
    norm: NormalizedLiteLLMModel,
    enrichment: Enrichment,
    description: Localized | null,
): Model {
    const override = enrichment.models[norm.label] ?? {};
    const fallbackName = deriveDisplayName(norm.label);
    const providerEnrichment = enrichment.providers[norm.provider] ?? {};
    const autoCats = deriveCategories(norm.label, norm.capabilities, norm.mode);
    const categories: ModelCategory[] = override.categories ?? autoCats;
    const autoFormats = deriveFormats(norm.label, norm.capabilities, norm.mode);
    return {
        label: norm.label,
        name: override.name ?? { en: fallbackName, fr: fallbackName },
        logo: override.logo ?? providerEnrichment.default_model_logo ?? "",
        llm_config: override.llm_config !== undefined ? override.llm_config : "default",
        description: override.description ?? description,
        context_window: norm.context_window,
        capabilities: norm.capabilities,
        categories,
        input_formats: override.input_formats ?? autoFormats.input_formats,
        output_formats: override.output_formats ?? autoFormats.output_formats,
        pricing: norm.pricing,
        deprecation_date: norm.deprecation_date,
    };
}

function applyDocPageFilter(
    candidates: NormalizedLiteLLMModel[],
    providerId: ProviderId,
    pages: PageCache,
): { kept: NormalizedLiteLLMModel[]; dropped: string[] } {
    const page = pages[providerId];
    if (!page) return { kept: candidates, dropped: [] };

    const kept: NormalizedLiteLLMModel[] = [];
    const dropped: string[] = [];
    for (const m of candidates) {
        // The configured doc page only covers chat models; specialized modes have their own
        // pages (Imagen, Whisper, TTS, etc.) we don't fetch — pass them through.
        if (m.mode !== "chat") {
            kept.push(m);
            continue;
        }
        if (findInPage(m.label, page).found) kept.push(m);
        else dropped.push(m.label);
    }
    return { kept, dropped };
}

function sortProviders(catalog: Catalog, order: ProviderId[] | undefined): Catalog {
    if (!order || order.length === 0) {
        return [...catalog].sort((a, b) => a.provider.localeCompare(b.provider));
    }
    const rank = new Map<ProviderId, number>();
    order.forEach((p, i) => rank.set(p, i));
    return [...catalog].sort((a, b) => {
        const ra = rank.get(a.provider) ?? Infinity;
        const rb = rank.get(b.provider) ?? Infinity;
        if (ra !== rb) return ra - rb;
        return a.provider.localeCompare(b.provider);
    });
}

function sortModels(models: Model[], explicitOrder: string[] | undefined): Model[] {
    return [...models].sort((a, b) => {
        if (explicitOrder && explicitOrder.length > 0) {
            const ra = explicitOrder.indexOf(a.label);
            const rb = explicitOrder.indexOf(b.label);
            const sa = ra === -1 ? Infinity : ra;
            const sb = rb === -1 ? Infinity : rb;
            if (sa !== sb) return sa - sb;
            if (sa !== Infinity) return 0;
        }
        return compareByVersionThenPrice(a, b);
    });
}

async function main() {
    console.log("→ Fetching LiteLLM catalog…");
    const rawNormalized = await fetchLiteLLMCatalog();
    console.log(`  ${rawNormalized.length} chat models matched across our 4 providers`);

    const enrichment = await readJson<Enrichment>(ENRICHMENT_PATH, {
        providers: {},
        models: {},
    });

    const afterRegex = rawNormalized.filter((m) => !shouldExclude(m.label, enrichment.filters));
    const regexFilteredOut = rawNormalized.length - afterRegex.length;
    if (regexFilteredOut > 0) {
        console.log(
            `  ${regexFilteredOut} models filtered out by enrichment.filters → ${afterRegex.length} kept`,
        );
    }

    const dedupEnabled = enrichment.filters?.exclude_dated === true;
    const afterDedup = PROVIDER_IDS.flatMap((p) =>
        smartDedupDated(afterRegex.filter((m) => m.provider === p), dedupEnabled),
    );
    const dedupedOut = afterRegex.length - afterDedup.length;
    if (dedupEnabled && dedupedOut > 0) {
        console.log(
            `  ${dedupedOut} dated snapshots merged via smart-dedup → ${afterDedup.length} kept`,
        );
    }

    const filterByPage = enrichment.filters?.filter_by_doc_page === true;
    let pages: PageCache = {};
    if (filterByPage) {
        console.log("→ Fetching provider doc pages for label filtering…");
        pages = await fetchPagesForFiltering(PROVIDER_IDS);
        const pageProvidersList = Object.keys(pages).join(", ") || "(none)";
        console.log(`  pages fetched: ${pageProvidersList}`);
        for (const p of PROVIDER_IDS) {
            if (!PAGE_FILTERABLE.has(p)) {
                console.log(`  ↪ ${p}: skipping page filter (docs not server-rendered)`);
            } else if (!pages[p]) {
                console.warn(`  ⚠ ${p}: doc page fetch failed, falling back to no page filter`);
            }
        }
    }

    const previous = await readJson<Catalog | null>(OUTPUT_PATH, null);
    const anthropicClient = makeAnthropicClient();
    if (!anthropicClient) {
        console.warn(
            "  ⚠ ANTHROPIC_API_KEY not set — skipping description extraction (existing descriptions are preserved)",
        );
    }

    const catalog: Catalog = [];
    const newlyAdded: string[] = [];

    for (const providerId of PROVIDER_IDS) {
        const providerCandidates = afterDedup.filter((m) => m.provider === providerId);

        const { kept, dropped } = filterByPage
            ? applyDocPageFilter(providerCandidates, providerId, pages)
            : { kept: providerCandidates, dropped: [] };

        if (filterByPage && dropped.length > 0) {
            console.log(`  ${providerId}: dropped ${dropped.length} not on doc page → ${kept.length} kept`);
        }

        const previousByLabel = previousModelByLabel(previous, providerId);

        const labelsNeedingDescription: string[] = [];
        for (const m of kept) {
            const override = enrichment.models[m.label];
            const prev = previousByLabel.get(m.label);
            const alreadyHas = override?.description ?? prev?.description;
            if (!alreadyHas) labelsNeedingDescription.push(m.label);
        }

        let descriptions: Record<string, Localized> = {};
        if (labelsNeedingDescription.length > 0 && anthropicClient) {
            console.log(
                `→ Extracting descriptions for ${labelsNeedingDescription.length} new ${providerId} model(s)…`,
            );
            try {
                descriptions = await extractDescriptions(
                    providerId,
                    labelsNeedingDescription,
                    anthropicClient,
                    pages[providerId],
                );
            } catch (err) {
                console.warn(`  ⚠ Description extraction failed for ${providerId}:`, err);
            }
        }

        const builtModels: Model[] = kept.map((norm) => {
            const prev = previousByLabel.get(norm.label);
            const description =
                enrichment.models[norm.label]?.description ??
                descriptions[norm.label] ??
                prev?.description ??
                null;
            const model = buildModel(norm, enrichment, description);
            if (!prev) newlyAdded.push(`${providerId}/${norm.label}`);
            return model;
        });

        const sortedModels = sortModels(
            builtModels,
            enrichment.order?.models?.[providerId],
        );

        const providerInfosOverride = enrichment.providers[providerId] ?? {};
        const providerCatalog: ProviderCatalog = {
            provider: providerId,
            provider_infos: {
                name: providerInfosOverride.name ?? PROVIDERS[providerId].name,
                logo: providerInfosOverride.logo ?? PROVIDERS[providerId].logo,
                model_docs: providerInfosOverride.model_docs ?? PROVIDERS[providerId].model_docs,
            },
            models: sortedModels,
        };
        catalog.push(providerCatalog);
    }

    const orderedCatalog = sortProviders(catalog, enrichment.order?.providers);

    await writeFile(OUTPUT_PATH, JSON.stringify(orderedCatalog, null, 4) + "\n", "utf8");

    const totalModels = orderedCatalog.reduce((sum, p) => sum + p.models.length, 0);
    console.log(`\n✓ Wrote ${OUTPUT_PATH}`);
    console.log(`  ${totalModels} models across ${orderedCatalog.length} providers`);
    if (newlyAdded.length > 0) {
        console.log(`\n  📌 New models since last run (${newlyAdded.length}):`);
        for (const id of newlyAdded) console.log(`    - ${id}`);
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
        const summary = [
            `## Sync results`,
            ``,
            `- **${totalModels}** models across **${orderedCatalog.length}** providers`,
            `- **${newlyAdded.length}** new model(s) since last run`,
            ``,
            ...(newlyAdded.length > 0
                ? [`### New models`, ``, ...newlyAdded.map((id) => `- \`${id}\``), ``]
                : []),
        ].join("\n");
        await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
