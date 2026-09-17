#!/usr/bin/env node
// 把 better-sqlite3 重编为 Node ABI（供 Vitest 在 Node 里跑测试）。
// 用法：node scripts/switch-abi-node.js
// 幂等：重跑无副作用。

const { execSync } = require('child_process');
const path = require('path');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');

function run(cmd, opts = {}) {
  console.log('[$] ' + cmd);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

console.log('== switch-abi-node: 重编 better-sqlite3 为 Node ABI ==');

// 进入 better-sqlite3 目录，用其自带的 prebuild-install / node-gyp 重新生成 Node 版二进制。
// prebuild-install 优先下预编译（秒级），失败再回退 node-gyp 本地编译（1-2min）。
try {
  run('npx --yes prebuild-install', { cwd: pkgDir, stdio: 'inherit' });
} catch {
  console.log('[!] prebuild-install 失败，回退到本地 node-gyp 编译（需要 C++ 工具链）');
  run('npx --yes node-gyp rebuild', { cwd: pkgDir, stdio: 'inherit' });
}

// 校验 ABI 是否切对了
const { version } = require(path.join(pkgDir, 'package.json'));
try {
  require(path.join(pkgDir, 'build', 'Release', 'better_sqlite3.node'));
  console.log(`✓ better-sqlite3@${version} 已可被当前 Node(${process.versions.node}) 加载（Node ABI）`);
} catch (e) {
  console.error('[✗] 切换后仍无法加载：' + e.message);
  process.exit(1);
}
