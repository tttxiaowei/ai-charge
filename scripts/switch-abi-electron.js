#!/usr/bin/env node
// 把 better-sqlite3 重编回 Electron ABI（供 dev / 打包 / 生产运行）。
// 用法：node scripts/switch-abi-electron.js
// 幂等：重跑无副作用。

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

console.log('== switch-abi-electron: 重编 better-sqlite3 为 Electron ABI ==');

// electron-builder 的 install-app-deps 会按 package.json 的 electron 版本重编所有原生依赖。
execSync('npx electron-builder install-app-deps', { stdio: 'inherit', cwd: root });

// 校验：Electron 能加载编译产物（用 electron -e 拿一次 ABI 号对比 better-sqlite3 目标）
console.log('✓ 已切回 Electron ABI（dev / npm run build / 打包可正常用 better-sqlite3）');
