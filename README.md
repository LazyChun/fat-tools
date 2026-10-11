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
- `sdk.events` — host/plugin event bus
- `sdk.remoteComponents.PluginBlockBox` — 远程组件（主程序暴露）用于渲染卡片盒
- `sdk.boards` — 高级插件板卡配置读写：
  - `getBoard/setBoard` -> `templates/default/confs/boards/<唯一key>/file.json`
  - `getDependencies/setDependencies` -> `templates/default/confs/boards/<唯一key>/dependencies.json`
  - `addConfigCard` -> 开发模式可配合浮动按钮快速新增配置卡片

> The **secondary sidebar** is reserved for FatNotes' chat block and is not
> available to plugins.
