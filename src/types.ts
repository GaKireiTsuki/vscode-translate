export type ProviderId = "openai" | "deepl" | "youdao" | "baidu";

export interface TranslateRequest {
  text: string;
  sourceLang?: string;
  targetLang: string;
  signal?: AbortSignal;
}

export interface TranslateUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface TranslateResult {
  text: string;
  detectedSourceLang?: string;
  usage?: TranslateUsage;
}

export interface ProviderCredentials {
  apiKey?: string;
  appId?: string;
  appKey?: string;
  appSecret?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  useFreeApi?: boolean;
  extraHeaders?: Record<string, string>;
}

export interface TranslationProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly kind: "llm" | "rest";
  translate(req: TranslateRequest, creds: ProviderCredentials): Promise<TranslateResult>;
  estimateCost?(usage: TranslateUsage | undefined, opts: { model?: string; sourceChars: number }): number | null;
}

export interface ProviderTotals {
  requests: number;
  sourceChars: number;
  targetChars: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
}

export interface StatsState {
  totals: ProviderTotals;
  byProvider: Record<string, ProviderTotals>;
  daily: Record<string, ProviderTotals>;
}

export function emptyTotals(): ProviderTotals {
  return {
    requests: 0,
    sourceChars: 0,
    targetChars: 0,
    tokensIn: 0,
    tokensOut: 0,
    estimatedCostUsd: 0,
  };
}

export function emptyStatsState(): StatsState {
  return { totals: emptyTotals(), byProvider: {}, daily: {} };
}
