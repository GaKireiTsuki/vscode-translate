import { LRU, cacheKey } from "./cache";
import { getProvider } from "./providers";
import type { StatsRecorder } from "./stats";
import type { ProviderCredentials, ProviderId, TranslateResult } from "./types";

export interface TranslateOptions {
  text: string;
  targetLang: string;
  sourceLang?: string;
  signal?: AbortSignal;
}

export interface ResolvedProvider {
  id: ProviderId;
  credentials: ProviderCredentials;
}

export interface TranslatorDeps {
  resolveProvider: () => Promise<ResolvedProvider> | ResolvedProvider;
  getCache: () => LRU<string, TranslateResult>;
  getMaxCharsPerRequest: () => number;
  getEstimateCost: () => boolean;
  stats?: StatsRecorder;
}

export class Translator {
  private readonly inflight = new Map<string, Promise<TranslateResult>>();

  constructor(private readonly deps: TranslatorDeps) {}

  async translate(opts: TranslateOptions): Promise<TranslateResult> {
    if (opts.text.length === 0) throw new Error("Cannot translate empty text");
    const max = this.deps.getMaxCharsPerRequest();
    if (opts.text.length > max) {
      throw new Error(`Text too long: ${opts.text.length} > ${max} (fine-translate.maxCharsPerRequest)`);
    }

    const { id: providerId, credentials } = await this.deps.resolveProvider();
    const provider = getProvider(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    const key = cacheKey({
      providerId,
      model: credentials.model,
      baseUrl: credentials.baseUrl,
      targetLang: opts.targetLang,
      sourceLang: opts.sourceLang,
      text: opts.text,
    });

    const cache = this.deps.getCache();
    const cached = cache.get(key);
    if (cached) return cached;

    const inflight = this.inflight.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const result = await provider.translate(
          {
            text: opts.text,
            sourceLang: opts.sourceLang,
            targetLang: opts.targetLang,
            signal: opts.signal,
          },
          credentials,
        );
        cache.set(key, result);
        if (this.deps.stats) {
          let cost = 0;
          if (this.deps.getEstimateCost() && provider.estimateCost) {
            const estimated = provider.estimateCost(result.usage, {
              model: credentials.model,
              sourceChars: opts.text.length,
            });
            if (estimated !== null) cost = estimated;
          }
          this.deps.stats.record({
            providerId,
            sourceChars: opts.text.length,
            targetChars: result.text.length,
            promptTokens: result.usage?.promptTokens,
            completionTokens: result.usage?.completionTokens,
            estimatedCostUsd: cost,
          });
        }
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}
