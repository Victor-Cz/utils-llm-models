import type { ProviderId, ProviderInfos } from "./types.js";

type ProviderConfig = ProviderInfos & {
    /** Value of `litellm_provider` in the LiteLLM JSON we want to keep for this provider. */
    litellm_provider: string;
    /** Optional alternate `.md` URL we try first; falls back to `model_docs` HTML. */
    docs_markdown_url?: string;
    /**
     * Label = last segment of the LiteLLM id (`black-forest-labs/flux-1.1-pro` → `flux-1.1-pro`),
     * for providers whose ids are `<owner>/<model>`. Falls back to the full id on a collision.
     */
    short_labels?: boolean;
    /**
     * No single doc page describes this provider's models: skip Claude description extraction
     * (descriptions then come from `enrichment.json` only).
     */
    skip_descriptions?: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
    anthropic: {
        name: { en: "Anthropic", fr: "Anthropic" },
        logo: "",
        model_docs: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
        docs_markdown_url: "https://docs.anthropic.com/en/docs/about-claude/models/overview.md",
        litellm_provider: "anthropic",
    },
    openai: {
        name: { en: "OpenAI", fr: "OpenAI" },
        logo: "",
        model_docs: "https://platform.openai.com/docs/models",
        litellm_provider: "openai",
    },
    google: {
        name: { en: "Google", fr: "Google" },
        logo: "",
        model_docs: "https://ai.google.dev/gemini-api/docs/models",
        litellm_provider: "gemini",
    },
    mistral: {
        name: { en: "Mistral", fr: "Mistral" },
        logo: "",
        model_docs: "https://docs.mistral.ai/getting-started/models/models_overview/",
        litellm_provider: "mistral",
    },
    replicate: {
        name: { en: "Replicate", fr: "Replicate" },
        logo: "",
        model_docs: "https://replicate.com/explore",
        litellm_provider: "replicate",
        short_labels: true,
        skip_descriptions: true,
    },
    recraft: {
        name: { en: "Recraft", fr: "Recraft" },
        logo: "",
        model_docs: "https://www.recraft.ai/docs",
        litellm_provider: "recraft",
        skip_descriptions: true,
    },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
