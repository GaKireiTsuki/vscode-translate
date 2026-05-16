import type {
  TranslateRequest,
  TranslateResult,
  TranslateUsage,
  TranslationProvider,
} from "../types";

const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
};

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function buildUserPrompt(req: TranslateRequest): string {
  const src = req.sourceLang ? `${req.sourceLang} ` : "";
  return `Translate the following ${src}text into ${req.targetLang}. Output only the translation, no commentary, no quotes, no markdown.\n\n${req.text}`;
}

export const openaiProvider: TranslationProvider = {
  id: "openai",
  displayName: "OpenAI Compatible",
  kind: "llm",

  async translate(req, creds): Promise<TranslateResult> {
    const baseUrl = (creds.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = creds.model ?? "gpt-4o-mini";
    const url = `${baseUrl}/chat/completions`;
    const systemPrompt = creds.systemPrompt?.trim();

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: buildUserPrompt(req) });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(creds.extraHeaders ?? {}),
    };
    if (creds.apiKey) headers["Authorization"] = `Bearer ${creds.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, temperature: 0, messages }),
      signal: req.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI response missing choices[0].message.content");

    const usage: TranslateUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined;

    return { text, usage };
  },

  estimateCost(usage, opts) {
    if (!usage) return null;
    const model = opts.model ?? "";
    const price = PRICE_TABLE[model];
    if (!price) return null;
    const inTokens = usage.promptTokens ?? 0;
    const outTokens = usage.completionTokens ?? 0;
    return (inTokens / 1_000_000) * price.input + (outTokens / 1_000_000) * price.output;
  },
};
