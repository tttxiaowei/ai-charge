import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // 同一测试文件内所有用例共享一个模块实例，
    // 避免 db.ts 被加载成两个实例（写连接与读连接分裂）。
    isolate: false,
    environment: 'node',
    server: {
      deps: {
        // better-sqlite3 是 CJS 原生模块，外化让 Vite 走原生 require，不转译
        external: ['better-sqlite3'],
      },
    },
  },
});
