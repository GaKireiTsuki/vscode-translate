import { isOpenAICompat, type ProviderId, type TranslationProvider } from "../types";

const registry = new Map<ProviderId, TranslationProvider>();

export function registerProvider(provider: TranslationProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: ProviderId): TranslationProvider | undefined {
  // All 18 OpenAI-compatible ids share one provider implementation; the
  // distinction lives in credentials (baseUrl/model/apiKey) resolved per id.
  if (isOpenAICompat(id) && id !== "openai") return registry.get("openai");
  return registry.get(id);
}

export function listProviders(): TranslationProvider[] {
  return [...registry.values()];
}

export function clearRegistry(): void {
  registry.clear();
}
