import * as vscode from "vscode";
import { resolveTargetLanguage, type ConfigStore } from "../config";
import type { Translator } from "../translator";
import type { HoverManager } from "./hover";

export class SelectionHandler {
  constructor(
    private readonly translator: Translator,
    private readonly config: ConfigStore,
    private readonly hover: HoverManager,
  ) {}

  register(_context: vscode.ExtensionContext): void {
    // 选区翻译改为 hover 触发，不再监听选区变化做自动弹出。
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
}
