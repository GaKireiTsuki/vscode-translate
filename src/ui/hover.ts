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
  private collectingExternal = false;

  constructor(
    private readonly translator: Translator,
    private readonly config: ConfigStore,
  ) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider({ pattern: "**" }, this),
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
    if (this.collectingExternal) return undefined;

    const ad = this.consumeAdhoc();
    if (ad && ad.uri === document.uri.toString() && ad.range.contains(position)) {
      return new vscode.Hover(ad.content, ad.range);
    }

    const cfg = this.config.get();

    if (cfg.selection.autoOnSelect) {
      const selectionHover = await this.handleSelectionHover(document, position, cfg, token);
      if (selectionHover) return selectionHover;
    }

    if (!cfg.hover.enabled) return undefined;
    if (!matchesLanguage(document.languageId, cfg.hover.languages)) return undefined;

    return this.handleExternalHover(document, position, cfg, token);
  }

  private async handleSelectionHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    cfg: ReturnType<ConfigStore["get"]>,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) return undefined;

    for (const sel of editor.selections) {
      if (sel.isEmpty || !sel.contains(position)) continue;
      const range = new vscode.Range(sel.start, sel.end);
      const text = document.getText(range).trim();
      if (text.length < HOVER_MIN_CHARS) continue;
      if (text.length > cfg.maxCharsPerRequest) continue;

      const targetLang = resolveTargetLanguage(cfg);
      const md = await this.translateCached(text, targetLang, document.uri, range, false, token);
      if (token.isCancellationRequested) return undefined;
      return new vscode.Hover(md, range);
    }
    return undefined;
  }

  private async handleExternalHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    cfg: ReturnType<ConfigStore["get"]>,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    let hovers: vscode.Hover[] = [];
    this.collectingExternal = true;
    try {
      hovers =
        (await vscode.commands.executeCommand<vscode.Hover[]>(
          "vscode.executeHoverProvider",
          document.uri,
          position,
        )) ?? [];
    } catch {
      hovers = [];
    } finally {
      this.collectingExternal = false;
    }
    if (token.isCancellationRequested) return undefined;

    const collected = collectHoverText(hovers);
    let range: vscode.Range | undefined = collected.range;
    let text = collected.text.trim();

    if (text.length < HOVER_MIN_CHARS) {
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) return undefined;
      text = document.getText(wordRange).trim();
      if (text.length < HOVER_MIN_CHARS) return undefined;
      range = wordRange;
    }

    if (text.length > cfg.maxCharsPerRequest) {
      text = text.slice(0, cfg.maxCharsPerRequest);
    }

    const targetLang = resolveTargetLanguage(cfg);
    const md = await this.translateCached(text, targetLang, document.uri, range, true, token);
    if (token.isCancellationRequested) return undefined;
    return new vscode.Hover(md, range);
  }

  private async translateCached(
    text: string,
    targetLang: string,
    uri: vscode.Uri,
    range: vscode.Range | undefined,
    preserveMarkdown: boolean,
    token: vscode.CancellationToken,
  ): Promise<vscode.MarkdownString> {
    const anchor = range
      ? `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
      : "anchorless";
    const key = `${uri.toString()}|${anchor}|${targetLang}|${preserveMarkdown ? "md" : "txt"}|${text}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const ac = new AbortController();
    token.onCancellationRequested(() => ac.abort());
    const promise = this.translateForHover(text, targetLang, preserveMarkdown, ac.signal);
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async translateForHover(
    text: string,
    targetLang: string,
    preserveMarkdown: boolean,
    signal: AbortSignal,
  ): Promise<vscode.MarkdownString> {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportHtml = false;
    md.appendMarkdown(`**${vscode.l10n.t("Translation")}** → \`${targetLang}\`\n\n`);
    try {
      const result = await this.translator.translate({ text, targetLang, preserveMarkdown, signal });
      if (preserveMarkdown) {
        md.appendMarkdown(result.text);
      } else {
        md.appendText(result.text);
      }
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

interface CollectedHover {
  text: string;
  range: vscode.Range | undefined;
}

function collectHoverText(hovers: vscode.Hover[]): CollectedHover {
  const parts: string[] = [];
  let range: vscode.Range | undefined;
  for (const h of hovers) {
    if (!range && h.range) range = h.range;
    for (const c of h.contents) {
      const cleaned = stripMarkdownNoise(readContentValue(c));
      if (cleaned) parts.push(cleaned);
    }
  }
  return { text: dedupe(parts).join("\n\n---\n\n"), range };
}

function readContentValue(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const v = (content as { value?: unknown }).value;
    if (typeof v === "string") return v;
  }
  return "";
}

function dedupe(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

// 剥掉 hover markdown 里翻译没意义的噪音（图片、代码块、command 链接的复杂 URL、codicon、HTML），
// 保留 markdown 结构（标题、加粗、列表、引用、分隔线、普通链接），方便下游 LLM 按结构翻译。
function stripMarkdownNoise(md: string): string {
  if (!md) return "";
  let text = md;
  // 代码块整段丢弃（diff、源码片段对翻译没用）
  text = text.replace(/```[\s\S]*?```/g, "");
  // 图片整段丢弃
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // command: 链接 → 保留 label（去掉 codicon），URL 丢弃
  text = text.replace(/\[([^\]]*)\]\(command:[^)]*\)/g, (_, label: string) => {
    const cleaned = label.replace(/\$\([^)]+\)/g, "").trim();
    return cleaned ? ` ${cleaned} ` : " ";
  });
  // 残留 codicon $(name)
  text = text.replace(/\$\([^)]+\)/g, "");
  // HTML 标签
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // 合并空白行
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
