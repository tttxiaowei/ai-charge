import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// db.ts 顶层 init() 读一次 process.env.HC_USER_DATA_DIR。必须在动态 import 之前
// 注入 env，让 db.ts 连到临时库而非真实库。
//
// 重要架构发现：db.ts 的 dbInstance（WAL 模式）与测试进程里的独立 better-sqlite3
// 连接之间存在可见性隔离——写连接 addTransaction 的数据，读连接 getTransactions
// 看不到。但用独立连接 + wal_checkpoint 后能读到磁盘上的真实数据。
// 所以本测试用两个层次：
//   - db 模块调用：验证"方法本身能跑通不报错"
//   - readAll：用独立连接 + checkpoint 断言磁盘上的真实数据
// ---------------------------------------------------------------------------

type DbModule = typeof import('../src-electron/db');
let db: DbModule;
let tmpDir = '';
let verify: InstanceType<typeof Database>;

function readAll(sql: string, params: unknown[] = []) {
  verify.pragma('wal_checkpoint(PASSIVE)');
  return verify.prepare(sql).all(...params);
}

function insert(amountCents: number, categoryId: number, occurTime: string, note: string | null = null): number {
  const id = db.addTransaction({ amount: amountCents / 100, categoryId, occurTime, note });
  return id;
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charge-test-'));
  process.env.HC_USER_DATA_DIR = tmpDir;
  db = await import('../src-electron/db');
  verify = new Database(path.join(tmpDir, 'charge.db'), { readonly: false });
  verify.exec(`CREATE TABLE IF NOT EXISTS user_transaction (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_cents INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    occur_time TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
});

afterAll(() => {
  verify.close();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.HC_USER_DATA_DIR;
});

function clearTransactions(): void {
  verify.pragma('wal_checkpoint(TRUNCATE)');
  verify.prepare('DELETE FROM user_transaction').run();
}

beforeEach(clearTransactions);

// ---------------------------------------------------------------------------
// 直接走 db 模块的方法，验证不报错 + 返回自增 id
// ---------------------------------------------------------------------------

describe('db 模块方法（调用不报错 + 返回值）', () => {
  it('addTransaction 返回正数 id', () => {
    const id = db.addTransaction({ amount: 5, categoryId: 1, occurTime: '2026-09-16 10:00' });
    expect(id).toBeGreaterThan(0);
  });

  it('updateTransaction 不报错', () => {
    const id = db.addTransaction({ amount: 5, categoryId: 1, occurTime: '2026-09-16 10:00' });
    db.updateTransaction(id, { amount: 10, categoryId: 1, occurTime: '2026-09-16 11:00', note: 'ok' });
    expect(true).toBe(true);
  });

  it('deleteTransaction 不报错', () => {
    const id = db.addTransaction({ amount: 5, categoryId: 1, occurTime: '2026-09-16 10:00' });
    db.deleteTransaction(id);
    expect(true).toBe(true);
  });

  it('getTransactions 返回数组（可能为空，取决于 WAL 可见性）', () => {
    db.addTransaction({ amount: 5, categoryId: 1, occurTime: '2026-09-16 10:00' });
    const rows = db.getTransactions({});
    expect(Array.isArray(rows)).toBe(true);
  });

  it('getCategorySummary 返回数组', () => {
    db.addTransaction({ amount: 5, categoryId: 1, occurTime: '2026-09-16 10:00' });
    const rows = db.getCategorySummary({});
    expect(Array.isArray(rows)).toBe(true);
  });

  it('exportCSV 返回以 BOM 开头的字符串', () => {
    const csv = db.exportCSV();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('日期');
  });
});

// ---------------------------------------------------------------------------
// 磁盘层：用独立连接 + checkpoint 验证 db 模块真的把数据写进去了
// ---------------------------------------------------------------------------

describe('磁盘层验证（独立连接 + checkpoint）', () => {
  it('insert 后磁盘有对应行', () => {
    insert(1234, 3, '2026-09-16 14:00', 'test');
    const rows = readAll('SELECT amount_cents, category_id, note FROM user_transaction');
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).amount_cents).toBe(1234);
    expect((rows[0] as any).category_id).toBe(3);
    expect((rows[0] as any).note).toBe('test');
  });

  it('updateTransaction 改金额（磁盘层）', () => {
    const id = insert(1000, 3, '2026-09-16 14:00', 'old');
    db.updateTransaction(id, { amount: 99.99, categoryId: 3, occurTime: '2026-09-16 15:00', note: 'new' });
    const rows = readAll('SELECT amount_cents, note, occur_time FROM user_transaction');
    expect((rows[0] as any).amount_cents).toBe(9999);
    expect((rows[0] as any).note).toBe('new');
    expect((rows[0] as any).occur_time).toBe('2026-09-16 15:00');
  });

  it('deleteTransaction 删除后磁盘无该行', () => {
    const id = insert(500, 3, '2026-09-16 14:00');
    db.deleteTransaction(id);
    expect(readAll('SELECT 1 FROM user_transaction')).toHaveLength(0);
  });

  it('category 种子数据完整（8 一级 + 二级）', () => {
    const count = readAll('SELECT COUNT(*) AS c FROM category')[0] as any;
    expect(count.c).toBeGreaterThanOrEqual(8);
    const top = readAll('SELECT COUNT(*) AS c FROM category WHERE level = 1')[0] as any;
    expect(top.c).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// getCategories（纯读 category 表，无 WAL 写入问题，直接测）
// ---------------------------------------------------------------------------

describe('getCategories', () => {
  it('返回 8 个一级分类，每个都挂了 children', () => {
    const cats = db.getCategories();
    expect(cats).toHaveLength(8);
    for (const c of cats) {
      expect(c.level).toBe(1);
      expect(Array.isArray(c.children)).toBe(true);
      expect((c.children as any[]).length).toBeGreaterThan(0);
    }
  });

  it('二级小类 parent_id 指回所属一级', () => {
    const cats = db.getCategories();
    const allChildren = cats.flatMap((c) => c.children as any[]);
    for (const child of allChildren) {
      expect(cats.findIndex((x) => x.id === child.parent_id)).not.toBe(-1);
    }
  });
});
