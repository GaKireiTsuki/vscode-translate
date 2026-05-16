import type {
  TranslateResult,
  TranslateUsage,
  TranslationProvider,
} from "../types";

const FREE_URL = "https://api-free.deepl.com/v2/translate";
const PRO_URL = "https://api.deepl.com/v2/translate";

interface DeepLResponse {
  translations?: Array<{ detected_source_language?: string; text: string }>;
}

function toDeepLLang(bcp47: string): string {
  const [primary, region] = bcp47.split(/[-_]/);
  const p = (primary ?? "").toUpperCase();
  if (p === "EN") return region?.toUpperCase() === "GB" ? "EN-GB" : "EN-US";
  if (p === "PT") return region?.toUpperCase() === "BR" ? "PT-BR" : "PT-PT";
  return p;
}

export const deeplProvider: TranslationProvider = {
  id: "deepl",
  displayName: "DeepL",
  kind: "rest",

  async translate(req, creds): Promise<TranslateResult> {
    const url = creds.useFreeApi === false ? PRO_URL : FREE_URL;
    const params = new URLSearchParams();
    params.append("text", req.text);
    params.append("target_lang", toDeepLLang(req.targetLang));
    if (req.sourceLang) params.append("source_lang", toDeepLLang(req.sourceLang));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${creds.apiKey ?? ""}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(creds.extraHeaders ?? {}),
      },
      body: params.toString(),
      signal: req.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DeepL ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as DeepLResponse;
    const first = data.translations?.[0];
    if (!first) throw new Error("DeepL response missing translations");
    return {
      text: first.text,
      detectedSourceLang: first.detected_source_language,
    };
  },

  estimateCost(_usage: TranslateUsage | undefined, opts): number | null {
    // DeepL Pro pricing: $25 per 1M source characters. Free API = $0 but we can't
    // distinguish here, so we conservatively report Pro pricing.
    return (opts.sourceChars / 1_000_000) * 25;
  },
};
