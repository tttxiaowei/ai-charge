import { contextBridge, ipcRenderer } from 'electron';
import type {
  TransactionInput,
  TransactionFilter,
  SummaryFilter,
} from './db';

// 渲染进程 -> 主进程：通过 IPC 调用数据库能力（主进程内实现于 db.ts）
contextBridge.exposeInMainWorld('chargeDB', {
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  addTransaction: (data: TransactionInput) => ipcRenderer.invoke('db:addTransaction', data),
  updateTransaction: (id: number, data: TransactionInput) =>
    ipcRenderer.invoke('db:updateTransaction', id, data),
  deleteTransaction: (id: number) => ipcRenderer.invoke('db:deleteTransaction', id),
  getTransactions: (filter?: TransactionFilter) => ipcRenderer.invoke('db:getTransactions', filter),
  getCategorySummary: (filter?: SummaryFilter) => ipcRenderer.invoke('db:getCategorySummary', filter),
  exportCSV: () => ipcRenderer.invoke('db:exportCSV'),
});
