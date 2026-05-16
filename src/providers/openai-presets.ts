import type { OpenAICompatProviderId } from "../types";
import data from "./openai-presets.json";

export interface OpenAIPreset {
  id: OpenAICompatProviderId;
  label: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
}

export const OPENAI_PRESETS: OpenAIPreset[] = data as OpenAIPreset[];

export function getPreset(id: OpenAICompatProviderId): OpenAIPreset {
  const preset = OPENAI_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown OpenAI-compat preset: ${id}`);
  return preset;
}
