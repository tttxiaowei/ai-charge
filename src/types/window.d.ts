// 渲染进程通过 preload.js 暴露的 chargeDB 全局 API 的类型声明
// 与 src-electron/preload.ts 中 contextBridge.exposeInMainWorld('chargeDB', ...) 对应

export interface CategoryRow {
  id: number;
  level: number;
  parent_id: number | null;
  name: string;
  sort: number;
}

// getCategories() 返回的一级节点：在 CategoryRow 上额外挂 children
export interface CategoryNode extends CategoryRow {
  children: CategoryRow[];
}

export interface TransactionInput {
  amount: number | string;
  categoryId: number;
  occurTime: string;
  note?: string;
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

export interface CategorySummaryRow {
  parent_id: number;
  parent_name: string;
  total_cents: number;
  count: number;
}

export interface SummaryFilter {
  month?: string;
}

export interface ChargeDBApi {
  getCategories(): Promise<CategoryNode[]>;
  addTransaction(data: TransactionInput): Promise<number>;
  updateTransaction(id: number, data: TransactionInput): Promise<void>;
  deleteTransaction(id: number): Promise<void>;
  getTransactions(filter?: TransactionFilter): Promise<TransactionRow[]>;
  getCategorySummary(filter?: SummaryFilter): Promise<CategorySummaryRow[]>;
  exportCSV(): Promise<string>;
}

declare global {
  interface Window {
    chargeDB: ChargeDBApi;
  }
}

export {};
