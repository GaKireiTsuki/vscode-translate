#!/usr/bin/env node
// Regenerates package.json schema enum/enumDescriptions for activeProvider,
// providers.openai.baseUrl, and providers.openai.model from
// src/providers/openai-presets.json. The JSON file is the single source of
// truth; this script keeps the static schema in sync so the VS Code settings
// UI dropdowns stay accurate.
//
// Usage: pnpm run sync-schema

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const presetsPath = path.join(root, "src/providers/openai-presets.json");
const pkgPath = path.join(root, "package.json");

const presets = JSON.parse(fs.readFileSync(presetsPath, "utf-8"));
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

const TRADITIONAL = ["deepl", "youdao", "baidu"];
const FOLLOW_PRESET_KEY = "%config.followPreset%";

const activeProviderEnum = [...presets.map((p) => p.id), ...TRADITIONAL];
const activeProviderDescs = [
  ...presets.map((p) => `${p.label} · ${p.defaultModel}`),
  "%config.activeProvider.enum.deepl%",
  "%config.activeProvider.enum.youdao%",
  "%config.activeProvider.enum.baidu%",
];

const baseUrlEnum = ["", ...presets.map((p) => p.baseUrl)];
const baseUrlDescs = [FOLLOW_PRESET_KEY, ...presets.map((p) => p.label)];

const modelEnum = [""];
const modelDescs = [FOLLOW_PRESET_KEY];
const modelIndex = new Map();
for (const preset of presets) {
  for (const m of preset.models) {
    const seen = modelIndex.get(m);
    if (seen !== undefined) {
      if (!modelDescs[seen].includes(preset.label)) {
        modelDescs[seen] = `${modelDescs[seen]} / ${preset.label}`;
      }
      continue;
    }
    modelIndex.set(m, modelEnum.length);
    modelEnum.push(m);
    modelDescs.push(preset.label);
  }
}

const props = pkg.contributes.configuration.properties;
const apply = (key, enums, descs) => {
  const p = props[key];
  if (!p) throw new Error(`package.json missing property: ${key}`);
  p.enum = enums;
  p.enumDescriptions = descs;
};

apply("fine-translate.activeProvider", activeProviderEnum, activeProviderDescs);
apply("fine-translate.providers.openai.baseUrl", baseUrlEnum, baseUrlDescs);
apply("fine-translate.providers.openai.model", modelEnum, modelDescs);

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

console.log(
  [
    `Synced schema from openai-presets.json (${presets.length} presets):`,
    `  activeProvider: ${activeProviderEnum.length} entries`,
    `  baseUrl: ${baseUrlEnum.length} entries`,
    `  model: ${modelEnum.length} entries (deduped)`,
  ].join("\n"),
);

// Sanity check: every preset id should be in OpenAICompatProviderId union.
const typesPath = path.join(root, "src/types.ts");
const typesSrc = fs.readFileSync(typesPath, "utf-8");
const missing = presets
  .map((p) => p.id)
  .filter((id) => !typesSrc.includes(`"${id}"`));
if (missing.length > 0) {
  console.error(
    `\nWARNING: src/types.ts OpenAICompatProviderId union missing ids: ${missing.join(", ")}`,
  );
  console.error(`Update the union and OPENAI_COMPAT_IDS to keep TS in sync.`);
  process.exit(1);
}
