import * as vscode from "vscode";
import type { ProviderId } from "./types";

export interface ResolvedConfig {
  activeProvider: ProviderId;
  openai: {
    baseUrl: string;
    model: string;
    systemPrompt: string;
    apiKey: string;
  };
  deepl: {
    useFreeApi: boolean;
    apiKey: string;
  };
  baidu: {
    appId: string;
    appSecret: string;
  };
  youdao: {
    appKey: string;
    appSecret: string;
  };
  targetLanguage: string;
  hover: {
    enabled: boolean;
    debounceMs: number;
    languages: string[];
  };
  selection: {
    autoOnSelect: boolean;
  };
  cache: {
    maxEntries: number;
    ttlMinutes: number;
  };
  maxCharsPerRequest: number;
  telemetry: {
    estimateCost: boolean;
  };
}

const CONFIG_ROOT = "fine-translate";

function readConfig(): ResolvedConfig {
  const c = vscode.workspace.getConfiguration(CONFIG_ROOT);
  return {
    activeProvider: c.get<ProviderId>("activeProvider", "openai"),
    openai: {
      baseUrl: c.get<string>("providers.openai.baseUrl", ""),
      model: c.get<string>("providers.openai.model", ""),
      systemPrompt: c.get<string>(
        "providers.openai.systemPrompt",
        "You are a precise translator. Output only the translation, no explanation.",
      ),
      apiKey: c.get<string>("providers.openai.apiKey", ""),
    },
    deepl: {
      useFreeApi: c.get<boolean>("providers.deepl.useFreeApi", true),
      apiKey: c.get<string>("providers.deepl.apiKey", ""),
    },
    baidu: {
      appId: c.get<string>("providers.baidu.appId", ""),
      appSecret: c.get<string>("providers.baidu.appSecret", ""),
    },
    youdao: {
      appKey: c.get<string>("providers.youdao.appKey", ""),
      appSecret: c.get<string>("providers.youdao.appSecret", ""),
    },
    targetLanguage: c.get<string>("targetLanguage", ""),
    hover: {
      enabled: c.get<boolean>("hover.enabled", false),
      debounceMs: c.get<number>("hover.debounceMs", 400),
      languages: c.get<string[]>("hover.languages", ["*"]),
    },
    selection: {
      autoOnSelect: c.get<boolean>("selection.autoOnSelect", false),
    },
    cache: {
      maxEntries: c.get<number>("cache.maxEntries", 500),
      ttlMinutes: c.get<number>("cache.ttlMinutes", 1440),
    },
    maxCharsPerRequest: c.get<number>("maxCharsPerRequest", 4000),
    telemetry: {
      estimateCost: c.get<boolean>("telemetry.estimateCost", true),
    },
  };
}

export function resolveTargetLanguage(cfg: ResolvedConfig): string {
  return cfg.targetLanguage || vscode.env.language || "en";
}

export class ConfigStore {
  private current: ResolvedConfig;
  private readonly emitter = new vscode.EventEmitter<ResolvedConfig>();
  readonly onDidChange = this.emitter.event;
  private readonly disposable: vscode.Disposable;

  constructor() {
    this.current = readConfig();
    this.disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CONFIG_ROOT)) return;
      this.current = readConfig();
      this.emitter.fire(this.current);
    });
  }

  get(): ResolvedConfig {
    return this.current;
  }

  async update<K extends keyof ResolvedConfig>(
    section: string,
    value: ResolvedConfig[K] | string | boolean | number,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
  ): Promise<void> {
    await vscode.workspace.getConfiguration(CONFIG_ROOT).update(section, value, target);
  }

  dispose(): void {
    this.disposable.dispose();
    this.emitter.dispose();
  }
}
