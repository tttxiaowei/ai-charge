# 黑马记账 - 产品文档（PRD）

## 1. 产品概述

- **产品名称**：黑马记账
- **产品定位**：个人桌面记账工具，帮助用户记录并管理日常花销
- **支持平台**：Windows、macOS（双平台）
- **目标用户**：需要记录日常消费、做简单个人消费管理的普通用户，无需注册登录，开箱即用

## 2. 功能需求

- 记录一笔花销：金额（人民币，支持小数，最小单位"分"）、发生时间（默认当前，可修改）、备注（可选）
- 两级分类体系（详见第 3 节）
- 花销列表：按时间倒序展示，支持按分类/时间筛选
- 统计视图（可选扩展）：按月汇总各分类支出占比
- 数据本地存储，无需登录，支持数据导出（CSV）
- **已确认范围**：仅记录支出（花销），不记录收入；仅本地存储，不做云端/多设备同步

## 3. 分类体系设计（两级）

一级大类（8个）及二级小类：

| 一级大类 | 二级小类 |
|---|---|
| 餐饮美食 | 早餐、午餐、晚餐、下午茶/咖啡、零食饮料、聚餐 |
| 交通出行 | 公交地铁、打车网约车、加油/充电、骑行共享单车、停车费、其他交通 |
| 购物消费 | 服饰鞋包、数码电子、日用百货、美妆护肤、食品饮料采购、礼物 |
| 居家生活 | 房租/房贷、水电燃气、物业维修、家居用品、宠物开销 |
| 休闲娱乐 | 电影演出、游戏氪金、KTV/酒吧、旅游度假、健身运动、订阅会员（视频/音乐等） |
| 医疗健康 | 药品、门诊挂号、检查化验、体检、美容理疗 |
| 教育学习 | 课程培训、书籍资料、考试报名费、自习/会员 |
| 其他支出 | 人情往来、缴费办理（话费/网费）、意外支出、分类不明 |

设计说明：
- 一级大类控制在 8 个以内，避免选择成本过高
- 二级小类贴合日常高频消费场景，预留"其他/分类不明"兜底
- 支持后续在"设置-分类管理"中自定义增删二级小类（产品层面预留，第一版可先做内置固定分类）

## 4. 技术方案

### 候选方案对比（选型参考）

| 方案 | 技术栈 | 优势 | 劣势 |
|---|---|---|---|
| A | Electron + React | 生态成熟、Web技术栈、资料多、打包工具齐全 | 安装包体积大（100MB+）、内存占用高 |
| B | Tauri (Rust后端) + React/Vue | 体积小（几MB）、性能好、内存占用低 | 生态较新、某些系统级能力需写Rust代码、打包签名流程略繁琐 |
| C | .NET MAUI / Avalonia | 原生级体验、性能优秀 | 学习曲线陡（.NET体系）、Web前端经验无法直接复用 |
| D | Flutter Desktop | 一套代码多平台（含桌面）、UI表现力强 | 桌面端生态相对移动端弱，部分 Windows/macOS 特定交互需额外适配 |

### 最终选定方案（用户确认）

**Electron + Vue 3**，具体技术选型：

| 层面 | 选型 | 说明 |
|---|---|---|
| 前端框架 | Vue 3 + Vite + TypeScript | 用户指定 |
| UI 组件库 | Element Plus | 含表单校验、级联选择器（Cascader）适合两级分类选择 |
| 状态管理 | Pinia | Vue 官方推荐状态管理库 |
| 桌面壳 | Electron + electron-builder | 双平台打包：Windows NSIS、macOS DMG |
| 语言 | TypeScript（全项目） | 前端 `vue-tsc` 类型检查；主进程 `tsc` 编译为 CJS 产物 |
| 数据库访问 | `better-sqlite3` | Node.js 原生 SQLite 驱动，需 `electron-rebuild` 适配 Electron ABI；类型由 `@types/better-sqlite3` 提供 |
| 数据存储位置 | Electron `app.getPath('userData')` 目录下 | Windows: `%APPDATA%`；macOS: `~/Library/Application Support`，便于跨机器备份/迁移 |

## 5. 数据模型设计

- 一笔花销 `user_transaction`：`id`、`amount_cents`（以"分"为单位存储整数，避免浮点误差）、`category_id`（二级分类 id）、`occur_time`、`note`、`created_at`
- 分类 `category`：`id`、`level`（1 或 2）、`parent_id`、`name`、`icon`、`sort`

本地存储确认使用 SQLite（`better-sqlite3`），数据库文件存放在上述 `userData` 目录，便于用户手动备份或迁移到其他机器。

## 6. 界面原型（文字描述）

- **主界面**：左侧分类/月份切换，中间花销列表，右侧或底部快捷记账表单
- **记账表单**：金额输入、分类级联选择（先大类后小类，Cascader 实现）、时间、备注、保存
- **统计页**：环形图/柱状图展示当月各一级分类占比
- **设置页**：分类管理（预留）、数据导出 CSV、关于

## 7. 项目结构与交付物

```
charge/
├── src/                     # 前端（Vue 3 + Vite + TypeScript + Element Plus + Pinia + ECharts）
│   ├── main.ts              # 入口：挂载 App、Pinia、Element Plus、Router
│   ├── App.vue              # 布局壳（侧边导航 + 路由出口）
│   ├── router.ts            # vue-router 路由（quick-record / records / stats / settings）
│   ├── types/
│   │   └── window.d.ts      # window.chargeDB 全局 API 类型声明（对应 preload.ts）
│   └── views/
│       ├── QuickRecordView.vue  # 记账表单（新增一笔花销）
│       ├── RecordsView.vue      # 记账列表 + 编辑/删除
│       ├── StatsView.vue        # 当月概览 + ECharts 环形图分类占比
│       └── SettingsView.vue     # CSV 导出 / 关于 / 分类管理（预留）
├── src-electron/            # 主进程源码（TypeScript）
│   ├── main.ts              # Electron 主进程：窗口、IPC handler 注册
│   ├── preload.ts           # contextBridge 暴露 chargeDB API
│   └── db.ts                # better-sqlite3 数据层（建表、种子分类、CRUD、聚合、CSV）
├── dist-electron/           # tsc 编译产物（CJS），package.json main 指向 dist-electron/main.js（已 gitignore）
├── tsconfig.json            # 前端 Vue/TS 编译配置（vue-tsc --noEmit 用）
├── tsconfig.electron.json   # 主进程编译配置（tsc 输出到 dist-electron/）
├── index.html               # Vite 入口 HTML（引用 /src/main.ts）
├── vite.config.ts
├── package.json             # 含 electron-builder 打包配置（NSIS / DMG）
└── CLAUDE.md                # 本文件
```

数据库文件位置（运行时自动生成）：
- macOS: `~/Library/Application Support/heima-charge/charge.db`（开发模式下 app 名为 `heima-charge`；打包后为 `黑马记账`）
- Windows: `%APPDATA%/heima-charge/charge.db`

### 常用命令

```bash
npm install                 # 首次安装（postinstall 自动 electron-builder install-app-deps 编译 better-sqlite3）
npm run dev                 # 开发模式：先 tsc 编译主进程到 dist-electron/，再 Vite + Electron 同时启动
npm run build               # 构建：先 build:electron（tsc），再 vite build 前端到 dist/
npm run build:electron      # 单独编译主进程 TS → dist-electron/（CJS）
npm run type-check          # 前端类型检查（vue-tsc --noEmit）
npm run start               # 构建后以生产模式启动 Electron
npm run dist:mac            # 打包 macOS DMG
npm run dist:win            # 打包 Windows NSIS（需在 Windows 机器上运行）
```

### 注意事项 / 踩坑记录

- **`ELECTRON_RUN_AS_NODE=1` 会让 Electron 退化成纯 Node 模式**：不启动 GUI、不注入内置 `electron` 模块，导致 `require('electron')` 拿到的是 npm shim（路径字符串），`app` 为 `undefined`。启动 Electron 前务必确认该环境变量未设置（`env -u ELECTRON_RUN_AS_NODE ...`）。
- **`better-sqlite3` 是原生模块**：`postinstall` 会自动调用 `electron-builder install-app-deps` 重新编译以匹配 Electron ABI。换 Node/Electron 版本或换机器后需重跑 `npm install`。纯 Node 直连库文件（`node -e "require('better-sqlite3')"`）会因 ABI 不匹配（Electron ABI 125 vs Node 127）报错——验证数据层请走 Electron 本身或直接 `sqlite3` CLI。
- **交易表名是 `user_transaction`（非保留字，无需双引号）**：建表与所有 SQL 语句统一使用 `user_transaction`。历史版本曾用保留字 `transaction`（需双引号），已重命名并迁移。
- **数据库初始化时机**：`db.ts` 顶层调用 `init()`，依赖 `HC_USER_DATA_DIR` 环境变量；`main.ts` 在 `app.whenReady()` 后先把 `app.getPath('userData')` 写入该变量，再通过 `require('./db.js')`（CJS 产物）延迟加载 db，避免提前初始化时报错。
- **主进程是 TS 但产物是 CJS**：`src-electron/*.ts` 用 ESM 风格 `import`，由 `tsconfig.electron.json`（`module: CommonJS`）编译到 `dist-electron/`。改了主进程源码必须重跑 `npm run build:electron`（`dev`/`build` 已自动串接）；Electron 加载的是 `dist-electron/main.js`，不是 `.ts` 源文件。
- **`typescript` 锁定 5.x**：`vue-tsc@2` 依赖 `typescript` 的 `lib/tsc` 子路径，TS 7（beta）改了 exports 会报 `ERR_PACKAGE_PATH_NOT_EXPORTED`。本仓用 `typescript@^5.9`。
- **打包 DMG 需要能访问 Electron 发布源**：本机网络访问 GitHub 会超时，可用 `ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"` 走镜像。

### 当前完成状态

- 阶段 1–5：已完成（脚手架、数据层、记账核心、统计页、设置页/CSV 导出）
- 阶段 6：macOS DMG 已构建成功并验证可启动；**Windows NSIS 安装包需用户在 Windows 机器上执行 `npm install && npm run dist:win` 完成**（本机为 macOS，无法交叉构建并安装实测 Windows 包）

## 8. 开发迭代步骤（分阶段里程碑）

**阶段 1：项目脚手架**
- 初始化 Vue 3 + Vite + TypeScript 项目
- 集成 Electron 主进程（`main.ts`/`preload.ts`）与 electron-builder；主进程 TS 经 `tsc` 编译为 CJS 产物
- 集成 `better-sqlite3`，配置 `electron-rebuild`（Postinstall 自动适配 Electron ABI）
- 配置 electron-builder 打包脚本（Windows NSIS、macOS DMG）

**阶段 2：数据层**
- 设计并生成 SQLite 建表语句（`category`、`user_transaction` 表，含字段约束、默认值）
- 首次启动自动建库、插入 8 个一级大类 + 二级小类初始数据
- 封装数据库访问模块（增删改查、按月聚合查询）

**阶段 3：记账核心功能（主界面）**
- 记账表单（金额、级联分类选择、时间、备注）
- 花销列表（时间倒序、分页/筛选：按月份、按一级分类）
- 编辑 / 删除花销

**阶段 4：统计页**
- 按月汇总各一级分类支出金额，环形图 / 柱状图展示（可用 ECharts 或类似图表库）
- 当月总支出、日均支出概览

**阶段 5：设置页**
- 数据导出 CSV
- 关于页（版本号、版权信息）
- 分类管理入口（第一版仅展示，自定义增删留待后续迭代，见第 9 节）

**阶段 6：双平台打包与验证**
- 分别构建 Windows（NSIS）与 macOS（DMG）安装包
- 在 Windows 与 macOS 各一台机器上安装、验证：新增/编辑/删除花销、筛选统计、导出 CSV 均正常
- 验证数据库文件实际生成位置（`userData` 目录），确认跨机器备份/迁移流程可行

**阶段 7：（可选，非第一版范围）** 预留后续迭代，见第 9 节。

## 9. 验证方式

- 本地启动开发模式验证双平台构建（`npm run dev`）
- 记录/编辑/删除一笔花销，切换分类，导出 CSV 验证数据正确性
- 分别构建 Windows 与 macOS 安装包，并在两台机器上验证可安装运行

## 9. 后续迭代方向（非第一版范围）

- 收入记录
- 自定义增删二级分类
- 云同步 / 多设备数据同步
- 预算提醒、消费趋势分析
