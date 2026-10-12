# fat-tools

Very useful tools

A FatNotes bespoke plugin scaffolded by `fat-notes-extension-cli`.

## Install dependencies

```
npm install
```

## Build

```
npm run build
```

The production bundle (including `remoteEntry.js`) is emitted to `dist/`.

## Package & install

Zip the **contents** of `dist/` together with the top-level `plugin.json` as
`install.zip` and install it via FatNotes → Extensions → Custom Bespoke Plugins.

## Module Federation name alignment

FatNotes assigns each plugin a UUID at install time. The Module Federation
remote name the host expects is `plugin_<uuid_with_underscores>`. After
installing or registering the plugin in FatNotes:

1. Find the assigned UUID in the host plugin list (e.g. `2c535311-9c1a-4126-8921-ddfac4f5f690`).
2. Add `"mfName": "plugin_2c535311_9c1a_4126_8921_ddfac4f5f690"` to your **workspace** `plugin.json`.
3. Rebuild (`npm run build`). The webpack config picks up `mfName` automatically.

Alternatively, set the env var before building:

```powershell
$env:PLUGIN_MF_NAME = "plugin_2c535311_9c1a_4126_8921_ddfac4f5f690"
npm run dev
```

If names don't match you will see:

> `[ Federation Runtime ]: remoteEntryExports is undefined`

## File structure

- `src/index.tsx` — plugin entry; must export `activate(sdk)` and `deactivate()`.
- `src/MenuView.tsx` — 主侧边栏（次面板）：只展示工具菜单，点击走 `sdk.router.navigate`。
- `src/WorkPageView.tsx` — 工作台整页（右侧工作区）：按当前路由渲染对应工具。
- `src/routes.ts` — 工具路由表（`/tools/<toolId>`）与 path ⇄ toolId 互转。
- `src/tools/registry.tsx` — 工具注册表（新增工具只需在此加一条记录）。
- `src/ThemeShell.tsx` — 跟随宿主明暗主题的 antd ConfigProvider 壳。
- `plugin.json` — manifest consumed by the FatNotes installer.
- `types/fat-notes-sdk.d.ts` — SDK type declarations (mirror of host).
- `webpack.config.js` — Module Federation build (`exposes ./plugin`).

## 内置工具（46 个，纯前端实现）

菜单按分类展示，点击卡片 → `sdk.router.navigate("/tools/<toolId>")`。

| 分类 | 工具 |
| --- | --- |
| 文本 | 文本对比、字数统计、正则测试、命名转换、行处理、Markdown 预览、汉字拆解 |
| 编码 | Base64、URL 编解码、颜色转换、摩斯电码 |
| 开发 | JSON 工具、哈希计算、UUID 生成器、时间戳转换、URL 解析、JWT 解析、DNS 查询、XML 工具 |
| 数值 | 计算器、进制转换、单位换算、元素周期表、汇率计算、科学计算器 |
| 绘图 | 画板 |
| 生成 | 密码生成器、条形码生成、随机字符生成、转盘抽签、智能取名 |
| 时间 | 秒表 / 倒计时、时间计算器、假期日历、农历转换 |
| 生活 | 亲友关系图谱、血型图谱、星座罗盘、易经算命、网站导航 |
| 文件 | PDF 合并、PDF 分割、格子拆图、格子合图 |
| 记录 | 待办清单、操作记录 |

> 新增工具只需在 `src/tools/registry.tsx` 加一条记录（`ToolCategory` 已支持上表分类），
> 纯计算逻辑收敛到 `src/utils.ts`（不依赖 DOM，便于 `vitest` 单测）。

## 布局约定（参考 fat-stock）

活动栏项 id 必须与工作台页 id 完全一致（本插件均为 `fat-tools.main`），
宿主才认为「点图标后：左侧主侧边栏 = 菜单，右侧工作区 = 功能页」：

```ts
sdk.contributions.registerActivityBarItem({ id: "fat-tools.main", icon: "Wrench" });
sdk.contributions.registerPrimarySidebar(() => <MenuView sdk={sdk} />);   // 只放菜单
sdk.contributions.registerWorkbenchPage({ id: "fat-tools.main", render: () => <WorkPageView sdk={sdk} /> });
```

菜单点击 → `sdk.router.navigate("/tools/<toolId>")`；`WorkPageView` 订阅
`sdk.router.onChange` 后按 `getCurrent().path` 渲染对应工具。

## 操作记录落库（专用 SQLite）

所有工具的操作历史统一写入专用 SQLite：`<workspace>/fatTools/history.db`
（stdlib `sqlite3`，无第三方依赖）。Python 后端 `backend/` 暴露 4 个 handler：

- `history.add` — 写入一条记录（按工具各保留最近 500 条，字段自动截断）
- `history.list` — 查询（可按 toolId 过滤，倒序）
- `history.clear` — 清空（可按 toolId）
- `history.stats` / `history.dbPath` — 统计与库文件路径

前端 `src/historyClient.ts` 封装调用；后端不可用时自动降级 localStorage。
工具内调用：显式动作（计算/格式化/编码等）直接 `recordUsage()`，
「输入即算」类（哈希/正则/字数/颜色/进制/时间戳）用 `recordUsageDebounced()` 停顿后落库。

## SDK capabilities

- `sdk.dataSource` — list / read data sources
- `sdk.query` / `sdk.mutation` — run saved queries/mutations or raw SQL
- `sdk.ui` — toast, modal, theme, i18n
- `sdk.commands` — register/execute commands
- `sdk.store` — read host Redux state
- `sdk.contributions` — activityBar / primary sidebar / panel / footer / routes / block types
  - 仪表盘块类型 `fat-tools.calcCard`（「tools」分类：迷你计算器卡片）
  - 仪表盘块类型 `fat-tools.toolSwitcher`（「other/其他」分类：一张卡片内嵌
    多个工具并切换；显示配置面板（`registerBlockDisplayConfig`）提供
    工具选择、默认工具、是否展示切换按钮、切换控件样式与位置，
    卡片外框（背景色/标题/圆角/边框/内边距）复用宿主 `BlockConfigCommon.PanelDisplay`，
    编辑态读写走共享 redux（`blockEdit/onUpdateEditBlock`）
- `sdk.events` — host/plugin event bus
- `sdk.remoteComponents.PluginBlockBox` — 远程组件（主程序暴露）用于渲染卡片盒
- `sdk.boards` — 高级插件板卡配置读写：
  - `getBoard/setBoard` -> `templates/default/confs/boards/<唯一key>/file.json`
  - `getDependencies/setDependencies` -> `templates/default/confs/boards/<唯一key>/dependencies.json`
  - `addConfigCard` -> 开发模式可配合浮动按钮快速新增配置卡片

> The **secondary sidebar** is reserved for FatNotes' chat block and is not
> available to plugins.
