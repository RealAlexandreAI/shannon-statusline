import * as fs from "node:fs";
import type { ShannonBridgeData } from "./types.js";

const BRIDGE_PATH = "/tmp/shannon-status.json";

export function writeBridge(data: ShannonBridgeData): void {
  try {
    const json = JSON.stringify(data);
    fs.writeFileSync(BRIDGE_PATH, json + "\n", "utf8");
  } catch {
    // Silently ignore write errors
  }
}
