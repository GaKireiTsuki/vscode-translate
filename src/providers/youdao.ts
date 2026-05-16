import * as crypto from "node:crypto";
import type {
  TranslateResult,
  TranslateUsage,
  TranslationProvider,
} from "../types";

const URL = "https://openapi.youdao.com/api";

interface YoudaoResponse {
  errorCode?: string;
  translation?: string[];
  l?: string;
  msg?: string;
}

function toYoudaoLang(bcp47: string): string {
  const p = (bcp47.split(/[-_]/)[0] ?? "").toLowerCase();
  if (p === "zh") return "zh-CHS";
  return p;
}

export function truncateForSign(q: string): string {
  if (q.length <= 20) return q;
  return q.slice(0, 10) + String(q.length) + q.slice(-10);
}

export const youdaoProvider: TranslationProvider = {
  id: "youdao",
  displayName: "Youdao",
  kind: "rest",

  async translate(req, creds): Promise<TranslateResult> {
    const appKey = creds.appKey ?? "";
    const appSecret = creds.appSecret ?? "";
    if (!appKey || !appSecret) throw new Error("Youdao requires appKey + appSecret");

    const salt = crypto.randomUUID();
    const curtime = Math.floor(Date.now() / 1000).toString();
    const input = truncateForSign(req.text);
    const sign = crypto
      .createHash("sha256")
      .update(appKey + input + salt + curtime + appSecret)
      .digest("hex");

    const params = new URLSearchParams();
    params.append("q", req.text);
    params.append("from", req.sourceLang ? toYoudaoLang(req.sourceLang) : "auto");
    params.append("to", toYoudaoLang(req.targetLang));
    params.append("appKey", appKey);
    params.append("salt", salt);
    params.append("sign", sign);
    params.append("signType", "v3");
    params.append("curtime", curtime);

    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(creds.extraHeaders ?? {}),
      },
      body: params.toString(),
      signal: req.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Youdao HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as YoudaoResponse;
    if (data.errorCode && data.errorCode !== "0") {
      throw new Error(`Youdao errorCode ${data.errorCode}${data.msg ? `: ${data.msg}` : ""}`);
    }
    const text = data.translation?.[0];
    if (!text) throw new Error("Youdao response missing translation");
    const detected = data.l?.split("2")[0];
    return { text, detectedSourceLang: detected };
  },

  estimateCost(_usage: TranslateUsage | undefined, opts): number | null {
    // Youdao 文本翻译: ≈ ¥48 / 1M chars ≈ $7 USD.
    return (opts.sourceChars / 1_000_000) * 7;
  },
};
