---
name: git-save
description: 把当前改动提交并 push 到远程仓库。提交前先校验门禁（.claude/gates/.tester-pass 与 .qe-pass 两个通过标记 + 内容指纹一致），通过才执行 git add / commit / push。规范 commit（conventional），处理未配 remote、非 main 分支、无 upstream 等本项目常见状况。
---

# git-save：门禁校验 + 提交并推送

## 何时用

- 被 `gitcommit-agent` 调用（它已跑完 tester + quality-engineer 门禁、落好标记），或用户明确要求提交
- 用户说"保存下代码"、"推到远程"、"push 一下"、"commit + push"（但主代理应先派 `gitcommit-agent`，见项目记忆；直接命中本 skill 时，本 skill 会自己把关）

## 核心：门禁校验（第 0.5 步，先于一切 git 操作）

**提交前必须先通过门禁**：`tester` 与 `quality-engineer` 两个 agent 各落一个通过标记（`.claude/gates/.tester-pass`、`.claude/gates/.qe-pass`），且标记里的**内容指纹**与本次将被提交的内容一致。缺标记 / 指纹不符 → **拒绝提交**。

```bash
cd /Users/xiaowei/test/charge
TG=".claude/gates"
T="$TG/.tester-pass"; Q="$TG/.qe-pass"

# 1) 两个标记都得在
[ -f "$T" ] || { echo "✗ 门禁：缺 $T（单测未过或未跑 tester）"; exit 1; }
[ -f "$Q" ] || { echo "✗ 门禁：缺 $Q（质量检查未过或未跑 quality-engineer）"; exit 1; }

# 2) 读各标记的 treeFingerprint
tfp=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$T','utf8')).treeFingerprint||'')")
qfp=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$Q','utf8')).treeFingerprint||'')")
[ -n "$tfp" ] || { echo "✗ 门禁：$T 缺 treeFingerprint"; exit 1; }
[ -n "$qfp" ] || { echo "✗ 门禁：$Q 缺 treeFingerprint"; exit 1; }

# 3) 重算"本次将被提交内容"的指纹，三者须一致
git add -A
cur=$(git write-tree)
if [ "$cur" != "$tfp" ] || [ "$cur" != "$qfp" ]; then
  echo "✗ 门禁：内容指纹不匹配（cur=$cur / tester=$tfp / qe=$qfp）"
  echo "  说明 agent 跑完后工作区又变了 → 请重跑 gitcommit-agent（它会重新并行跑两个 agent 刷新标记）"
  exit 1
fi
echo "✓ 门禁通过：双标记 + 指纹一致，可提交"
```

任一 `exit 1` 就**停止，不做后面任何 git add/commit/push**，把门禁失败原因报给用户。

> **逃生门**（仅用户明确要跳过时）：设 `SKIP_GATE=1` 跳过本校验；或直接 `git commit --no-verify`。默认不用。

## 步骤

### 0. 看现状
```bash
git status --short
git rev-parse --abbrev-ref HEAD      # 老 git 兼容，别用 --show-current
git remote -v
git log --oneline -3
```

### 0.5. 门禁校验（见上，**必须先过**）

### 1. 确认/配置远程（当前未配时必做）
```bash
git remote -v
# 若为空：向用户要远程地址，然后：
git remote add origin <user 给的 URL>
```
> 远程地址**必须由用户提供**，skill 不臆造。若已有 remote 只缺跟踪，跳过。

### 2. 暂存改动
```bash
git add -A
git status --short       # 再确认一遍，避免误提交（dist/、coverage/、.claude/gates/ 已被 gitignore）
```

### 3. 提交（conventional 规范）
按改动内容写一个**准确**的 message。参考近期风格：`feat:` / `fix:` / `refactor(xxx):` / `test:` / `docs:` / `chore:`。
```bash
git commit -m "<type>: <一句话总结>"
```
> 一次提交只装逻辑相关的一组改动；混了不相关的多块先跟用户确认。

### 4. 推送（首次 / 非 main 分支要 -u 建跟踪）
```bash
BR=$(git rev-parse --abbrev-ref HEAD)
git push -u origin "$BR"
```

### 5. 清理门禁标记（提交成功后必做）
```bash
rm -f .claude/gates/.tester-pass .claude/gates/.qe-pass
```
> 标记是"提交前凭据"，提交成功即失效。若 `git push` 失败（认证/网络等），**保留标记**（下次可复用），并告知用户"提交未完成，标记保留"。

### 6. 失败排查
| 现象 | 处理 |
|---|---|
| 门禁校验 `exit 1`（缺标记/指纹不符） | 回到 `gitcommit-agent` 重跑两个 agent 刷新标记；或用户明确要跳过才走逃生门 |
| `no remote named origin` | 第 1 步 `git remote add` |
| 认证失败 / `could not read Username` | 确认有写权限；SSH 配 key，HTTPS 用 Personal Access Token |
| 非快进 `rejected ... non-fast-forward` | `git pull --rebase origin "$BR"` 再 push；**绝不** `--force`（除非用户明确要且是个人分支） |
| push 到受保护 main | 走 PR 而非直推；本 skill 默认推特性分支 |

## 边界与上报

- **门禁没过不提交**。除用户明确点头用逃生门外，`exit 1` 就停。
- **绝不** 擅自 `git push --force`、`reset --hard`、改 remote 地址、改 user 配置。
- 远程地址 / 目标分支不确定时**问用户**，不猜。
- 提交信息**如实**描述改动。

## 与其他机制的分工

| 谁 | 干什么 |
|---|---|
| `gitcommit-agent` | 提交入口：并行跑 tester + quality-engineer（软门禁），落标记后调本 skill |
| `tester` / `quality-engineer` | 被 gitcommit-agent 并行派，各落 `.claude/gates/` 下通过标记 |
| **`git-save`（本）** | **门禁复核（双标记+指纹）→ git add / commit / push → 清标记** |
| 不再有 git hook | 门禁下沉到本 skill（按用户要求），不依赖 `.git/hooks` |
