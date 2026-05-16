import * as vscode from "vscode";
import { resolveTargetLanguage, type ConfigStore } from "../config";
import type { Translator } from "../translator";
import type { HoverManager } from "./hover";

const LONG_TEXT_THRESHOLD = 800;
const AUTO_DEBOUNCE_MS = 500;
const AUTO_MIN_CHARS = 2;

export class SelectionHandler {
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private output: vscode.OutputChannel | undefined;

  constructor(
    private readonly translator: Translator,
    private readonly config: ConfigStore,
    private readonly hover: HoverManager,
  ) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((e) => this.onSelectionChange(e)),
      { dispose: () => this.disposeTimer() },
    );
  }

  async runCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(vscode.l10n.t("No active editor."));
      return;
    }
    const range = new vscode.Range(editor.selection.start, editor.selection.end);
    const text = editor.document.getText(range).trim();
    if (!text) {
      void vscode.window.showWarningMessage(vscode.l10n.t("No selection."));
      return;
    }
    await this.translateAndShow(editor, range, text);
  }

  private onSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.config.get().selection.autoOnSelect) return;
    const sel = e.selections[0];
    if (!sel || sel.isEmpty) return;
    this.disposeTimer();
    this.autoTimer = setTimeout(() => {
      const editor = e.textEditor;
      const range = new vscode.Range(editor.selection.start, editor.selection.end);
      const text = editor.document.getText(range).trim();
      if (text.length < AUTO_MIN_CHARS) return;
      void this.translateAndShow(editor, range, text);
    }, AUTO_DEBOUNCE_MS);
  }

  private async translateAndShow(
    editor: vscode.TextEditor,
    range: vscode.Range,
    text: string,
  ): Promise<void> {
    const cfg = this.config.get();
    const targetLang = resolveTargetLanguage(cfg);
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: vscode.l10n.t("Translating…") },
        () => this.translator.translate({ text, targetLang }),
      );

      if (text.length > LONG_TEXT_THRESHOLD || result.text.length > LONG_TEXT_THRESHOLD) {
        const ch = this.ensureOutput();
        ch.appendLine(`──── ${new Date().toLocaleString()} → ${targetLang} ────`);
        ch.appendLine(result.text);
        ch.appendLine("");
        ch.show(true);
        return;
      }

      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${vscode.l10n.t("Translation")}** → \`${targetLang}\`\n\n`);
      md.appendText(result.text);
      this.hover.showAdhoc(editor.document.uri, range, md);
      await vscode.commands.executeCommand("editor.action.showHover");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(message);
    }
  }

  private ensureOutput(): vscode.OutputChannel {
    if (!this.output) this.output = vscode.window.createOutputChannel("Fine Translate");
    return this.output;
  }

  private disposeTimer(): void {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }
}
