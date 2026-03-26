import { getContextPercent, getModelName } from "./stdin.js";
import type {
  ConfigCounts,
  GitStatus,
  StdinData,
  TranscriptData,
} from "./types.js";

// ── ANSI helpers ────────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const _BOLD = "\x1b[1m";

// Standard 16-color — used for semantic states only
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const _GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";
const _BRIGHT_BLUE = "\x1b[94m";

// 256-color — curated palette
//   C_MINT:   soft teal for completed/"good" states (less aggressive than pure green)
//   C_SKY:    vivid sky blue for tools/branches (attention without alarm)
//   C_LILAC:  lavender for Shannon brand accent (agents, metadata)
//   C_SLATE:  cool gray-blue for permission modes & secondary info / separators
const C_MINT = "\x1b[38;5;114m";
const C_SKY = "\x1b[38;5;81m";
const C_LILAC = "\x1b[38;5;183m";
const C_SLATE = "\x1b[38;5;111m";

// True color (24-bit) helpers
function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

function label(text: string): string {
  return colorize(text, DIM);
}

/** Colored segment separator */
const SEP = colorize("│", C_SLATE);

// ── Terminal width detection ────────────────────────────────

function getTerminalWidth(): number | null {
  const stdoutCols = process.stdout?.columns;
  if (
    typeof stdoutCols === "number" &&
    Number.isFinite(stdoutCols) &&
    stdoutCols > 0
  ) {
    return Math.floor(stdoutCols);
  }
  const stderrCols = process.stderr?.columns;
  if (
    typeof stderrCols === "number" &&
    Number.isFinite(stderrCols) &&
    stderrCols > 0
  ) {
    return Math.floor(stderrCols);
  }
  const envCols = Number.parseInt(process.env.COLUMNS ?? "", 10);
  if (Number.isFinite(envCols) && envCols > 0) return envCols;
  return null;
}

function getAdaptiveBarWidth(): number {
  const cols = getTerminalWidth();
  if (cols === null) return 12;
  if (cols >= 120) return 12;
  if (cols >= 80) return 10;
  if (cols >= 60) return 6;
  return 4;
}

// ── Progress bars ───────────────────────────────────────────

/**
 * Gradient progress bar using true color (24-bit).
 * Each cell transitions from a desaturated tone to full saturation,
 * creating a smooth "filling up" visual effect.
 *
 * Color ramps:
 *   < 70%  green  (#6b8e23 → #22c55e)  — olive to emerald
 *   70-84% amber  (#b8860b → #eab308)  — dark goldenrod to yellow
 *   ≥ 85%  red    (#b91c1c → #ef4444)  — dark red to vivid red
 */
function contextBar(percent: number, width: number): string {
  const safeW = Math.max(0, width);
  const safeP = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safeP / 100) * safeW);
  const empty = safeW - filled;

  // Pick ramp endpoints based on severity
  let r0: number, g0: number, b0: number, r1: number, g1: number, b1: number;
  if (safeP >= 85) {
    [r0, g0, b0] = [185, 28, 28];
    [r1, g1, b1] = [239, 68, 68];
  } else if (safeP >= 70) {
    [r0, g0, b0] = [184, 134, 11];
    [r1, g1, b1] = [234, 179, 8];
  } else {
    [r0, g0, b0] = [107, 142, 35];
    [r1, g1, b1] = [34, 197, 94];
  }

  const filledCells =
    filled > 0
      ? Array.from({ length: filled }, (_, i) => {
          const t = filled > 1 ? i / (filled - 1) : 1;
          const r = Math.round(r0 + (r1 - r0) * t);
          const g = Math.round(g0 + (g1 - g0) * t);
          const b = Math.round(b0 + (b1 - b0) * t);
          return `${rgb(r, g, b)}█`;
        }).join("")
      : "";

  return `${filledCells}${DIM}${"░".repeat(empty)}${RESET}`;
}

/** Context percentage color — matches gradient endpoint for visual coherence */
function contextPercentColor(percent: number): string {
  if (percent >= 85) return rgb(239, 68, 68);
  if (percent >= 70) return rgb(234, 179, 8);
  return rgb(34, 197, 94);
}

// ── Formatters ──────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function fmtDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Fish-shell–style path abbreviation.
 * Each middle directory component is reduced to its first character (uppercase).
 * The last 2 components are always shown in full to preserve context.
 * Home directory is replaced with ~.
 *
 * Examples:
 *   /Users/slahser/Desktop/Shannon         →  ~/S/h/D/Shannon
 *   /Users/slahser/Desktop/Shannon/src     →  ~/S/h/D/Shannon/src
 *   /tmp/workspace/session-abc/src/app.ts  →  /t/w/session-abc/src/app.ts
 */
function fishPath(p: string, maxLen = 28): string {
  if (!p) return "";

  // Replace $HOME with ~
  const home = process.env.HOME ?? "";
  const display = home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;

  const rawParts = display.split("/");
  const parts = rawParts.filter(Boolean);
  if (parts.length === 0) return "";

  // Always show last 2 components in full
  const last2 = parts.slice(-2);
  const middle = parts.slice(0, -2);

  let result: string;
  if (middle.length === 0) {
    result = last2.join("/");
  } else {
    const abbreviated = middle.map((c) => c.charAt(0).toUpperCase());
    result = [...abbreviated, ...last2].join("/");
  }

  // For absolute (non-home) paths, re-add the leading "/"
  // "~" paths are already self-contained and don't need it
  const isHomeRelative = display.startsWith("~");
  const prefixed = p.startsWith("/") && !isHomeRelative ? `/${result}` : result;

  // If still too long, progressively strip leading components of the end until it fits
  if (prefixed.length > maxLen) {
    // Build up from just the last component, progressively adding parents
    for (let i = 1; i <= last2.length; i++) {
      const candidate = `…/${last2.slice(-i).join("/")}`;
      if (candidate.length <= maxLen) return candidate;
    }
    // Absolute last resort: truncate filename to fit
    const filename = last2[last2.length - 1] ?? "";
    const extStart = filename.lastIndexOf(".");
    const ext = extStart > 0 ? filename.slice(extStart) : "";
    const name = extStart > 0 ? filename.slice(0, extStart) : filename;
    const avail = maxLen - 2; // "…/" = 2
    if (avail > ext.length + 1) {
      return `…/${name.slice(-(avail - ext.length - 1))}${ext}`;
    }
    return `…${ext.slice(-(maxLen - 1))}`;
  }

  return prefixed;
}

// ── Line renderers ──────────────────────────────────────────

/**
 * Line 1: Project + Model + Git + Duration + Agent + Permission
 * Layout: [model] project │ git:(branch) │ duration │ agent │ mode
 */
function renderProjectLine(
  stdin: StdinData,
  git: GitStatus | null,
  sessionDuration: string,
): string {
  const parts: string[] = [];

  // Model badge
  const modelName = getModelName(stdin);
  parts.push(colorize(`[${modelName}]`, CYAN));

  // Project name — fish-style abbreviated path
  const cwd = stdin.workspace?.project_dir ?? stdin.cwd ?? "";
  if (cwd) {
    parts.push(colorize(fishPath(cwd, 30), YELLOW));
  }

  // Git status
  if (git) {
    const dirty = git.isDirty ? "*" : "";
    let gitInfo =
      colorize("git:(", MAGENTA) +
      colorize(`${git.branch}${dirty}`, C_SKY) +
      colorize(")", MAGENTA);

    const gitDetails: string[] = [];
    if (git.ahead > 0) gitDetails.push(colorize(`↑${git.ahead}`, GREEN));
    if (git.behind > 0) gitDetails.push(colorize(`↓${git.behind}`, RED));
    if (git.fileStats) {
      const fsP: string[] = [];
      if (git.fileStats.modified > 0) fsP.push(`!${git.fileStats.modified}`);
      if (git.fileStats.added > 0) fsP.push(`+${git.fileStats.added}`);
      if (git.fileStats.deleted > 0) fsP.push(`✘${git.fileStats.deleted}`);
      if (git.fileStats.untracked > 0) fsP.push(`?${git.fileStats.untracked}`);
      if (fsP.length > 0) gitDetails.push(label(fsP.join(" ")));
    }
    if (gitDetails.length > 0) gitInfo += ` ${gitDetails.join(" ")}`;

    parts.push(gitInfo);
  }

  // Session duration
  if (sessionDuration) {
    parts.push(label(`⏱ ${sessionDuration}`));
  }

  // Agent name
  const agentName = stdin.agent?.name;
  if (agentName) {
    parts.push(colorize(`@${agentName}`, C_LILAC));
  }

  // Permission mode
  const permMode = stdin.permission_mode;
  if (permMode) {
    parts.push(colorize(permMode, C_SLATE));
  }

  return parts.join(` ${SEP} `);
}

/**
 * Line 2: Context window — progress bar + percentage + window size + token breakdown
 * Layout: Context ████████░░ 65% (200k) │ in: 35.0k out: 300 cache: 500
 */
function renderContextLine(stdin: StdinData): string {
  const barWidth = getAdaptiveBarWidth();
  const percent = getContextPercent(stdin);
  const bar = contextBar(percent, barWidth);

  const windowSize = stdin.context_window?.context_window_size ?? 0;
  const windowLabel =
    windowSize >= 1_000_000
      ? `${(windowSize / 1_000_000).toFixed(1)}M`
      : windowSize >= 1000
        ? `${Math.round(windowSize / 1000)}k`
        : windowSize > 0
          ? `${windowSize}`
          : "";

  const percentColor = contextPercentColor(percent);
  let line = `${label("Context")} ${bar} ${colorize(`${percent}%`, percentColor)}`;
  if (windowLabel) line += ` ${label(`(${windowLabel})`)}`;

  // Token breakdown — always show when data available (not just at high context)
  const usage = stdin.context_window?.current_usage;
  if (usage) {
    const inTok = fmtTokens(usage.input_tokens ?? 0);
    const outTok = fmtTokens(usage.output_tokens ?? 0);
    const cacheIn = usage.cache_read_input_tokens ?? 0;
    const cacheNew = usage.cache_creation_input_tokens ?? 0;
    const cacheTotal = cacheIn + cacheNew;

    const tokenParts: string[] = [];
    tokenParts.push(`in: ${colorize(inTok, WHITE)}`);
    if (Number(usage.output_tokens ?? 0) > 0) {
      tokenParts.push(`out: ${colorize(outTok, WHITE)}`);
    }
    if (cacheTotal > 0) {
      tokenParts.push(
        `cache: ${colorize(fmtTokens(cacheTotal), rgb(99, 102, 241))}`,
      );
    }
    line += ` ${SEP} ${label(tokenParts.join("  "))}`;
  }

  // Token detail at high context — use parenthesis format like claude-hud
  if (percent >= 85 && usage) {
    const _inTok = fmtTokens(usage.input_tokens ?? 0);
    const cacheIn = usage.cache_read_input_tokens ?? 0;
    const cacheNew = usage.cache_creation_input_tokens ?? 0;
    const _cacheTotal = cacheIn + cacheNew;
    line += label(" (high usage)");
  }

  return line;
}

/**
 * Line 3: Config counts (when non-zero)
 * Layout: 3 CLAUDE.md │ 2 rules │ 1 MCPs │ 2 hooks
 */
function renderConfigLine(configCounts: ConfigCounts): string | null {
  const parts: string[] = [];
  if (configCounts.claudeMd > 0)
    parts.push(`${configCounts.claudeMd} CLAUDE.md`);
  if (configCounts.rules > 0) parts.push(`${configCounts.rules} rules`);
  if (configCounts.mcp > 0) parts.push(`${configCounts.mcp} MCPs`);
  if (configCounts.hooks > 0) parts.push(`${configCounts.hooks} hooks`);
  if (parts.length === 0) return null;
  return label(parts.join(` ${SEP} `));
}

/**
 * Separator line between static and activity sections
 */
function makeSeparator(): string {
  return colorize("─".repeat(40), C_SLATE);
}

/**
 * Activity line: running tools + completed tool counts
 */
function renderToolsLine(transcript: TranscriptData): string | null {
  const parts: string[] = [];

  // Running tools (up to 3, with duration)
  const running = transcript.tools.filter((t) => t.status === "running");
  for (const t of running.slice(-3)) {
    const target = t.target ? `: ${fishPath(t.target, 22)}` : "";
    const elapsed = fmtDurationShort(Date.now() - t.startTime.getTime());
    parts.push(
      `${colorize("◐", YELLOW)} ${colorize(t.name, C_SKY)}${target} ${label(`(${elapsed})`)}`,
    );
  }

  // Completed tool counts (sorted by frequency, top 5)
  const completed = transcript.tools.filter((t) => t.status === "completed");
  const completedCounts = new Map<string, number>();
  for (const t of completed) {
    completedCounts.set(t.name, (completedCounts.get(t.name) ?? 0) + 1);
  }
  const sortedCompleted = Array.from(completedCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [name, count] of sortedCompleted) {
    parts.push(
      `${colorize("✓", C_MINT)} ${name}${count > 1 ? ` ${label(`×${count}`)}` : ""}`,
    );
  }

  if (parts.length === 0) return null;
  return parts.join(` ${SEP} `);
}

/**
 * Activity line: running agents + completed agents
 */
function renderAgentsLine(transcript: TranscriptData): string | null {
  const parts: string[] = [];

  // Running agents (up to 3)
  const runningAgents = transcript.agents.filter((a) => a.status === "running");
  for (const a of runningAgents.slice(-3)) {
    const model = a.model ? ` ${label(`[${a.model}]`)}` : "";
    const desc = a.description
      ? `: ${a.description.slice(0, 40)}${a.description.length > 40 ? "..." : ""}`
      : "";
    const elapsed = fmtDurationShort(Date.now() - a.startTime.getTime());
    parts.push(
      `${colorize("◐", YELLOW)} ${colorize(a.type, C_LILAC)}${model}${desc} ${label(`(${elapsed})`)}`,
    );
  }

  // Completed agents (latest 3)
  const completedAgents = transcript.agents.filter(
    (a) => a.status === "completed",
  );
  for (const a of completedAgents.slice(-3)) {
    const desc = a.description ? `: ${a.description.slice(0, 40)}` : "";
    parts.push(`${colorize("✓", C_MINT)} ${colorize(a.type, C_LILAC)}${desc}`);
  }

  if (parts.length === 0) return null;
  return parts.join(` ${SEP} `);
}

/**
 * Activity line: todos
 */
function renderTodosLine(transcript: TranscriptData): string | null {
  if (transcript.todos.length === 0) return null;

  const done = transcript.todos.filter((t) => t.status === "completed").length;
  const total = transcript.todos.length;
  const current = transcript.todos.find((t) => t.status === "in_progress");

  if (!current) {
    if (done === total && total > 0) {
      return `${colorize("✓", C_MINT)} All done ${label(`(${done}/${total})`)}`;
    }
    return null;
  }

  const content =
    current.content.length > 50
      ? `${current.content.slice(0, 50)}...`
      : current.content;
  return `${colorize("▸", YELLOW)} ${content} ${label(`(${done}/${total})`)}`;
}

// ── Main render ─────────────────────────────────────────────

export function render(
  stdin: StdinData,
  transcript: TranscriptData,
  git: GitStatus | null,
  configCounts: ConfigCounts,
  sessionDuration: string,
): void {
  const lines: string[] = [];

  // Line 1: Project identity
  lines.push(renderProjectLine(stdin, git, sessionDuration));

  // Line 2: Context window
  lines.push(renderContextLine(stdin));

  // Line 3: Config counts (optional)
  const configLine = renderConfigLine(configCounts);
  if (configLine) lines.push(configLine);

  // Collect activity lines
  const toolsLine = renderToolsLine(transcript);
  const agentsLine = renderAgentsLine(transcript);
  const todosLine = renderTodosLine(transcript);
  const hasActivity = toolsLine || agentsLine || todosLine;

  // Separator before activity (only if there are static lines before)
  if (hasActivity && lines.length > 0) {
    lines.push(makeSeparator());
  }

  // Activity lines
  if (toolsLine) lines.push(toolsLine);
  if (agentsLine) lines.push(agentsLine);
  if (todosLine) lines.push(todosLine);

  // ── Output with NBSP replacement ──
  for (const line of lines) {
    console.log(`${RESET}${line.replace(/ /g, "\u00A0")}`);
  }
}
