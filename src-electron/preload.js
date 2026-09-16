const { contextBridge, ipcRenderer } = require('electron');

// 渲染进程 -> 主进程：通过 IPC 调用数据库能力（主进程内实现于 db.js）
contextBridge.exposeInMainWorld('chargeDB', {
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  addTransaction: (data) => ipcRenderer.invoke('db:addTransaction', data),
  updateTransaction: (id, data) => ipcRenderer.invoke('db:updateTransaction', id, data),
  deleteTransaction: (id) => ipcRenderer.invoke('db:deleteTransaction', id),
  getTransactions: (filter) => ipcRenderer.invoke('db:getTransactions', filter),
  getCategorySummary: (filter) => ipcRenderer.invoke('db:getCategorySummary', filter),
  exportCSV: () => ipcRenderer.invoke('db:exportCSV'),
});
