# Fine Translate

A lightweight, pluggable in-editor translation extension for VS Code. Select text and translate via hover, command palette, or keyboard shortcut. Bring your own provider — OpenAI-compatible LLMs, DeepL, Youdao, or Baidu.

UI is localized: **English**, **简体中文**, **繁體中文**, **日本語** (follows `vscode.env.language`).

## Features

- **Selection translation** — right-click → *Fine Translate: Translate Selection*, or `Cmd/Ctrl+Shift+T`. Result renders as a hover card next to your selection; long output falls back to a dedicated output channel.
- **Hover translation** *(optional, off by default)* — once enabled via `Fine Translate: Toggle Hover Translation`, hovering over a word triggers an inline translation in the hover popup.
- **18 OpenAI-compatible LLM providers** as first-class options — OpenAI, Anthropic (Claude), Google Gemini, xAI (Grok), DeepSeek, Moonshot (Kimi), Zhipu (智谱 GLM), Alibaba Qwen, Mistral, Cohere, Groq, Together AI, Fireworks, DeepInfra, Cerebras, Hugging Face, Baseten, Ollama (local). Switching provider updates Base URL and model in one step; the model dropdown lists ~81 known model IDs.
- **3 traditional translation APIs** — DeepL (Free or Pro), Youdao (sha256-signed), Baidu (md5-signed).
- **Smart caching** — in-memory LRU keyed on `(provider, model, baseUrl, sourceLang, targetLang, text)`. Repeated translations are free.
- **Usage panel** — `Fine Translate: Show Usage` opens a Webview with request count, characters, tokens (LLM only), and estimated USD cost, broken down per provider.
- **Status bar** — current provider + today's source-character count, click to open the usage panel.
- **Secrets handled via `SecretStorage`** — API keys never touch `settings.json`.

## Quick start

1. Install the extension (`code --install-extension fine-translate-0.1.0.vsix` or from the marketplace).
2. *Command Palette → `Fine Translate: Switch Provider…`* — pick a provider, then a model (Base URL + model are filled automatically from the matching preset).
3. *`Fine Translate: Set API Key…`* — paste your key. The secret is keyed by provider id (e.g. `deepseek` / `anthropic`), so each provider has its own slot.
4. Select some text → `Cmd/Ctrl+Shift+T`.

## Configuration

All keys live under `fine-translate.*`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `activeProvider` | `openai` | 18 OpenAI-compat ids + `deepl` / `youdao` / `baidu`. Settings UI shows a dropdown. |
| `targetLanguage` | *(empty)* | BCP-47 target language. Empty = follow `vscode.env.language`. |
| `providers.openai.baseUrl` | `""` (follow preset) | Override Base URL for OpenAI-compat providers. Leave blank to use the preset of `activeProvider`. Dropdown lists 18 preset URLs. |
| `providers.openai.model` | `""` (follow preset) | Override model. Leave blank to use the preset default for the active provider. Dropdown lists ~81 known models. |
| `providers.openai.systemPrompt` | *translator system prompt* | LLM system instruction. |
| `providers.deepl.useFreeApi` | `true` | Toggle Free vs Pro endpoint. |
| `providers.baidu.appId` | `""` | Baidu App ID (the secret goes via `Set API Key`). |
| `providers.youdao.appKey` | `""` | Youdao App Key (the secret goes via `Set API Key`). |
| `hover.enabled` | `false` | Enable hover-on-translate. |
| `hover.debounceMs` | `400` | Hover debounce. |
| `hover.languages` | `["*"]` | Document languageIds where hover translation is active. |
| `selection.autoOnSelect` | `false` | Auto-translate when selection changes. |
| `cache.maxEntries` | `500` | In-memory LRU capacity. |
| `cache.ttlMinutes` | `1440` | Entry TTL. |
| `maxCharsPerRequest` | `4000` | Hard cap to avoid runaway cost. |
| `telemetry.estimateCost` | `true` | Display estimated USD cost in the usage panel. |

The 18 OpenAI-compatible providers share one `providers.openai.*` settings block. Switching provider rewrites Base URL and model; leave both blank to always inherit from the current preset. API keys are stored per-provider in `SecretStorage`, so changing `activeProvider` does not lose the previous key.

## Commands

| Command | Description |
| --- | --- |
| `Fine Translate: Translate Selection` | Translate the current selection. |
| `Fine Translate: Toggle Hover Translation` | Quick on/off for hover mode. |
| `Fine Translate: Set API Key…` | Pick provider → enter secret (stored via `SecretStorage` under the active provider id). |
| `Fine Translate: Clear API Key…` | Forget stored secrets for a provider. |
| `Fine Translate: Clear Cache` | Drop the in-memory translation cache. |
| `Fine Translate: Show Usage` | Open the usage Webview. Stats are bucketed per provider id, so each LLM endpoint appears separately. |
| `Fine Translate: Reset Statistics` | Clear cumulative counters. |
| `Fine Translate: Switch Provider…` | Two-step pick: provider → model. Writes `activeProvider`, `baseUrl`, `model` in one go. |

## Localization

UI strings ship in four languages and follow VS Code's display language:

- `package.nls.json` / `package.nls.<locale>.json` — declarative strings (commands, settings descriptions).
- `l10n/bundle.l10n.<locale>.json` — runtime strings consumed via `vscode.l10n.t()`.

Supported locales: `en` (fallback), `zh-cn`, `zh-tw`, `ja`. Missing keys fall through to the English source written in code.

## Build & develop

```
pnpm install
pnpm run build        # esbuild → dist/extension.js
pnpm run test:unit    # vitest
pnpm run test:e2e     # tsc → out/, then @vscode/test-electron
pnpm run package      # vsce package → .vsix
```

Press F5 inside VS Code to launch the Extension Development Host.

### Architecture (one-glance)

```
extension.ts ─► config.ts, secrets.ts, translator.ts, ui/*, stats.ts
translator.ts ─► cache.ts, providers/* (registered at activate())
ui/* (hover, selection, statusBar, panel) ─► translator, stats, config
```

- Providers implement a single `translate(req, creds) → TranslateResult` interface and an optional `estimateCost`.
- The `translator` facade handles cache lookups, request de-duplication, and stats recording.
- Stats are persisted in `globalState` with debounced flush + immediate flush on window blur and `deactivate()`.
- Webview HTML is hand-written with strict CSP; theming via `var(--vscode-*)`.

## Caveats

- Changing `providers.openai.systemPrompt` does **not** invalidate cached entries — clear the cache (`Fine Translate: Clear Cache`) to force re-translation.
- DeepL cost estimation always uses Pro pricing as a conservative upper bound; on the Free plan your real cost is $0.
- Selection auto-translation is off by default. Turning it on sends every selection change to the active provider (after a 500 ms debounce).

## License

MIT.
