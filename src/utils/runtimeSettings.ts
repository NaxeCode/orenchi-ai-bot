import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export type RuntimeSettingsData = {
  chatModelPreset: string;
  ttsProvider: string;
  ttsVoice: string;
};

const DEFAULT_SETTINGS: RuntimeSettingsData = {
  chatModelPreset: "balanced",
  ttsProvider: "openai",
  ttsVoice: "alloy"
};

const SETTINGS_PATH = path.join(process.cwd(), "runtime-settings.json");

export function loadRuntimeSettings(): RuntimeSettingsData {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed
    };
  } catch (error) {
    console.warn("Failed to load runtime settings, using defaults:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveRuntimeSettings(data: RuntimeSettingsData): Promise<void> {
  await writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2), "utf8");
}
