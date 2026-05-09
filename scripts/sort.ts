import type { Model } from "./types.js";

export type Version = { major: number; minor: number };

const LATEST_VERSION: Version = { major: Infinity, minor: Infinity };

/**
 * Best-effort version extraction from a label.
 * - "*-latest" → highest possible (these aliases always point to the most recent)
 * - "claude-opus-4-7", "gpt-5.4", "gemini-3.1-pro-preview", "mistral-large-3" → first numeric token
 * - Falls back to null when no number is found.
 */
export function extractVersion(label: string): Version | null {
    if (label.endsWith("-latest")) return LATEST_VERSION;

    const match = label.match(/(\d+)(?:[.\-](\d+))?/);
    if (!match) return null;

    return {
        major: parseInt(match[1], 10),
        minor: match[2] ? parseInt(match[2], 10) : 0,
    };
}

function cmpDesc(a: number, b: number): number {
    if (a === b) return 0;
    return a < b ? 1 : -1;
}

function compareVersions(a: Version | null, b: Version | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;   // unknown → after
    if (b === null) return -1;
    const major = cmpDesc(a.major, b.major);
    if (major !== 0) return major;
    return cmpDesc(a.minor, b.minor);
}

function outputPrice(model: Model): number | null {
    return model.pricing?.["1m_tokens"]?.output ?? null;
}

/** Sort: version desc → output price desc → label asc. */
export function compareByVersionThenPrice(a: Model, b: Model): number {
    const v = compareVersions(extractVersion(a.label), extractVersion(b.label));
    if (v !== 0) return v;

    const pa = outputPrice(a);
    const pb = outputPrice(b);
    if (pa === null && pb === null) return a.label.localeCompare(b.label);
    if (pa === null) return 1;
    if (pb === null) return -1;
    const price = cmpDesc(pa, pb);
    if (price !== 0) return price;

    return a.label.localeCompare(b.label);
}
