import { PROVIDERS } from "./providers.js";
import type { ModelCapability, ModelPricing, ProviderId } from "./types.js";

const LITELLM_URL =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** LiteLLM modes we keep in our catalog. Everything else (embedding, moderation, ocr, video_generation, responses) is dropped. */
export const KEPT_MODES = new Set([
    "chat",
    "image_generation",
    "audio_transcription",
    "audio_speech",
    "realtime",
]);

export type LiteLLMMode =
    | "chat"
    | "image_generation"
    | "audio_transcription"
    | "audio_speech"
    | "realtime";

type LiteLLMEntry = {
    litellm_provider?: string;
    mode?: string;
    max_input_tokens?: number;
    max_output_tokens?: number;
    max_tokens?: number;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    cache_creation_input_token_cost?: number;
    cache_read_input_token_cost?: number;
    input_cost_per_image?: number;
    output_cost_per_image?: number;
    input_cost_per_second?: number;
    output_cost_per_second?: number;
    input_cost_per_character?: number;
    output_cost_per_character?: number;
    supports_vision?: boolean;
    supports_function_calling?: boolean;
    supports_audio_input?: boolean;
    supports_audio_output?: boolean;
    supports_pdf_input?: boolean;
    supports_reasoning?: boolean;
    supports_prompt_caching?: boolean;
    deprecation_date?: string;
};

export type NormalizedLiteLLMModel = {
    label: string;
    provider: ProviderId;
    mode: LiteLLMMode;
    context_window: { input: number | null; output: number | null };
    capabilities: ModelCapability[];
    pricing: ModelPricing | null;
    deprecation_date: string | null;
};

const PROVIDER_BY_LITELLM: Record<string, ProviderId> = Object.fromEntries(
    (Object.entries(PROVIDERS) as Array<[ProviderId, (typeof PROVIDERS)[ProviderId]]>).map(
        ([providerId, cfg]) => [cfg.litellm_provider, providerId],
    ),
);

function stripProviderPrefix(key: string): string {
    const slashIdx = key.indexOf("/");
    if (slashIdx === -1) return key;
    return key.slice(slashIdx + 1);
}

function isDeprecated(entry: LiteLLMEntry): boolean {
    return Boolean(entry.deprecation_date);
}

function extractCapabilities(entry: LiteLLMEntry): ModelCapability[] {
    const caps: ModelCapability[] = [];
    if (entry.supports_vision) caps.push("vision");
    if (entry.supports_function_calling) caps.push("function_calling");
    if (entry.supports_audio_input) caps.push("audio_input");
    if (entry.supports_audio_output) caps.push("audio_output");
    if (entry.supports_pdf_input) caps.push("pdf_input");
    if (entry.supports_reasoning) caps.push("reasoning");
    if (entry.supports_prompt_caching) caps.push("prompt_caching");
    return caps;
}

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

function extractPricing(entry: LiteLLMEntry): ModelPricing | null {
    const pricing: ModelPricing = {};

    if (entry.input_cost_per_token != null && entry.output_cost_per_token != null) {
        pricing["1m_tokens"] = {
            input: round(entry.input_cost_per_token * 1_000_000),
            output: round(entry.output_cost_per_token * 1_000_000),
        };
        if (entry.cache_creation_input_token_cost != null) {
            pricing["1m_tokens"].cache_write = round(entry.cache_creation_input_token_cost * 1_000_000);
        }
        if (entry.cache_read_input_token_cost != null) {
            pricing["1m_tokens"].cache_read = round(entry.cache_read_input_token_cost * 1_000_000);
        }
    }

    if (entry.output_cost_per_image != null || entry.input_cost_per_image != null) {
        pricing.per_image = {};
        if (entry.input_cost_per_image != null) pricing.per_image.input = round(entry.input_cost_per_image);
        if (entry.output_cost_per_image != null) pricing.per_image.output = round(entry.output_cost_per_image);
    }

    if (entry.input_cost_per_second != null || entry.output_cost_per_second != null) {
        pricing.per_minute = {};
        if (entry.input_cost_per_second != null) pricing.per_minute.input = round(entry.input_cost_per_second * 60);
        if (entry.output_cost_per_second != null) pricing.per_minute.output = round(entry.output_cost_per_second * 60);
    }

    if (entry.input_cost_per_character != null || entry.output_cost_per_character != null) {
        pricing.per_1m_characters = {};
        if (entry.input_cost_per_character != null) pricing.per_1m_characters.input = round(entry.input_cost_per_character * 1_000_000);
        if (entry.output_cost_per_character != null) pricing.per_1m_characters.output = round(entry.output_cost_per_character * 1_000_000);
    }

    return Object.keys(pricing).length > 0 ? pricing : null;
}

export async function fetchLiteLLMCatalog(): Promise<NormalizedLiteLLMModel[]> {
    const res = await fetch(LITELLM_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch LiteLLM catalog: HTTP ${res.status}`);
    }
    const raw = (await res.json()) as Record<string, LiteLLMEntry>;

    const seen = new Map<string, NormalizedLiteLLMModel>();

    for (const [key, entry] of Object.entries(raw)) {
        if (key === "sample_spec") continue;
        if (!entry.mode || !KEPT_MODES.has(entry.mode)) continue;
        if (!entry.litellm_provider) continue;

        const providerId = PROVIDER_BY_LITELLM[entry.litellm_provider];
        if (!providerId) continue;
        if (isDeprecated(entry)) continue;

        const label = stripProviderPrefix(key);
        // Skip composite/sized image labels like `1024-x-1024/dall-e-2` whose stripped form starts with the size.
        if (/^\d+-x-\d+$/.test(label.split("/")[0] ?? "")) continue;
        if (/^\d+-x-\d+-/.test(label)) continue;

        const dedupKey = `${providerId}:${label}`;
        if (seen.has(dedupKey)) continue;

        seen.set(dedupKey, {
            label,
            provider: providerId,
            mode: entry.mode as LiteLLMMode,
            context_window: {
                input: entry.max_input_tokens ?? null,
                output: entry.max_output_tokens ?? entry.max_tokens ?? null,
            },
            capabilities: extractCapabilities(entry),
            pricing: extractPricing(entry),
            deprecation_date: entry.deprecation_date ?? null,
        });
    }

    return [...seen.values()].sort((a, b) => {
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
        return a.label.localeCompare(b.label);
    });
}
