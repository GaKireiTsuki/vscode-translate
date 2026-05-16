import * as vscode from "vscode";
import { LRU } from "./cache";
import { ConfigStore, type ResolvedConfig } from "./config";
import { clearRegistry, registerProvider } from "./providers";
import { openaiProvider } from "./providers/openai";
import { OPENAI_PRESETS, getPreset } from "./providers/openai-presets";
import { deeplProvider } from "./providers/deepl";
import { youdaoProvider } from "./providers/youdao";
import { baiduProvider } from "./providers/baidu";
import { Secrets, type SecretField } from "./secrets";
import { StatsRecorder } from "./stats";
import { Translator } from "./translator";
import type {
  ProviderCredentials,
  ProviderId,
  StatsState,
  TranslateResult,
} from "./types";
import { emptyStatsState, isOpenAICompat } from "./types";
import { PROVIDER_LABELS } from "./labels";
import { HoverManager } from "./ui/hover";
import { SelectionHandler } from "./ui/selection";
import { StatusBar } from "./ui/statusBar";
import { UsagePanel } from "./ui/panel";

const STATS_KEY = "fine-translate.stats.v1";

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
    vscode.commands.registerCommand("fine-translate.selection", () => selectionHandler.runCommand()),
    vscode.commands.registerCommand("fine-translate.toggleHover", () => toggleHover(config)),
    vscode.commands.registerCommand("fine-translate.setApiKey", () => setApiKeyCommand(secrets)),
    vscode.commands.registerCommand("fine-translate.clearApiKey", () => clearApiKeyCommand(secrets)),
    vscode.commands.registerCommand("fine-translate.clearCache", () => {
      cache.clear();
      void vscode.window.showInformationMessage(vscode.l10n.t("Cache cleared."));
    }),
    vscode.commands.registerCommand("fine-translate.showUsagePanel", () => usagePanel.show()),
    vscode.commands.registerCommand("fine-translate.resetStats", async () => {
      const resetLabel = vscode.l10n.t("Reset");
      const ok = await vscode.window.showWarningMessage(
        vscode.l10n.t("Reset translation statistics?"),
        { modal: true },
        resetLabel,
      );
      if (ok === resetLabel) {
        stats.reset();
        await pendingFlush();
      }
    }),
    vscode.commands.registerCommand("fine-translate.switchProvider", () => switchProviderCommand(config)),
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
  if (isOpenAICompat(id)) {
    const preset = getPreset(id);
    return {
      apiKey: (await secrets.get(id, "apiKey")) || cfg.openai.apiKey || undefined,
      baseUrl: cfg.openai.baseUrl || preset.baseUrl,
      model: cfg.openai.model || preset.defaultModel,
      systemPrompt: cfg.openai.systemPrompt,
    };
  }
  switch (id) {
    case "deepl":
      return {
        apiKey: (await secrets.get("deepl", "apiKey")) || cfg.deepl.apiKey || undefined,
        useFreeApi: cfg.deepl.useFreeApi,
      };
    case "youdao":
      return {
        appKey: cfg.youdao.appKey,
        appSecret: (await secrets.get("youdao", "appSecret")) || cfg.youdao.appSecret || undefined,
      };
    case "baidu":
      return {
        appId: cfg.baidu.appId,
        appSecret: (await secrets.get("baidu", "appSecret")) || cfg.baidu.appSecret || undefined,
      };
  }
}

async function toggleHover(config: ConfigStore): Promise<void> {
  const enabled = !config.get().hover.enabled;
  await config.update("hover.enabled", enabled);
  void vscode.window.showInformationMessage(
    enabled
      ? vscode.l10n.t("Hover translation enabled.")
      : vscode.l10n.t("Hover translation disabled."),
  );
}

async function setApiKeyCommand(secrets: Secrets): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    (Object.entries(PROVIDER_LABELS) as Array<[ProviderId, string]>).map(([id, label]) => ({
      id,
      label,
    })),
    { title: vscode.l10n.t("Set API key for which provider?") },
  );
  if (!pick) return;
  const useAppSecret = pick.id === "baidu" || pick.id === "youdao";
  const fieldLabel = useAppSecret ? vscode.l10n.t("App Secret") : vscode.l10n.t("API Key");
  const value = await vscode.window.showInputBox({
    title: vscode.l10n.t("Enter {0} for {1}", fieldLabel, pick.label),
    password: true,
    placeHolder: vscode.l10n.t("Stored via SecretStorage, not in settings.json."),
  });
  if (!value) return;
  const field: SecretField = useAppSecret ? "appSecret" : "apiKey";
  await secrets.set(pick.id, value, field);
  void vscode.window.showInformationMessage(
    vscode.l10n.t("{0} {1} stored.", pick.label, fieldLabel),
  );
}

async function clearApiKeyCommand(secrets: Secrets): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    (Object.entries(PROVIDER_LABELS) as Array<[ProviderId, string]>).map(([id, label]) => ({
      id,
      label,
    })),
    { title: vscode.l10n.t("Clear API key for which provider?") },
  );
  if (!pick) return;
  await secrets.deleteAll(pick.id);
  void vscode.window.showInformationMessage(vscode.l10n.t("{0} secrets cleared.", pick.label));
}

interface ProviderQuickPickItem extends vscode.QuickPickItem {
  id?: ProviderId;
}

async function switchProviderCommand(config: ConfigStore): Promise<void> {
  const current = config.get().activeProvider;
  const currentLabel = vscode.l10n.t("(current)");

  const items: ProviderQuickPickItem[] = [];
  items.push({
    label: vscode.l10n.t("OpenAI-compatible LLMs"),
    kind: vscode.QuickPickItemKind.Separator,
  });
  for (const preset of OPENAI_PRESETS) {
    items.push({
      id: preset.id,
      label: preset.label,
      description: current === preset.id ? currentLabel : preset.baseUrl,
      detail: vscode.l10n.t("{0} models · default: {1}", preset.models.length, preset.defaultModel),
    });
  }
  items.push({
    label: vscode.l10n.t("Traditional translation APIs"),
    kind: vscode.QuickPickItemKind.Separator,
  });
  for (const id of ["deepl", "youdao", "baidu"] as const) {
    items.push({
      id,
      label: PROVIDER_LABELS[id],
      description: current === id ? currentLabel : undefined,
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t("Switch translation provider"),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick || !pick.id) return;
  const pickedId = pick.id;

  if (isOpenAICompat(pickedId)) {
    const preset = getPreset(pickedId);
    const model = await pickModelForPreset(preset);
    if (model === undefined) return;
    await config.update("providers.openai.baseUrl", preset.baseUrl);
    await config.update("providers.openai.model", model);
    await config.update("activeProvider", pickedId);
    void vscode.window.showInformationMessage(
      vscode.l10n.t(
        "Active provider → {0} ({1}). Set the API key via 'Fine Translate: Set API Key…' if needed.",
        preset.label,
        model,
      ),
    );
  } else {
    await config.update("activeProvider", pickedId);
    void vscode.window.showInformationMessage(
      vscode.l10n.t("Active provider → {0}.", PROVIDER_LABELS[pickedId]),
    );
  }
}

async function pickModelForPreset(
  preset: ReturnType<typeof getPreset>,
): Promise<string | undefined> {
  if (preset.models.length === 1) return preset.models[0];
  const defaultLabel = vscode.l10n.t("(default)");
  const modelItems = preset.models.map((m) => ({
    label: m,
    description: m === preset.defaultModel ? defaultLabel : undefined,
  }));
  const modelPick = await vscode.window.showQuickPick(modelItems, {
    title: vscode.l10n.t("Choose model for {0}", preset.label),
    matchOnDescription: true,
  });
  return modelPick?.label;
}
