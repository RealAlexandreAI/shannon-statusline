# Releasing

`shannon-statusline` 的发版 SOP。所有面向 npm registry 的 `npm publish` 由维护者**手动**执行，不在 CI 里自动触发。

---

## Semver 政策

| 改动类型 | 版本位 | 例 |
|----------|--------|-----|
| 渲染微调、性能改进、bug fix（无 schema 变化） | patch | `0.2.1` → `0.2.2` |
| 新增 Bridge JSON 字段、新增 stdin payload 字段、新功能（向后兼容） | minor | `0.2.1` → `0.3.0` |
| Bridge JSON 字段删除/语义变更，stdin 协议 break，下游必须改代码才能兼容 | major | `0.2.1` → `1.0.0` |

> Pre-1.0：minor bump 也可能含 break，但应在 CHANGELOG 显式说明。1.0.0 之后严格 semver。

---

## 发版流程

### 0. 准备

- `main` 分支干净（`git status` 无 uncommitted）
- 最近一次 CI 绿（GitHub Actions `CI` workflow）
- 本地用 `bun run test:stdin` 至少跑通一次

### 1. 升版本号

```bash
# patch / minor / major 三选一
npm version patch -m "chore: release v%s"
```

`npm version` 会：

- 改 `package.json` 的 `version` 字段
- 自动 `git add package.json && git commit -m "chore: release vX.Y.Z"`
- 创建 git tag `vX.Y.Z`

> 不要手改 `package.json` 然后再 commit —— 用 `npm version` 保证 commit 和 tag 一致。

### 2. 推送 commit + tag

```bash
git push origin main --follow-tags
```

GitHub Actions 的 `CI` workflow 会自动跑 typecheck + build 验证 tag commit。**不会**自动 publish。

### 3. （可选）创建 GitHub Release

```bash
gh release create vX.Y.Z \
  --title "shannon-statusline vX.Y.Z" \
  --generate-notes \
  --latest
```

或在 GitHub 网页上手动 draft，自动从 commit 历史生成 changelog。

### 4. 发布到 npm（**人工操作**）

> ⚠️ 不要让 CI 跑这一步。维护者请喊持有 npm 凭据的人执行：

```bash
# 确保已 login
npm whoami       # 应返回 npm 账号
# 若未登录：npm login

# 发布
npm publish --access public
```

`prepublishOnly` 会自动跑 `bun run build`，所以不需要手动构建。

### 5. 同步到 Shannon GUI

如果这次发版包含运行时改动（不是纯 README/docs），Shannon GUI 需要重新打包内嵌的 dist。在 Shannon 私有 repo 那边：

```bash
cd /path/to/shannon-statusline
git pull origin main         # 拉到刚发布的 tag commit
SHANNON_DIR=/path/to/Shannon bun run sync:shannon

cd /path/to/Shannon
git add src-tauri/resources/statusline-plugin/dist/
git commit -m "chore(statusline): bump bundled dist to vX.Y.Z"
git push
```

Shannon 那边的下一次 release 就会带上这版 statusline。详细 SOP 在 Shannon 私有 repo 的 `docs/statusline-integration.md`。

---

## 版本号在哪里被用到

| 位置 | 用途 |
|------|------|
| `package.json` `version` | npm registry / `shannon-statusline --version` |
| git tag `vX.Y.Z` | 标记 release commit |
| GitHub Release | 用户可见的 changelog |
| Shannon `src-tauri/resources/statusline-plugin/dist/` | 内嵌版本 —— 与 npm 版本独立演进，但 dist 内容必须来自某个真实发布过的 tag |

---

## 紧急回滚

如果发布后发现严重 bug：

1. **立即** 通过 `npm deprecate shannon-statusline@X.Y.Z "reason"` 标记 deprecated（不要 unpublish，会破坏依赖）
2. 修 bug，bump patch（X.Y.Z+1），按上述流程重新发版
3. 在 GitHub Release notes 高亮 deprecated 版本和原因
