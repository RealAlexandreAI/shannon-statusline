<div align="center">

<img src="shannon-statusline.png" alt="shannon-statusline preview" width="100%" />

# shannon-statusline

**Cyberpunk terminal HUD for [Claude Code](https://claude.ai/code)**

[![npm version](https://img.shields.io/npm/v/shannon-statusline?color=ff0090&label=npm)](https://www.npmjs.com/package/shannon-statusline)
[![license](https://img.shields.io/npm/l/shannon-statusline?color=39ff14)](./LICENSE)
[![node](https://img.shields.io/node/v/shannon-statusline?color=00bfff)](./package.json)

</div>

---

## What you get

A live HUD rendered below every Claude Code response:

```
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ✦ 12m  │  ⊟ auto
λ Opus  │  ⊡ ████████░░░░ 65% (200k)  │  ↑ 36k  ↓ 300  ⊗ 8.5k
※ ×3 CLAUDE.md  │  ⊕ ×4 MCPs  │  ↩ ×12 hooks
──────────────────────────────────────────────────────
✔ Read ×12  │  ✔ Edit ×7  │  ✔ Bash ×4
↻ Bash: ~/D/project/src (3s)
──────────────────────────────────────────────────────
↻ Fix login bug  (3/5)
▸ Add OAuth flow
✔ Refactor session store
──────────────────────────────────────────────────────
↻ Task [haiku]: implement auth (1m 2s)
✔ Explore: search docs for tag refs
```

Each line has Matrix-style katakana rain on the right. No Nerd Font needed.

---

## Install

```bash
npm install -g shannon-statusline
shannon-statusline setup
```

`setup` detects your Node.js, writes `~/.shannon/shannon-statusline/run.sh`, and patches `~/.claude/settings.json`. Restart Claude Code — done.

> **No bundled runtime dependency.** Uses whatever `node` is in your PATH. Immune to system library upgrades.

---

## Manual config

If you prefer to wire it yourself, add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "shannon-statusline",
    "padding": 0
  }
}
```

Or scope it to one project via `.claude/settings.json` at the repo root.

---

## GUI bridge

Alongside the terminal HUD, the same data is pushed as NDJSON to a Unix socket at `/tmp/shannon-<uid>.sock`. Any local process listening on that socket receives live session state — model, context, tools, agents, todos, git, cost — on every hook tick.

Socket absent → silent no-op, zero overhead.

---

## Development

```bash
git clone https://github.com/RealAlexandreAI/shannon-statusline.git
cd shannon-statusline
bun install
bun run build
bun run test:stdin   # smoke test with sample payload
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`RELEASING.md`](./RELEASING.md).

---

## License

[MIT](./LICENSE)
