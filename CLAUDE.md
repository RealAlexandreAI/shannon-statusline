# shannon-statusline

## 概述

shannon-statusline 是一个独立 npm 包，repo 为 [RealAlexandreAI/shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline)。

**物理位置**：本 repo 位于 Shannon 主工作区 `shannon-statusline/` 目录下，作为独立子模块管理。

## 仓库架构

```
Shannon 工作区 (RealAlexandreAI/Shannon)
└── shannon-statusline/          ← 独立 npm 包，物理存放位置
    ├── .git/                    ← 独立 git repo（不是 symlink）
    ├── origin                   → RealAlexandreAI/Shannon.git（父库）
    └── statusline-public        → RealAlexandreAI/shannon-statusline.git（正确）
```

**注意**：shannon-statusline 的 `.git` 是完整的独立仓库，有自己的 remote history。但因为物理路径在 Shannon 工作区内，git hooks 会从父库继承配置。

## git remote 说明

| remote | 指向 | 用途 |
|--------|------|------|
| `origin` | Shannon 父库 | 不要使用 |
| `statusline-public` | shannon-statusline 独立包 | **正确 push 目标** |

## 日常开发

### 首次 clone 后设置

```bash
cd shannon-statusline
git remote -v
# 确认 push 目标为 statusline-public

# origin 指向父库，推送会被父库 pre-push hook 拦截（全项目 typecheck）
# 确保每次 push 用 statusline-public remote
```

### 推送流程

```bash
git add <files>
git commit -m "your message"

# 正确方式 — 推送到独立包仓库
git push statusline-public <branch>

# 错误方式 — 会触发父库 hooks，报父库 typecheck 错误
git push origin <branch>
```

### pre-push hook 问题

shannon-statusline 的 hooks 配置在父库 `.git/hooks/` 下（通过 git repo 嵌套继承）。执行 `git push` 时：

1. 无论推送到哪个 remote，hook 都会运行
2. `pre-push` 跑了 `bun run typecheck`，检查整个 Shannon 工作区
3. 父库若有 TS 错误，push 会被拦截

**解法**：使用 `--no-verify` 绕过 hook（hook 检查的是父库代码，与本包无关）

```bash
git push statusline-public <branch> --no-verify
```

长期解决方案：shannon-statusline 应该有自己的 `.git/hooks/` 或父库修复 typecheck。

## 部署

```bash
# 构建
bun run build

# 发布（npm publish 需要手动执行，不要自动触发）
npm publish
```

## 相关文件

- `src/index.ts` — 入口，stdin 解析 → 并行数据收集 → render + bridge
- `src/render.ts` — 赛博朋克 ANSI HUD 渲染（7 行输出）
- `src/bridge.ts` — 写入 JSON Bridge 文件供 Shannon GUI 读取
- `src/transcript.ts` — JSONL transcript 解析（工具/Agent/Todo/文件活动）
- `src/git.ts` — Git 状态检测（branch/dirty/ahead/behind/file stats）
- `src/config-counter.ts` — 配置文件计数（CLAUDE.md/rules/MCP/hooks）
- `src/stdin.ts` — stdin JSON payload 解析与工具函数
- `src/types.ts` — 共享 TypeScript 类型定义
- `shannon-statusline.png` — README 展示用截图
