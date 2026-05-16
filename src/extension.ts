import * as vscode from "vscode";
import { LRU } from "./cache";
import { ConfigStore, type ResolvedConfig } from "./config";
import { clearRegistry, registerProvider } from "./providers";
import { openaiProvider } from "./providers/openai";
import { deeplProvider } from "./providers/deepl";
import { youdaoProvider } from "./providers/youdao";
import { baiduProvider } from "./providers/baidu";
import { Secrets, type SecretField } from "./secrets";
import { StatsRecorder } from "./stats";
import { Translator } from "./translator";
import type { ProviderCredentials, ProviderId, StatsState, TranslateResult } from "./types";
import { emptyStatsState } from "./types";
import { HoverManager } from "./ui/hover";
import { SelectionHandler } from "./ui/selection";
import { StatusBar } from "./ui/statusBar";
import { UsagePanel } from "./ui/panel";

const STATS_KEY = "translate.stats.v1";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI Compatible",
  deepl: "DeepL",
  youdao: "Youdao",
  baidu: "Baidu",
};

let pendingFlush: () => Promise<void> = async () => {};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  clearRegistry();
  registerProvider(openaiProvider);
  registerProvider(deeplProvider);
  registerProvider(youdaoProvider);
  registerProvider(baiduProvider);

  const config = new ConfigStore();
  context.subscriptions.push({ dispose: () => config.dispose() });

  const secrets = new Secrets(context.secrets);

  const initialStats = context.globalState.get<StatsState>(STATS_KEY) ?? emptyStatsState();
  const stats = new StatsRecorder(initialStats);
  context.subscriptions.push({ dispose: stats.onChange(() => scheduleFlush()) });

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      try {
        await context.globalState.update(STATS_KEY, stats.get());
      } catch {
        /* ignored */
      }
    }, 1000);
  }
  pendingFlush = async () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await context.globalState.update(STATS_KEY, stats.get());
  };
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((s) => {
      if (!s.focused) void pendingFlush();
    }),
  );

  let cache = makeCache(config.get());
  context.subscriptions.push(
    config.onDidChange((cfg) => {
      cache = makeCache(cfg);
    }),
  );

  const translator = new Translator({
    resolveProvider: async () => {
      const cfg = config.get();
      const id = cfg.activeProvider;
      const credentials = await resolveCredentials(id, cfg, secrets);
      return { id, credentials };
    },
    getCache: () => cache,
    getMaxCharsPerRequest: () => config.get().maxCharsPerRequest,
    getEstimateCost: () => config.get().telemetry.estimateCost,
    stats,
  });

  const hoverManager = new HoverManager(translator, config);
  hoverManager.register(context);

  const selectionHandler = new SelectionHandler(translator, config, hoverManager);
  selectionHandler.register(context);

  const statusBar = new StatusBar(stats, config);
  statusBar.register(context);

  const usagePanel = new UsagePanel(stats, config);

  context.subscriptions.push(
    vscode.commands.registerCommand("translate.selection", () => selectionHandler.runCommand()),
    vscode.commands.registerCommand("translate.toggleHover", () => toggleHover(config)),
    vscode.commands.registerCommand("translate.setApiKey", () => setApiKeyCommand(secrets)),
    vscode.commands.registerCommand("translate.clearApiKey", () => clearApiKeyCommand(secrets)),
    vscode.commands.registerCommand("translate.clearCache", () => {
      cache.clear();
      void vscode.window.showInformationMessage("[translate] Cache cleared.");
    }),
    vscode.commands.registerCommand("translate.showUsagePanel", () => usagePanel.show()),
    vscode.commands.registerCommand("translate.resetStats", async () => {
      const ok = await vscode.window.showWarningMessage(
        "Reset translation statistics?",
        { modal: true },
        "Reset",
      );
      if (ok === "Reset") {
        stats.reset();
        await pendingFlush();
      }
    }),
    vscode.commands.registerCommand("translate.switchProvider", () => switchProviderCommand(config)),
  );
}

export async function deactivate(): Promise<void> {
  await pendingFlush();
}

function makeCache(cfg: ResolvedConfig): LRU<string, TranslateResult> {
  return new LRU<string, TranslateResult>(cfg.cache.maxEntries, cfg.cache.ttlMinutes * 60_000);
}

async function resolveCredentials(
  id: ProviderId,
  cfg: ResolvedConfig,
  secrets: Secrets,
): Promise<ProviderCredentials> {
  switch (id) {
    case "openai":
      return {
        apiKey: await secrets.get("openai", "apiKey"),
        baseUrl: cfg.openai.baseUrl,
        model: cfg.openai.model,
        systemPrompt: cfg.openai.systemPrompt,
      };
    case "deepl":
      return {
        apiKey: await secrets.get("deepl", "apiKey"),
        useFreeApi: cfg.deepl.useFreeApi,
      };
    case "youdao":
      return {
        appKey: cfg.youdao.appKey,
        appSecret: await secrets.get("youdao", "appSecret"),
      };
    case "baidu":
      return {
        appId: cfg.baidu.appId,
        appSecret: await secrets.get("baidu", "appSecret"),
      };
  }
}

async function toggleHover(config: ConfigStore): Promise<void> {
  const enabled = !config.get().hover.enabled;
  await config.update("hover.enabled", enabled);
  void vscode.window.showInformationMessage(
    `[translate] Hover translation ${enabled ? "enabled" : "disabled"}.`,
  );
}

async function setApiKeyCommand(secrets: Secrets): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    (Object.entries(PROVIDER_LABELS) as Array<[ProviderId, string]>).map(([id, label]) => ({
      id,
      label,
    })),
    { title: "Set API key for which provider?" },
  );
  if (!pick) return;
  const useAppSecret = pick.id === "baidu" || pick.id === "youdao";
  const fieldLabel = useAppSecret ? "App Secret" : "API Key";
  const value = await vscode.window.showInputBox({
    title: `Enter ${fieldLabel} for ${pick.label}`,
    password: true,
    placeHolder: "Stored via SecretStorage, not in settings.json.",
  });
  if (!value) return;
  const field: SecretField = useAppSecret ? "appSecret" : "apiKey";
  await secrets.set(pick.id, value, field);
  void vscode.window.showInformationMessage(`[translate] ${pick.label} ${fieldLabel} stored.`);
}

async function clearApiKeyCommand(secrets: Secrets): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    (Object.entries(PROVIDER_LABELS) as Array<[ProviderId, string]>).map(([id, label]) => ({
      id,
      label,
    })),
    { title: "Clear API key for which provider?" },
  );
  if (!pick) return;
  await secrets.deleteAll(pick.id);
  void vscode.window.showInformationMessage(`[translate] ${pick.label} secrets cleared.`);
}

async function switchProviderCommand(config: ConfigStore): Promise<void> {
  const current = config.get().activeProvider;
  const pick = await vscode.window.showQuickPick(
    (Object.entries(PROVIDER_LABELS) as Array<[ProviderId, string]>).map(([id, label]) => ({
      id,
      label,
      description: current === id ? "(current)" : undefined,
    })),
    { title: "Switch active translation provider" },
  );
  if (!pick) return;
  await config.update("activeProvider", pick.id);
  void vscode.window.showInformationMessage(`[translate] Active provider → ${pick.label}.`);
}
