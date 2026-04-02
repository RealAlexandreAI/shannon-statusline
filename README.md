# shannon-statusline

> Rich agent-monitoring StatusLine plugin for [Claude Code](https://claude.ai/code) — powered by [Shannon](https://github.com/RealAlexandreAI/Shannon).

A terminal HUD that hooks into Claude Code's `PostToolUse` / `Stop` lifecycle events and renders a live status overlay showing model, context usage, session info, git branch, and active tool counts — all in a single, composable line.

```
⎇ main  ●  claude-opus-4-5  ▸ 18%  λ 42  ✦ 12  ✎ 8  ⚙ 3  ⊗ 2  ✔ session-abc123
```

## Installation

```bash
npm install -g shannon-statusline
# or
bun add -g shannon-statusline
```

## Usage with Claude Code

### Global hook (all projects)

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "shannon-statusline"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "shannon-statusline"
          }
        ]
      }
    ]
  }
}
```

### Project-scoped hook

Add to `.claude/settings.json` in your project root:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "shannon-statusline" }]
      }
    ]
  }
}
```

## How it works

Claude Code invokes the hook command and passes a JSON payload via **stdin**. `shannon-statusline` reads it, then:

1. **Parses** the payload (model, context window, session ID, transcript path, CWD)
2. **Reads** the last 50 lines of the JSONL transcript to count tool calls
3. **Checks** git branch via `git symbolic-ref`
4. **Renders** a one-line ANSI HUD to stdout (visible in the terminal)
5. **Writes** a JSON bridge file (`~/Library/Caches/shannon/status.json`) that [Shannon GUI](https://github.com/RealAlexandreAI/Shannon) reads for the sidebar panel

Steps 2–4 run in parallel for near-zero latency.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SHANNON_BRIDGE_PATH` | `~/Library/Caches/shannon/status.json` (macOS) | Override the bridge JSON output path. Useful for testing or when running in a custom environment. |

### Example

```bash
SHANNON_BRIDGE_PATH=/tmp/my-bridge.json shannon-statusline
```

## HUD Format

```
⎇ <branch>  ●  <model>  ▸ <context%>%  λ <total_calls>  ✦ <read>  ✎ <write>  ⚙ <bash>  ⊗ <task>  ✔ <session_id>
```

| Symbol | Meaning |
|--------|---------|
| `⎇` | Git branch |
| `●` | Session active indicator |
| `▸ N%` | Context window usage percentage |
| `λ` | Total tool calls this session |
| `✦` | Read tool calls |
| `✎` | Write/Edit tool calls |
| `⚙` | Bash/shell tool calls |
| `⊗` | Task/Agent subagent calls |
| `✔` | Session ID (truncated) |

## Shannon GUI Integration

When [Shannon](https://github.com/RealAlexandreAI/Shannon) is running, it watches the bridge file and populates the **Agent Status** sidebar in real time — showing model, context usage bar, tool stats grid, and file activity timeline.

No extra configuration needed. Shannon auto-detects the bridge file at the default path, or reads `SHANNON_BRIDGE_PATH` if set.

## Bridge File Format

```json
{
  "model": { "display_name": "claude-opus-4-5", "id": "claude-opus-4-5" },
  "context_window": {
    "used_percentage": 18,
    "context_window_size": 200000,
    "current_usage": {
      "input_tokens": 36000,
      "output_tokens": 300,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 500
    }
  },
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "workspace": {
    "current_dir": "/path/to/project",
    "project_dir": "/path/to/project"
  }
}
```

## Development

```bash
git clone https://github.com/RealAlexandreAI/shannon-statusline.git
cd shannon-statusline
bun install
bun run build      # compile TypeScript → dist/

# Test with sample payload
bun run test:stdin
```

### Project structure

```
src/
  index.ts     — entry: stdin parse → parallel render+bridge
  bridge.ts    — write JSON bridge file for Shannon GUI
  render.ts    — ANSI HUD rendering
  git.ts       — git branch detection
  tools.ts     — transcript JSONL tool call counter
  types.ts     — shared TypeScript types
dist/          — compiled output (git-ignored, npm-published)
```

## Contributing

Issues and PRs welcome at [github.com/RealAlexandreAI/shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline).

## License

MIT © [RealAlexandreAI](https://github.com/RealAlexandreAI)
