---
name: rebuild-app
description: 把黑马记账打包成 macOS DMG 安装包。先编译（tsc + vite），再 electron-builder --mac，产出 release/*.dmg。打包前切回 Electron ABI，产物校验后截图/提示安装路径。
---

# rebuild-app：打包 macOS DMG 安装包

## 何时用

- 用户说"打个 DMG"、"打包 macOS 安装包"、"生成 .dmg"、"出个能分发的包"
- 改完代码想出一版可安装的 mac 包（区别于 dev 模式直接跑）

## 关键约束（务必遵守）

1. **只打 mac**：本项目是 macOS，`dist:mac` 走 DMG。Windows 的 NSIS 包要在 Windows 机器上打（交叉构建装不了、实测不了），本 skill 不负责，若用户要 win 包就提示"需在 Windows 上 `npm run dist:win`"。
2. **打包前 better-sqlite3 必须在 Electron ABI**：`electron-builder` 会自己跑 `install-app-deps` 重编，但若当前是 Node ABI 残留状态、或本地编译工具链缺失，最好先 `npm run switch-abi-electron` 兜底。保险做法：打包命令前统一走 `postinstall` 那条链（下面第 3 步会带上）。
3. **`npm run build` 已含 tsc**：`build` = `build:electron`（tsc 编译主进程到 `dist-electron/`）+ `vite build`（前端到 `dist/`）。打包用的是这两份产物，别漏。
4. **GitHub 网络**：electron-builder 拉 Electron 二进制/公证材料可能访问 GitHub。本机超时则设 `ELECTRON_MIRROR`（见第 5 步）。

## 步骤

### 1. 清旧产物（可选但推荐，避免拿旧 DMG 误判）
```bash
cd /Users/xiaowei/test/charge
rmtrash release/ 2>/dev/null   # 或 rm -rf release/（注意本机 rm 被 alias 成 rmtrash）
```
> 留着旧的也行，electron-builder 会覆盖同名输出；删了更干净、避免"其实是上次的包"。

### 2. 确认 ABI 已切回 Electron（防"刚跑完单测没切回"）
```bash
npm run switch-abi-electron
# 校验：能起 electron 主进程
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron -e "console.log('abi ok', process.versions.modules)"
```

### 3. 打包
```bash
cd /Users/xiaowei/test/charge
env -u ELECTRON_RUN_AS_NODE npm run dist:mac 2>&1 | tail -40
```
`dist:mac` = `npm run build && electron-builder --mac`，产物落在 `release/`。

> 这一步可能几分钟（拉二进制、代码签名公证配置、压缩）。跑完看输出末尾有没有 `packaging ... done` / 生成 `.dmg` 的日志。

### 4. 校验产物
```bash
ls -lh release/*.dmg
# 确认体积正常（此前约 130MB 量级）且时间戳是刚生成的
stat -f "%N %z bytes, modified %Sm" release/*.dmg
```

### 5. 失败排查（GitHub 超时时）
```bash
# 拉 Electron 二进制走国内镜像后重试
env -u ELECTRON_RUN_AS_NODE \
    ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
    npm run dist:mac 2>&1 | tail -40
```

### 6. 报告
- 产物路径：`release/黑马记账-<version>.dmg`（版本号取自 `package.json` 的 `version`）
- 体积 + 生成时间
- 安装方式：双击 `.dmg` → 拖 `黑马记账` 到 Applications；首次运行若 Gatekeeper 拦（未公证/未签名），提示"右键 → 打开"或 `xattr -dr com.apple.quarantine /Applications/黑马记账.app`
- 截图（可选）：`screencapture -x /tmp/heima-dmg.png` 展示 `release/` 目录

## 边界与上报

- **签名/公证**：当前 `package.json` 的 `build` 段没配 `mac.identity` / 公证（notarize），打出来的是**未签名**包。本地自用没问题；要分发给别人，需在 CI/签名机配 `CSC_*` 环境变量 + `notarize` 步骤——本 skill 不做，报给用户即可。
- **版本没变 → DMG 同名**：electron-builder 输出名含 `version`。想出新包名先改 `package.json` 的 `version`。
- **`ELECTRON_RUN_AS_NODE`**：打包命令必须 unset，否则 electron-builder 调 electron 时会退化成纯 Node、报错。

## 与别的机制的分工

- **要能跑的窗口**（开发调试）→ `run-app`（dev/prod 直接起，不产出 DMG）
- **要可分发的 .dmg** → **本 skill（rebuild-app）**
- **打包后想验数据层** → `verify-db`
