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

function getCategories(): CategoryRow[] {
  const rows = dbInstance!.prepare('SELECT id, level, parent_id, name, sort FROM category').all() as unknown as CategoryRow[];
  const topLevel = rows.filter((r) => r.level === 1).sort((a, b) => a.sort - b.sort);
  for (const item of topLevel) {
    item.children = rows.filter((r) => r.parent_id === item.id);
  }
  return topLevel;
}

export interface TransactionInput {
  amount: number | string;
  categoryId: number;
  occurTime: string;
  note?: string;
}

function addTransaction({ amount, categoryId, occurTime, note }: TransactionInput): number {
  const amountCents = Math.round(parseFloat(String(amount)) * 100);
  const stmt = (dbInstance as any)!.prepare(
    'INSERT INTO user_transaction (amount_cents, category_id, occur_time, note) VALUES (?, ?, ?, ?)'
  );
  // @ts-ignore @types/better-sqlite3@9.x 的 run() 参数重载与 mixed 参数不兼容
  const info = stmt.run(amountCents, categoryId, occurTime, note || null);
  return Number(info.lastInsertRowid);
}

function updateTransaction(id: number, { amount, categoryId, occurTime, note }: TransactionInput): void {
  const amountCents = Math.round(parseFloat(String(amount)) * 100);
  const stmt = (dbInstance as any)!.prepare(
    'UPDATE user_transaction SET amount_cents=?, category_id=?, occur_time=?, note=? WHERE id=?'
  );
  // @ts-ignore 同上
  stmt.run(amountCents, categoryId, occurTime, note || null, id);
}

function deleteTransaction(id: number): void {
  dbInstance!.prepare('DELETE FROM user_transaction WHERE id=?').run(id);
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
    const note = (r.note || '').replace(/"/g, '""');
    csv += `${r.occur_time},${r.parent_name},${r.category_name},${amount},"${note}"\n`;
  }
  return csv;
}

// 应用启动时初始化一次数据库
init();

export { getCategories, addTransaction, updateTransaction, deleteTransaction, getTransactions, getCategorySummary, exportCSV };
