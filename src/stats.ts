import { emptyStatsState, emptyTotals, type ProviderTotals, type StatsState } from "./types";

export interface StatsRecord {
  providerId: string;
  sourceChars: number;
  targetChars: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd: number;
}

export type StatsListener = (state: StatsState) => void;

export class StatsRecorder {
  private state: StatsState;
  private readonly listeners = new Set<StatsListener>();

  constructor(initial?: StatsState) {
    this.state = initial ?? emptyStatsState();
  }

  onChange(listener: StatsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  record(r: StatsRecord): void {
    const today = isoDate(new Date());
    accumulate(this.state.totals, r);
    accumulate(ensureBucket(this.state.byProvider, r.providerId), r);
    accumulate(ensureBucket(this.state.daily, today), r);
    this.notify();
  }

  get(): StatsState {
    return this.state;
  }

  todaySourceChars(): number {
    const today = isoDate(new Date());
    return this.state.daily[today]?.sourceChars ?? 0;
  }

  reset(): void {
    this.state = emptyStatsState();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* swallow listener errors */
      }
    }
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ensureBucket(bucket: Record<string, ProviderTotals>, key: string): ProviderTotals {
  let v = bucket[key];
  if (!v) {
    v = emptyTotals();
    bucket[key] = v;
  }
  return v;
}

function accumulate(t: ProviderTotals, r: StatsRecord): void {
  t.requests += 1;
  t.sourceChars += r.sourceChars;
  t.targetChars += r.targetChars;
  t.tokensIn += r.promptTokens ?? 0;
  t.tokensOut += r.completionTokens ?? 0;
  t.estimatedCostUsd += r.estimatedCostUsd;
}
