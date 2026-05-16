import * as crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baiduProvider } from "./baidu";

interface Captured {
  url: string;
  init: RequestInit;
}

function mockFetch(captured: Captured[], response: { status?: number; body: any }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    const status = response.status ?? 200;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      statusText: ok ? "OK" : "ERR",
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    } as Response;
  });
}

function paramsFromUrl(url: string): URLSearchParams {
  const q = url.split("?")[1] ?? "";
  return new URLSearchParams(q);
}

describe("baiduProvider", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("GETs fanyi-api with md5 sign", async () => {
    const captured: Captured[] = [];
    global.fetch = mockFetch(captured, {
      body: { from: "en", to: "zh", trans_result: [{ src: "hello", dst: "你好" }] },
    }) as any;

    const res = await baiduProvider.translate(
      { text: "hello", targetLang: "zh-CN" },
      { appId: "20240000000", appSecret: "secret" },
    );

    expect(captured[0].init.method).toBe("GET");
    expect(captured[0].url.startsWith("https://fanyi-api.baidu.com/api/trans/vip/translate?")).toBe(true);
    const p = paramsFromUrl(captured[0].url);
    expect(p.get("q")).toBe("hello");
    expect(p.get("to")).toBe("zh");
    expect(p.get("from")).toBe("auto");
    expect(p.get("appid")).toBe("20240000000");
    const salt = p.get("salt")!;
    const expected = crypto.createHash("md5").update("20240000000hello" + salt + "secret").digest("hex");
    expect(p.get("sign")).toBe(expected);

    expect(res.text).toBe("你好");
    expect(res.detectedSourceLang).toBe("en");
  });

  it("maps ja/ko/fr to jp/kor/fra", async () => {
    const captured: Captured[] = [];
    global.fetch = mockFetch(captured, {
      body: { trans_result: [{ src: "x", dst: "x" }] },
    }) as any;
    await baiduProvider.translate({ text: "hi", targetLang: "ja" }, { appId: "1", appSecret: "s" });
    expect(paramsFromUrl(captured[0].url).get("to")).toBe("jp");
    await baiduProvider.translate({ text: "hi", targetLang: "ko" }, { appId: "1", appSecret: "s" });
    expect(paramsFromUrl(captured[1].url).get("to")).toBe("kor");
    await baiduProvider.translate({ text: "hi", targetLang: "fr" }, { appId: "1", appSecret: "s" });
    expect(paramsFromUrl(captured[2].url).get("to")).toBe("fra");
  });

  it("throws on error_code", async () => {
    global.fetch = mockFetch([], {
      body: { error_code: "54001", error_msg: "Invalid sign" },
    }) as any;
    await expect(
      baiduProvider.translate(
        { text: "hi", targetLang: "zh-CN" },
        { appId: "1", appSecret: "s" },
      ),
    ).rejects.toThrow(/54001/);
  });

  it("joins multi-paragraph trans_result with newlines", async () => {
    global.fetch = mockFetch([], {
      body: { trans_result: [{ src: "a", dst: "甲" }, { src: "b", dst: "乙" }] },
    }) as any;
    const res = await baiduProvider.translate(
      { text: "a\nb", targetLang: "zh-CN" },
      { appId: "1", appSecret: "s" },
    );
    expect(res.text).toBe("甲\n乙");
  });

  it("rejects missing credentials", async () => {
    await expect(
      baiduProvider.translate({ text: "hi", targetLang: "zh-CN" }, {}),
    ).rejects.toThrow(/appId/);
  });
});
