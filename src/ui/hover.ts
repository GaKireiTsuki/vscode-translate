import * as vscode from "vscode";
import { resolveTargetLanguage, type ConfigStore } from "../config";
import type { Translator } from "../translator";

interface AdhocEntry {
  uri: string;
  range: vscode.Range;
  content: vscode.MarkdownString;
  expires: number;
}

const ADHOC_TTL_MS = 30_000;
const HOVER_MIN_CHARS = 2;

export class HoverManager implements vscode.HoverProvider {
  private adhoc: AdhocEntry | null = null;
  private readonly inflight = new Map<string, Promise<vscode.MarkdownString>>();

  constructor(
    private readonly translator: Translator,
    private readonly config: ConfigStore,
  ) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider({ scheme: "file" }, this),
      vscode.languages.registerHoverProvider({ scheme: "untitled" }, this),
    );
  }

  showAdhoc(uri: vscode.Uri, range: vscode.Range, content: vscode.MarkdownString): void {
    this.adhoc = { uri: uri.toString(), range, content, expires: Date.now() + ADHOC_TTL_MS };
  }

  private consumeAdhoc(): AdhocEntry | null {
    if (this.adhoc && this.adhoc.expires <= Date.now()) {
      this.adhoc = null;
    }
    return this.adhoc;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const ad = this.consumeAdhoc();
    if (ad && ad.uri === document.uri.toString() && ad.range.contains(position)) {
      return new vscode.Hover(ad.content, ad.range);
    }

    const cfg = this.config.get();
    if (!cfg.hover.enabled) return undefined;
    if (!matchesLanguage(document.languageId, cfg.hover.languages)) return undefined;

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return undefined;
    const text = document.getText(wordRange).trim();
    if (text.length < HOVER_MIN_CHARS) return undefined;
    if (text.length > cfg.maxCharsPerRequest) return undefined;

    const targetLang = resolveTargetLanguage(cfg);
    const key = `${document.uri.toString()}|${wordRange.start.line}:${wordRange.start.character}|${text}|${targetLang}`;
    const existing = this.inflight.get(key);
    if (existing) {
      const md = await existing;
      return token.isCancellationRequested ? undefined : new vscode.Hover(md, wordRange);
    }

    const ac = new AbortController();
    token.onCancellationRequested(() => ac.abort());
    const promise = this.translateForHover(text, targetLang, ac.signal);
    this.inflight.set(key, promise);
    try {
      const md = await promise;
      if (token.isCancellationRequested) return undefined;
      return new vscode.Hover(md, wordRange);
    } finally {
      this.inflight.delete(key);
    }
  }

  private async translateForHover(
    text: string,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<vscode.MarkdownString> {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Translate** → \`${targetLang}\`\n\n`);
    try {
      const result = await this.translator.translate({ text, targetLang, signal });
      md.appendText(result.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      md.appendMarkdown(`*error:* \`${message.slice(0, 200)}\``);
    }
    return md;
  }
}

function matchesLanguage(languageId: string, allowed: string[]): boolean {
  if (allowed.includes("*")) return true;
  return allowed.includes(languageId);
}
