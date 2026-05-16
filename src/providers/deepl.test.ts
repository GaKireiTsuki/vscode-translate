import { afterEach, describe, expect, it, vi } from "vitest";
import { deeplProvider } from "./deepl";

interface Captured {
  url: string;
  init: RequestInit;
  body: URLSearchParams;
}

function mockFetch(captured: Captured[], response: { status?: number; body: any }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.push({
      url,
      init,
      body: new URLSearchParams(typeof init.body === "string" ? init.body : ""),
    });
    const status = response.status ?? 200;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      statusText: ok ? "OK" : "ERR",
      json: async () => response.body,
      text: async () => (typeof response.body === "string" ? response.body : JSON.stringify(response.body)),
    } as Response;
  });
}

describe("deeplProvider", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts form-encoded body to free endpoint by default", async () => {
    const captured: Captured[] = [];
    global.fetch = mockFetch(captured, {
      body: { translations: [{ detected_source_language: "EN", text: "你好" }] },
    }) as any;

    const res = await deeplProvider.translate(
      { text: "hello", targetLang: "zh-CN" },
      { apiKey: "k" },
    );

    expect(captured[0].url).toBe("https://api-free.deepl.com/v2/translate");
    expect((captured[0].init.headers as Record<string, string>).Authorization).toBe("DeepL-Auth-Key k");
    expect(captured[0].body.get("text")).toBe("hello");
    expect(captured[0].body.get("target_lang")).toBe("ZH");
    expect(res.text).toBe("你好");
    expect(res.detectedSourceLang).toBe("EN");
  });

  it("uses pro endpoint when useFreeApi=false", async () => {
    const captured: Captured[] = [];
    global.fetch = mockFetch(captured, {
      body: { translations: [{ text: "你好" }] },
    }) as any;
    await deeplProvider.translate(
      { text: "hi", targetLang: "zh-CN" },
      { apiKey: "k", useFreeApi: false },
    );
    expect(captured[0].url).toBe("https://api.deepl.com/v2/translate");
  });

  it("maps en-US / en-GB / pt-BR correctly", async () => {
    const captured: Captured[] = [];
    global.fetch = mockFetch(captured, { body: { translations: [{ text: "x" }] } }) as any;
    await deeplProvider.translate({ text: "hi", targetLang: "en" }, { apiKey: "k" });
    expect(captured[0].body.get("target_lang")).toBe("EN-US");
    await deeplProvider.translate({ text: "hi", targetLang: "en-GB" }, { apiKey: "k" });
    expect(captured[1].body.get("target_lang")).toBe("EN-GB");
    await deeplProvider.translate({ text: "hi", targetLang: "pt-BR" }, { apiKey: "k" });
    expect(captured[2].body.get("target_lang")).toBe("PT-BR");
  });

  it("throws on non-2xx", async () => {
    global.fetch = mockFetch([], { status: 403, body: { message: "Forbidden" } }) as any;
    await expect(
      deeplProvider.translate({ text: "hi", targetLang: "zh-CN" }, { apiKey: "bad" }),
    ).rejects.toThrow(/403/);
  });

  it("estimateCost is roughly $25 per 1M source chars", () => {
    const cost = deeplProvider.estimateCost!(undefined, { sourceChars: 1_000_000 });
    expect(cost).toBeCloseTo(25, 4);
  });
});
