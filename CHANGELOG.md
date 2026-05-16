# Changelog

## 0.2.0 — 2026-05-16

Major refactor: 18 OpenAI-compatible LLM providers are now first-class top-level providers (previously bundled under a single `openai` id).

### Added

- **18 OpenAI-compatible providers** as discrete `activeProvider` ids — `openai`, `anthropic`, `gemini`, `xai`, `deepseek`, `moonshot`, `zhipu`, `qwen`, `mistral`, `cohere`, `groq`, `together`, `fireworks`, `deepinfra`, `cerebras`, `huggingface`, `baseten`, `ollama`.
- **`Fine Translate: Switch Provider…`** is now a two-step picker — pick provider, then pick model. Writes `activeProvider`, `providers.openai.baseUrl`, `providers.openai.model` in one go. Grouped with QuickPick separators (LLMs / Traditional translation APIs).
- **Settings UI dropdowns** for `activeProvider`, `providers.openai.baseUrl`, and `providers.openai.model`. The model dropdown lists 81 known models with provider labels; the URL dropdown lists 18 preset endpoints. Both accept custom values typed in `settings.json`.
- **Per-provider usage stats** — the usage panel now buckets requests, characters, tokens, and cost by provider id, so each LLM endpoint appears on its own row.
- **`settings.providers.<id>.apiKey` / `appSecret` fallback** — for users who prefer settings.json over SecretStorage. SecretStorage still takes precedence.
- **i18n** — UI ships in English (fallback), Simplified Chinese, Traditional Chinese, Japanese, via `package.nls.*.json` (declarative) and `l10n/bundle.l10n.*.json` (runtime).
- **`scripts/sync-schema.mjs`** — single source of truth for presets is `src/providers/openai-presets.json`; the script regenerates `package.json` enum/enumDescriptions and is wired into `pnpm run package`.

### Changed

- `providers.openai.baseUrl` and `providers.openai.model` defaults are now `""` ("follow active provider preset"). Leaving them blank inherits from the matching preset; non-blank values override.
- `getProvider` treats the 17 non-`openai` OpenAI-compat ids as aliases of `openai`, sharing one provider instance. No 18× clone overhead at activation.
- Extension renamed from `vscode-translate` to `fine-translate`. Command prefix `translate.*` → `fine-translate.*`. Marketplace ID: `FineSoft.fine-translate`.
- Notification messages no longer prefix with `[translate]`; rely on VS Code's own source labels.

### Removed

- `Fine Translate: Apply Provider Preset…` command — merged into `Switch Provider…`.

## 0.1.0 — initial

- Selection translation, hover translation, output channel, usage webview, status bar.
- Providers: OpenAI-compatible (single config), DeepL, Youdao, Baidu.
