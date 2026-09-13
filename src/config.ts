import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StatuslineConfig {
  /** Enable the matrix rain in the cyberpunk renderer. Default: true. */
  rain: boolean;
}

export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = { rain: true };

export function getConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".shannon", "shannon-statusline", "config.json");
}

export function loadConfig(homeDir = homedir()): StatuslineConfig {
  const config: StatuslineConfig = { ...DEFAULT_STATUSLINE_CONFIG };

  try {
    const configPath = getConfigPath(homeDir);
    if (!existsSync(configPath)) return config;

    const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (typeof raw === "object" && raw !== null && "rain" in raw && typeof raw.rain === "boolean") {
      config.rain = raw.rain;
    }
  } catch {
    // Keep the default when the optional config is unavailable or invalid.
  }

  return config;
}
