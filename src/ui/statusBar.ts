import * as vscode from "vscode";
import type { ConfigStore } from "../config";
import type { StatsRecorder } from "../stats";
import type { ProviderId } from "../types";

const PROVIDER_SHORT: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepl: "DeepL",
  youdao: "Youdao",
  baidu: "Baidu",
};

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private offStats?: () => void;
  private offConfig?: vscode.Disposable;

  constructor(
    private readonly stats: StatsRecorder,
    private readonly config: ConfigStore,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "translate.showUsagePanel";
    this.item.tooltip = "Translate · click to show usage";
    this.update();
  }

  register(context: vscode.ExtensionContext): void {
    this.offStats = this.stats.onChange(() => this.update());
    this.offConfig = this.config.onDidChange(() => this.update());
    context.subscriptions.push(this.item, {
      dispose: () => {
        this.offStats?.();
        this.offConfig?.dispose();
      },
    });
    this.item.show();
  }

  private update(): void {
    const today = this.stats.todaySourceChars();
    const id = this.config.get().activeProvider;
    const short = PROVIDER_SHORT[id] ?? id;
    this.item.text = `$(globe) ${today.toLocaleString()} · ${short}`;
  }
}
