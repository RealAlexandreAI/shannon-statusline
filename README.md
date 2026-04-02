# shannon-statusline

> 为 [Claude Code](https://claude.ai/code) 打造的赛博朋克终端 HUD —— 由 [Shannon](https://github.com/RealAlexandreAI/Shannon) 驱动。

挂载在 Claude Code 的 `PostToolUse` / `Stop` 生命周期钩子，渲染实时多行 ANSI 状态条，展示模型、上下文用量、Git 状态、Token 消耗、工具活动、子 Agent 状态及 Todo 进度 —— 全部集中在一块终端 HUD 中。

![shannon-statusline preview](shannon-statusline.png)

---

## 🤖 For Agent — 自动安装

> 如果你是 AI Agent（如 Claude Code），请阅读并执行下方代码块完成全自动安装。

```agent-install
# Step 1: Install shannon-statusline globally
npm install -g shannon-statusline

# Step 2: Merge hooks into ~/.claude/settings.json
# Read the current file (create if missing), then deep-merge the hooks below.
# DO NOT overwrite existing hooks — append PostToolUse and Stop entries.

SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"

# If file doesn't exist, initialize with empty object
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Use node to safely merge hooks (avoids clobbering existing config)
node - <<'EOF'
const fs = require('fs');
const path = require('path');

const file = path.join(process.env.HOME, '.claude', 'settings.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}

config.hooks ??= {};

const hookEntry = { type: 'command', command: 'shannon-statusline' };
const matcher   = { matcher: '', hooks: [hookEntry] };

for (const event of ['PostToolUse', 'Stop']) {
  config.hooks[event] ??= [];
  const already = config.hooks[event].some(
    g => g.hooks?.some(h => h.command === 'shannon-statusline')
  );
  if (!already) config.hooks[event].push(matcher);
}

fs.writeFileSync(file, JSON.stringify(config, null, 2));
console.log('✔ shannon-statusline hooks installed →', file);
EOF

# Step 3: Verify installation
shannon-statusline --version 2>/dev/null && echo "✔ binary OK" || echo "⚠ binary not found — check PATH"
```

完成后 `~/.claude/settings.json` 中将包含 `PostToolUse` 和 `Stop` 两个钩子，每次 Claude Code 调用工具或停止时自动渲染 HUD。

---

## 安装

```bash
npm install -g shannon-statusline
# or
bun add -g shannon-statusline
```

## 在 Claude Code 中使用

### 全局 hook（所有项目）

添加到 `~/.claude/settings.json`：

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

### 项目级 hook

添加到项目根目录的 `.claude/settings.json`：

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

---

## HUD 格式

渲染 7 行输出，分两区（状态区 + 活动区），中间由紫色分隔线隔开：

```
λ claude-opus-4-5 │ ⌘ ~/D/Shannon │ ⎇ main* ↑2 !3 +1 │ ✦ 12m │ @myagent │ ⊟ auto
⊡ ████████░░░░ 65% (200k)  ↑ 36k  ↓ 300  ⊗ 8.5k
※ ×3 CLAUDE.md │ ≡ ×2 rules │ ⊕ ×1 MCPs │ ↩ ×2 hooks
────────────────────────────────────────
↻ Bash: ~/D/Shannon/src (3s) │ ✔ Read ×12 │ ✔ Edit ×7 │ ✔ Bash ×4
↻ Task [claude-haiku-3-5]: implement auth module (1m 2s)
▸ Fix login bug (3/5)
```

### 第 1 行 — 项目信息

| 图标 | 含义 | 颜色 |
|------|------|------|
| `λ` | Claude 模型名 | electric cyan |
| `⌘` | 工作目录（Fish 风格缩短路径） | chrome gold |
| `⎇` | Git 分支 `*`=有未提交修改 | electric cyan |
| `↑N` | 领先远端 N 个提交 | green |
| `↓N` | 落后远端 N 个提交 | red |
| `!N` | 已修改文件数 | neon orange |
| `+N` | 新增文件数 | matrix green |
| `✘N` | 已删除文件数 | red |
| `?N` | Untracked 文件数 | electric purple |
| `✦` | 会话时长 | electric purple |
| `@name` | Agent 名称 | neon pink |
| `⊟` | 权限模式（auto/approve-all/deny-all） | electric purple |

### 第 2 行 — 上下文用量

真彩色渐变进度条，颜色随危险程度变化：

| 范围 | 颜色渐变 | 含义 |
|------|---------|------|
| < 70% | 暗绿 → 霓虹酸绿 `#39ff14` | 正常 |
| 70–84% | 暗焦橙 → 霓虹橙 `#ff6b00` | 注意 |
| ≥ 85% | 深洋红 → 霓虹粉 `#ff0090` | 危险 + `▲ high usage` 警告 |

行格式：`⊡ ████░░ 65% (200k)  ↑ 36k  ↓ 300  ⊗ 8.5k`

| 图标 | 含义 |
|------|------|
| `⊡` | 上下文进度条 |
| `↑` | Input tokens |
| `↓` | Output tokens |
| `⊗` | 缓存命中 tokens（cache_read + cache_creation） |

### 第 3 行 — 配置加载

| 图标 | 含义 | 颜色 |
|------|------|------|
| `※` | 加载的 `CLAUDE.md` 数量 | chrome gold |
| `≡` | Rules 文件数量 | electric purple |
| `⊕` | MCP 数量 | bright aqua |
| `↩` | Hooks 数量 | neon orange |

如果全部为 0 则此行不显示。

### 分隔线

`────────────────────────────────────────`（40 × electric purple）

### 第 5 行 — 工具活动

运行中的工具（最近 3 个）+ 完成工具统计（按频率排序，最多 5 项）：

```
↻ Bash: ~/D/Shannon/src (3s) │ ✔ Read ×12 │ ✔ Edit ×7
```

| 图标 | 含义 |
|------|------|
| `↻` | 正在运行 | neon orange |
| `✔` | 已完成 | matrix green |

### 第 6 行 — Agent 活动

运行中的子 Agent（最近 3 个）+ 已完成 Agent（最近 3 个）：

```
↻ Task [claude-haiku-3-5]: implement feature (1m 2s) │ ✔ Task: debug session
```

### 第 7 行 — Todo 进度

```
▸ Fix login bug (3/5)       # 有进行中 todo
✔ All done (5/5)            # 全部完成
```

---

## 图标速查表

| 图标 | Unicode | 用途 |
|------|---------|------|
| `λ` | U+03BB | AI / Claude 模型（λ演算） |
| `⌘` | U+2318 | 工作目录路径（macOS ⌘ 键） |
| `⎇` | U+2387 | Git 分支 |
| `✦` | U+2726 | 会话时长 |
| `⊟` | U+229F | 权限模式 |
| `↑` | U+2191 | Input tokens / Git 领先 |
| `↓` | U+2193 | Output tokens / Git 落后 |
| `⊗` | U+2297 | 缓存 tokens |
| `⊡` | U+22A1 | 上下文进度条 |
| `≡` | U+2261 | Rules 文件 |
| `⊕` | U+2295 | MCP 数量 |
| `▲` | U+25B2 | 高用量警告 |
| `✔` | U+2714 | 已完成 |
| `↻` | U+21BB | 运行中 |
| `▸` | U+25B8 | 当前 Todo |
| `※` | U+203B | CLAUDE.md 配置文件 |
| `↩` | U+21A9 | Hooks（事件触发器） |

> 所有图标均来自标准 Unicode 块（Greek、Arrows、Mathematical Ops、Misc Technical、Geometric Shapes、Dingbats），**不需要 Nerd Font**，SF Mono、Menlo、Monaco 均可正常显示。

---

## 工作原理

Claude Code 触发 hook 时，通过 **stdin** 传入 JSON payload。`shannon-statusline` 读取后：

1. **解析** payload（model、context window、session ID、transcript path、CWD）
2. 并行收集三路数据：
   - **Transcript** — 解析最近 JSONL 文件，统计工具调用、子 Agent、Todo、文件活动
   - **Git** — `git status --porcelain -b` 获取分支、dirty 状态、ahead/behind、文件统计
   - **Configs** — 扫描 CLAUDE.md、rules、MCP、hooks 文件数量
3. **渲染** 7 行 ANSI HUD 到 stdout（所有空格替换为 NBSP，防止终端折行）
4. **写入** Bridge 文件（`~/Library/Caches/shannon/status.json`），供 Shannon GUI 实时读取

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SHANNON_BRIDGE_PATH` | `~/Library/Caches/shannon/status.json`（macOS） | 覆盖 Bridge JSON 输出路径 |

```bash
SHANNON_BRIDGE_PATH=/tmp/my-bridge.json shannon-statusline
```

---

## Bridge 文件格式

```json
{
  "session_id": "abc123",
  "model": { "id": "claude-opus-4-5", "display_name": "claude-opus-4-5" },
  "context_window": {
    "used_percentage": 65,
    "remaining_percentage": 35,
    "context_window_size": 200000,
    "input_tokens": 36000,
    "output_tokens": 300,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 8500
  },
  "cost": {
    "total_cost_usd": 0.042,
    "total_duration_ms": 12000,
    "total_lines_added": 45,
    "total_lines_removed": 12
  },
  "workspace": {
    "cwd": "/Users/slahser/Desktop/Shannon",
    "project_dir": "/Users/slahser/Desktop/Shannon"
  },
  "git": {
    "branch": "main",
    "is_dirty": true,
    "ahead": 2,
    "behind": 0,
    "file_stats": { "modified": 3, "added": 1, "deleted": 0, "untracked": 2 }
  },
  "tools": [
    {
      "name": "Read",
      "target": "/src/index.ts",
      "status": "completed",
      "start_time_ms": 1700000000000,
      "duration_ms": 45
    }
  ],
  "tool_counts": { "Read": 12, "Edit": 7, "Bash": 4 },
  "agents": [
    {
      "id": "agent-001",
      "type": "Task",
      "model": "claude-haiku-3-5",
      "description": "implement auth module",
      "status": "running",
      "start_time_ms": 1700000000000,
      "duration_ms": null
    }
  ],
  "todos": [
    { "content": "Fix login bug", "status": "in_progress", "priority": "high" }
  ],
  "file_activity": [
    { "path": "/src/index.ts", "type": "write", "timestamp_ms": 1700000000000 }
  ],
  "config_counts": {
    "claude_md": 3,
    "rules": 2,
    "mcp": 1,
    "hooks": 2
  },
  "session_duration_ms": 720000,
  "permission_mode": "auto",
  "vim_mode": null,
  "agent_name": null,
  "timestamp": 1700000000000
}
```

---

## Shannon GUI 集成

[Shannon](https://github.com/RealAlexandreAI/Shannon) 监听 Bridge 文件变化，实时更新侧边栏 **Agent Status** 面板——展示模型、上下文进度条、工具统计网格、文件活动时间线。

无需额外配置，Shannon 自动从默认路径读取，或通过 `SHANNON_BRIDGE_PATH` 覆盖。

---

## 开发

```bash
git clone https://github.com/RealAlexandreAI/shannon-statusline.git
cd shannon-statusline
bun install
bun run build      # TypeScript → dist/

# 用示例 payload 测试
bun run test:stdin
```

### 项目结构

```
src/
  index.ts          — 入口：stdin 解析 → 并行数据收集 → render + bridge
  render.ts         — 赛博朋克 ANSI HUD 渲染（7 行输出）
  bridge.ts         — 写入 JSON Bridge 文件供 Shannon GUI 读取
  transcript.ts     — JSONL transcript 解析（工具/Agent/Todo/文件活动）
  git.ts            — Git 状态检测（branch/dirty/ahead/behind/file stats）
  config-counter.ts — 配置文件计数（CLAUDE.md/rules/MCP/hooks）
  stdin.ts          — stdin JSON payload 解析与工具函数
  types.ts          — 共享 TypeScript 类型定义
dist/               — 编译输出（.gitignore，npm 发布）
```

---

## Contributing

Issues 和 PR 欢迎提交到 [github.com/RealAlexandreAI/shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline)。

## License

MIT © [RealAlexandreAI](https://github.com/RealAlexandreAI)
