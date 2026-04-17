<div align="center">

<img src="shannon-statusline.png" alt="shannon-statusline preview" width="100%" />

# shannon-statusline

**赛博朋克终端 HUD for [Claude Code](https://claude.ai/code) — adaptive multi-section status with matrix-rain decoration, zero runtime deps.**

[![npm version](https://img.shields.io/npm/v/shannon-statusline?color=ff0090&label=npm)](https://www.npmjs.com/package/shannon-statusline)
[![license](https://img.shields.io/npm/l/shannon-statusline?color=39ff14)](./LICENSE)
[![node](https://img.shields.io/node/v/shannon-statusline?color=00bfff)](./package.json)

</div>

挂在 Claude Code 的 `PostToolUse` / `Stop` 生命周期钩子上，把模型 / 上下文 / Git / Token / 工具活动 / 子 Agent / Todo 浓缩成一块自适应 ANSI HUD，每行右侧附一道 Matrix 风格片假名雨。同时把同帧数据通过 Unix socket NDJSON 推给本地监听者（如 [Shannon](https://github.com/RealAlexandreAI/Shannon) GUI）。

---

## ⚡ 30 秒安装

```bash
npm install -g shannon-statusline
```

加到 `~/.claude/settings.json`：

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "shannon-statusline" }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "shannon-statusline" }] }
    ]
  }
}
```

完成。下次 Claude Code 调用任意工具或停止时，HUD 自动渲染。

<details>
<summary>🤖 想让 AI Agent 全自动安装？点这里展开 install script</summary>

```agent-install
# Step 1: Install shannon-statusline globally
npm install -g shannon-statusline

# Step 2: Merge hooks into ~/.claude/settings.json (deep-merge, won't clobber existing hooks)
SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"
[ ! -f "$SETTINGS_FILE" ] && echo '{}' > "$SETTINGS_FILE"

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
  const already = config.hooks[event].some(g => g.hooks?.some(h => h.command === 'shannon-statusline'));
  if (!already) config.hooks[event].push(matcher);
}
fs.writeFileSync(file, JSON.stringify(config, null, 2));
console.log('✔ shannon-statusline hooks installed →', file);
EOF

# Step 3: Verify
shannon-statusline --version 2>/dev/null && echo "✔ binary OK" || echo "⚠ binary not found — check PATH"
```

</details>

<details>
<summary>项目级 hook（只在某个仓库启用）</summary>

加到项目根目录 `.claude/settings.json`：

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "shannon-statusline" }] }
    ]
  }
}
```

</details>

---

## ✨ 它做什么

| | |
|---|---|
| 🪶 **Zero runtime deps** | `dependencies: {}`，唯一依赖是 Node.js 自带 stdlib |
| 🎨 **不用 Nerd Font** | 全部图标走标准 Unicode 块（Greek、Arrows、Math Ops、Misc Technical），SF Mono / Menlo / Monaco 可显 |
| 🌧 **Matrix Rain** | 每行右侧自带 6 列绿色片假名瀑布，stagger 偏移 + 头部白绿衰减，"在终端里跑《黑客帝国》" |
| 🌈 **真彩色渐变进度条** | 上下文用量按区间在 暗绿→霓虹酸绿 → 暗焦橙→霓虹橙 → 深洋红→霓虹粉 之间 24-bit 渐变，超 85% 触发 `▲ high usage` |
| 💡 **会呼吸的分隔线** | 三态：idle 稳态灰 / waiting 琥珀正弦呼吸（period 2s）/ done 彩虹滚动（任务全部完成后 linger 3s） |
| 📐 **自适应宽度** | 根据 `process.stdout.columns` 自动选择进度条宽度 4 / 6 / 10 / 12 字符；rain 列总是右对齐到当前终端右侧 |
| 🌉 **GUI Bridge** | 同帧数据通过 Unix socket NDJSON 推给本地监听者；socket 不存在则静默跳过，不会拖慢 hook |
| 🔬 **解析丰富** | JSONL transcript 提取工具 / 子 Agent / Todo / 文件活动；`git status -b` 拿分支 / dirty / ahead / behind / file stats；扫 CLAUDE.md / rules / MCP / hooks |

---

## 🖥 HUD 长什么样

布局是**自适应多段**：每段在有数据时才出现，段与段之间用一条会变颜色的分隔线断开。下面是一帧典型输出（单色文本演示，实际终端里每个段是独立彩色，右侧伴有 Matrix 雨）：

```
⌘ ~/D/Shannon  │  ⎇ main* ↑2 !3 +1 ?2  │  ✦ 12m  │  ⊟ auto                ｦ ７ Ω ｾ Ψ Φ
λ Opus 4.6  │  ⊡ ████████░░░░ 65% (1.0M)  │  ↑ 36k  ↓ 300  ⊗ 8.5k          ｾ ｦ Φ ｿ ５ Ψ
※ ×3 CLAUDE.md  │  ⊕ ×1 MCPs  │  ↩ ×2 hooks                                ｺ Δ ｦ ７ Ω ｾ
─────────────────────────────────────────────                                 Ω Ψ ｾ Φ ｦ ｺ
✔ Read ×12  │  ✔ Edit ×7  │  ✔ Bash ×4                                       ｦ ｾ ７ Ψ Δ Φ
↻ Bash: ~/D/Shannon/src (3s)                                                  ｿ ｦ ｺ Ω Ψ ７
─────────────────────────────────────────────                                 Φ ｾ ｦ Ω ｺ Ψ
↻ Fix login bug (3/5)                                                         ７ Ψ Φ ｦ ｾ Ω
▸ Add OAuth flow                                                              ｺ ｦ Ψ ７ Φ Δ
✔ Refactor session store                                                      Ω ｾ ｦ ｺ Ψ Φ
─────────────────────────────────────────────                                 ｦ Ω ｺ ７ Δ Ψ
↻ Task [haiku-3-5]: implement auth (1m 2s)                                    Ψ ｦ ｾ Φ Ω ｺ
✔ Explore: search docs for tag refs                                           ｺ Ψ ７ ｦ Φ Ω
```

四个段（每个都可选，都跟一条分隔线）：

| 段 | 出现条件 | 内容 |
|----|---------|------|
| **A · 状态** | 总是出现 | 项目路径 / Git / 会话时长 / Agent / 权限模式 → 模型 + 上下文进度条 + Token → 配置加载计数 |
| **B · 工具** | 有 completed 工具或 running 工具时 | 完成工具水平计数（按 priority list `Read/Edit/Write/Bash/Glob/Grep/Agent`）+ 当前 running 工具竖排 |
| **C · Todos** | transcript 里有 todo 时 | 每个 todo 一行，按 transcript 顺序，`✔` / `↻` / `▸` 三态图标 |
| **D · 子 Agent** | 有 running 或 completed sub-agent 时 | 先 running 再 completed，每个一行，最多 3+3 |

<details>
<summary>段 A · 状态详解（路径 / Git / 模型 / 上下文 / Token / 配置）</summary>

**第 1 行 · 项目身份**

| 图标 | 含义 | 颜色 |
|------|------|------|
| `⌘` | 项目路径（Fish 风格缩短，max 30 char） | chrome gold |
| `⎇` | Git 分支，`*` 表示有未提交改动 | electric cyan |
| `↑N` / `↓N` | 领先 / 落后远端提交数 | green / red |
| `!N` | 已修改文件数 | neon orange |
| `+N` | 新增文件数 | matrix green |
| `✘N` | 已删除文件数 | red |
| `?N` | Untracked 文件数 | electric purple |
| `✦` | 会话时长（`12m` / `1h 5m` 自适应） | electric purple |
| `@name` | Agent 名称（如果 stdin 携带） | neon pink |
| `⊟` | 权限模式（`auto` / `acceptEdits` / `bypassPermissions` / `plan`） | electric purple |

**第 2 行 · 模型 · 上下文 · Token**

`λ Opus 4.6  │  ⊡ ████░░ 65% (1.0M) ▲ high usage  │  ↑ 36k  ↓ 300  ⊗ 8.5k`

| 图标 | 含义 |
|------|------|
| `λ` | Claude / Codex 模型 display name | electric cyan |
| `⊡` | 上下文进度条前缀 | electric purple |
| 进度条本体 | 24-bit 渐变（见下方颜色规则），宽度 4/6/10/12 自适应终端宽度 |
| `N% (size)` | 用量 + 上下文窗口大小（`200k` / `1.0M`） | 颜色随用量等级变 |
| `▲ high usage` | 用量 ≥ 85% 时追加 | neon hot pink |
| `↑ N` | input tokens | cyan / 数值 white |
| `↓ N` | output tokens（仅 > 0 时显示） | lilac / white |
| `⊗ N` | cache tokens（`cache_read + cache_creation`，仅 > 0 时显示） | bright aqua |

进度条颜色规则：

| 用量 | 渐变端点 | 含义 |
|------|---------|------|
| < 70% | `#003300 → #39ff14` 暗绿 → 霓虹酸绿 | 正常 |
| 70–84% | `#7a1500 → #ff6b00` 暗焦橙 → 霓虹橙 | 注意 |
| ≥ 85% | `#5a0030 → #ff0090` 深洋红 → 霓虹粉 | 危险（叠加 `▲ high usage`） |

**第 3 行 · 配置加载**（4 项全 0 时整行不出现）

| 图标 | 含义 | 颜色 |
|------|------|------|
| `※` | `CLAUDE.md` 数量 | chrome gold |
| `≡` | rules 文件数 | electric purple |
| `⊕` | MCP 数量 | bright aqua |
| `↩` | hooks 数量 | neon orange |

</details>

<details>
<summary>段 B · 工具详解（运行中 + 已完成）</summary>

**完成工具水平计数**（curated 优先级列表 `Read / Edit / Write / Bash / Glob / Grep / Agent`，按声明顺序展示，count > 1 才显示 `×N`）：

```
✔ Read ×12  │  ✔ Edit ×7  │  ✔ Bash ×4
```

**当前运行工具**（最近 3 个，每个独占一行，含目标路径 + elapsed）：

```
↻ Bash: ~/D/Shannon/src (3s)
↻ Read: ~/D/Shannon/src/lib/api.ts (1s)
```

| 图标 | 含义 | 颜色 |
|------|------|------|
| `✔` | 已完成 | matrix green |
| `↻` | 正在运行 | neon orange |

</details>

<details>
<summary>段 C · Todos 详解（按 transcript 顺序全列）</summary>

```
↻ Fix login bug (3/5)
▸ Add OAuth flow
▸ Write integration tests
✔ Refactor session store
```

| 图标 | 状态 | 颜色 |
|------|------|------|
| `↻` | `in_progress` | neon orange |
| `▸` | `pending` | electric purple |
| `✔` | `completed` | matrix green |

`(done/total)` 后缀只附在未完成项后面（已完成项不重复展示总进度）。每条内容超 50 字符截断 + `...`。

</details>

<details>
<summary>段 D · 子 Agent 详解（running 优先 + completed）</summary>

```
↻ Task [haiku-3-5]: implement auth module (1m 2s)
↻ Task: review docker build (8s)
✔ Explore: search docs for tag refs
✔ feature-dev:code-reviewer: Review docker build system
```

- 先列 `status === "running"` 最多 3 个，再列 `status === "completed"` 最多 3 个
- 格式：`<icon> <type> [model] : <description...> (elapsed)`，model 和 description 都可空
- description 超 40 字符截断 + `...`

</details>

<details>
<summary>分隔线状态机（idle / waiting / done）</summary>

每条段间分隔线根据当前状态变色：

| 状态 | 触发 | 视觉效果 |
|------|------|---------|
| `idle` | 默认 | 稳态灰 `─`（`#585858`） |
| `waiting` | `output_style.name` ∈ `{waiting_input, ask_user, waiting}` | 琥珀色正弦呼吸，period 2s，亮度在 0.35–0.65 之间振荡 |
| `done` | 无 running 工具 + 无 running agent，且（`output_style` 是 `result`/`done`，或 todos 全部 completed） | 全色相彩虹滚动，period 2s，触发后 linger 3s 再回退 idle |

linger 用模块级 `_doneEpoch` 时间戳实现，每次 hook 调起的新 process 自然 reset，无需持久化。

</details>

<details>
<summary>Matrix Rain 装饰技术细节</summary>

每条 HUD 行右侧附 6 列绿色片假名瀑布：

- 字符集：半角片假名 `ｦｧｨｩｪｫｬｭｮｯｰｱ…ｿ` + 数字 `0–9` + 希腊字母 `λΨΩΔΦ`，全部单宽，无需 Nerd Font
- 头部下落速度：900 ms / 行（`RAIN_SPEED_MS`）
- 列间相位偏移：280 ms（`RAIN_COL_OFFSET_MS`）→ 错落瀑布
- 字符变形频率：每 350 ms 一帧
- 颜色衰减（按距头部距离 `dist` 取色）：
  - `dist=0` 头部白绿 `rgb(200,255,200)`
  - `dist=1` 霓虹酸绿 `rgb(57,255,20)`（Matrix 招牌色）
  - `dist=2` 中等绿 `rgb(0,200,0)`
  - `dist=3` 暗绿 `rgb(0,160,0)`
  - `dist=4` 更暗 `rgb(0,100,0)`
  - 末两位 → 近黑，逐渐隐没

每次 hook 触发都基于 `Date.now()` 计算当前帧位置，前后两次调用之间动画自然推进，无需持久化任何状态。

</details>

<details>
<summary>图标速查表（全部 Unicode 块出处）</summary>

| 图标 | Unicode | 出处 | 用途 |
|------|---------|------|------|
| `λ` | U+03BB | Greek & Coptic | 模型 |
| `⌘` | U+2318 | Misc Technical | 项目路径 |
| `⎇` | U+2387 | Misc Technical | Git 分支 |
| `✦` | U+2726 | Dingbats | 会话时长 |
| `⊟` | U+229F | Mathematical Ops | 权限模式 |
| `↑` | U+2191 | Arrows | input / Git ahead |
| `↓` | U+2193 | Arrows | output / Git behind |
| `⊗` | U+2297 | Mathematical Ops | cache tokens |
| `⊡` | U+22A1 | Mathematical Ops | 上下文进度条 |
| `≡` | U+2261 | Mathematical Ops | rules |
| `⊕` | U+2295 | Mathematical Ops | MCP |
| `▲` | U+25B2 | Geometric Shapes | high usage 警告 |
| `✔` | U+2714 | Dingbats | 已完成 |
| `↻` | U+21BB | Arrows | 运行中 |
| `▸` | U+25B8 | Geometric Shapes | pending todo |
| `※` | U+203B | CJK Symbols | CLAUDE.md |
| `↩` | U+21A9 | Arrows | hooks |

> 全部来自标准 Unicode 块，**不需要 Nerd Font**。

</details>

---

## 🌉 GUI Bridge — Unix socket NDJSON

每次渲染完，statusline 会把同一帧数据封装成 NDJSON 消息推到本地 Unix socket：

| 项 | 值 |
|----|----|
| Socket 路径 | `/tmp/shannon-<uid>.sock`（`<uid>` = 当前 user uid） |
| 覆盖 | 环境变量 `SHANNON_SOCKET_PATH` |
| 协议 | 一条 NDJSON line（JSON + `\n`）后即关 socket |
| 超时 | 2000 ms 写超时 |
| 失败行为 | 静默 —— socket 不存在 / 写超时 / 任意错误都不会让 hook fail |

只有当本地有进程在监听该 socket（典型场景：[Shannon](https://github.com/RealAlexandreAI/Shannon) GUI 已启动）时才有副作用。GUI 没起时，statusline 渲染 HUD 后正常退出，无任何文件 I/O 副作用。

### 消息格式

```jsonc
{
  "type": "status_update",
  "session_id": "abc123",
  "transcript_path": "/Users/.../session.jsonl",
  "version": "2.1.92",
  "output_style": "result",
  "exceeds_200k_tokens": false,

  "model": { "id": "claude-opus-4-5", "display_name": "Opus 4.6 (1M context)" },

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
    "total_api_duration_ms": 8400,
    "total_lines_added": 45,
    "total_lines_removed": 12
  },

  "workspace": {
    "cwd": "/Users/slahser/Desktop/Shannon",
    "project_dir": "/Users/slahser/Desktop/Shannon",
    "added_dirs": []
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
    { "content": "Fix login bug", "status": "in_progress" }
  ],
  "file_activity": ["/src/index.ts", "/src/lib/api.ts"],

  "config_counts": {
    "claude_md": 3,
    "rules": 2,
    "mcp": 1,
    "hooks": 2
  },

  "session_duration_ms": 720000,
  "vim_mode": null,
  "agent_name": null,
  "permission_mode": "auto",
  "timestamp": 1700000000000
}
```

> Schema 是公开契约。修改字段需 bump 版本，规则见 [`CONTRIBUTING.md`](./CONTRIBUTING.md#bridge-json-schema-变更政策)。

### 自己写一个消费者

最小消费者（Node.js）：

```js
import * as net from "node:net";
import * as fs from "node:fs";

const SOCKET = `/tmp/shannon-${process.getuid()}.sock`;

try { fs.unlinkSync(SOCKET); } catch {}

net.createServer((conn) => {
  let buf = "";
  conn.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "status_update") {
        console.log("ctx:", msg.context_window?.used_percentage, "%");
      }
    }
  });
}).listen(SOCKET, () => {
  fs.chmodSync(SOCKET, 0o600);
  console.log("listening:", SOCKET);
});
```

---

## 工作原理

Claude Code 触发 hook 时通过 stdin 把 JSON payload 传给 `shannon-statusline`：

1. **解析** payload —— model / context window / session ID / transcript path / cwd / output_style / cost / vim / agent / permission_mode
2. **并行收集** 三路数据
   - **Transcript** —— `tail` 最近 JSONL 文件，重建工具 / 子 Agent / Todo / 文件活动 / sessionStart
   - **Git** —— `git status --porcelain -b` 拿分支、dirty、ahead/behind、按状态分类的文件计数
   - **Configs** —— 扫描 `CLAUDE.md` / `rules*` / MCP / hooks 文件数
3. **检测** 当前分隔线状态（idle/waiting/done），按需 latch done linger
4. **渲染** 自适应多段 HUD 到 stdout（所有空格替换为 NBSP 防止终端折行 + 右侧叠加 Matrix Rain）
5. **推送** 同帧 bridge 数据到 Unix socket（socket 不存在则静默跳过）

---

## Shannon GUI 集成

[Shannon](https://github.com/RealAlexandreAI/Shannon) 是一个 macOS Tauri app，进程启动时在 `/tmp/shannon-<uid>.sock` 起 Unix socket server，接收 statusline 推过来的 NDJSON 流，把数据实时渲染到侧边栏 **Agent Status** 面板：模型、上下文进度条、工具计数网格、文件活动 timeline、子 Agent 列表、Todo 进度。

无需额外配置 —— 只要装好 statusline 钩子 + Shannon 在跑，就自动联动。

> Shannon 是私有 repo，statusline 是独立公开 npm 包。两者通过这条 NDJSON 协议解耦，互不依赖对方源码，任何第三方 GUI 也可以监听同一 socket 消费同一份数据。

---

## 开发 / 贡献 / 发版

- 开发指南、项目结构、代码风格、与 Shannon GUI 的端到端验证：[`CONTRIBUTING.md`](./CONTRIBUTING.md)
- 发版 SOP（semver / git tag / 手动 `npm publish`）：[`RELEASING.md`](./RELEASING.md)

Issues 和 PR 提到 [github.com/RealAlexandreAI/shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline)。

```bash
git clone https://github.com/RealAlexandreAI/shannon-statusline.git
cd shannon-statusline
bun install
bun run build         # TypeScript → dist/
bun run test:stdin    # 用示例 payload 跑通管线
```

---

## License

[MIT](./LICENSE)
