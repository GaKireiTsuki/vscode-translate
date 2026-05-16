import { afterEach, describe, expect, it, vi } from "vitest";
import { openaiProvider } from "./openai";

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: any;
}

function mockFetch(captured: CapturedRequest[], response: { status?: number; body: any; ok?: boolean }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.push({
      url,
      init,
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    });
    const status = response.status ?? 200;
    const ok = response.ok ?? (status >= 200 && status < 300);
    return {
      ok,
      status,
      statusText: ok ? "OK" : "ERR",
      json: async () => response.body,
      text: async () => (typeof response.body === "string" ? response.body : JSON.stringify(response.body)),
    } as Response;
  });
}

describe("openaiProvider", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts to /chat/completions with correct shape", async () => {
    const captured: CapturedRequest[] = [];
    global.fetch = mockFetch(captured, {
      body: {
        choices: [{ message: { content: "你好" } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      },
    }) as any;

    const result = await openaiProvider.translate(
      { text: "hello", targetLang: "zh-CN" },
      { apiKey: "sk-test", model: "gpt-4o-mini", systemPrompt: "be precise" },
    );

    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(req.init.method).toBe("POST");
    expect((req.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(req.body.model).toBe("gpt-4o-mini");
    expect(req.body.temperature).toBe(0);
    expect(req.body.messages[0]).toEqual({ role: "system", content: "be precise" });
    expect(req.body.messages[1].role).toBe("user");
    expect(req.body.messages[1].content).toContain("zh-CN");
    expect(req.body.messages[1].content).toContain("hello");
    expect(result.text).toBe("你好");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 4 });
  });

  it("uses configured baseUrl and strips trailing slash", async () => {
    const captured: CapturedRequest[] = [];
    global.fetch = mockFetch(captured, {
      body: { choices: [{ message: { content: "你好" } }] },
    }) as any;

    await openaiProvider.translate(
      { text: "hi", targetLang: "zh-CN" },
      { apiKey: "k", baseUrl: "http://localhost:11434/v1/", model: "llama3" },
    );
    expect(captured[0].url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("omits Authorization when apiKey missing (e.g. local Ollama)", async () => {
    const captured: CapturedRequest[] = [];
    global.fetch = mockFetch(captured, {
      body: { choices: [{ message: { content: "你好" } }] },
    }) as any;
    await openaiProvider.translate({ text: "hi", targetLang: "zh-CN" }, { model: "llama3" });
    expect((captured[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws on non-2xx with status and body excerpt", async () => {
    global.fetch = mockFetch([], {
      status: 429,
      body: { error: { message: "Rate limited" } },
    }) as any;

    await expect(
      openaiProvider.translate({ text: "hi", targetLang: "zh-CN" }, { apiKey: "k" }),
    ).rejects.toThrow(/429/);
  });

  it("throws on missing content", async () => {
    global.fetch = mockFetch([], { body: { choices: [] } }) as any;
    await expect(
      openaiProvider.translate({ text: "hi", targetLang: "zh-CN" }, { apiKey: "k" }),
    ).rejects.toThrow(/content/);
  });

  it("estimateCost returns USD for known model", () => {
    const cost = openaiProvider.estimateCost!(
      { promptTokens: 1_000_000, completionTokens: 1_000_000 },
      { model: "gpt-4o-mini", sourceChars: 0 },
    );
    expect(cost).toBeCloseTo(0.15 + 0.6, 4);
  });

  it("estimateCost returns null for unknown model", () => {
    const cost = openaiProvider.estimateCost!(
      { promptTokens: 100, completionTokens: 100 },
      { model: "unknown-model", sourceChars: 0 },
    );
    expect(cost).toBeNull();
  });
});
