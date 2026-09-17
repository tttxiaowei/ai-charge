import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

// 数据库模块（主进程内使用 better-sqlite3）
// 注意：db.ts 顶层会调用 init() 并读取用户数据目录，
// 因此必须在 app ready 之后再加载，避免 'app' is undefined。
// 这里用 require 把加载推迟到 initDb()（whenReady 时）首次调用，
// 编译成 CJS 后即为延迟 require，保留原 main.js 的语义。
type DbModule = typeof import('./db');
let db: DbModule | null = null;

function initDb(): DbModule {
  if (!db) {
    // 通过环境变量把 Electron 的真实 userData 目录注入给 db.ts
    process.env.HC_USER_DATA_DIR = app.getPath('userData');
    // 编译产物为 CJS，require('./db.js') 指向 tsc 输出的 dist-electron/db.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    db = require('./db.js') as DbModule;
  }
  return db;
}

function registerIpcHandlers(): void {
  ipcMain.handle('db:getCategories', () => initDb().getCategories());
  ipcMain.handle('db:addTransaction', (_e, data) => initDb().addTransaction(data));
  ipcMain.handle('db:updateTransaction', (_e, id, data) => initDb().updateTransaction(id, data));
  ipcMain.handle('db:deleteTransaction', (_e, id) => initDb().deleteTransaction(id));
  ipcMain.handle('db:getTransactions', (_e, filter) => initDb().getTransactions(filter));
  ipcMain.handle('db:getCategorySummary', (_e, filter) => initDb().getCategorySummary(filter));
  ipcMain.handle('db:exportCSV', () => initDb().exportCSV());
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: '黑马记账',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  initDb(); // 提前初始化数据库，确保分类种子数据就绪
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
