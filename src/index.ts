import { readStdin } from "./stdin.js";
import { parseTranscript } from "./transcript.js";
import { getGitStatus } from "./git.js";
import { countConfigs } from "./config-counter.js";
import { render } from "./render.js";
import { writeBridge } from "./bridge.js";
import type { ShannonBridgeData } from "./types.js";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export async function main(): Promise<void> {
  try {
    const stdin = await readStdin();
    if (!stdin) {
      console.log("[shannon-statusline] Initializing...");
      return;
    }

    const transcriptPath = stdin.transcript_path ?? "";
    const cwd = stdin.cwd ?? stdin.workspace?.current_dir ?? "";

    // Collect data in parallel
    const [transcript, git, configCounts] = await Promise.all([
      parseTranscript(transcriptPath),
      getGitStatus(cwd),
      countConfigs(cwd),
    ]);

    // Session duration
    const sessionDuration = formatSessionDuration(transcript.sessionStart);

    // Render terminal HUD (stdout)
    render(stdin, transcript, git, configCounts, sessionDuration);

    // Write bridge file for Shannon GUI
    const bridgeData = assembleBridgeData(stdin, transcript, git, configCounts);
    writeBridge(bridgeData);
  } catch (error) {
    console.log(
      "[shannon-statusline] Error:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

function assembleBridgeData(
  stdin: NonNullable<Awaited<ReturnType<typeof readStdin>>>,
  transcript: Awaited<ReturnType<typeof parseTranscript>>,
  git: Awaited<ReturnType<typeof getGitStatus>>,
  configCounts: Awaited<ReturnType<typeof countConfigs>>,
): ShannonBridgeData {
  const usage = stdin.context_window?.current_usage;

  return {
    session_id: stdin.session_id ?? null,
    transcript_path: stdin.transcript_path ?? null,
    version: stdin.version ?? null,
    output_style: stdin.output_style?.name ?? null,
    exceeds_200k_tokens: stdin.exceeds_200k_tokens ?? false,

    model: stdin.model?.id
      ? {
          id: stdin.model.id,
          display_name: stdin.model.display_name ?? stdin.model.id,
        }
      : null,

    context_window: stdin.context_window
      ? {
          used_percentage: stdin.context_window.used_percentage ?? 0,
          remaining_percentage:
            stdin.context_window.remaining_percentage ?? 100,
          context_window_size: stdin.context_window.context_window_size ?? 0,
          input_tokens: usage?.input_tokens ?? 0,
          output_tokens: usage?.output_tokens ?? 0,
          cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        }
      : null,

    cost: stdin.cost
      ? {
          total_cost_usd: stdin.cost.total_cost_usd ?? 0,
          total_duration_ms: stdin.cost.total_duration_ms ?? 0,
          total_api_duration_ms: stdin.cost.total_api_duration_ms ?? 0,
          total_lines_added: stdin.cost.total_lines_added ?? 0,
          total_lines_removed: stdin.cost.total_lines_removed ?? 0,
        }
      : null,

    workspace: stdin.cwd
      ? {
          cwd: stdin.cwd,
          project_dir: stdin.workspace?.project_dir ?? null,
          added_dirs: stdin.workspace?.added_dirs ?? [],
        }
      : null,

    git: git
      ? {
          branch: git.branch,
          is_dirty: git.isDirty,
          ahead: git.ahead,
          behind: git.behind,
          file_stats: git.fileStats,
        }
      : null,

    tools: transcript.tools.map((t) => ({
      name: t.name,
      target: t.target,
      status: t.status,
      start_time_ms: t.startTime.getTime(),
      duration_ms: t.endTime
        ? t.endTime.getTime() - t.startTime.getTime()
        : null,
    })),
    tool_counts: transcript.toolCounts,

    agents: transcript.agents.map((a) => ({
      id: a.id,
      type: a.type,
      model: a.model,
      description: a.description,
      status: a.status,
      start_time_ms: a.startTime.getTime(),
      duration_ms: a.endTime
        ? a.endTime.getTime() - a.startTime.getTime()
        : null,
    })),

    todos: transcript.todos,
    file_activity: transcript.fileActivity,

    config_counts: {
      claude_md: configCounts.claudeMd,
      rules: configCounts.rules,
      mcp: configCounts.mcp,
      hooks: configCounts.hooks,
    },

    session_duration_ms: transcript.sessionStart
      ? Date.now() - transcript.sessionStart.getTime()
      : null,

    vim_mode: stdin.vim?.mode ?? null,
    agent_name: stdin.agent?.name ?? null,
    permission_mode: stdin.permission_mode ?? null,
    timestamp: Date.now(),
  };
}

function formatSessionDuration(sessionStart: Date | null): string {
  if (!sessionStart) return "";
  const ms = Date.now() - sessionStart.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

// Direct execution detection
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (argvPath && isSamePath(argvPath, scriptPath)) {
  void main();
}
