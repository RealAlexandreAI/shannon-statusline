---
description: Configure shannon-statusline as your statusline
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

## Step 1: Detect Runtime

Get the plugin path:
```bash
ls -td ~/.claude/plugins/cache/shannon-statusline/shannon-statusline/*/ 2>/dev/null | head -1
```
If empty, the plugin is not installed. Tell user to install via `/plugin install shannon-statusline` first.

Get runtime absolute path (prefer bun for performance, fallback to node):
```bash
command -v bun 2>/dev/null || command -v node 2>/dev/null
```
If empty, stop and tell user to install Node.js or Bun.

Determine source file based on runtime:
- If bun: use `src/index.ts`
- Otherwise: use `dist/index.js`

Generate command:
```
bash -c '"{RUNTIME_PATH}" "$(ls -td ~/.claude/plugins/cache/shannon-statusline/shannon-statusline/*/ 2>/dev/null | head -1){SOURCE}"'
```

## Step 2: Test Command

Run the generated command. It should produce output within a few seconds.
If it errors, do not proceed.

## Step 3: Apply Configuration

Read `~/.claude/settings.json` and merge in the statusLine config:

```json
{
  "statusLine": {
    "type": "command",
    "command": "{GENERATED_COMMAND}"
  }
}
```

Preserve all existing settings. Only update the `statusLine` key.

## Step 4: Verify

Use AskUserQuestion:
- Question: "The statusline should now appear below your input. Is it working?"
- Options: "Yes, I see it" / "No, something's wrong"

If no: debug with `{GENERATED_COMMAND} 2>&1` and check runtime paths.
