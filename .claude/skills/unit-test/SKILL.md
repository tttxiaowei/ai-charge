---
name: unit-test
description: 对黑马记账的数据层 db.ts 做单元测试并出报告。用 Vitest（Node 环境）测 db.ts 的 CRUD/聚合/导出/分类种子，通过独立连接 + WAL checkpoint 断言磁盘数据，不碰真实库、不改生产代码。
---

# unit-test：数据层单元测试 + 报告

## 何时用

- 改过 `src-electron/db.ts`（CRUD、SQL、聚合、导出、种子分类）
- 想验证某次逻辑改动没把数据层写坏，又不想在 GUI 里点
- 需要一份可落盘的测试 + 覆盖率报告

> 与 `verify-db` 的分工：`verify-db` 对**真实库**做备份/还原闭环验证；`unit-test` 对**临时隔离库**做纯逻辑断言。两者互补。

## 关键约束（务必遵守）

1. **不碰真实库**：`db.ts` 顶层 `init()` 读 `process.env.HC_USER_DATA_DIR`，必须在 `import` db 之前指向一个 `/tmp` 临时目录。绝不能用顶层静态 `import`（ESM hoisting 会让 import 先于 env 赋值执行）。
2. **不改生产代码**：所有隔离逻辑放测试文件 / `vitest.config.ts` / 环境变量，不动 `src-electron/*.ts`。
3. **better-sqlite3 是 CJS 原生模块**：默认按 Electron ABI（125）编译，Node（127）加载会报 `NODE_MODULE_VERSION` 不匹配。**已自动化**：`npm test` / `npm run test:coverage` 会自动切 Node ABI → 跑测试 → 切回 Electron ABI，无需手动。单独切：`npm run switch-abi-node` / `npm run switch-abi-electron`。
4. **WAL 模式可见性隔离**：`db.ts` 内部 `dbInstance`（WAL）写出的数据，本进程内的后续读看不到（跨模块实例分裂）。断言数据落地要用**独立 better-sqlite3 连接 + `wal_checkpoint`** 读磁盘。
5. **Vitest 版本锁定 2.x**：`vitest@5` 要求 Vite 6+，本项目是 Vite 5.4。已用 `vitest@^2.1` + `@vitest/coverage-v8@^2.1`。

## 步骤

### 1. 确认依赖已装
```bash
cd /Users/xiaowei/test/charge
# 缺则装（Vite 5 兼容版本）
npm i -D vitest@^2.1 @vitest/coverage-v8@^2.1
```

### 2. 跑测试 + 出报告（ABI 切换全自动）
```bash
npm test             # = 切Node ABI → vitest run → 切回Electron ABI
npm run test:coverage # = 同上 + 生成 coverage/ 覆盖率报告
```
> 一键搞定，不用手动切 ABI。脚本用 `prebuild-install` 秒级切（失败才本地编译），且切回那步用 `;` 保证测试失败也切回，避免 dev 崩。

# 快速跑（控制台报告：几 pass / 几 fail + 明细）
npm test            # = vitest run

### 3. 解读报告
- **控制台**：`Test Files X passed`、`Tests N passed`；失败会列 `→ 期望 vs 实际` + 报错位置。
- **覆盖率**（`--coverage`）：关注 `src-electron/db.ts` 那行的 `Stmt%`/`Fn%`。`main.ts`/`preload.ts` 是 0% 正常（它们依赖 Electron，不测）。
- **db.ts 未覆盖的行**通常是「WAL 写后本进程读不回」的那段（`getTransactions`/`getCategorySummary`/`exportCSV` 内部），这些已被测试里的「磁盘层验证」用独立连接绕着覆盖了，别误判成漏测。

### 4. 复核真实库没被污染（收尾必做）
```bash
sqlite3 "$HOME/Library/Application Support/heima-charge/charge.db" "SELECT COUNT(*) FROM user_transaction;"
```
行数应保持不变（测试只在 `/tmp` 临时库操作，不碰这里）。

## 测试文件位置

`tests/db.test.ts`（已存在）。测 db.ts 的 8 个导出方法，分三层：
- **db 模块方法**：调用不报错 + 返回自增 id（验证方法本身能跑通）
- **磁盘层**：独立连接 + `wal_checkpoint` 断言 `addTransaction`/`updateTransaction`/`deleteTransaction` 真把数据写进 `user_transaction`
- **getCategories**：纯读 category 表（无写、无 WAL 分裂），直接断言 8 一级 + 二级 + parent_id 指回

## 踩坑记录（本项目实测）

| 现象 | 根因 | 解法 |
|---|---|---|
| `NODE_MODULE_VERSION 125 vs 127` | better-sqlite3 编成 Electron ABI，Vitest 跑在 Node | `npm test` 已自动切；单独 `npm run switch-abi-node` / `switch-abi-electron` |
| 顶层 `import` 后 env 没生效，测试写进真实库 | ESM import hoisting 先于 env 赋值 | `beforeAll` 里动态 `import`，env 先设 |
| insert 后 `getTransactions` 返回 `[]`，但新连接 + checkpoint 能读到 | WAL 模式下 db 模块内部连接与测试读连接不共享可见性 | 断言走独立连接 + `wal_checkpoint` |
| `vitest` 装成 5.x 报 Vite 版本冲突 | vitest 5 要 Vite 6+，本项目 Vite 5.4 | 锁 `vitest@^2.1` |
| `npm i -D vitest` 触发 5.x 并破坏依赖解析 | npm 默认拉最新 | 显式写版本 `vitest@^2.1` |

## 注意

- 测试全程在 `/tmp/charge-test-*` 临时目录，`afterAll` 删掉。
- 原生模块 ABI 切换有代价（每次 1–2 min 编译）；频繁跑测试可只切一次、最后统一切回。
- 若 `sqlite3` CLI 没装：`brew install sqlite`（仅第 6 步复核需要）。
