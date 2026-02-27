import * as fs from "node:fs";
import * as readline from "node:readline";
import type {
  TranscriptData,
  ToolEntry,
  AgentEntry,
  TodoItem,
} from "./types.js";

const MAX_TOOLS = 20;
const MAX_AGENTS = 10;
const MAX_FILES = 20;

export async function parseTranscript(
  transcriptPath: string
): Promise<TranscriptData> {
  const result: TranscriptData = {
    tools: [],
    toolCounts: {},
    agents: [],
    todos: [],
    fileActivity: [],
    sessionStart: null,
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return result;
  }

  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  const toolCountMap = new Map<string, number>();
  const fileSet = new Set<string>();
  const latestTodos: TodoItem[] = [];

  try {
    const fileStream = fs.createReadStream(transcriptPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        processEntry(
          entry,
          toolMap,
          agentMap,
          toolCountMap,
          fileSet,
          latestTodos,
          result
        );
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Return partial results on error
  }

  result.tools = Array.from(toolMap.values()).slice(-MAX_TOOLS);
  result.toolCounts = Object.fromEntries(toolCountMap);
  result.agents = Array.from(agentMap.values()).slice(-MAX_AGENTS);
  result.todos = latestTodos;
  result.fileActivity = Array.from(fileSet).slice(-MAX_FILES);

  return result;
}

function processEntry(
  entry: Record<string, unknown>,
  toolMap: Map<string, ToolEntry>,
  agentMap: Map<string, AgentEntry>,
  toolCountMap: Map<string, number>,
  fileSet: Set<string>,
  latestTodos: TodoItem[],
  result: TranscriptData
): void {
  const timestamp = entry.timestamp
    ? new Date(entry.timestamp as string)
    : new Date();

  if (!result.sessionStart && entry.timestamp) {
    result.sessionStart = timestamp;
  }

  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === "tool_use" && block.id && block.name) {
      const toolName = block.name as string;
      const input = block.input as Record<string, unknown> | undefined;

      // Count all tool uses
      toolCountMap.set(toolName, (toolCountMap.get(toolName) ?? 0) + 1);

      // Track file activity from Read/Write/Edit
      const filePath = extractFilePath(toolName, input);
      if (filePath) {
        fileSet.add(filePath);
      }

      if (toolName === "Task") {
        // Sub-agent
        const agentEntry: AgentEntry = {
          id: block.id as string,
          type: (input?.subagent_type as string) ?? "unknown",
          model: (input?.model as string) ?? null,
          description: (input?.description as string) ?? null,
          status: "running",
          startTime: timestamp,
        };
        agentMap.set(block.id as string, agentEntry);
      } else if (toolName === "TodoWrite") {
        // Todos
        const todos = input?.todos;
        if (todos && Array.isArray(todos)) {
          latestTodos.length = 0;
          latestTodos.push(
            ...todos.map(
              (t: Record<string, unknown>) =>
                ({
                  content: (t.content as string) ?? (t.subject as string) ?? "",
                  status: (t.status as TodoItem["status"]) ?? "pending",
                }) satisfies TodoItem
            )
          );
        }
      } else {
        // Regular tool
        const toolEntry: ToolEntry = {
          id: block.id as string,
          name: toolName,
          target: extractTarget(toolName, input),
          status: "running",
          startTime: timestamp,
        };
        toolMap.set(block.id as string, toolEntry);
      }
    }

    if (block.type === "tool_result" && block.tool_use_id) {
      const id = block.tool_use_id as string;
      const tool = toolMap.get(id);
      if (tool) {
        tool.status = block.is_error ? "error" : "completed";
        tool.endTime = timestamp;
      }
      const agent = agentMap.get(id);
      if (agent) {
        agent.status = "completed";
        agent.endTime = timestamp;
      }
    }
  }
}

function extractFilePath(
  toolName: string,
  input: Record<string, unknown> | undefined
): string | null {
  if (!input) return null;
  if (toolName === "Read" || toolName === "Write" || toolName === "Edit") {
    return (input.file_path as string) ?? (input.path as string) ?? null;
  }
  return null;
}

function extractTarget(
  toolName: string,
  input: Record<string, unknown> | undefined
): string | null {
  if (!input) return null;
  switch (toolName) {
    case "Read":
    case "Write":
    case "Edit":
      return (input.file_path as string) ?? (input.path as string) ?? null;
    case "Glob":
    case "Grep":
      return (input.pattern as string) ?? null;
    case "Bash": {
      const cmd = input.command as string | undefined;
      if (!cmd) return null;
      return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
    }
    case "WebFetch":
      return (input.url as string) ?? null;
    case "WebSearch":
      return (input.query as string) ?? null;
    case "LSP":
      return (input.operation as string) ?? null;
  }
  return null;
}
