# utils-llm-models

Catalogue auto-synchronisé des modèles LLM et de génération d'image et de vidéo (Anthropic, OpenAI, Google, Mistral, Replicate, Recraft) destiné à être consommé par plusieurs projets via une URL raw GitHub.

## Sources

| Donnée | Source |
|---|---|
| IDs, context window, capabilities, pricing | [LiteLLM `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) |
| Sélection des modèles | Page de doc officielle (Anthropic, Google, Mistral), motifs de [`enrichment.json`](./enrichment.json) (Replicate, Recraft) |
| Descriptions (EN + FR) | Page de doc officielle du provider, extraction par Claude (pas pour Replicate et Recraft, sans page de doc commune) |
| Logo, `llm_config`, overrides custom | [`enrichment.json`](./enrichment.json) (édité à la main) |

### Fournisseurs

| `provider` | `litellm_provider` | Clés LiteLLM | `label` |
|---|---|---|---|
| `openai` | `openai` | `gpt-image-2.5-flare`… | la clé |
| `anthropic` | `anthropic` | `claude-…` | la clé |
| `google` | `gemini` | `gemini/veo-3.1-generate-001`… | sans le préfixe `gemini/` |
| `mistral` | `mistral` | `mistral-…` | la clé |
| `replicate` | `replicate` | `replicate/<owner>/<model>` | le dernier segment (`flux-1.1-pro`, `wan-3`) ; l'id `<owner>/<model>` complet s'il est déjà pris |
| `recraft` | `recraft` | `recraft/<model>` | sans le préfixe `recraft/` (`recraftv3`) |

Côté Replicate, seuls Flux en image (`black-forest-labs/flux-*`, hors variantes lora, finetuned, canny, depth et fill) et la vidéo Kling, Seedance, Wan et Hailuo (MiniMax `h3*`) sont gardés.

Aucune clé API providers n'est nécessaire pour la découverte des modèles. Une `ANTHROPIC_API_KEY` est utilisée uniquement pour générer les descriptions des nouveaux modèles (l'étape est skip si la clé est absente).

## Format de sortie

[`models.json`](./models.json) — un tableau de providers, chacun avec ses modèles. Les `label` correspondent aux IDs natifs LangChain (`new ChatAnthropic({ model: label })`).

```json
[
  {
    "provider": "google",
    "provider_infos": { "name": { "en": "Google", "fr": "Google" }, "logo": "...", "model_docs": "..." },
    "models": [
      {
        "label": "gemini-2.5-flash",
        "name": { "en": "Gemini 2.5 Flash", "fr": "Gemini 2.5 Flash" },
        "logo": "",
        "llm_config": "default",
        "description": { "en": "...", "fr": "..." },
        "context_window": { "input": 1048576, "output": 65536 },
        "capabilities": ["vision", "function_calling"],
        "pricing": { "1m_tokens": { "input": 0.3, "output": 2.5 } },
        "deprecation_date": null
      }
    ]
  }
]
```

### `pricing`

Toutes les clés sont optionnelles, en dollars ; un modèle sans prix connu a `pricing: null`.

| Clé | Unité | Champs | Source LiteLLM |
|---|---|---|---|
| `1m_tokens` | par million de tokens texte | `input`, `output`, `cache_write?`, `cache_read?` | `input_cost_per_token`, `output_cost_per_token`, `cache_*` |
| `per_image` | par image | `input?`, `output?` | `input_cost_per_image`, `output_cost_per_image` |
| `image_tokens` | par million de tokens image (comme `1m_tokens`) | `input?`, `output?` | `input_cost_per_image_token`, `output_cost_per_image_token` (modèles d'image seulement) |
| `per_second` | par seconde de vidéo générée | `output?`, `by_resolution?` | `output_cost_per_second`, `output_cost_per_second_<résolution>` (modèles vidéo seulement) |
| `per_minute` | par minute d'audio | `input?`, `output?` | `input_cost_per_second`, `output_cost_per_second` × 60 (hors vidéo) |
| `per_1m_characters` | par million de caractères | `input?`, `output?` | `input_cost_per_character`, `output_cost_per_character` |

```json
{ "label": "flux-1.1-pro", "categories": ["image"], "pricing": { "per_image": { "output": 0.04 } } }
{ "label": "gpt-image-2.5-flare", "categories": ["image"], "pricing": { "image_tokens": { "input": 8, "output": 30 } } }
{
  "label": "wan-3",
  "categories": ["video"],
  "pricing": { "per_second": { "output": 0.14, "by_resolution": { "480p": 0.035, "720p": 0.07, "1080p": 0.14 } } }
}
```

`per_second.output` est le prix par défaut donné par LiteLLM ; `by_resolution` liste les prix par résolution quand le fournisseur les distingue (clés telles que LiteLLM les nomme : `480p`, `720p`, `768p`, `1080p`, `2k`, `4k`), de la plus basse à la plus haute.

### `categories`

`chat`, `code`, `reasoning`, `image` (modèles d'image : prix `per_image` ou `image_tokens`), `video` (modèles vidéo : prix `per_second`), `transcription`, `speech`, `realtime`.

## Usage depuis un autre projet

```ts
const res = await fetch(
    "https://raw.githubusercontent.com/<owner>/utils-llm-models/main/models.json",
);
const catalog = await res.json();
```

## Pipeline

[`/.github/workflows/sync.yml`](./.github/workflows/sync.yml) — exécution :

- **Manuelle** : onglet *Actions* → *Sync LLM models* → *Run workflow*
- **Cron** : tous les lundis 06:00 UTC
- **CLI** : `gh workflow run sync.yml`

À chaque run, le workflow ouvre une PR `chore/sync-llm-models` avec les changements (nouveaux modèles, pricing à jour, descriptions ajoutées), demande la relecture de `Victor-Cz` (notification), puis la **merge tout seul** si le catalogue est cohérent ([`scripts/check.ts`](./scripts/check.ts)). S'il ne l'est pas (un fournisseur sans modèle, ou qui en perd plus de la moitié d'un coup), la PR reste ouverte et le run échoue, ce qui notifie aussi.

## Setup initial

1. Côté repo GitHub : `Settings → Secrets and variables → Actions` → ajouter `ANTHROPIC_API_KEY`.
2. Lancer le premier run manuellement pour générer `models.json`.

## Dev local

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-… npm run sync
```

## Édition de `enrichment.json`

### `providers` — overrides au niveau provider
Tout champ présent ici **écrase** la valeur par défaut (`scripts/providers.ts`).
- `logo` : logo de la marque (utilisé dans `provider_infos.logo`)
- `default_model_logo` : logo appliqué à **tous les modèles du provider** quand aucun logo spécifique n'est défini sur le modèle (évite de répéter le logo Claude sur chaque modèle Anthropic)
- `name`, `model_docs` : overrides optionnels

### `models` — overrides par modèle
Tout champ présent **écrase** la valeur auto-détectée (logo, name, llm_config, description).

```json
"models": {
    "gemini-2.5-flash": {
        "logo": "https://…/gemini-flash-icon.svg",
        "name": { "en": "Gemini 2.5 Flash", "fr": "Gemini 2.5 Flash" }
    }
}
```

### `filters` — exclusion de modèles non désirés
LiteLLM expose **toutes** les variantes (snapshots datés, fine-tuning, modèles deprecated…). Le filtre nettoie tout ça en cascade :

1. **Modèles avec `deprecation_date`** — toujours droppés (qu'ils soient déjà dépréciés ou planifiés pour l'être). Pas configurable.
2. **`exclude_dated: true`** — drop les snapshots datés (`claude-opus-4-5-20251101`, `mistral-large-2407`, `gpt-4o-2024-05-13`, `gemini-2.0-flash-001`…). On garde uniquement l'alias canonique.
3. **`exclude_patterns: string[]`** — regex ; tout `label` qui match est exclu. Utile pour dégager les vieux modèles (`gpt-3.5-*`), les modèles open-source non hébergés (`open-mistral-*`), les modes spécialisés (`-audio-*`, `-realtime-*`), les familles séparées (`gemma-*`, `learnlm-*`, `lyria-*`)…
4. **`provider_patterns`** — par fournisseur, `include` (garde seulement ce qui matche) et `exclude` (regex), appliqués à l'id LiteLLM sans son préfixe fournisseur (`black-forest-labs/flux-1.1-pro`). Remplace le filtre par page de doc pour Replicate et Recraft, qui n'en ont pas.
5. **`filter_by_doc_page: true`** — pour Anthropic, Google, Mistral, on fetch la page de doc officielle et on garde seulement les modèles dont le `label` y apparaît (matching multi-stratégies : exact, sans `-latest`, dot↔dash). C'est ce filtre qui dégage les `gemini-flash-lite-latest` / `gemini-pro-latest` que LiteLLM expose mais que Google ne documente pas. **Skippé silencieusement pour OpenAI** dont la doc est rendue côté JS et bloque le scraping, ainsi que pour Replicate et Recraft. La page ne couvre que les modèles de chat : image, vidéo, audio passent sans ce filtre.

### `order` — ordre d'affichage

- `order.providers: ProviderId[]` — ordre des providers dans le tableau de sortie. Les providers non listés vont à la fin, alphabétique.
- `order.models[providerId]: string[]` — ordre des modèles dans un provider. Les non-listés vont après.

**Si `filter_by_doc_page` est actif et qu'aucun ordre explicite n'est défini**, les modèles sont triés selon leur **position d'apparition sur la page de doc du provider** (= généralement "principal en premier" puisque les providers listent leurs modèles dans cet ordre). C'est l'équivalent gratuit d'une priorisation maintenue par les providers eux-mêmes.
