import * as vscode from "vscode";
import type { ConfigStore } from "../config";
import { PROVIDER_LABELS } from "../labels";
import type { StatsRecorder } from "../stats";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private offStats?: () => void;
  private offConfig?: vscode.Disposable;

  constructor(
    private readonly stats: StatsRecorder,
    private readonly config: ConfigStore,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "fine-translate.showUsagePanel";
    this.item.tooltip = vscode.l10n.t("Fine Translate · click to show usage");
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
    const short = PROVIDER_LABELS[id] ?? id;
    this.item.text = `$(globe) ${today.toLocaleString()} · ${short}`;
  }
}
