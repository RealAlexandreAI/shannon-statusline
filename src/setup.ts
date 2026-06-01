import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

// ── Constants ──────────────────────────────────────────────────────────────

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const INSTALL_DIR = path.join(HOME, ".shannon", "shannon-statusline");
const WRAPPER_PATH = path.join(INSTALL_DIR, "run.sh");
const SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveNode(): string {
  for (const candidate of ["node", "bun"]) {
    try {
      const resolved = execFileSync("command", ["-v", candidate], {
        encoding: "utf8",
        shell: true,
      }).trim();
      if (resolved) return resolved;
    } catch {
      // try next
    }
  }
  throw new Error(
    "Node.js not found. Install from https://nodejs.org or via mise/nvm.",
  );
}

function resolveDistIndex(): string {
  // __filename is the compiled dist/setup.js — dist/ lives beside it
  const here = new URL(import.meta.url).pathname;
  const candidate = path.resolve(path.dirname(here), "index.js");
  if (!fs.existsSync(candidate)) {
    throw new Error(`dist/index.js not found at ${candidate}`);
  }
  return candidate;
}

function writeWrapper(nodePath: string, indexPath: string): void {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  const script = `#!/bin/sh
# shannon-statusline standalone wrapper
# Managed by: shannon-statusline setup
# Node:        ${nodePath}
# Plugin:      ${indexPath}
exec "${nodePath}" "${indexPath}" "$@"
`;
  fs.writeFileSync(WRAPPER_PATH, script, { mode: 0o755 });
}

function patchSettings(): void {
  let config: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Fresh file
  }

  config.statusLine = {
    type: "command",
    command: WRAPPER_PATH,
    padding: 0,
  };

  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(config, null, 2) + "\n");
}

function verify(): void {
  const out = execFileSync("/bin/sh", [WRAPPER_PATH], {
    input:
      '{"session_id":"setup-test","transcript_path":"","cwd":"/tmp","model":{"id":"claude-opus-4-6","display_name":"Opus"},"context_window":{"used_percentage":10,"context_window_size":200000,"current_usage":{"input_tokens":20000,"output_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}',
    encoding: "utf8",
    timeout: 5000,
  });
  if (!out.trim()) {
    throw new Error("Wrapper produced no output — check node path.");
  }
}

// ── Public entry ───────────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  process.stdout.write("shannon-statusline setup\n\n");

  // 1. Resolve runtime
  process.stdout.write("  1/4  Resolving Node.js path...\n");
  const nodePath = resolveNode();
  process.stdout.write(`       → ${nodePath}\n`);

  // 2. Resolve dist
  process.stdout.write("  2/4  Locating dist/index.js...\n");
  const indexPath = resolveDistIndex();
  process.stdout.write(`       → ${indexPath}\n`);

  // 3. Write wrapper
  process.stdout.write("  3/4  Writing wrapper...\n");
  writeWrapper(nodePath, indexPath);
  process.stdout.write(`       → ${WRAPPER_PATH}\n`);

  // 4. Patch settings
  process.stdout.write("  4/4  Patching ~/.claude/settings.json...\n");
  patchSettings();
  process.stdout.write(`       → statusLine.command = ${WRAPPER_PATH}\n`);

  // 5. Smoke test
  process.stdout.write("\n  Verifying wrapper...\n");
  try {
    verify();
    process.stdout.write("  ✔ OK — statusline is working.\n");
    process.stdout.write(
      "\n  Restart Claude Code for the statusline to appear.\n\n",
    );
  } catch (err) {
    process.stdout.write(
      `  ✘ Verification failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.stdout.write(
      `  Run manually: echo '{}' | ${WRAPPER_PATH}\n\n`,
    );
    process.exitCode = 1;
  }
}
