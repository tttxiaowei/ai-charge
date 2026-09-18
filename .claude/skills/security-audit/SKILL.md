---
name: security-audit
description: 对黑马记账做安全审查。检查代码/配置中的敏感信息泄露、SQL 注入、CSV 公式注入、IPC 信任边界、危险 API 调用等。产出分级风险报告。只读不改代码。
---

# security-audit：安全隐患审查

## 何时用

- 用户说"查下安全"、"有没有泄密/注入风险"、"代码安全审查"、"上线前过一遍安全"
- 改了数据层 / IPC / 导出逻辑 / 依赖后，想确认没引入新风险

## 项目特性（决定审计重点）

黑马记账是**本地 Electron + SQLite 记账工具**：无服务端、无网络请求、无用户登录。所以：
- **不存在的风险**（别浪费时间找）：跨站脚本（XSS 对纯本地 app 影响低）、服务端注入、API 泄露、鉴权漏洞
- **真正的风险面**（重点查）：
  1. 敏感信息硬编码进代码/配置
  2. SQL 拼接注入（本库用参数化，但要看有没有被改坏）
  3. **CSV 公式注入**（导出字段直接拼用户输入）
  4. **IPC 信任边界**（`ipcMain.handle` 收的参数校验）
  5. 危险 API（`execSync`/`child_process`/`eval`/`fs.write` 到不可控路径）
  6. `nodeIntegration`/`contextIsolation` 被改坏（这是本 app 的关键防线）

## 执行步骤

### 1. 敏感信息扫描
```bash
cd /Users/xiaowei/test/charge
# 凭证/密钥/连接串（排除 node_modules）
grep -rniE "api[_-]?key|secret|passw(or)?d|token|private[_-]?key|AKIA[0-9]{4}|bearer\s+[a-z0-9]|mongodb://|mysql://|redis://" \
  src src-electron tests scripts *.json 2>/dev/null | grep -v node_modules
# .env / 密钥文件
ls -A | grep -iE ".*env.*|.*key|credential" || echo "(无 .env/密钥文件)"
```
判定：
- 命中**真实凭证** → 🔴 立即上报（这工具本不该有凭证，出现就是误提交）
- 命中**占位/示例**（`changeme`、`YOUR_KEY`）→ 🟡 提示别当真的
- 测试里的假数据（`amount: '12.5'` 之类）→ 不算

### 2. SQL 注入核查（本库应全参数化）
```bash
grep -rnE "\.prepare\(" src-electron/db.ts
```
逐条看：
- **危险**：SQL 字符串里有 `${...}` 直接拼变量进 `prepare()` → 🔴 SQL 注入
- **安全**：用 `?` 占位 + 参数数组（如 `prepare('... WHERE id=?').all(id)`）→ ✓
- **特例**：`db.ts` 里 `getTransactions`/`getCategorySummary` 的**表名/列名是写死的字符串拼接**（`sql += ' WHERE ' + where.join(...)`），但 `where` 里的条件是**固定模板**（`substr(t.occur_time,1,7)=?`），参数走 `?` —— 这是**安全的拼接**（拼的是 SQL 结构不是用户值）。要确认 `month`/`categoryId` 是走 `params` 而非直接进 SQL 文本。

### 3. CSV 公式注入（本项目已知风险点）
```bash
grep -n "csv +=\|exportCSV\|note" src-electron/db.ts
```
`exportCSV` 把 `note` 直接拼进 CSV 单元格。**Excel/Google Sheets 打开 CSV 时，以 `=`、`+`、`-`、`@`、`\t`、`\r` 开头的单元格会被当公式执行**。
- 现在 `db.ts` 只做了双引号转义（`replace(/"/g,'""')`），**没做公式注入防护** → 🟡
- 建议：单元格值以危险前缀开头时，前置一个 `'` 或包单引号（标准做法：`if (/^[=+\-@;\t\r]/.test(v)) v = "'" + v`）
- 报告时给出这段具体建议，但不擅自改（本 skill 只读）

### 4. IPC 信任边界
```bash
grep -nE "ipcMain\.handle|ipcRenderer\.invoke" src-electron/main.ts src-electron/preload.ts
```
逐个 `handler` 看入参校验：
- `addTransaction({ amount, ... })`：`amount` 走 `Math.round(parseFloat(String(amount))*100)` → **无范围/类型校验**，传 `"abc"`/`undefined`/`1e99` 会产生 `NaN` 或荒谬分额 → 🟡 逻辑漏洞（建议：校验 `Number.isFinite` + 上限）
- `categoryId`：无"是否存在的分类"校验，传任意整数能建一条指向不存在分类的记录 → 🟡（数据完整性）
- 这些是**逻辑/数据完整性**问题，非注入；按 🟡 报，注明建议
- **关键防线**：确认 `main.ts` 里 `contextIsolation: true` 且 `nodeIntegration: false` → 若被改成 `false`/`true` → 🔴（渲染进程可直碰 Node，是重大隐患）

### 5. 危险 API 与文件写入
```bash
grep -rnE "eval\(|new Function|child_process|execSync|spawnSync|fs\.write|writeFileSync|unlinkSync|rmSync" src src-electron
```
- `db.ts` 的 `fs.mkdirSync/...writeFile` 只写到 `HC_USER_DATA_DIR/charge.db`（受控路径）→ ✓ 可接受
- 出现 `execSync`/`eval`/`new Function` → 🔴 逐个看
- 写文件路径**可由用户输入拼出来**的 → 🔴 路径穿越

### 6. 依赖与配置（轻扫）
- `package.json`：`dependencies` 里的包是否有已知高危 CVE（用户要求时才联网查 `npm audit`；默认不查，避免拖时间）
- `tsconfig` / `vite.config`：无明显安全问题
- `electron-builder` 未配签名/公证 → 记录为"未公证，分发需 Gatekeeper 绕过"（非漏洞，是发布注意项）

### 7. 汇总报告

| 段 | 内容 |
|---|---|
| 总评 | 整体安全成熟度 + 主要短板 |
| 发现清单 | 每条：位置（`文件:行`）· 严重度 · 描述 · 建议 |
| 分级 | 🔴 高危（凭证泄露/注入/防线被拆）· 🟡 中危（数据完整性/CSV 公式/缺校验）· 🟢 提示（未公证等） |

**预期本报告对本项目的典型结果**（可作对照）：
- 🔴：通常无（前提是第 1、5 步没扫到凭证/危险 API）
- 🟡：CSV 公式注入（`db.ts` exportCSV）、IPC `amount`/`categoryId` 缺校验
- 🟢：未签名/公证

## 边界与上报

- **只读不改**。发现后出报告 + 具体建议，修复由用户/后续操作执行；用户点头"顺手修"才动手。
- 命中**真实凭证**（非占位）：🔴 立即报，并建议"从代码移除 + 若已 push 进 git 需轮换该凭证"（进 git 历史删不掉，只能失效化）。
- 拿不准某命中是不是误报（如测试里的假密钥），标注"疑似误报"而不武断升级。
- 严重度判断保守：宁可 🟡 提示，不轻易 🔴；但凭证泄露 / `contextIsolation` 被拆 / SQL 直接拼用户值 这三类**必须** 🔴。

## 与其他 skill 的分工

| skill | 关注 |
|---|---|
| `security-audit`（本） | 安全（泄密/注入/防线/数据完整性） |
| `verify-db` | 数据层功能闭环 |
| `unit-test` | 逻辑正确性 |
| `comments-check` | 注释可读性 |
