export type ProviderId = "anthropic" | "openai" | "google" | "mistral" | "replicate" | "recraft";

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
    /**
     * Image tokens per 1M tokens, like `1m_tokens` (image models billed by the token, e.g. gpt-image-2.x).
     * `input` = image tokens sent (edits, references), `output` = image tokens generated.
     */
    image_tokens?: { input?: number; output?: number };
    /**
     * Per second of generated video (video_generation models). `output` is the default price;
     * `by_resolution` holds the price per resolution when the provider bills them differently
     * (keys as LiteLLM names them: "480p", "720p", "768p", "1080p", "2k", "4k").
     */
    per_second?: { output?: number; by_resolution?: Record<string, number> };
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
    | "video"          // video generation (Veo, Wan, Kling, Seedance…)
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
    /**
     * Per-provider regex patterns matched against the LiteLLM id without its provider prefix
     * (e.g. `black-forest-labs/flux-1.1-pro` for `replicate/black-forest-labs/flux-1.1-pro`).
     * For providers with no usable doc page (Replicate, Recraft), they replace the page filter.
     */
    provider_patterns?: Partial<Record<ProviderId, ProviderPatterns>>;
};

export type ProviderPatterns = {
    /** If set, only ids matching at least one of these are kept. */
    include?: string[];
    /** Ids matching any of these are dropped (applied after `include`). */
    exclude?: string[];
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
