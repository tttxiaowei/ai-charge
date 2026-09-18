---
name: comments-check
description: 对黑马记账项目做代码注释审查。检查注释是否缺失、注释与代码是否一致、注释是否小白视角可理解。按维度打分并产出可落盘的审查报告。只读不改代码。
---

# comments-check：代码注释审查

## 何时用

- 用户说"查下注释"、"代码注释够不够"、"注释和代码对得上吗"、"写注释写清楚没"
- 代码 review 环节想专项看注释质量
- 新功能合入前把注释作为质量门槛之一

## 审查对象（默认范围）

按优先级排序，用户没指定时全查：

1. `src-electron/db.ts` —— 数据层，SQL 和表结构最容易与注释漂移
2. `src-electron/main.ts` / `preload.ts` —— 主进程，IPC 通道名与 `window.chargeDB` 的类型声明需对齐
3. `src/views/*.vue` 与 `src/main.ts` / `router.ts` —— 前端逻辑
4. `tests/db.test.ts` —— 测试用例里"为什么这么断言"的注释

> 排除：`dist/`、`dist-electron/`、`node_modules/`、`release/`（构建产物与依赖）；`CLAUDE.md`（产品文档，不在本 skill 检查范围）。

## 三个维度的检查标准

### 维度 1：注释缺失（Completeness）

**规则**：
- 每一个**导出函数 / 顶层函数**上方至少一行 JSDoc/注释，说明"做什么"
- 每一处**核心逻辑块**（SQL 拼接、条件分支、循环、聚合、状态变更）至少一行行内注释，说明"为什么这么写"
- 每一个**非显然的命名/常量**（如魔法数字、枚举、表名、IPC 通道名）至少一行注释，说明"它是什么"
- 文件顶部可加一行"本文件职责"注释（可选但推荐）

**反例（应判缺失）**：
```ts
// 没有说明"为什么用 substr 前缀"
const where = [];
if (month) where.push("substr(t.occur_time, 1, 7) = ?");
if (categoryId) where.push("t.category_id = ?");
```

**判定**：按文件统计"应注释项 / 已注释项"，缺失比例 > 20% 标记 `🔴`，10–20% 标 `🟡`，<10% 标 `🟢`。

### 维度 2：注释与代码匹配（Consistency）

**规则**：注释描述的行为必须与代码实际行为一致。重点查：
- 注释里的**函数名/参数名**是否和实际一致（重命名后注释没跟上）
- 注释里的**表名/字段名**是否和 SQL 里一致（如 `transaction` vs `user_transaction`）
- 注释说的**返回值类型/默认值/边界**是否真的成立
- 注释提到的**副作用**（建表、种子、WAL、env 依赖）是否真的发生

**反例（应判不匹配）**：
```ts
// 注释写"返回 8 个一级分类"，但代码 filter 后按 sort 排序且 children 动态挂
function getCategories() { ... }
```
若 `SEED_CATEGORIES` 实际是 8 组但 `sort` 字段默认 0 导致排序不稳定，注释"按 sort 升序"就没写清"tie-break 是什么"。

**判定**：逐条 diff，发现"注释说 X、代码做 Y"的，列出不匹配项，标 `🔴`（语义级）或 `🟡`（细节级）。

### 维度 3：小白视角（Readability for a new reader）

**规则**：假设读者**第一次看这个项目、没读过 CLAUDE.md、没看过 git log**，注释能否让他：
- 不看代码就知道"这个函数在做什么、为什么需要它"
- 不查文档就知道"这个常量/魔法数字是什么"
- 不读实现就知道"这个 SQL 在过滤什么"

**具体检查点**：
- 是否解释了**领域概念**（如 `amount_cents` 是"以分为单位的整数，避免浮点误差"——小白需要知道为什么用分）
- 是否解释了**架构选择**（如"顶层 init() 读 `HC_USER_DATA_DIR`，所以 main.ts 必须延迟 require"）
- 是否避免了**未解释的缩写/内部黑话**（`WAL`、`ABI`、`IPC` 第一次出现时要带一句解释）
- 注释是否**以"为什么"为主而非复述"做了什么"**（"调用 update 方法"这种注释是废话，应删）

**判定**：每个文件给 0–5 分（5=小白友好，0=只有代码能自解释），<3 标 `🔴`。

## 执行步骤

1. **拉取审查对象**：
   ```
   Read src-electron/db.ts
   Read src-electron/main.ts
   Read src-electron/preload.ts
   Read src/main.ts
   Read src/router.ts
   Read src/views/QuickRecordView.vue
   Read src/views/RecordsView.vue
   Read src/views/StatsView.vue
   Read src/views/SettingsView.vue
   Read tests/db.test.ts
   ```
   （用户指定范围时只读指定的。）

2. **逐文件、逐维度打钩**：用 Grep/Read 抽关键段落，按上面三套标准标注：
   - 维度 1：缺哪条注释（精确到行号）
   - 维度 2：哪行注释与哪行代码不匹配（引用两边原文）
   - 维度 3：哪段注释对小白是黑话 / 哪段在复述代码

3. **产出报告**（Markdown，存到 `docs/comments-check-report.md`，不提交 git；或按用户要求直接打印在对话里）：

   ```markdown
   # 注释审查报告（日期）

   ## 总览
   | 文件 | 缺失 | 不匹配 | 小白分 | 总体 |
   |---|---|---|---|---|
   | src-electron/db.ts | 3 | 2 | 4 | 🟡 |
   | ... | | | | |

   ## 详细发现

   ### 1. 缺失
   - `db.ts:159` `getTransactions` 内 `substr(...,1,7)` 未注释"为什么截取前 7 位是月份匹配"
   - ...

   ### 2. 不匹配
   - `main.ts:14` 注释说 "app ready 后再加载"，但代码里 `require('./db.js')` 在 `whenReady().then` 内部——匹配 ✓（举例应反其意）
   - ...

   ### 3. 小白视角扣分点
   - `db.ts:53` `WAL` 未解释（建议："WAL = Write-Ahead Logging，SQLite 的一种日志模式，写操作先进日志再落盘"）
   - ...

   ## 修复建议（按优先级）
   1. P0：`db.ts` 表名注释与 `CLAUDE.md` 第 5 节同步（`user_transaction` 不是 `transaction`）
   2. P1：每个 SQL 模板字符串上方加一行"过滤语义"注释
   3. P2：`WAL` / `ABI` / `IPC` 首次出现处加括注
   ```

4. **不改代码**。skill 只做"发现 + 建议"，修复由用户/后续 agent 执行。若用户要求"顺手修"，再按建议逐项 Edit。

## 边界与上报

- 若发现 `CLAUDE.md` 里写的内容与代码注释互相矛盾（如表名、构建命令），**单独列一节"文档漂移"**，这是最高优先级。
- 若代码里有 `@ts-ignore` / `// eslint-disable` 等"抑制注释"，也检查其理由是否写清楚（只写 `// @ts-ignore` 而不说为什么，判维度 3 失分）。
- 注释里的**中文/英文混排**不做强制，但建议同一文件内风格一致（本项目以中文为主）。

## 输出约定

- 报告默认打印在对话里（方便立即看）；用户要求"落盘"时写到 `docs/comments-check-report.md`（`docs/` 已 gitignore 可选项，默认不 gitignore，提交与否由用户定）。
- 严重度用 emoji：🔴 必改 / 🟡 建议 / 🟢 可选。
- 末尾给一句话总结："整体注释成熟度 X/5，主要短板是……"。

## 与 verify-db / unit-test 的分工

| skill | 关注 |
|---|---|
| `verify-db` | 数据层**功能**闭环（SQL 跑得通、库没污染） |
| `unit-test` | 数据层**逻辑**断言（CRUD/聚合/导出正确） |
| `comments-check` | 代码**可读性**（注释在不在、对不对、小白能不能看懂） |

三者互补：功能对不对是前两个管，注释好不好是这个管。
