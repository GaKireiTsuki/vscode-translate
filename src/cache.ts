import * as crypto from "node:crypto";
import type { ProviderId } from "./types";

export interface CacheKeyParts {
  providerId: ProviderId;
  model?: string;
  baseUrl?: string;
  targetLang: string;
  sourceLang?: string;
  text: string;
}

export function cacheKey(parts: CacheKeyParts): string {
  const composed = [
    parts.providerId,
    parts.model ?? "",
    parts.baseUrl ?? "",
    parts.targetLang,
    parts.sourceLang ?? "auto",
    parts.text,
  ].join("|");
  return crypto.createHash("sha1").update(composed).digest("hex");
}

interface LruEntry<V> {
  value: V;
  expires: number;
}

export class LRU<K, V> {
  private readonly map = new Map<K, LruEntry<V>>();
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(max: number, ttlMs: number, now: () => number = Date.now) {
    if (max < 0) throw new Error("max must be >= 0");
    if (ttlMs <= 0) throw new Error("ttlMs must be > 0");
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.max === 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      if (first === undefined) break;
      this.map.delete(first);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
