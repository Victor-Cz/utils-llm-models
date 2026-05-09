import type { LiteLLMMode } from "./litellm.js";
import type { Format, ModelCapability } from "./types.js";

const FORMAT_ORDER: Format[] = ["text", "image", "audio", "video", "pdf"];

function ordered(set: Set<Format>): Format[] {
    return FORMAT_ORDER.filter((f) => set.has(f));
}

/**
 * Derive what a model accepts as input vs produces as output.
 *
 * Sources of truth, in order:
 *   1. LiteLLM `mode` defines the I/O baseline (image_generation → out=image, transcription → in=audio/out=text, etc.)
 *   2. LiteLLM capability flags refine chat-mode models (`supports_vision` → in+image, `supports_audio_input` → in+audio, etc.)
 *   3. Label-based hints catch realtime/audio variants that LiteLLM keeps in `mode: chat`
 *      (e.g., `gpt-4o-realtime-preview`, `gpt-audio`).
 */
export function deriveFormats(
    label: string,
    capabilities: ModelCapability[],
    mode: LiteLLMMode = "chat",
): { input_formats: Format[]; output_formats: Format[] } {
    const input = new Set<Format>();
    const output = new Set<Format>();

    if (mode === "image_generation") {
        input.add("text");
        // Image-edit / image-input variants: gpt-image-* and dall-e-2 accept image input for edits/variations
        if (/^gpt-image|^dall-e-2/.test(label)) input.add("image");
        output.add("image");
    } else if (mode === "audio_transcription") {
        input.add("audio");
        output.add("text");
    } else if (mode === "audio_speech") {
        input.add("text");
        output.add("audio");
    } else if (mode === "realtime") {
        input.add("text");
        input.add("audio");
        output.add("text");
        output.add("audio");
    } else {
        // mode === "chat"
        input.add("text");
        output.add("text");

        if (capabilities.includes("vision")) input.add("image");
        if (capabilities.includes("audio_input")) input.add("audio");
        if (capabilities.includes("audio_output")) output.add("audio");
        if (capabilities.includes("pdf_input")) input.add("pdf");

        // Realtime / Live / Audio chat variants (LiteLLM keeps these in mode: chat)
        if (/-realtime(-|$)|-live(-|$)|-audio(-|$)|-native-audio/.test(label)) {
            input.add("audio");
            output.add("audio");
        }
    }

    return { input_formats: ordered(input), output_formats: ordered(output) };
}
