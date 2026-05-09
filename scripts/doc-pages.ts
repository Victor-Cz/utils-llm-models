import { dateStem } from "./filters.js";
import { PROVIDERS } from "./providers.js";
import type { ProviderId } from "./types.js";

/** Providers whose doc page is server-rendered and scrapable. OpenAI's is JS-rendered + 403. */
export const PAGE_FILTERABLE: ReadonlySet<ProviderId> = new Set(["anthropic", "google", "mistral"]);

export type PageMatch = {
    /** True if any matching variant of the label appears on the page. */
    found: boolean;
    /** Index of first occurrence in the page text; `Infinity` when not found. */
    position: number;
};

export async function fetchDocPage(providerId: ProviderId): Promise<string | null> {
    const cfg = PROVIDERS[providerId];
    const candidates = [cfg.docs_markdown_url, cfg.model_docs].filter(
        (u): u is string => typeof u === "string",
    );
    for (const url of candidates) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (compatible; utils-llm-models-sync/1.0; +https://github.com)",
                    Accept: "text/markdown, text/html;q=0.9, */*;q=0.8",
                },
            });
            if (!res.ok) continue;
            const text = await res.text();
            if (text.trim().length > 100) return text;
        } catch {
            // try next candidate
        }
    }
    return null;
}

export type PageCache = Partial<Record<ProviderId, string>>;

export async function fetchPagesForFiltering(
    providerIds: readonly ProviderId[],
): Promise<PageCache> {
    const cache: PageCache = {};
    await Promise.all(
        providerIds
            .filter((p) => PAGE_FILTERABLE.has(p))
            .map(async (p) => {
                const page = await fetchDocPage(p);
                if (page) cache[p] = page;
            }),
    );
    return cache;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Multi-strategy label match against page content:
 *  1) exact substring
 *  2) for `*-latest`: prefix followed by a version suffix
 *  3) variant with dots replaced by dashes (Google: `gemini-2-5-flash`)
 *  4) date-stripped stem (LiteLLM `mistral-medium-3-1-2508` vs page `mistral-medium-3-1-25-08`)
 */
export function findInPage(label: string, page: string): PageMatch {
    const direct = page.indexOf(label);
    if (direct >= 0) return { found: true, position: direct };

    if (label.endsWith("-latest")) {
        const prefix = label.slice(0, -"-latest".length);
        const rx = new RegExp(`\\b${escapeRegex(prefix)}-?\\d`);
        const m = page.match(rx);
        if (m && m.index !== undefined) {
            return { found: true, position: m.index };
        }
    }

    if (label.includes(".")) {
        const dashed = label.replace(/\./g, "-");
        const idx = page.indexOf(dashed);
        if (idx >= 0) return { found: true, position: idx };
    }

    const stem = dateStem(label);
    if (stem !== label && stem.length > 0) {
        const idx = page.indexOf(stem);
        if (idx >= 0) return { found: true, position: idx };
    }

    return { found: false, position: Infinity };
}
