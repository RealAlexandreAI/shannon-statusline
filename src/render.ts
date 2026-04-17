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
const _BOLD = "\x1b[1m";

// Standard 16-color — semantic states (git arrows)
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const _GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";
const _BRIGHT_BLUE = "\x1b[94m";

// 256-color — cyberpunk neon palette
//   C_MINT:   matrix green  (#87ff00)  completed / good states
//   C_SKY:    electric cyan (#00ffff)  tools / branches / in-tokens
//   C_LILAC:  neon pink     (#ff87ff)  Shannon brand / agents / out-tokens
//   C_SLATE:  electric purple (#875fff) separators / elapsed / secondary
//   C_HOT:    neon orange   (#ff8700)  running / modified files
//   C_GOLD:   chrome gold   (#ffd700)  project path
//   C_AQUA:   bright aqua   (#00d7d7)  cache tokens / MCPs
const C_MINT = "\x1b[38;5;118m";
const C_SKY = "\x1b[38;5;51m";
const C_LILAC = "\x1b[38;5;213m";
const C_SLATE = "\x1b[38;5;99m";
const C_HOT = "\x1b[38;5;208m";
const C_GOLD = "\x1b[38;5;220m";
const C_AQUA = "\x1b[38;5;44m";
const C_GRAY = "\x1b[38;5;240m"; // gray-black for separators

// True color (24-bit) helpers
function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

// ── Rainbow / Marquee helpers ────────────────────────────────

/**
 * Convert HSL to RGB (all inputs 0–1 range, output 0–255).
 * Saturation is always 1.0 for vivid neon output.
 */
function hslToRgb(h: number, l: number): [number, number, number] {
  const s = 1.0;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(h * 6) % 6;
  switch (sector) {
    case 0:
      r = c;
      g = x;
      b = 0;
      break;
    case 1:
      r = x;
      g = c;
      b = 0;
      break;
    case 2:
      r = 0;
      g = c;
      b = x;
      break;
    case 3:
      r = 0;
      g = x;
      b = c;
      break;
    case 4:
      r = x;
      g = 0;
      b = c;
      break;
    case 5:
      r = c;
      g = 0;
      b = x;
      break;
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

/** Colored segment separator */
const SEP = colorize("│", C_GRAY);

// ── Icons ────────────────────────────────────────────────────
//
// Deliberately drawn from DIFFERENT Unicode blocks for visual variety.
// All codepoints present in SF Mono, Menlo, Monaco — no Nerd Font required.
//
//   Block sources:
//     Greek & Coptic      (U+0370–03FF)  — λ
//     Arrows              (U+2190–21FF)  — ↑ ↓ ↻
//     Mathematical Ops    (U+2200–22FF)  — ≡ ⊕ ⊗ ⊞ ⊟
//     Misc Technical      (U+2300–23FF)  — ⎇
//     Geometric Shapes    (U+25A0–25FF)  — ▲ ▸
//     Dingbats            (U+2700–27BF)  — ✦ ✔
//
//   I_MODEL    λ  U+03BB  Lambda                    AI / Claude model (λ-calculus)
//   I_PATH     ⌘  U+2318  Place of Interest Sign    workspace / project root (macOS ⌘ key)
//   I_BRANCH   ⎇  U+2387  Alternative Key Symbol    git branch
//   I_CLOCK    ✦  U+2726  Four Pointed Star         session duration
//   I_LOCK     ⊟  U+229F  Squared Minus             permission mode / access control
//   I_IN       ↑  U+2191  Upwards Arrow             input tokens
//   I_OUT      ↓  U+2193  Downwards Arrow           output tokens
//   I_CACHE    ⊗  U+2297  Circled Times             cache tokens (consumed from cache)
//   I_CTX      ⊡  U+22A1  Squared Dot Operator      context window bar prefix
//   I_RULES    ≡  U+2261  Identical To              rules count
//   I_MCP      ⊕  U+2295  Circled Plus              MCP count
//   I_WARN     ▲  U+25B2  Triangle                  high-usage warning
//   I_DONE     ✔  U+2714  Heavy Check Mark          completed
//   I_RUN      ↻  U+21BB  CW Open Circle Arrow      running / spinning
//   I_TODO     ▸  U+25B8  Right Triangle            current todo
//   I_CLAUDE   ※  U+203B  Reference Mark            CLAUDE.md config files
//   I_HOOK     ↩  U+21A9  Leftwards Arrow w/ Hook   hooks (event triggers)
//
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

// ── Terminal width detection ────────────────────────────────

function getTerminalWidth(): number | null {
  // Try stdout first
  const stdoutCols = process.stdout?.columns;
  if (
    typeof stdoutCols === "number" &&
    Number.isFinite(stdoutCols) &&
    stdoutCols > 0
  ) {
    return Math.floor(stdoutCols);
  }
  // Try stderr
  const stderrCols = process.stderr?.columns;
  if (
    typeof stderrCols === "number" &&
    Number.isFinite(stderrCols) &&
    stderrCols > 0
  ) {
    return Math.floor(stderrCols);
  }
  // Try getWindowSize (may work when columns is not set)
  try {
    const size = process.stdout?.getWindowSize?.();
    if (Array.isArray(size) && size.length >= 2 && size[0] > 0) {
      return size[0];
    }
  } catch {
    // ignore
  }
  // Fallback env
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
 * Each cell transitions from a dark tone to full neon saturation,
 * creating a cyberpunk "power charging" visual effect.
 *
 * Color ramps:
 *   < 70%  matrix  (#003300 → #39ff14)  — dark to neon acid green
 *   70-84% fire    (#7a1500 → #ff6b00)  — dark to neon orange
 *   ≥ 85%  magenta (#5a0030 → #ff0090)  — dark to neon hot pink
 */
function contextBar(percent: number, width: number): string {
  const safeW = Math.max(0, width);
  const safeP = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safeP / 100) * safeW);
  const empty = safeW - filled;

  // Pick ramp endpoints based on severity — cyberpunk neon palette
  let r0: number, g0: number, b0: number, r1: number, g1: number, b1: number;
  if (safeP >= 85) {
    [r0, g0, b0] = [90, 0, 48]; // deep magenta-black
    [r1, g1, b1] = [255, 0, 144]; // neon hot pink #ff0090
  } else if (safeP >= 70) {
    [r0, g0, b0] = [122, 21, 0]; // dark ember
    [r1, g1, b1] = [255, 107, 0]; // neon orange #ff6b00
  } else {
    [r0, g0, b0] = [0, 51, 0]; // terminal-black green
    [r1, g1, b1] = [57, 255, 20]; // neon acid green #39ff14
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

/** Context percentage color — matches neon gradient endpoint */
function contextPercentColor(percent: number): string {
  if (percent >= 85) return rgb(255, 0, 144); // neon hot pink
  if (percent >= 70) return rgb(255, 107, 0); // neon orange
  return rgb(57, 255, 20); // neon acid green
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

// ── Visible-width helpers ────────────────────────────────────

/**
 * Strip ANSI SGR escape sequences (\x1b[...m) and return visible char count.
 * Used to compute padding without counting invisible color codes.
 */
function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Pad a string containing ANSI codes to a target visible width.
 * If already at or over target, returns the string unchanged.
 */
function padVisible(s: string, target: number): string {
  const vLen = visibleLen(s);
  if (vLen >= target) return s;
  return s + " ".repeat(target - vLen);
}

// ── Matrix rain ──────────────────────────────────────────────

/**
 * Half-width katakana (U+FF66–FF9F) + digits + Greek letters.
 * All are single-column-width — no Nerd Font required.
 * SF Mono / Menlo / Monaco render these correctly.
 */
const RAIN_CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789λΨΩΔΦ";

/** Fixed column where rain starts — statusline stdout is always piped by
 *  Claude Code so there is no reliable way to detect actual terminal width.
 *  120 is a safe conservative value that works on most modern terminals. */
const PAD_COL = 120;
const RAIN_COLS = 6;

/** Milliseconds for the raindrop head to advance one row */
const RAIN_SPEED_MS = 900;

/** Phase offset between adjacent columns — creates staggered waterfall */
const RAIN_COL_OFFSET_MS = 280;

/**
 * Generate a single rain character cell for a given (row, col, time).
 *
 * The drop head falls from row 0 → totalRows-1 cyclically.
 * Every position renders a character — no empty columns.
 *
 * Matrix aesthetic: green dominates, gray only appears at the very tail.
 *   dist=0        → bright white-green   rgb(200,255,200)
 *   dist=1        → neon acid green      rgb(57,255,20)   ← Matrix signature
 *   dist=2        → medium green        rgb(0,200,0)
 *   dist=3        → dim green           rgb(0,140,0)
 *   dist=max-1    → dark gray            rgb(38,38,38)
 *   dist=max      → nearly black         rgb(20,20,20)
 */
function rainCell(
  row: number,
  col: number,
  now: number,
  totalRows: number,
): string {
  const colPhase =
    ((now + col * RAIN_COL_OFFSET_MS) / RAIN_SPEED_MS) % totalRows;
  const headRow = Math.floor(colPhase);
  const dist = (row - headRow + totalRows) % totalRows;

  // Character changes every ~350ms, unique per cell position
  const charIdx =
    Math.floor(now / 350 + row * 7 + col * 13) % RAIN_CHARS.length;
  const ch = RAIN_CHARS[charIdx] ?? " ";

  if (dist === 0) {
    return `${rgb(200, 255, 200)}${ch}${RESET}`; // bright head
  } else if (dist === 1) {
    return `${rgb(57, 255, 20)}${ch}${RESET}`; // neon acid green
  } else if (dist === 2) {
    return `${rgb(0, 200, 0)}${ch}${RESET}`; // medium green
  } else if (dist === 3) {
    return `${rgb(0, 160, 0)}${ch}${RESET}`; // dim green
  } else if (dist === 4) {
    return `${rgb(0, 100, 0)}${ch}${RESET}`; // darker green (extended bright)
  } else if (dist === totalRows - 1) {
    return `${rgb(20, 20, 20)}${ch}${RESET}`; // nearly black
  } else if (dist === totalRows - 2) {
    return `${rgb(0, 0, 0)}${ch}${RESET}`; // pure black
  } else {
    return `${rgb(8, 8, 8)}${ch}${RESET}`; // dark gray (transition)
  }
}

/**
 * Build one row of the rain decoration.
 * Returns RAIN_COLS colored characters separated by spaces.
 * Visible width = RAIN_COLS + (RAIN_COLS - 1) spaces = 11 for RAIN_COLS=6.
 */
function makeRainRow(row: number, now: number, totalRows: number): string {
  const cells: string[] = [];
  for (let c = 0; c < RAIN_COLS; c++) {
    cells.push(rainCell(row, c, now, totalRows));
  }
  return cells.join(" ");
}

// ── Line renderers ──────────────────────────────────────────

/**
 * Line 1: ◇ path  ◈ branch ↑N ↓N !N +N ✘N ?N  ✦ duration  @agent  ◉ mode
 */
function renderProjectLine(
  stdin: StdinData,
  git: GitStatus | null,
  sessionDuration: string,
): string {
  const parts: string[] = [];

  // Project path — ◇ ~/D/Shannon
  const cwd = stdin.workspace?.project_dir ?? stdin.cwd ?? "";
  if (cwd) {
    parts.push(
      `${colorize(I_PATH, C_GOLD)} ${colorize(
        shortenDisplayPath(cwd, {
          homeDir: process.env.HOME ?? "",
          maxLength: 30,
        }),
        C_GOLD,
      )}`,
    );
  }

  // Git status — ◈ main* ↑2 ↓1 !3 +2 ✘1 ?1
  if (git) {
    const dirty = git.isDirty ? "*" : "";
    let gitInfo = `${colorize(I_BRANCH, C_SKY)} ${colorize(`${git.branch}${dirty}`, C_SKY)}`;

    const gitDetails: string[] = [];
    if (git.ahead > 0) gitDetails.push(colorize(`↑${git.ahead}`, GREEN));
    if (git.behind > 0) gitDetails.push(colorize(`↓${git.behind}`, RED));
    if (git.fileStats) {
      // Each file status type gets its own neon color — no more monochrome DIM
      if (git.fileStats.modified > 0)
        gitDetails.push(colorize(`!${git.fileStats.modified}`, C_HOT));
      if (git.fileStats.added > 0)
        gitDetails.push(colorize(`+${git.fileStats.added}`, C_MINT));
      if (git.fileStats.deleted > 0)
        gitDetails.push(colorize(`✘${git.fileStats.deleted}`, RED));
      if (git.fileStats.untracked > 0)
        gitDetails.push(colorize(`?${git.fileStats.untracked}`, C_SLATE));
    }
    if (gitDetails.length > 0) gitInfo += ` ${gitDetails.join(" ")}`;
    parts.push(gitInfo);
  }

  // Session duration — ✦ 1h5m
  if (sessionDuration) {
    parts.push(
      `${colorize(I_CLOCK, C_SLATE)} ${colorize(sessionDuration, C_SLATE)}`,
    );
  }

  // Agent name — @ agent-name
  const agentName = stdin.agent?.name;
  if (agentName) {
    parts.push(colorize(`@${agentName}`, C_LILAC));
  }

  // Permission mode — ◉ auto
  const permMode = stdin.permission_mode;
  if (permMode) {
    parts.push(`${colorize(I_LOCK, C_SLATE)} ${colorize(permMode, C_SLATE)}`);
  }

  return parts.join(` ${SEP} `);
}

/**
 * Line 2: ◆ Model | ◎ ████░░ 99% (1.0M) ▲ high usage | ↑ 494.2k  ↓ 390  ⊗ 494.2k
 */
function renderContextLine(stdin: StdinData): string {
  const modelName = getModelName(stdin);
  const modelBadge = `${colorize(I_MODEL, CYAN)} ${colorize(modelName, CYAN)}`;

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
  // Context block: bar + percent + windowLabel + high usage warning
  let ctxBlock = `${colorize(I_CTX, C_SLATE)} ${bar} ${colorize(`${percent}%`, percentColor)}`;
  if (windowLabel) ctxBlock += ` ${dim(`(${windowLabel})`)}`;
  if (percent >= 85) {
    ctxBlock += ` ${colorize(`${I_WARN} high usage`, rgb(255, 0, 144))}`;
  }

  // Token breakdown block
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
      tokenParts.push(
        `${colorize(I_CACHE, C_AQUA)} ${colorize(fmtTokens(cacheTotal), C_AQUA)}`,
      );
    }
    tokenBlock = `  ${tokenParts.join("  ")}`;
  }

  // Final order: Model | Context | Tokens
  return `${modelBadge}  ${SEP}  ${ctxBlock}  ${SEP}${tokenBlock}`;
}

/**
 * Line 3: ◆ ×3 CLAUDE.md  ≡ ×2 rules  ⊕ ×1 MCPs  ◈ ×2 hooks
 * Each item has its own icon + neon color — no more all-DIM config line.
 */
function renderConfigLine(configCounts: ConfigCounts): string | null {
  const parts: string[] = [];
  if (configCounts.claudeMd > 0)
    parts.push(
      `${colorize(I_CLAUDE, C_GOLD)} ${colorize(`×${configCounts.claudeMd}`, C_GOLD)} ${dim("CLAUDE.md")}`,
    );
  if (configCounts.rules > 0)
    parts.push(
      `${colorize(I_RULES, C_SLATE)} ${colorize(`×${configCounts.rules}`, C_SLATE)} ${dim("rules")}`,
    );
  if (configCounts.mcp > 0)
    parts.push(
      `${colorize(I_MCP, C_AQUA)} ${colorize(`×${configCounts.mcp}`, C_AQUA)} ${dim("MCPs")}`,
    );
  if (configCounts.hooks > 0)
    parts.push(
      `${colorize(I_HOOK, C_HOT)} ${colorize(`×${configCounts.hooks}`, C_HOT)} ${dim("hooks")}`,
    );
  if (parts.length === 0) return null;
  return parts.join(` ${SEP} `);
}

/**
 * Separator line between static and activity sections.
 *
 * Three visual states driven by Date.now() phase — no persistent state needed:
 *
 *   "waiting" — golden yellow breathing pulse.
 *     Brightness oscillates via a sine wave (period ~2 s).
 *     Signals: waiting_input / ask_user.
 *
 *   "done"    — rainbow scrolling gradient (full hue cycle, period ~2 s).
 *     Active for DONE_LINGER_MS (3 s) after all tasks complete,
 *     then falls back to idle.
 *     Signals: all todos done, no running tools, output_style "result".
 *
 *   "idle"    — steady electric purple (C_SLATE, the existing default).
 */
type SepState = "idle" | "waiting" | "done";

/** How long (ms) to keep the rainbow celebration after done is detected */
const DONE_LINGER_MS = 3000;

/**
 * Detect separator state from current render data.
 *
 * Priority: waiting > done > idle.
 *
 * "done" is detected by a combination of signals:
 *   - no running tools
 *   - no in-progress agents
 *   - output_style.name is "result" (Claude Code's completion signal)
 *     OR all todos are completed (and there are some todos)
 *
 * We use Date.now() modulo to implement a simple linger window:
 * once done is detected we seed a linger epoch so the rainbow
 * plays for DONE_LINGER_MS even if the next invocation arrives late.
 *
 * NOTE: linger state is module-level — it resets when the Node process
 * exits, which is fine because each statusline invocation is a fresh process.
 */
let _doneEpoch = 0; // timestamp when done was last detected

function detectSepState(
  stdin: StdinData,
  transcript: TranscriptData,
): SepState {
  // 1. Waiting for user input — highest priority
  const style = stdin.output_style?.name ?? "";
  if (
    style === "waiting_input" ||
    style === "ask_user" ||
    style === "waiting"
  ) {
    return "waiting";
  }

  // 2. Done detection
  const hasRunningTool = transcript.tools.some((t) => t.status === "running");
  const hasRunningAgent = transcript.agents.some((a) => a.status === "running");
  const allTodosDone =
    transcript.todos.length > 0 &&
    transcript.todos.every((t) => t.status === "completed");
  const isResultStyle = style === "result" || style === "done";

  const isDone =
    !hasRunningTool && !hasRunningAgent && (isResultStyle || allTodosDone);

  if (isDone) {
    _doneEpoch = Date.now();
  }

  // Stay in "done" state for DONE_LINGER_MS after last detection
  if (Date.now() - _doneEpoch < DONE_LINGER_MS) {
    return "done";
  }

  return "idle";
}

function makeSeparator(state: SepState, width: number): string {
  const now = Date.now();

  if (state === "waiting") {
    // Golden yellow breathing: brightness oscillates 0.35–0.65 via sine
    const t = (now / 2000) * Math.PI * 2; // period = 2 s
    const lightness = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t));
    // Hue ≈ 0.138 = gold/amber
    const [r, g, b] = hslToRgb(0.138, lightness);
    return `\x1b[38;2;${r};${g};${b}m${"─".repeat(width)}${RESET}`;
  }

  if (state === "done") {
    // Rainbow scroll: full hue cycle over width chars, phase advances with time
    const phase = (now / 2000) % 1; // full cycle ~2 s
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

  // idle — steady gray
  return colorize("─".repeat(width), C_GRAY);
}

/**
 * Running tools only (above separator)
 */
function renderRunningToolsLine(transcript: TranscriptData): string[] | null {
  const parts: string[] = [];
  const running = transcript.tools.filter((t) => t.status === "running");
  for (const t of running.slice(-3)) {
    const target = t.target
      ? `: ${shortenDisplayPath(t.target, {
          homeDir: process.env.HOME ?? "",
          maxLength: 22,
        })}`
      : "";
    const elapsed = fmtDurationShort(Date.now() - t.startTime.getTime());
    parts.push(
      `${colorize(I_RUN, C_HOT)} ${colorize(t.name, C_SKY)}${target} ${colorize(`(${elapsed})`, C_SLATE)}`,
    );
  }
  if (parts.length === 0) return null;
  return parts;
}

/**
 * Completed tool counts only (below separator, horizontal single line)
 */
function renderToolCountsLine(transcript: TranscriptData): string | null {
  const parts: string[] = [];
  // Curated fixed list (in priority order, matches UI CORE_TOOLS)
  const CURATED_TOOLS = [
    "Read",
    "Edit",
    "Write",
    "Bash",
    "Glob",
    "Grep",
    "Agent",
  ] as const;
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
  return parts.join(`  ${SEP}  `); // horizontal
}

/**
 * All agents — vertical list (running first, then completed)
 */
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

  const completedAgents = transcript.agents.filter(
    (a) => a.status === "completed",
  );
  for (const a of completedAgents.slice(-3)) {
    const desc = a.description ? `: ${a.description.slice(0, 40)}` : "";
    parts.push(
      `${colorize(I_DONE, C_MINT)} ${colorize(a.type, C_LILAC)}${desc}`,
    );
  }

  if (parts.length === 0) return null;
  return parts;
}

/**
 * Todos — vertical list (each todo on its own line)
 */
function renderTodosLine(transcript: TranscriptData): string[] | null {
  if (transcript.todos.length === 0) return null;

  const done = transcript.todos.filter((t) => t.status === "completed").length;
  const total = transcript.todos.length;
  const parts: string[] = [];

  for (const t of transcript.todos) {
    const statusIcon =
      t.status === "completed"
        ? I_DONE
        : t.status === "in_progress"
          ? I_RUN
          : I_TODO;
    const statusColor =
      t.status === "completed"
        ? C_MINT
        : t.status === "in_progress"
          ? C_HOT
          : C_SLATE;
    const content =
      t.content.length > 50 ? `${t.content.slice(0, 50)}...` : t.content;
    const count =
      t.status === "completed"
        ? ""
        : ` ${colorize(`(${done}/${total})`, C_SLATE)}`;
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

  // Line 1: Project identity
  lines.push(renderProjectLine(stdin, git, sessionDuration));

  // Line 2: Context window
  lines.push(renderContextLine(stdin));

  // Line 3: Config counts (optional)
  const configLine = renderConfigLine(configCounts);
  if (configLine) lines.push(configLine);

  // ── Activity section ────────────────────────────────────────
  const runningToolsLine = renderRunningToolsLine(transcript);
  const toolCountsLine = renderToolCountsLine(transcript);
  const todosLine = renderTodosLine(transcript);
  const agentsLine = renderAgentsLine(transcript);

  const sepState = detectSepState(stdin, transcript);

  // Separator 1: static lines → tool counts + running tools
  if ((toolCountsLine || runningToolsLine) && lines.length > 0) {
    lines.push(makeSeparator(sepState, PAD_COL));
  }
  if (toolCountsLine) lines.push(toolCountsLine); // horizontal
  if (runningToolsLine) lines.push(...runningToolsLine); // vertical

  // Separator 2: tool counts/running tools → todos
  if (todosLine) {
    lines.push(makeSeparator(sepState, PAD_COL));
    lines.push(...todosLine); // vertical list
  }

  // Separator 3: todos → agents
  if (agentsLine) {
    lines.push(makeSeparator(sepState, PAD_COL));
    lines.push(...agentsLine); // vertical list
  }

  // ── Matrix rain decoration (right-aligned, all rows) ──
  const now = Date.now();
  const totalRows = lines.length;
  const termWidth = getTerminalWidth();
  const padCols = termWidth ?? PAD_COL;

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row] ?? "";
    const padded = padVisible(line, padCols);
    const rain = makeRainRow(row, now, totalRows);
    const decorated = `${RESET}${padded.replace(/ /g, "\u00A0")}  ${rain}`;
    console.log(decorated);
  }
}
