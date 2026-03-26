import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ShannonBridgeData } from "./types.js";

/**
 * Resolve the bridge file path in the user-specific cache directory.
 * macOS: ~/Library/Caches/shannon/status.json
 * Avoids /tmp which is world-writable and susceptible to symlink/TOCTOU attacks.
 */
function getBridgePath(): string {
  const platform = os.platform();
  let cacheDir: string;
  if (platform === "darwin") {
    cacheDir = path.join(os.homedir(), "Library", "Caches");
  } else if (platform === "win32") {
    cacheDir =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  } else {
    cacheDir = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  }
  return path.join(cacheDir, "shannon", "status.json");
}

const BRIDGE_PATH = getBridgePath();

export function writeBridge(data: ShannonBridgeData): void {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(BRIDGE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const json = JSON.stringify(data);
    fs.writeFileSync(BRIDGE_PATH, `${json}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    // Silently ignore write errors
  }
}
