import type {
  StdinData,
  TranscriptData,
  GitStatus,
  ConfigCounts,
} from "./types.js";
import { getModelName, getContextPercent } from "./stdin.js";

// ANSI color helpers
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";

export function render(
  stdin: StdinData,
  transcript: TranscriptData,
  git: GitStatus | null,
  configCounts: ConfigCounts,
  sessionDuration: string,
): void {
  const lines: string[] = [];

  // Line 1: Model + Context bar
  const modelName = getModelName(stdin);
  const percent = getContextPercent(stdin);
  const contextBar = makeContextBar(percent);
  const windowSize = stdin.context_window?.context_window_size ?? 0;
  const windowLabel =
    windowSize >= 1_000_000
      ? `${(windowSize / 1_000_000).toFixed(1)}M`
      : windowSize >= 1000
        ? `${Math.round(windowSize / 1000)}k`
        : `${windowSize}`;

  let line1 = `${BOLD}[${modelName}]${RESET} ${contextBar} ${percent}%`;
  if (windowSize > 0) {
    line1 += ` ${DIM}(${windowLabel})${RESET}`;
  }
  if (sessionDuration) {
    line1 += ` ${DIM}| ${sessionDuration}${RESET}`;
  }
  lines.push(line1);

  // Line 2: Workspace + Git (with file stats)
  const cwd = stdin.workspace?.project_dir ?? stdin.cwd ?? "";
  const dirName = cwd.split("/").pop() ?? cwd;
  let line2 = `${CYAN}${dirName}${RESET}`;
  if (git) {
    const dirty = git.isDirty ? "*" : "";
    let gitInfo = `${MAGENTA}git:(${git.branch}${dirty})${RESET}`;
    if (git.ahead > 0 || git.behind > 0) {
      const parts: string[] = [];
      if (git.ahead > 0) parts.push(`${GREEN}\u2191${git.ahead}${RESET}`);
      if (git.behind > 0) parts.push(`${RED}\u2193${git.behind}${RESET}`);
      gitInfo += ` ${parts.join(" ")}`;
    }
    if (git.fileStats) {
      const fsParts: string[] = [];
      if (git.fileStats.modified > 0)
        fsParts.push(`${YELLOW}~${git.fileStats.modified}${RESET}`);
      if (git.fileStats.added > 0)
        fsParts.push(`${GREEN}+${git.fileStats.added}${RESET}`);
      if (git.fileStats.deleted > 0)
        fsParts.push(`${RED}-${git.fileStats.deleted}${RESET}`);
      if (git.fileStats.untracked > 0)
        fsParts.push(`${GRAY}?${git.fileStats.untracked}${RESET}`);
      if (fsParts.length > 0) gitInfo += ` ${fsParts.join(" ")}`;
    }
    line2 += ` ${gitInfo}`;
  }
  lines.push(line2);

  // Line 3: Config counts + token breakdown
  const infoParts: string[] = [];
  if (configCounts.claudeMd > 0) {
    infoParts.push(`${configCounts.claudeMd} CLAUDE.md`);
  }
  if (configCounts.rules > 0) {
    infoParts.push(`${configCounts.rules} rules`);
  }
  if (configCounts.mcp > 0) {
    infoParts.push(`${configCounts.mcp} MCPs`);
  }
  if (configCounts.hooks > 0) {
    infoParts.push(`${configCounts.hooks} hooks`);
  }

  const usage = stdin.context_window?.current_usage;
  if (usage) {
    const inTok = formatTokens(usage.input_tokens ?? 0);
    const outTok = formatTokens(usage.output_tokens ?? 0);
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreate = usage.cache_creation_input_tokens ?? 0;
    let tokenPart = `${DIM}in:${RESET}${inTok} ${DIM}out:${RESET}${outTok}`;
    if (cacheRead > 0) {
      tokenPart += ` ${BLUE}cached:${formatTokens(cacheRead)}${RESET}`;
    }
    if (cacheCreate > 0) {
      tokenPart += ` ${MAGENTA}new:${formatTokens(cacheCreate)}${RESET}`;
    }
    infoParts.push(tokenPart);
  }

  if (infoParts.length > 0) {
    lines.push(`${DIM}${infoParts.join(" | ")}${RESET}`);
  }

  // Line 4+: Tools activity (with duration for running tools)
  const running = transcript.tools.filter((t) => t.status === "running");
  const completed = transcript.tools.filter((t) => t.status === "completed");
  if (running.length > 0 || completed.length > 0) {
    const parts: string[] = [];
    for (const t of running.slice(-3)) {
      const target = t.target ? `: ${shortenPath(t.target)}` : "";
      const elapsed = formatDurationShort(Date.now() - t.startTime.getTime());
      parts.push(
        `${YELLOW}\u25D0 ${t.name}${target} ${DIM}(${elapsed})${RESET}`,
      );
    }
    // Summarize completed tools
    const completedCounts = new Map<string, number>();
    for (const t of completed) {
      completedCounts.set(t.name, (completedCounts.get(t.name) ?? 0) + 1);
    }
    for (const [name, count] of Array.from(completedCounts.entries()).slice(
      -5,
    )) {
      parts.push(
        `${GREEN}\u2713 ${name}${count > 1 ? ` \u00d7${count}` : ""}${RESET}`,
      );
    }
    lines.push(parts.join(" | "));
  }

  // Line 5: Agents (with duration for running agents)
  const runningAgents = transcript.agents.filter((a) => a.status === "running");
  if (runningAgents.length > 0) {
    const agentParts = runningAgents.slice(-3).map((a) => {
      const model = a.model ? ` [${a.model}]` : "";
      const desc = a.description ? `: ${a.description}` : "";
      const elapsed = formatDurationShort(Date.now() - a.startTime.getTime());
      return `${CYAN}\u25D0 ${a.type}${model}${desc} ${DIM}(${elapsed})${RESET}`;
    });
    lines.push(agentParts.join(" | "));
  }

  // Line 6: Todos
  if (transcript.todos.length > 0) {
    const done = transcript.todos.filter(
      (t) => t.status === "completed",
    ).length;
    const total = transcript.todos.length;
    const current = transcript.todos.find((t) => t.status === "in_progress");
    let todoLine = `${WHITE}\u25B8 ${done}/${total}${RESET}`;
    if (current) {
      const label =
        current.content.length > 40
          ? current.content.slice(0, 40) + "..."
          : current.content;
      todoLine += ` ${DIM}${label}${RESET}`;
    }
    lines.push(todoLine);
  }

  // Output with NBSP replacement (prevents Claude Code from collapsing spaces)
  for (const line of lines) {
    console.log(`${RESET}${line.replace(/ /g, "\u00A0")}`);
  }
}

function makeContextBar(percent: number): string {
  const width = 10;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color: string;
  if (percent > 80) color = RED;
  else if (percent > 50) color = YELLOW;
  else color = GREEN;

  return `${color}${"█".repeat(filled)}${GRAY}${"░".repeat(empty)}${RESET}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 2) return p;
  return parts.slice(-2).join("/");
}

function formatDurationShort(ms: number): string {
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
