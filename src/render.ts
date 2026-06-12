import { shortenDisplayPath } from "./path.js";
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

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";

const C_MINT = "\x1b[38;5;118m";
const C_SKY = "\x1b[38;5;51m";
const C_LILAC = "\x1b[38;5;213m";
const C_SLATE = "\x1b[38;5;99m";
const C_HOT = "\x1b[38;5;208m";
const C_GOLD = "\x1b[38;5;220m";
const C_AQUA = "\x1b[38;5;44m";
const C_GRAY = "\x1b[38;5;240m";

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

// ── Rainbow / Marquee helpers ────────────────────────────────

function hslToRgb(h: number, l: number): [number, number, number] {
  const s = 1.0;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(h * 6) % 6;
  switch (sector) {
    case 0: r = c; g = x; b = 0; break;
    case 1: r = x; g = c; b = 0; break;
    case 2: r = 0; g = c; b = x; break;
    case 3: r = 0; g = x; b = c; break;
    case 4: r = x; g = 0; b = c; break;
    case 5: r = c; g = 0; b = x; break;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

const SEP = colorize("│", C_GRAY);

// ── Icons ────────────────────────────────────────────────────

const I_MODEL = "λ";
const I_PATH = "⌘";
const I_BRANCH = "⎇";
const I_CLOCK = "✦";
const I_LOCK = "⊟";
const I_IN = "↑";
const I_OUT = "↓";
const I_CACHE = "⊗";
const I_CTX = "⊡";
const I_RULES = "≡";
const I_MCP = "⊕";
const I_WARN = "▲";
const I_DONE = "✔";
const I_RUN = "↻";
const I_TODO = "▸";
const I_CLAUDE = "※";
const I_HOOK = "↩";

// ── Progress bars ───────────────────────────────────────────

function contextBar(percent: number, width: number): string {
  const safeW = Math.max(0, width);
  const safeP = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safeP / 100) * safeW);
  const empty = safeW - filled;

  let r0: number, g0: number, b0: number, r1: number, g1: number, b1: number;
  if (safeP >= 85) {
    [r0, g0, b0] = [90, 0, 48];
    [r1, g1, b1] = [255, 0, 144];
  } else if (safeP >= 70) {
    [r0, g0, b0] = [122, 21, 0];
    [r1, g1, b1] = [255, 107, 0];
  } else {
    [r0, g0, b0] = [0, 51, 0];
    [r1, g1, b1] = [57, 255, 20];
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

function contextPercentColor(percent: number): string {
  if (percent >= 85) return rgb(255, 0, 144);
  if (percent >= 70) return rgb(255, 107, 0);
  return rgb(57, 255, 20);
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

// ── Matrix rain ──────────────────────────────────────────────

const RAIN_CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789λΨΩΔΦ";

const RAIN_COLS = 6;

const RAIN_SPEED_MS = 900;
const RAIN_COL_OFFSET_MS = 280;

function rainCell(row: number, col: number, now: number, totalRows: number): string {
  const colPhase = ((now + col * RAIN_COL_OFFSET_MS) / RAIN_SPEED_MS) % totalRows;
  const headRow = Math.floor(colPhase);
  const dist = (row - headRow + totalRows) % totalRows;

  const charIdx = Math.floor(now / 350 + row * 7 + col * 13) % RAIN_CHARS.length;
  const ch = RAIN_CHARS[charIdx] ?? " ";

  if (dist === 0) return `${rgb(200, 255, 200)}${ch}${RESET}`;
  if (dist === 1) return `${rgb(57, 255, 20)}${ch}${RESET}`;
  if (dist === 2) return `${rgb(0, 200, 0)}${ch}${RESET}`;
  if (dist === 3) return `${rgb(0, 160, 0)}${ch}${RESET}`;
  if (dist === 4) return `${rgb(0, 100, 0)}${ch}${RESET}`;
  if (dist === totalRows - 1) return `${rgb(20, 20, 20)}${ch}${RESET}`;
  if (dist === totalRows - 2) return `${rgb(0, 0, 0)}${ch}${RESET}`;
  return `${rgb(8, 8, 8)}${ch}${RESET}`;
}

function makeRainRow(row: number, now: number, totalRows: number): string {
  const cells: string[] = [];
  for (let c = 0; c < RAIN_COLS; c++) {
    cells.push(rainCell(row, c, now, totalRows));
  }
  return cells.join(" ");
}

// ── Line renderers ──────────────────────────────────────────

function renderProjectLine(
  stdin: StdinData,
  git: GitStatus | null,
  sessionDuration: string,
): string {
  const parts: string[] = [];

  const cwd = stdin.workspace?.project_dir ?? stdin.cwd ?? "";
  if (cwd) {
    parts.push(
      `${colorize(I_PATH, C_GOLD)} ${colorize(
        shortenDisplayPath(cwd, { homeDir: process.env.HOME ?? "", maxLength: 30 }),
        C_GOLD,
      )}`,
    );
  }

  if (git) {
    const dirty = git.isDirty ? "*" : "";
    let gitInfo = `${colorize(I_BRANCH, C_SKY)} ${colorize(`${git.branch}${dirty}`, C_SKY)}`;
    const gitDetails: string[] = [];
    if (git.ahead > 0) gitDetails.push(colorize(`↑${git.ahead}`, GREEN));
    if (git.behind > 0) gitDetails.push(colorize(`↓${git.behind}`, RED));
    if (git.fileStats) {
      if (git.fileStats.modified > 0) gitDetails.push(colorize(`!${git.fileStats.modified}`, C_HOT));
      if (git.fileStats.added > 0) gitDetails.push(colorize(`+${git.fileStats.added}`, C_MINT));
      if (git.fileStats.deleted > 0) gitDetails.push(colorize(`✘${git.fileStats.deleted}`, RED));
      if (git.fileStats.untracked > 0) gitDetails.push(colorize(`?${git.fileStats.untracked}`, C_SLATE));
    }
    if (gitDetails.length > 0) gitInfo += ` ${gitDetails.join(" ")}`;
    parts.push(gitInfo);
  }

  if (sessionDuration) {
    parts.push(`${colorize(I_CLOCK, C_SLATE)} ${colorize(sessionDuration, C_SLATE)}`);
  }

  const agentName = stdin.agent?.name;
  if (agentName) {
    parts.push(colorize(`@${agentName}`, C_LILAC));
  }

  const permMode = stdin.permission_mode;
  if (permMode) {
    parts.push(`${colorize(I_LOCK, C_SLATE)} ${colorize(permMode, C_SLATE)}`);
  }

  return parts.join(` ${SEP} `);
}

function renderContextLine(stdin: StdinData): string {
  const modelName = getModelName(stdin);
  const modelBadge = `${colorize(I_MODEL, CYAN)} ${colorize(modelName, CYAN)}`;

  const barWidth = 10;
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
  let ctxBlock = `${colorize(I_CTX, C_SLATE)} ${bar} ${colorize(`${percent}%`, percentColor)}`;
  if (windowLabel) ctxBlock += ` ${dim(`(${windowLabel})`)}`;
  if (percent >= 85) {
    ctxBlock += ` ${colorize(`${I_WARN} high usage`, rgb(255, 0, 144))}`;
  }

  const usage = stdin.context_window?.current_usage;
  let tokenBlock = "";
  if (usage) {
    const inTok = fmtTokens(usage.input_tokens ?? 0);
    const outTok = fmtTokens(usage.output_tokens ?? 0);
    const cacheIn = usage.cache_read_input_tokens ?? 0;
    const cacheNew = usage.cache_creation_input_tokens ?? 0;
    const cacheTotal = cacheIn + cacheNew;

    const tokenParts: string[] = [];
    tokenParts.push(`${colorize(I_IN, C_SKY)} ${colorize(inTok, WHITE)}`);
    if (Number(usage.output_tokens ?? 0) > 0) {
      tokenParts.push(`${colorize(I_OUT, C_LILAC)} ${colorize(outTok, WHITE)}`);
    }
    if (cacheTotal > 0) {
      tokenParts.push(`${colorize(I_CACHE, C_AQUA)} ${colorize(fmtTokens(cacheTotal), C_AQUA)}`);
    }
    tokenBlock = `  ${tokenParts.join("  ")}`;
  }

  return `${modelBadge}  ${SEP}  ${ctxBlock}  ${SEP}${tokenBlock}`;
}

function renderConfigLine(configCounts: ConfigCounts): string | null {
  const parts: string[] = [];
  if (configCounts.claudeMd > 0)
    parts.push(`${colorize(I_CLAUDE, C_GOLD)} ${colorize(`×${configCounts.claudeMd}`, C_GOLD)} ${dim("CLAUDE.md")}`);
  if (configCounts.rules > 0)
    parts.push(`${colorize(I_RULES, C_SLATE)} ${colorize(`×${configCounts.rules}`, C_SLATE)} ${dim("rules")}`);
  if (configCounts.mcp > 0)
    parts.push(`${colorize(I_MCP, C_AQUA)} ${colorize(`×${configCounts.mcp}`, C_AQUA)} ${dim("MCPs")}`);
  if (configCounts.hooks > 0)
    parts.push(`${colorize(I_HOOK, C_HOT)} ${colorize(`×${configCounts.hooks}`, C_HOT)} ${dim("hooks")}`);
  if (parts.length === 0) return null;
  return parts.join(` ${SEP} `);
}

// ── Separator ───────────────────────────────────────────────

type SepState = "idle" | "waiting" | "done";
const DONE_LINGER_MS = 3000;
let _doneEpoch = 0;

function detectSepState(stdin: StdinData, transcript: TranscriptData): SepState {
  const style = stdin.output_style?.name ?? "";
  if (style === "waiting_input" || style === "ask_user" || style === "waiting") {
    return "waiting";
  }

  const hasRunningTool = transcript.tools.some((t) => t.status === "running");
  const hasRunningAgent = transcript.agents.some((a) => a.status === "running");
  const allTodosDone =
    transcript.todos.length > 0 && transcript.todos.every((t) => t.status === "completed");
  const isResultStyle = style === "result" || style === "done";
  const isDone = !hasRunningTool && !hasRunningAgent && (isResultStyle || allTodosDone);

  if (isDone) _doneEpoch = Date.now();
  if (Date.now() - _doneEpoch < DONE_LINGER_MS) return "done";
  return "idle";
}

function makeSeparator(state: SepState, width: number): string {
  const now = Date.now();

  if (state === "waiting") {
    const t = (now / 2000) * Math.PI * 2;
    const lightness = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t));
    const [r, g, b] = hslToRgb(0.138, lightness);
    return `\x1b[38;2;${r};${g};${b}m${"─".repeat(width)}${RESET}`;
  }

  if (state === "done") {
    const phase = (now / 2000) % 1;
    return (
      "─"
        .repeat(width)
        .split("")
        .map((ch, i) => {
          const hue = (phase + i / width) % 1;
          const [r, g, b] = hslToRgb(hue, 0.62);
          return `\x1b[38;2;${r};${g};${b}m${ch}`;
        })
        .join("") + RESET
    );
  }

  return colorize("─".repeat(width), C_GRAY);
}

// ── Activity renderers ──────────────────────────────────────

function renderRunningToolsLine(transcript: TranscriptData): string[] | null {
  const parts: string[] = [];
  const running = transcript.tools.filter((t) => t.status === "running");
  for (const t of running.slice(-3)) {
    const target = t.target
      ? `: ${shortenDisplayPath(t.target, { homeDir: process.env.HOME ?? "", maxLength: 22 })}`
      : "";
    const elapsed = fmtDurationShort(Date.now() - t.startTime.getTime());
    parts.push(
      `${colorize(I_RUN, C_HOT)} ${colorize(t.name, C_SKY)}${target} ${colorize(`(${elapsed})`, C_SLATE)}`,
    );
  }
  if (parts.length === 0) return null;
  return parts;
}

function renderToolCountsLine(transcript: TranscriptData): string | null {
  const parts: string[] = [];
  const CURATED_TOOLS = ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Agent"] as const;
  const completed = transcript.tools.filter((t) => t.status === "completed");
  const completedCounts = new Map<string, number>();
  for (const t of completed) {
    completedCounts.set(t.name, (completedCounts.get(t.name) ?? 0) + 1);
  }
  for (const name of CURATED_TOOLS) {
    const count = completedCounts.get(name) ?? 0;
    if (count > 0) {
      parts.push(
        `${colorize(I_DONE, C_MINT)} ${colorize(name, WHITE)}${count > 1 ? ` ${colorize(`×${count}`, C_SLATE)}` : ""}`,
      );
    }
  }
  if (parts.length === 0) return null;
  return parts.join(`  ${SEP}  `);
}

function renderAgentsLine(transcript: TranscriptData): string[] | null {
  const parts: string[] = [];

  const runningAgents = transcript.agents.filter((a) => a.status === "running");
  for (const a of runningAgents.slice(-3)) {
    const model = a.model ? ` ${colorize(`[${a.model}]`, C_SLATE)}` : "";
    const desc = a.description
      ? `: ${a.description.slice(0, 40)}${a.description.length > 40 ? "..." : ""}`
      : "";
    const elapsed = fmtDurationShort(Date.now() - a.startTime.getTime());
    parts.push(
      `${colorize(I_RUN, C_HOT)} ${colorize(a.type, C_LILAC)}${model}${desc} ${colorize(`(${elapsed})`, C_SLATE)}`,
    );
  }

  const completedAgents = transcript.agents.filter((a) => a.status === "completed");
  for (const a of completedAgents.slice(-3)) {
    const desc = a.description ? `: ${a.description.slice(0, 40)}` : "";
    parts.push(`${colorize(I_DONE, C_MINT)} ${colorize(a.type, C_LILAC)}${desc}`);
  }

  if (parts.length === 0) return null;
  return parts;
}

function renderTodosLine(transcript: TranscriptData): string[] | null {
  if (transcript.todos.length === 0) return null;

  const done = transcript.todos.filter((t) => t.status === "completed").length;
  const total = transcript.todos.length;
  const parts: string[] = [];

  for (const t of transcript.todos) {
    const statusIcon =
      t.status === "completed" ? I_DONE : t.status === "in_progress" ? I_RUN : I_TODO;
    const statusColor =
      t.status === "completed" ? C_MINT : t.status === "in_progress" ? C_HOT : C_SLATE;
    const content = t.content.length > 50 ? `${t.content.slice(0, 50)}...` : t.content;
    const count =
      t.status === "completed" ? "" : ` ${colorize(`(${done}/${total})`, C_SLATE)}`;
    parts.push(
      `${colorize(statusIcon, statusColor)} ${colorize(content, WHITE)}${count}`,
    );
  }

  return parts;
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

  lines.push(renderProjectLine(stdin, git, sessionDuration));
  lines.push(renderContextLine(stdin));
  const configLine = renderConfigLine(configCounts);
  if (configLine) lines.push(configLine);

  const runningToolsLine = renderRunningToolsLine(transcript);
  const toolCountsLine = renderToolCountsLine(transcript);
  const todosLine = renderTodosLine(transcript);
  const agentsLine = renderAgentsLine(transcript);
  const sepState = detectSepState(stdin, transcript);

  if ((toolCountsLine || runningToolsLine) && lines.length > 0) {
    lines.push(makeSeparator(sepState, 67));
  }
  if (toolCountsLine) lines.push(toolCountsLine);
  if (runningToolsLine) lines.push(...runningToolsLine);

  if (todosLine) {
    lines.push(makeSeparator(sepState, 67));
    lines.push(...todosLine);
  }

  if (agentsLine) {
    lines.push(makeSeparator(sepState, 67));
    lines.push(...agentsLine);
  }

  // ── Matrix rain — LEFT side, no width dependency ──
  const now = Date.now();
  const totalRows = lines.length;

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row] ?? "";
    console.log(`${makeRainRow(row, now, totalRows)}  ${line}`);
  }
}
