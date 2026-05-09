import Anthropic from "@anthropic-ai/sdk";
import { fetchDocPage } from "./doc-pages.js";
import type { Localized, ProviderId } from "./types.js";

const EXTRACTION_MODEL = "claude-opus-4-7";

type DescriptionsByLabel = Record<string, Localized>;

function buildPrompt(providerId: ProviderId, labels: string[], pageContent: string): string {
    const truncated =
        pageContent.length > 100_000 ? pageContent.slice(0, 100_000) + "\n[…truncated]" : pageContent;
    return `You are extracting concise model descriptions from a provider's official documentation page.

Provider: ${providerId}
Models to describe (use these exact IDs as keys in your output):
${labels.map((l) => `- ${l}`).join("\n")}

Documentation page content:
<doc>
${truncated}
</doc>

For each model ID above, write a 1-2 sentence description in English AND French based on what the documentation says. Stay close to the official wording — do not invent capabilities or positioning that isn't in the doc.

If a model ID is not mentioned in the documentation, omit it from your response (do not guess).

Return ONLY a JSON object with this shape, no prose:
{
  "<model-id>": { "en": "...", "fr": "..." },
  ...
}`;
}

function parseJsonResponse(raw: string): DescriptionsByLabel {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = (fenced ? fenced[1] : raw).trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) return {};
    try {
        return JSON.parse(candidate.slice(start, end + 1)) as DescriptionsByLabel;
    } catch {
        return {};
    }
}

export async function extractDescriptions(
    providerId: ProviderId,
    labels: string[],
    client: Anthropic,
    cachedPage?: string,
): Promise<DescriptionsByLabel> {
    if (labels.length === 0) return {};
    const page = cachedPage ?? (await fetchDocPage(providerId));
    if (!page) {
        console.warn(`  ⚠ Could not fetch doc page for ${providerId}`);
        return {};
    }

    const message = await client.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(providerId, labels, page) }],
    });

    const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

    return parseJsonResponse(text);
}

export function makeAnthropicClient(): Anthropic | null {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    return new Anthropic({ apiKey: key });
}
