---
name: run-app
description: 启动黑马记账应用。dev 模式（Vite + Electron，用于开发调试）或生产模式（构建后 electron .，用于验证打包行为）。启动后确认窗口就绪并截图给用户看。
---

# run-app：启动黑马记账应用

## 何时用

- 用户说"跑起来"、"启动 app"、"打开看看"、"验证能不能打开"
- 改完前端/主进程后想肉眼确认界面

## 先问清一件事

启动前有**两种模式**，行为差别大，若用户没指明就用默认：

| 模式 | 命令 | 用途 | 数据目录 |
|---|---|---|---|
| **dev（默认）** | `npm run dev` | 开发调试：HMR、DevTools、Vite dev server | `heima-charge` |
| **prod** | `npm run build && electron .` | 验证打包行为（`loadFile` 加载 `dist/`） | `黑马记账` |

默认 **dev**，除非用户明确说"验证生产/打包"。

## 关键约束

1. **`ELECTRON_RUN_AS_NODE` 必须 unset**：否则 Electron 退化成纯 Node、不弹窗口（`app` 为 undefined）。启动命令一律 `env -u ELECTRON_RUN_AS_NODE ...`。
2. **better-sqlite3 需在 Electron ABI**：dev/prod 都要 Electron 加载它。若刚跑过单测且没切回来，先 `npm run switch-abi-electron`。不确定就 `npm run build`（会触发 install-app-deps 重编）。
3. **后台跑 + 看日志判断就绪**，不要阻塞等它退出（GUI 不会自己退）。

## 步骤

### 1. 清掉可能残留的旧实例
```bash
# 停掉旧的 dev / electron（避免端口 5173 被占、多个窗口）
pkill -f "heima-charge" 2>/dev/null; pkill -f "electron ." 2>/dev/null; true
```
> 若之前有后台 dev 任务在跑（Claude 起的），优先用 TaskStop 停那个 task，而不是 pkill。

### 2. 确认 ABI 为 Electron 版（保险起见）
```bash
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron -e \
  "console.log('electron ok, abi=', process.versions.modules)"
```
能打印 `electron ok` 即主进程环境正常；报 `NODE_MODULE_VERSION` 错就先 `npm run switch-abi-electron`。

### 3. 启动（dev 默认）
```bash
cd /Users/xiaowei/test/charge
env -u ELECTRON_RUN_AS_NODE npm run dev 2>&1
```
**在后台运行**（run_in_background）。dev 会自动：`build:electron`（tsc 编译主进程）→ 起 Vite(5173) → 等 5173 → 起 Electron 窗口 + 开 DevTools。

生产模式则：
```bash
env -u ELECTRON_RUN_AS_NODE npm run build && env -u ELECTRON_RUN_AS_NODE electron .
```

### 4. 等就绪 + 确认窗口
轮询后台输出，看到这些行即就绪：
- `[dev:vite]   VITE ... ready` + `Local: http://localhost:5173/`
- `[dev:electron]` 出现 `[进程号:...]` 的 Electron 日志行（非 Autofill 报错那种 devtools 警告）

再 `ps aux | grep -iE "electron" | grep -v grep` 确认有本 app 的 Electron 进程（区别于 VSCode 自带的）。

### 5. 截图给用户看（macOS）
```bash
screencapture -x /tmp/heima-charge.png   # -x 无提示音；截全屏，窗口应可见
# 若只想截 app 窗口（按窗口 id）：先 screencapture -l <windowid>；windowid 用 osascript 查
```
然后把 `/tmp/heima-charge.png` 用 Read 展示给用户。

> 若 `screencapture` 因无屏幕共享/录屏权限失败（报权限错），就降级为"只报告窗口已起 + 日志就绪"，不硬要截图。

### 6. 报告
- 模式（dev/prod）、Electron 是否就绪、Vite 端口、数据库目录路径
- 截图（若成功）
- 一句"现在可以操作窗口了"

## 边界与上报

- **窗口弹不出来**：查后台日志里有没有 `require('electron')` 相关错（多半是 `ELECTRON_RUN_AS_NODE` 漏 unset 或 ABI 没切）。把原始日志段报给用户。
- **5173 端口被占**（`EADDRINUSE`）：`lsof -i :5173` 找到占用进程，先停掉再重来。
- **better-sqlite3 报错**（`NODE_MODULE_VERSION 125/127`）：ABI 没切对，跑 `npm run switch-abi-electron` 再启。
- **只截到桌面没截到窗口**：可能窗口在后面，提示用户点一下窗口或改用 `screencapture -w`（交互选窗口）。

## 与别的机制的分工

- **想跑单测** → `tester` / `unit-test`（不是本 skill）
- **想验证数据层 SQL 对不对** → `verify-db`
- **本 skill 只管"把窗口跑起来给人看"**
