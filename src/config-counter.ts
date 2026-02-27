import * as fs from "node:fs";
import * as path from "node:path";
import type { ConfigCounts } from "./types.js";

export async function countConfigs(cwd: string): Promise<ConfigCounts> {
  const result: ConfigCounts = { claudeMd: 0, rules: 0, mcp: 0, hooks: 0 };
  if (!cwd) return result;

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";

  // Count CLAUDE.md files (project + user)
  const claudeMdPaths = [
    path.join(cwd, "CLAUDE.md"),
    path.join(cwd, ".claude", "CLAUDE.md"),
    path.join(home, ".claude", "CLAUDE.md"),
  ];
  for (const p of claudeMdPaths) {
    if (fileExists(p)) result.claudeMd++;
  }

  // Count .mdc rules files
  const rulesDir = path.join(cwd, ".claude", "rules");
  if (dirExists(rulesDir)) {
    try {
      const entries = fs.readdirSync(rulesDir);
      result.rules = entries.filter((e) => e.endsWith(".mdc")).length;
    } catch {
      // Ignore
    }
  }

  // Count MCP servers from settings
  const settingsPath = path.join(home, ".claude", "settings.json");
  const projectSettingsPath = path.join(cwd, ".claude", "settings.json");
  const mcpServers = new Set<string>();

  for (const sp of [settingsPath, projectSettingsPath]) {
    try {
      if (fileExists(sp)) {
        const content = fs.readFileSync(sp, "utf8");
        const settings = JSON.parse(content);
        const servers = settings?.mcpServers;
        if (servers && typeof servers === "object") {
          for (const key of Object.keys(servers)) {
            mcpServers.add(key);
          }
        }
      }
    } catch {
      // Ignore
    }
  }
  result.mcp = mcpServers.size;

  // Count hooks
  try {
    if (fileExists(settingsPath)) {
      const content = fs.readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(content);
      const hooks = settings?.hooks;
      if (hooks && typeof hooks === "object") {
        result.hooks = Object.keys(hooks).length;
      }
    }
  } catch {
    // Ignore
  }

  return result;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
