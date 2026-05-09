import type { EnrichmentFilters } from "./types.js";

const DATED_SUFFIX_PATTERNS: RegExp[] = [
    /-\d{3,}$/,             // -001, -002, -1106, -2402, -20240307
    /-\d{4}-\d{2}-\d{2}$/,  // -2024-05-13 (ISO date)
    /-\d{2}-\d{4}$/,        // -09-2025 (Google preview style)
    /-\d{4}-\d{2}$/,        // -2025-09
];

export function isDatedSnapshot(label: string): boolean {
    return DATED_SUFFIX_PATTERNS.some((rx) => rx.test(label));
}

/** The label minus its dated suffix; returns the input unchanged if no suffix matches. */
export function dateStem(label: string): string {
    for (const rx of DATED_SUFFIX_PATTERNS) {
        const m = label.match(rx);
        if (m) return label.slice(0, label.length - m[0].length);
    }
    return label;
}

/** Best-effort numeric weight of a date suffix for "most recent" selection. Higher = newer. */
function dateRank(label: string): number {
    const m = label.match(/-(\d{3,})$/);
    if (m) return parseInt(m[1], 10);
    const iso = label.match(/-(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return parseInt(iso[1] + iso[2] + iso[3], 10);
    return 0;
}

export function shouldExclude(label: string, filters: EnrichmentFilters | undefined): boolean {
    if (!filters) return false;
    if (filters.exclude_patterns) {
        for (const pattern of filters.exclude_patterns) {
            try {
                if (new RegExp(pattern).test(label)) return true;
            } catch {
                console.warn(`  ⚠ Invalid regex in filters.exclude_patterns: ${pattern}`);
            }
        }
    }
    return false;
}

/**
 * Smart deduplication of dated snapshots:
 * - For each group sharing the same dateStem, if ANY non-dated entry exists, drop dated ones.
 * - Otherwise keep the one with the highest dateRank.
 * - Returns the labels that should be kept.
 */
export function smartDedupDated<T extends { label: string }>(
    items: T[],
    enabled: boolean,
): T[] {
    if (!enabled) return items;

    const groups = new Map<string, T[]>();
    for (const item of items) {
        const stem = dateStem(item.label);
        const arr = groups.get(stem);
        if (arr) arr.push(item);
        else groups.set(stem, [item]);
    }

    const kept: T[] = [];
    for (const group of groups.values()) {
        const nonDated = group.filter((g) => !isDatedSnapshot(g.label));
        if (nonDated.length > 0) {
            kept.push(...nonDated);
        } else {
            const best = group.reduce((a, b) => (dateRank(b.label) > dateRank(a.label) ? b : a));
            kept.push(best);
        }
    }

    // Supersede: drop dated entry D with stem S when a non-dated sibling N exists where:
    //   - N == S + "-latest"  (e.g., `pixtral-large-latest` supersedes `pixtral-large-2411`)
    //   - N starts with S + "-<digit>"  (e.g., `mistral-large-3` supersedes `mistral-large-2512`)
    const nonDatedLabels = new Set(kept.filter((k) => !isDatedSnapshot(k.label)).map((k) => k.label));
    return kept.filter((entry) => {
        if (!isDatedSnapshot(entry.label)) return true;
        const baseStem = dateStem(entry.label);
        if (nonDatedLabels.has(baseStem + "-latest")) return false;
        const prefix = baseStem + "-";
        for (const other of nonDatedLabels) {
            if (other.startsWith(prefix) && /^\d/.test(other.slice(prefix.length))) {
                return false;
            }
        }
        return true;
    });
}
