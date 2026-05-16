import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LRU } from "./cache";
import { Translator } from "./translator";
import { clearRegistry, registerProvider } from "./providers";
import { StatsRecorder } from "./stats";
import type { ProviderCredentials, TranslateResult, TranslationProvider } from "./types";

function makeProvider(impl: TranslationProvider["translate"]): TranslationProvider {
  return {
    id: "openai",
    displayName: "Mock",
    kind: "llm",
    translate: impl,
    estimateCost: (usage) =>
      ((usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0)) * 0.001,
  };
}

const creds: ProviderCredentials = {
  apiKey: "k",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
};

function makeTranslator(opts: {
  cache?: LRU<string, TranslateResult>;
  stats?: StatsRecorder;
  estimateCost?: boolean;
  max?: number;
}) {
  const cache = opts.cache ?? new LRU<string, TranslateResult>(10, 60_000);
  return new Translator({
    resolveProvider: () => ({ id: "openai", credentials: creds }),
    getCache: () => cache,
    getMaxCharsPerRequest: () => opts.max ?? 4000,
    getEstimateCost: () => opts.estimateCost ?? true,
    stats: opts.stats,
  });
}

describe("Translator", () => {
  beforeEach(() => clearRegistry());
  afterEach(() => clearRegistry());

  it("calls provider on cache miss and records stats", async () => {
    const fn = vi.fn(async () => ({
      text: "你好",
      usage: { promptTokens: 5, completionTokens: 2 },
    }));
    registerProvider(makeProvider(fn));
    const stats = new StatsRecorder();
    const t = makeTranslator({ stats });

    const res = await t.translate({ text: "hello", targetLang: "zh-CN" });
    expect(res.text).toBe("你好");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(stats.get().totals.requests).toBe(1);
    expect(stats.get().totals.tokensIn).toBe(5);
    expect(stats.get().totals.tokensOut).toBe(2);
    expect(stats.get().totals.sourceChars).toBe(5);
    expect(stats.get().totals.targetChars).toBe(2);
    expect(stats.get().totals.estimatedCostUsd).toBeCloseTo(7 * 0.001, 6);
    expect(stats.get().byProvider.openai!.requests).toBe(1);
  });

  it("returns cached result on second call", async () => {
    const fn = vi.fn(async () => ({ text: "你好" }));
    registerProvider(makeProvider(fn));
    const t = makeTranslator({});
    await t.translate({ text: "hello", targetLang: "zh-CN" });
    await t.translate({ text: "hello", targetLang: "zh-CN" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent same-key requests", async () => {
    let resolve: (r: TranslateResult) => void = () => {};
    const fn = vi.fn(() => new Promise<TranslateResult>((r) => (resolve = r)));
    registerProvider(makeProvider(fn));
    const t = makeTranslator({});
    const p1 = t.translate({ text: "hello", targetLang: "zh-CN" });
    const p2 = t.translate({ text: "hello", targetLang: "zh-CN" });
    await Promise.resolve();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    resolve({ text: "你好" });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
  });

  it("rejects empty and overlong text", async () => {
    registerProvider(makeProvider(async () => ({ text: "x" })));
    const t = makeTranslator({ max: 10 });
    await expect(t.translate({ text: "", targetLang: "zh-CN" })).rejects.toThrow();
    await expect(t.translate({ text: "a".repeat(11), targetLang: "zh-CN" })).rejects.toThrow(/too long/);
  });

  it("propagates provider errors and clears inflight", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("oops"))
      .mockResolvedValueOnce({ text: "ok" });
    registerProvider(makeProvider(fn));
    const t = makeTranslator({});
    await expect(t.translate({ text: "hi", targetLang: "zh-CN" })).rejects.toThrow(/oops/);
    const r = await t.translate({ text: "hi", targetLang: "zh-CN" });
    expect(r.text).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws on unknown provider", async () => {
    const t = makeTranslator({});
    await expect(t.translate({ text: "hi", targetLang: "zh-CN" })).rejects.toThrow(/provider/i);
  });

  it("skips cost estimation when estimateCost=false", async () => {
    registerProvider(
      makeProvider(async () => ({ text: "你好", usage: { promptTokens: 100, completionTokens: 100 } })),
    );
    const stats = new StatsRecorder();
    const t = makeTranslator({ stats, estimateCost: false });
    await t.translate({ text: "hi", targetLang: "zh-CN" });
    expect(stats.get().totals.estimatedCostUsd).toBe(0);
  });
});
