import { describe, expect, it } from "vitest";
import { LRU, cacheKey } from "./cache";

describe("LRU", () => {
  it("returns stored values", () => {
    const cache = new LRU<string, number>(3, 1000);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("evicts least recently used when full", () => {
    const cache = new LRU<string, number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("treats get as recency update", () => {
    const cache = new LRU<string, number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("expires entries by TTL", () => {
    let now = 1000;
    const cache = new LRU<string, number>(5, 100, () => now);
    cache.set("a", 1);
    now = 1050;
    expect(cache.get("a")).toBe(1);
    now = 1200;
    expect(cache.get("a")).toBeUndefined();
  });

  it("rejects negative max but accepts zero (no-op cache)", () => {
    expect(() => new LRU(-1, 100)).toThrow();
    const cache = new LRU<string, number>(0, 100);
    cache.set("a", 1);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("clear empties the cache", () => {
    const cache = new LRU<string, number>(3, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe("cacheKey", () => {
  it("produces a stable hash", () => {
    const a = cacheKey({ providerId: "openai", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", targetLang: "zh-CN", text: "hello" });
    const b = cacheKey({ providerId: "openai", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", targetLang: "zh-CN", text: "hello" });
    expect(a).toBe(b);
  });

  it("differs when model changes", () => {
    const a = cacheKey({ providerId: "openai", model: "gpt-4o-mini", targetLang: "zh-CN", text: "hello" });
    const b = cacheKey({ providerId: "openai", model: "gpt-4o", targetLang: "zh-CN", text: "hello" });
    expect(a).not.toBe(b);
  });

  it("differs when baseUrl changes", () => {
    const a = cacheKey({ providerId: "openai", baseUrl: "https://api.openai.com/v1", targetLang: "zh-CN", text: "hello" });
    const b = cacheKey({ providerId: "openai", baseUrl: "http://localhost:11434/v1", targetLang: "zh-CN", text: "hello" });
    expect(a).not.toBe(b);
  });

  it("treats unset sourceLang as 'auto'", () => {
    const a = cacheKey({ providerId: "openai", targetLang: "zh-CN", text: "hello" });
    const b = cacheKey({ providerId: "openai", sourceLang: "auto", targetLang: "zh-CN", text: "hello" });
    expect(a).toBe(b);
  });

  it("differs when preserveMarkdown flips", () => {
    const a = cacheKey({ providerId: "openai", targetLang: "zh-CN", text: "**hello**" });
    const b = cacheKey({ providerId: "openai", targetLang: "zh-CN", text: "**hello**", preserveMarkdown: true });
    expect(a).not.toBe(b);
  });
});
