import * as crypto from "node:crypto";
import type {
  TranslateResult,
  TranslateUsage,
  TranslationProvider,
} from "../types";

const URL = "https://fanyi-api.baidu.com/api/trans/vip/translate";

interface BaiduResponse {
  trans_result?: Array<{ src: string; dst: string }>;
  from?: string;
  to?: string;
  error_code?: string;
  error_msg?: string;
}

function toBaiduLang(bcp47: string): string {
  const p = (bcp47.split(/[-_]/)[0] ?? "").toLowerCase();
  switch (p) {
    case "zh": return "zh";
    case "ja": return "jp";
    case "ko": return "kor";
    case "fr": return "fra";
    case "es": return "spa";
    case "ar": return "ara";
    case "vi": return "vie";
    default: return p;
  }
}

export const baiduProvider: TranslationProvider = {
  id: "baidu",
  displayName: "Baidu",
  kind: "rest",

  async translate(req, creds): Promise<TranslateResult> {
    const appId = creds.appId ?? "";
    const appSecret = creds.appSecret ?? "";
    if (!appId || !appSecret) throw new Error("Baidu requires appId + appSecret");

    const salt = Math.random().toString(36).slice(2, 14);
    const sign = crypto
      .createHash("md5")
      .update(appId + req.text + salt + appSecret)
      .digest("hex");

    const params = new URLSearchParams();
    params.append("q", req.text);
    params.append("from", req.sourceLang ? toBaiduLang(req.sourceLang) : "auto");
    params.append("to", toBaiduLang(req.targetLang));
    params.append("appid", appId);
    params.append("salt", salt);
    params.append("sign", sign);

    const res = await fetch(`${URL}?${params.toString()}`, {
      method: "GET",
      headers: creds.extraHeaders ?? {},
      signal: req.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Baidu HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as BaiduResponse;
    if (data.error_code) {
      throw new Error(`Baidu error_code ${data.error_code}${data.error_msg ? `: ${data.error_msg}` : ""}`);
    }
    const text = data.trans_result?.map((r) => r.dst).join("\n");
    if (!text) throw new Error("Baidu response missing trans_result");
    return { text, detectedSourceLang: data.from };
  },

  estimateCost(_usage: TranslateUsage | undefined, opts): number | null {
    // Baidu 标准版: ¥49 / 1M chars ≈ $7 USD.
    return (opts.sourceChars / 1_000_000) * 7;
  },
};
