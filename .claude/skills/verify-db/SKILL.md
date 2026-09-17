---
name: verify-db
description: 验证黑马记账 SQLite 数据库改动（表结构/SQL/迁移）——备份 charge.db，用与 db.ts 代码同款的 SQL 跑一遍增/改/查/删/聚合/导出的闭环，再还原库，确认新逻辑真能命中而不在真实库留脏数据。改完 db.ts、建表语句、迁移脚本后用。
---

# verify-db：数据库改动闭环验证

对 `charge.db` 做"备份 → 跑代码同款 SQL → 还原"的闭环验证。核心原则：**验证的是运行中 app 实际使用的那张表/那条 SQL，但绝不把测试数据留在真实库里**。

## 何时用

- 改过 `src-electron/db.ts`（建表、增删改查 SQL、聚合、导出）
- 做了表迁移 / 改表名 / 改 schema
- 想确认某条 SQL 在真实数据上到底跑不跑得通，但不想在 GUI 里点来点去

## 关键约束（务必遵守）

1. **DB 路径**：`$HOME/Library/Application Support/heima-charge/charge.db`（开发模式 app 名 `heima-charge`；打包后为 `黑马记账`）。先 `ls` 确认它存在；不存在则说明还没跑过 app，提示用户先启动一次。
2. **WAL 模式**：库是 `journal_mode=WAL`。备份时用 `sqlite3 charge.db ".backup /tmp/xxx"`（安全），**不要**直接 `cp` 主库文件再改——WAL 里可能有未 checkpoint 的数据。还原也用 `.backup` 反向写回，或停掉正在写库的进程再操作。
3. **用代码同款 SQL**：验证前先 Read `src-electron/db.ts`，把要测的那条 SQL **原样**拷出来（JOIN、`substr` 月份过滤、列名 `amount_cents` 等都要一致）。不要凭记忆写一条"差不多"的 SQL——那样测不到真实逻辑。
4. **事务包裹 + 自动还原**：所有写操作包在 BEGIN/COMMIT 里做，验证完立刻还原备份。任何一步失败也要先还原，别把测试行留在库中。
5. **原生模块 ABI 陷阱**：别用 `node -e "require('better-sqlite3')"` 直连（Electron ABI ≠ Node ABI，会报 `NODE_MODULE_VERSION` 不匹配）。验证一律走 `sqlite3` CLI 或 Electron 本身。

## 步骤

1. **读取要验证的 SQL 来源**
   ```
   Read src-electron/db.ts
   ```
   找到对应函数（`addTransaction`/`updateTransaction`/`getTransactions`/`getCategorySummary`/`exportCSV`...），把它的 SQL 逐字记下。

2. **备份（用 .backup，WAL 安全）**
   ```bash
   DIR="$HOME/Library/Application Support/heima-charge"
   DB="$DIR/charge.db"
   BAK="/tmp/charge.db.bak.$$"
   sqlite3 "$DB" ".backup '$BAK'"
   echo "已备份到 $BAK"; ls -l "$BAK"
   ```

3. **闭环测试：插一条 → 改它 → 查（带 JOIN）→ 删掉，全程用代码同款 SQL**
   ```bash
   DB="$HOME/Library/Application Support/heima-charge/charge.db"

   # 插（SQL 同 db.ts addTransaction）
   sqlite3 "$DB" "INSERT INTO user_transaction (amount_cents, category_id, occur_time, note) VALUES (1234, 3, '2026-09-16 14:00', 'verify-db-test');"

   NEWID=$(sqlite3 "$DB" "SELECT MAX(id) FROM user_transaction;")
   echo "新行 id=$NEWID"

   # 改（SQL 同 updateTransaction）
   sqlite3 "$DB" "UPDATE user_transaction SET amount_cents=9999, note='改过' WHERE id=$NEWID;"

   # 查（SQL 同 getTransactions，带两级 JOIN，验证聚合/分类关联）
   echo "带 JOIN 查询结果："
   sqlite3 "$DB" "SELECT t.id, p.name||'/'||c.name, (t.amount_cents/100.0) FROM user_transaction t JOIN category c ON c.id=t.category_id JOIN category p ON p.id=c.parent_id WHERE t.id=$NEWID;"

   # 删（SQL 同 deleteTransaction）
   sqlite3 "$DB" "DELETE FROM user_transaction WHERE id=$NEWID;"
   echo "删除后行数: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM user_transaction;')"
   ```

   按你这次实际改的函数增删对应步骤——比如只改了 `getCategorySummary`，就重点跑那条聚合 SQL；改了 `exportCSV`，就跑一次导出确认 BOM/列头/转义。

4. **还原（无条件执行，无论测试成功与否）**
   ```bash
   DB="$HOME/Library/Application Support/heima-charge/charge.db"
   BAK="/tmp/charge.db.bak.$$"
   sqlite3 "$DB" ".restore '$BAK'"
   rm -f "$BAK"
   echo "=== 还原后最终状态 ==="
   sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
   sqlite3 "$DB" "SELECT id, amount_cents, occur_time FROM user_transaction;"
   ```
   对比还原前后的表清单 + 数据，确认测试行已清除、库回到原样。

5. **报告结论**：用一张表说清每一步的输入/期望/实际，标注哪些通过、哪些失败。失败时给出"具体哪条 SQL 在哪一步、报什么错"，方便定位。

## 注意

- 若 `sqlite3` CLI 没装：`brew install sqlite` 或提示用户。
- 还原那步**必须做**，这是"不在真实库留脏数据"的保证。宁可少测一步，也别跳过还原。
- 如果 app 正在运行（dev 任务在跑），WAL 下读写不会冲突，但为稳妥建议验证时确认没有并发的写操作，或先停 dev 再验证、验证完重启。
