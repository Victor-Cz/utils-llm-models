import type { LiteLLMMode } from "./litellm.js";
import type { ModelCapability, ModelCategory } from "./types.js";

const ORDERED: ModelCategory[] = [
    "chat",
    "code",
    "reasoning",
    "image",
    "transcription",
    "speech",
    "realtime",
];

/**
 * Purpose-categories the model qualifies for. Modality details (vision, audio I/O) are NOT here —
 * see `input_formats` / `output_formats`.
 *
 * Detection rules:
 *  - LiteLLM `mode` is the strongest signal (image_generation → image, audio_transcription → transcription, etc.)
 *  - For chat-mode entries, label patterns identify specialization (codestral/devstral → code, pixtral → image,
 *    magistral / o-series → reasoning, *-realtime/-live/-audio → realtime)
 *  - `supports_reasoning` capability adds `reasoning` even on chat models (e.g., Claude with extended thinking)
 *  - Default: `chat`
 */
export function deriveCategories(
    label: string,
    capabilities: ModelCapability[],
    mode: LiteLLMMode = "chat",
): ModelCategory[] {
    const cats = new Set<ModelCategory>();

    if (mode === "image_generation") cats.add("image");
    else if (mode === "audio_transcription") cats.add("transcription");
    else if (mode === "audio_speech") cats.add("speech");
    else if (mode === "realtime") cats.add("realtime");
    else {
        // mode === "chat"
        if (/^(labs-)?(codestral|devstral)-/.test(label) || /^codex-|-codex(-|$)/.test(label)) {
            cats.add("code");
        } else if (/^pixtral-/.test(label)) {
            cats.add("image");
        } else if (/^magistral-/.test(label) || /^o\d/.test(label)) {
            cats.add("reasoning");
        } else if (/-live(-|$)|-realtime(-|$)|-audio(-|$)|-native-audio/.test(label)) {
            cats.add("realtime");
        } else {
            cats.add("chat");
        }
    }

    if (capabilities.includes("reasoning")) cats.add("reasoning");

    return ORDERED.filter((c) => cats.has(c));
}
