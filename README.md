# Translate

A lightweight, pluggable in-editor translation extension for VS Code. Select text and translate via hover, command palette, or keyboard shortcut. Bring your own provider — OpenAI-compatible LLMs, DeepL, Youdao, or Baidu.

## Features

- **Selection translation** — right-click → *Translate Selection*, or `Cmd/Ctrl+Shift+T`. Result renders as a hover card next to your selection; long output falls back to a dedicated output channel.
- **Hover translation** *(optional, off by default)* — once enabled via `Translate: Toggle Hover Translation`, hovering over a word triggers an inline translation in the hover popup.
- **Pluggable providers**
  - **OpenAI Compatible** — covers OpenAI, Claude (via OpenAI-compatible endpoint), DeepSeek, Kimi, 智谱, local Ollama, and anything else that speaks `POST /v1/chat/completions`. Configure `baseUrl` + `model`.
  - **DeepL** — Free or Pro endpoint.
  - **Youdao** — sha256 signed.
  - **Baidu** — md5 signed.
- **Smart caching** — in-memory LRU keyed on `(provider, model, baseUrl, sourceLang, targetLang, text)`. Repeated translations are free.
- **Usage panel** — `Translate: Show Usage` opens a Webview with request count, characters, tokens (LLM only), and estimated USD cost, broken down per provider.
- **Status bar** — current provider + today's source-character count, click to open the usage panel.
- **Secrets handled via `SecretStorage`** — API keys never touch `settings.json`.

## Quick start

1. Install the extension (`code --install-extension vscode-translate-0.1.0.vsix` or from the marketplace).
2. Pick a provider via *Command Palette → `Translate: Switch Provider`*.
3. Run *`Translate: Set API Key…`* and paste your key (Baidu / Youdao also need their App ID / App Key set in `settings.json`).
4. Select some text → `Cmd/Ctrl+Shift+T`.

## Configuration

All keys live under `translate.*`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `activeProvider` | `openai` | One of `openai` / `deepl` / `youdao` / `baidu`. |
| `targetLanguage` | *(empty)* | BCP-47 target language. Empty = follow `vscode.env.language`. |
| `providers.openai.baseUrl` | `https://api.openai.com/v1` | Override for OpenAI-compatible endpoints. |
| `providers.openai.model` | `gpt-4o-mini` | Model for the OpenAI-compatible provider. |
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

## Commands

| Command | Description |
| --- | --- |
| `Translate: Translate Selection` | Translate the current selection. |
| `Translate: Toggle Hover Translation` | Quick on/off for hover mode. |
| `Translate: Set API Key…` | Pick provider → enter secret (stored via `SecretStorage`). |
| `Translate: Clear API Key…` | Forget stored secrets for a provider. |
| `Translate: Clear Cache` | Drop the in-memory translation cache. |
| `Translate: Show Usage` | Open the usage Webview. |
| `Translate: Reset Statistics` | Clear cumulative counters. |
| `Translate: Switch Provider` | Pick the active provider. |

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

- Changing `providers.openai.systemPrompt` does **not** invalidate cached entries — clear the cache (`Translate: Clear Cache`) to force re-translation.
- DeepL cost estimation always uses Pro pricing as a conservative upper bound; on the Free plan your real cost is $0.
- Selection auto-translation is off by default. Turning it on sends every selection change to the active provider (after a 500 ms debounce).

## License

MIT.
