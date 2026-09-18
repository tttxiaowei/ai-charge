import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

let dbInstance: DatabaseType | null = null;

// 解析数据库文件位置：优先使用 Electron app.getPath('userData')（若已注入），
// 否则回退到各平台的等效用户数据目录，保证在纯 Node 环境下也能测试。
function resolveUserDataDir(): string {
  if (typeof process.env.HC_USER_DATA_DIR === 'string' && process.env.HC_USER_DATA_DIR) {
    return process.env.HC_USER_DATA_DIR;
  }
  const platformDir =
    process.platform === 'win32'
      ? process.env.APPDATA
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config');
  return path.join(platformDir as string, '黑马记账');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// 8 个一级大类 + 二级小类（第一版内置固定分类）
const SEED_CATEGORIES = [
  { level: 1, name: '餐饮美食', children: ['早餐', '午餐', '晚餐', '下午茶/咖啡', '零食饮料', '聚餐'] },
  { level: 1, name: '交通出行', children: ['公交地铁', '打车网约车', '加油/充电', '骑行共享单车', '停车费', '其他交通'] },
  { level: 1, name: '购物消费', children: ['服饰鞋包', '数码电子', '日用百货', '美妆护肤', '食品饮料采购', '礼物'] },
  { level: 1, name: '居家生活', children: ['房租/房贷', '水电燃气', '物业维修', '家居用品', '宠物开销'] },
  { level: 1, name: '休闲娱乐', children: ['电影演出', '游戏氪金', 'KTV/酒吧', '旅游度假', '健身运动', '订阅会员'] },
  { level: 1, name: '医疗健康', children: ['药品', '门诊挂号', '检查化验', '体检', '美容理疗'] },
  { level: 1, name: '教育学习', children: ['课程培训', '书籍资料', '考试报名费', '自习/会员'] },
  { level: 1, name: '其他支出', children: ['人情往来', '缴费办理', '意外支出', '分类不明'] },
];

interface CategoryRow {
  id: number;
  level: number;
  parent_id: number | null;
  name: string;
  sort: number;
  children?: CategoryRow[];
}

/**
 * 初始化数据库：解析 userData 目录、打开/建库、开 WAL、建表、首次插入种子分类。
 * 由 main.ts 在 app.whenReady() 后延迟加载本模块时触发（模块顶层调用一次）。
 */
function init(): void {
  const dbPath = path.join(resolveUserDataDir(), 'charge.db');
  ensureDir(path.dirname(dbPath));
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      icon TEXT,
      sort INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES category(id)
    );
    CREATE TABLE IF NOT EXISTS user_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_cents INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      occur_time TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES category(id)
    );
  `);

  // 首次建库时插入种子分类数据
  const count = dbInstance.prepare('SELECT COUNT(*) AS c FROM category').get() as { c: number };
  if (count.c === 0) {
    const insertCat = dbInstance.prepare(
      'INSERT INTO category (level, parent_id, name, sort) VALUES (?, ?, ?, ?)'
    );
    const tx = dbInstance.transaction(() => {
      for (const group of SEED_CATEGORIES) {
        const info = insertCat.run(group.level, null, group.name, 0);
        const parentId = info.lastInsertRowid;
        group.children.forEach((child, i) => {
          insertCat.run(2, parentId, child, i);
        });
      }
    });
    tx();
  }
}

/** 返回 8 个一级分类（按 sort 升序），每个一级下挂其二级 children。纯读，无写操作。 */
function getCategories(): CategoryRow[] {
  const rows = dbInstance!.prepare('SELECT id, level, parent_id, name, sort FROM category').all() as unknown as CategoryRow[];
  const topLevel = rows.filter((r) => r.level === 1).sort((a, b) => a.sort - b.sort);
  for (const item of topLevel) {
    item.children = rows.filter((r) => r.parent_id === item.id);
  }
  return topLevel;
}

export interface TransactionInput {
  /** 金额（元）。UI 端 el-input-number 只传 number；保留 string 是为 IPC 序列化保险——
   * 跨进程边界值可能退化成字符串，normalizeTransaction 用 parseFloat(String(amount)) 统一兜底。 */
  amount: number | string;
  categoryId: number;
  occurTime: string;
  note?: string;
}

// 金额上限：1 亿元 = 1e10 分（1e10 / 100 = 1e8 元）。超过视为异常入参，避免 1e99 之类把库写坏。
const MAX_AMOUNT_CENTS = 1e10;

// 入参归一化 + 校验：金额转分（抗浮点 + 限范围）、分类存在性校验。
// 校验失败抛 Error（由 IPC 层透传给渲染进程），不写库。
function normalizeTransaction({ amount, categoryId, occurTime, note }: TransactionInput): {
  amountCents: number;
  categoryId: number;
  occurTime: string;
  note: string | null;
} {
  const amountCents = Math.round(parseFloat(String(amount)) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 0 || amountCents > MAX_AMOUNT_CENTS) {
    throw new Error(`金额非法：${String(amount)}（需为 0 ~ ${MAX_AMOUNT_CENTS / 100} 元的有效数字）`);
  }
  // 分类存在性校验：防止写入指向不存在分类的悬空记录（数据完整性）
  const catExists = dbInstance!.prepare('SELECT 1 FROM category WHERE id = ?').get(categoryId);
  if (!catExists) {
    throw new Error(`分类不存在：categoryId=${categoryId}`);
  }
  return { amountCents, categoryId, occurTime, note: note || null };
}

// 校验主键 id 合法（整数且 > 0），防止 0 / 负数 / 浮点静默 no-op
function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`非法的记录 id：${id}`);
  }
}

/** 新增一笔花销，入参经 normalizeTransaction 校验（金额/分类），返回新记录自增 id。 */
function addTransaction(input: TransactionInput): number {
  const { amountCents, categoryId, occurTime, note } = normalizeTransaction(input);
  const stmt = (dbInstance as any)!.prepare(
    'INSERT INTO user_transaction (amount_cents, category_id, occur_time, note) VALUES (?, ?, ?, ?)'
  );
  // @ts-ignore @types/better-sqlite3@9.x 的 run() 参数重载与 mixed 参数不兼容
  const info = stmt.run(amountCents, categoryId, occurTime, note);
  return Number(info.lastInsertRowid);
}

/** 按 id 更新一笔花销；id 与入参均校验，目标行不存在或 id 非法时抛错。 */
function updateTransaction(id: number, input: TransactionInput): void {
  assertValidId(id);
  const { amountCents, categoryId, occurTime, note } = normalizeTransaction(input);
  const stmt = (dbInstance as any)!.prepare(
    'UPDATE user_transaction SET amount_cents=?, category_id=?, occur_time=?, note=? WHERE id=?'
  );
  // @ts-ignore 同上
  const info = stmt.run(amountCents, categoryId, occurTime, note, id);
  if (info.changes === 0) {
    throw new Error(`记录不存在：id=${id}`);
  }
}

/** 按 id 删除一笔花销；id 非法或目标行不存在时抛错。 */
function deleteTransaction(id: number): void {
  assertValidId(id);
  const info = dbInstance!.prepare('DELETE FROM user_transaction WHERE id=?').run(id);
  if (info.changes === 0) {
    throw new Error(`记录不存在：id=${id}`);
  }
}

export interface TransactionRow {
  id: number;
  amount_cents: number;
  category_id: number;
  occur_time: string;
  note: string | null;
  category_name: string;
  parent_category_name: string;
}

export interface TransactionFilter {
  month?: string;
  categoryId?: number;
}

/** 按可选的 month（YYYY-MM 前缀）/ categoryId 过滤花销，JOIN 出两级分类名，时间倒序。 */
function getTransactions({ month, categoryId }: TransactionFilter = {}): TransactionRow[] {
  let sql = `
    SELECT t.id, t.amount_cents, t.category_id, t.occur_time, t.note,
           c.name AS category_name, p.name AS parent_category_name
    FROM user_transaction t
    JOIN category c ON c.id = t.category_id
    JOIN category p ON p.id = c.parent_id
  `;
  const params: (string | number)[] = [];
  const where: string[] = [];
  if (month) {
    // occur_time 存为 'YYYY-MM-DD HH:MM'，取前 7 位即 'YYYY-MM'，与入参 month 精确匹配（前缀匹配，比 LIKE 快）
    where.push('substr(t.occur_time, 1, 7) = ?');
    params.push(month);
  }
  if (categoryId) {
    where.push('t.category_id = ?');
    params.push(categoryId);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY t.occur_time DESC, t.id DESC';
  return dbInstance!.prepare(sql).all(...params) as unknown as TransactionRow[];
}

export interface CategorySummaryRow {
  parent_id: number;
  parent_name: string;
  total_cents: number;
  count: number;
}

export interface SummaryFilter {
  month?: string;
}

/** 按一级分类聚合花销总额与笔数，可选 month（YYYY-MM 前缀）过滤。 */
function getCategorySummary({ month }: SummaryFilter = {}): CategorySummaryRow[] {
  const sql = `
    SELECT p.id AS parent_id, p.name AS parent_name,
           SUM(t.amount_cents) AS total_cents, COUNT(*) AS count
    FROM user_transaction t
    JOIN category c ON c.id = t.category_id
    JOIN category p ON p.id = c.parent_id
    ${month ? "WHERE substr(t.occur_time, 1, 7) = ?" : ''}
    GROUP BY p.id, p.name
  `;
  return dbInstance!.prepare(sql).all(...(month ? [month] : [])) as unknown as CategorySummaryRow[];
}

/** 导出全部花销为 CSV 字符串（带 UTF-8 BOM，Excel 可直接打开；含 CSV 公式注入防护）。 */
function exportCSV(): string {
  const rows = dbInstance!
    .prepare(
      `SELECT t.amount_cents, t.occur_time, t.note, c.name AS category_name, p.name AS parent_name
       FROM user_transaction t
       JOIN category c ON c.id = t.category_id
       JOIN category p ON p.id = c.parent_id`
    )
    .all() as unknown as Array<{ amount_cents: number; occur_time: string; note: string | null; category_name: string; parent_name: string }>;
  let csv = '﻿'; // UTF-8 BOM，方便 Excel 直接打开中文
  csv += '日期,一级分类,二级分类,金额(元),备注\n';
  for (const r of rows) {
    const amount = (r.amount_cents / 100).toFixed(2);
    // CSV 公式注入防护：以 = + - @ ; Tab CR 开头的值在 Excel/Sheets 会被当公式执行，
    // 先加单引号前缀（' = 转义成文本）再做双引号转义。
    let note = r.note || '';
    if (/^[=+\-@;\t\r]/.test(note)) note = "'" + note;
    note = note.replace(/"/g, '""');
    csv += `${r.occur_time},${r.parent_name},${r.category_name},${amount},"${note}"\n`;
  }
  return csv;
}

// 应用启动时初始化一次数据库
init();

export { getCategories, addTransaction, updateTransaction, deleteTransaction, getTransactions, getCategorySummary, exportCSV };
