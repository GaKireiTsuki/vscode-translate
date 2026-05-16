import * as crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { truncateForSign, youdaoProvider } from "./youdao";

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
      text: async () => JSON.stringify(response.body),
    } as Response;
  });
}

describe("youdaoProvider", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts form to openapi.youdao.com with sha256 sign", async () => {
    const captured: Captured[] = [];
    global.fetch = mockFetch(captured, {
      body: { errorCode: "0", translation: ["你好"], l: "en2zh-CHS" },
    }) as any;

    const res = await youdaoProvider.translate(
      { text: "hello", targetLang: "zh-CN" },
      { appKey: "AK", appSecret: "AS" },
    );

    expect(captured[0].url).toBe("https://openapi.youdao.com/api");
    expect(captured[0].body.get("q")).toBe("hello");
    expect(captured[0].body.get("to")).toBe("zh-CHS");
    expect(captured[0].body.get("from")).toBe("auto");
    expect(captured[0].body.get("appKey")).toBe("AK");
    expect(captured[0].body.get("signType")).toBe("v3");

    // Verify the sign is sha256(AK + truncate("hello") + salt + curtime + AS)
    const salt = captured[0].body.get("salt")!;
    const curtime = captured[0].body.get("curtime")!;
    const expected = crypto
      .createHash("sha256")
      .update("AK" + "hello" + salt + curtime + "AS")
      .digest("hex");
    expect(captured[0].body.get("sign")).toBe(expected);

    expect(res.text).toBe("你好");
    expect(res.detectedSourceLang).toBe("en");
  });

  it("throws on non-zero errorCode", async () => {
    global.fetch = mockFetch([], { body: { errorCode: "108", msg: "appKey invalid" } }) as any;
    await expect(
      youdaoProvider.translate(
        { text: "hi", targetLang: "zh-CN" },
        { appKey: "AK", appSecret: "AS" },
      ),
    ).rejects.toThrow(/108/);
  });

  it("rejects missing credentials", async () => {
    await expect(
      youdaoProvider.translate({ text: "hi", targetLang: "zh-CN" }, {}),
    ).rejects.toThrow(/appKey/);
  });

  it("truncateForSign follows the documented rule", () => {
    expect(truncateForSign("short")).toBe("short");
    expect(truncateForSign("a".repeat(20))).toBe("a".repeat(20));
    const long = "0123456789ABCDEFGHIJKLMNOPQRSTUV"; // 32 chars
    expect(truncateForSign(long)).toBe("0123456789" + "32" + "MNOPQRSTUV");
  });
});
