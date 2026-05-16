import type { ProviderId, TranslationProvider } from "../types";

const registry = new Map<ProviderId, TranslationProvider>();

export function registerProvider(provider: TranslationProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: ProviderId): TranslationProvider | undefined {
  return registry.get(id);
}

export function listProviders(): TranslationProvider[] {
  return [...registry.values()];
}

export function clearRegistry(): void {
  registry.clear();
}
