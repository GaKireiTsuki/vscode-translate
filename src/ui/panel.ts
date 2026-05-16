import * as vscode from "vscode";
import type { ConfigStore } from "../config";
import { PROVIDER_LABELS } from "../labels";
import type { StatsRecorder } from "../stats";
import type { ProviderTotals, StatsState } from "../types";

export class UsagePanel {
  private panel: vscode.WebviewPanel | undefined;
  private offStats: (() => void) | undefined;
  private offConfig: vscode.Disposable | undefined;

  constructor(
    private readonly stats: StatsRecorder,
    private readonly config: ConfigStore,
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.render();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "fine-translate.usage",
      vscode.l10n.t("Fine Translate · Usage"),
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.offStats?.();
      this.offStats = undefined;
      this.offConfig?.dispose();
      this.offConfig = undefined;
    });
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.offStats = this.stats.onChange(() => this.render());
    this.offConfig = this.config.onDidChange(() => this.render());
    this.render();
  }

  private handleMessage(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: string };
    if (m.type === "reset") {
      void vscode.commands.executeCommand("fine-translate.resetStats");
    } else if (m.type === "clearCache") {
      void vscode.commands.executeCommand("fine-translate.clearCache");
    }
  }

  private render(): void {
    if (!this.panel) return;
    const nonce = makeNonce();
    this.panel.webview.html = renderHtml(
      this.panel.webview,
      this.stats.get(),
      this.config.get().activeProvider,
      nonce,
    );
  }
}

function makeNonce(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function renderHtml(
  webview: vscode.Webview,
  state: StatsState,
  activeProvider: string,
  nonce: string,
): string {
  const cspSource = webview.cspSource;
  const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  const total = state.totals;
  const providers = Object.entries(state.byProvider);
  const t = vscode.l10n.t;
  const body = providers.length === 0
    ? `<div class="empty">${escapeHtml(t("No translations recorded yet."))}</div>`
    : `<table>
        <thead><tr>
          <th>${escapeHtml(t("Provider"))}</th>
          <th>${escapeHtml(t("Reqs"))}</th>
          <th>${escapeHtml(t("Src chars"))}</th>
          <th>${escapeHtml(t("Tgt chars"))}</th>
          <th>${escapeHtml(t("Tok in"))}</th>
          <th>${escapeHtml(t("Tok out"))}</th>
          <th>${escapeHtml(t("Cost (USD)"))}</th>
        </tr></thead>
        <tbody>${providers.map(([id, row]) => providerRow(id, row, activeProvider)).join("")}</tbody>
      </table>`;

  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 1.5rem; line-height: 1.5; }
  h1 { font-size: 1.2rem; margin: 0 0 1rem; }
  h2 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; }
  .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: .75rem 1rem; }
  .card .label { font-size: .7rem; opacity: .7; text-transform: uppercase; letter-spacing: .05em; }
  .card .value { font-size: 1.4rem; font-weight: 600; margin-top: .25rem; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { padding: .5rem .75rem; text-align: right; border-bottom: 1px solid var(--vscode-panel-border); }
  th:first-child, td:first-child { text-align: left; }
  th { font-weight: 600; opacity: .85; }
  tr.active td { color: var(--vscode-textLink-foreground); font-weight: 600; }
  .actions { margin-top: 1.5rem; display: flex; gap: .5rem; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); padding: .4rem .9rem; cursor: pointer; border-radius: 3px; font: inherit; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  .empty { opacity: .6; font-style: italic; padding: 1rem 0; }
</style>
</head><body>
<h1>${escapeHtml(t("Translation Usage"))}</h1>

<div class="grid">
  <div class="card"><div class="label">${escapeHtml(t("Requests"))}</div><div class="value">${total.requests.toLocaleString()}</div></div>
  <div class="card"><div class="label">${escapeHtml(t("Source chars"))}</div><div class="value">${total.sourceChars.toLocaleString()}</div></div>
  <div class="card"><div class="label">${escapeHtml(t("Target chars"))}</div><div class="value">${total.targetChars.toLocaleString()}</div></div>
  <div class="card"><div class="label">${escapeHtml(t("Tokens in / out"))}</div><div class="value">${total.tokensIn.toLocaleString()} / ${total.tokensOut.toLocaleString()}</div></div>
  <div class="card"><div class="label">${escapeHtml(t("Estimated cost"))}</div><div class="value">$${total.estimatedCostUsd.toFixed(4)}</div></div>
</div>

<h2>${escapeHtml(t("By provider"))}</h2>
${body}

<div class="actions">
  <button class="primary" id="reset" type="button">${escapeHtml(t("Reset Statistics"))}</button>
  <button id="clearCache" type="button">${escapeHtml(t("Clear Cache"))}</button>
</div>

<script nonce="${nonce}">
const vs = acquireVsCodeApi();
document.getElementById('reset').addEventListener('click', () => vs.postMessage({ type: 'reset' }));
document.getElementById('clearCache').addEventListener('click', () => vs.postMessage({ type: 'clearCache' }));
</script>
</body></html>`;
}

function providerRow(id: string, t: ProviderTotals, active: string): string {
  const label = (PROVIDER_LABELS as Record<string, string>)[id] ?? id;
  const cls = id === active ? "active" : "";
  return `<tr class="${cls}"><td>${escapeHtml(label)}</td><td>${t.requests.toLocaleString()}</td><td>${t.sourceChars.toLocaleString()}</td><td>${t.targetChars.toLocaleString()}</td><td>${t.tokensIn.toLocaleString()}</td><td>${t.tokensOut.toLocaleString()}</td><td>$${t.estimatedCostUsd.toFixed(4)}</td></tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
