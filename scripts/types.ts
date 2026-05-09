export type ProviderId = "anthropic" | "openai" | "google" | "mistral";

export type Localized = {
    en: string;
    fr: string;
};

export type ProviderInfos = {
    name: Localized;
    logo: string;
    model_docs: string;
};

export type ModelPricing = {
    "1m_tokens"?: {
        input: number;
        output: number;
        cache_write?: number;
        cache_read?: number;
    };
    /** Per generated image (for image_generation models). */
    per_image?: { input?: number; output?: number };
    /** Per minute of audio (for audio_transcription / realtime). */
    per_minute?: { input?: number; output?: number };
    /** Per 1M characters (for audio_speech / TTS models). */
    per_1m_characters?: { input?: number; output?: number };
};

export type ModelCapability =
    | "vision"
    | "function_calling"
    | "audio_input"
    | "audio_output"
    | "pdf_input"
    | "reasoning"
    | "prompt_caching";

/** Main purpose of a model (for grouping/filtering by intent). */
export type ModelCategory =
    | "chat"
    | "code"
    | "reasoning"
    | "image"          // image-first: Pixtral (vision-input), DALL-E / Imagen / gpt-image-1 (generation)
    | "transcription"  // audio → text (Whisper, gpt-4o-transcribe)
    | "speech"         // text → audio (TTS, gpt-4o-mini-tts, gemini-tts)
    | "realtime";      // bidirectional voice (gpt-realtime, gpt-audio, gemini-live)

/** Modalities the model can accept as input or produce as output (for capability filtering). */
export type Format = "text" | "image" | "audio" | "video" | "pdf";

export type Model = {
    label: string;
    name: Localized;
    logo: string;
    llm_config: string | null;
    description: Localized | null;
    context_window: {
        input: number | null;
        output: number | null;
    };
    capabilities: ModelCapability[];
    /** Purpose-categories the model qualifies for. Use to filter by intent (chat, code, reasoning…). */
    categories: ModelCategory[];
    /** Modalities the model accepts as input. Use to filter "models that take audio", etc. */
    input_formats: Format[];
    /** Modalities the model produces as output. Use to filter "models that return images", etc. */
    output_formats: Format[];
    pricing: ModelPricing | null;
    deprecation_date: string | null;
};

export type ProviderCatalog = {
    provider: ProviderId;
    provider_infos: ProviderInfos;
    models: Model[];
};

export type Catalog = ProviderCatalog[];

export type EnrichmentEntry = Partial<{
    name: Localized;
    logo: string;
    llm_config: string | null;
    description: Localized;
    /** Replace the auto-derived categories entirely. */
    categories: ModelCategory[];
    /** Override the auto-derived input formats. */
    input_formats: Format[];
    /** Override the auto-derived output formats. */
    output_formats: Format[];
}>;

export type ProviderEnrichment = Partial<ProviderInfos> & {
    /** Fallback logo applied to every model of this provider when none is set on the model itself. */
    default_model_logo?: string;
};

export type EnrichmentFilters = {
    /** Drop entries whose label looks like a dated snapshot (e.g. `claude-opus-4-5-20251101`). */
    exclude_dated?: boolean;
    /** Regex patterns; any model whose label matches any of these is dropped. */
    exclude_patterns?: string[];
    /**
     * If true, only keep models whose label is mentioned on the provider's official doc page.
     * Skipped silently for providers whose docs are not server-rendered (OpenAI).
     */
    filter_by_doc_page?: boolean;
};

export type EnrichmentOrder = {
    /** Display order of providers in the output array. Providers not listed go last, alphabetical. */
    providers?: ProviderId[];
    /**
     * Display order of models within each provider. Models not listed go after, sorted by
     * either their position on the doc page (when filter_by_doc_page is on) or alphabetical.
     */
    models?: Partial<Record<ProviderId, string[]>>;
};

export type Enrichment = {
    providers: Partial<Record<ProviderId, ProviderEnrichment>>;
    models: Partial<Record<string, EnrichmentEntry>>;
    filters?: EnrichmentFilters;
    order?: EnrichmentOrder;
};
