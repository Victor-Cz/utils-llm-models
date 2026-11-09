/**
 * Sanity check of a freshly synced `models.json` against the previous one, run by the
 * workflow before it merges the sync PR on its own. Exits 1 (the PR then stays open and the
 * failed run is notified) when a provider ends up with no models, or loses more than half of
 * them at once: on 2026-08-31 a doc page that named no Claude model wiped Anthropic, silently.
 *
 * Usage: tsx scripts/check.ts <previous models.json>
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_IDS } from "./providers.js";
import type { Catalog, ProviderId } from "./types.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_PATH = resolve(ROOT, "models.json");

/** A provider may not lose more than this share of its models in one sync */
const MAX_LOSS = 0.5;

async function counts(path: string): Promise<Map<ProviderId, number>> {
    const catalog = JSON.parse(await readFile(path, "utf8")) as Catalog;
    return new Map(catalog.map((entry) => [entry.provider, entry.models.length]));
}

async function main(): Promise<void> {
    const previousPath = process.argv[2];
    if (!previousPath) throw new Error("Usage: tsx scripts/check.ts <previous models.json>");

    const previous = await counts(previousPath);
    const current = await counts(CURRENT_PATH);

    const problems: string[] = [];
    for (const provider of PROVIDER_IDS) {
        const before = previous.get(provider) ?? 0;
        const after = current.get(provider) ?? 0;
        console.log(`  ${provider}: ${before} → ${after} models`);
        if (after === 0) {
            problems.push(`${provider} has no models left`);
        } else if (before > 0 && (before - after) / before > MAX_LOSS) {
            problems.push(`${provider} lost ${before - after} of its ${before} models`);
        }
    }

    if (problems.length > 0) {
        console.error(`✗ Catalog looks wrong, not merging:\n  - ${problems.join("\n  - ")}`);
        process.exit(1);
    }
    console.log("✓ Catalog looks sane");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
