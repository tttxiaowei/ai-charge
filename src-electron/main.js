const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// 数据库模块（主进程内使用 better-sqlite3）
// 注意：db.js 顶层会调用 init() 并读取用户数据目录，
// 因此必须在 app ready 之后再 require，避免 'app' is undefined。
let db = null;

function initDb() {
  if (!db) {
    // 通过环境变量把 Electron 的真实 userData 目录注入给 db.js
    process.env.HC_USER_DATA_DIR = app.getPath('userData');
    db = require('./db');
  }
  return db;
}

function registerIpcHandlers() {
  ipcMain.handle('db:getCategories', () => initDb().getCategories());
  ipcMain.handle('db:addTransaction', (_e, data) => initDb().addTransaction(data));
  ipcMain.handle('db:updateTransaction', (_e, id, data) => initDb().updateTransaction(id, data));
  ipcMain.handle('db:deleteTransaction', (_e, id) => initDb().deleteTransaction(id));
  ipcMain.handle('db:getTransactions', (_e, filter) => initDb().getTransactions(filter));
  ipcMain.handle('db:getCategorySummary', (_e, filter) => initDb().getCategorySummary(filter));
  ipcMain.handle('db:exportCSV', () => initDb().exportCSV());
}

function createWindow() {
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
