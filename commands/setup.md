---
description: Install shannon-statusline as your Claude Code statusline
allowed-tools: Bash, Read, Edit
---

Run the setup command:

```bash
shannon-statusline setup
```

This detects your Node.js path, writes `~/.shannon/shannon-statusline/run.sh`,
and patches `~/.claude/settings.json` with the correct `statusLine.command`.

If `shannon-statusline` is not in PATH yet, install it first:

```bash
npm install -g shannon-statusline
```

Then restart Claude Code. The HUD appears below every response.
