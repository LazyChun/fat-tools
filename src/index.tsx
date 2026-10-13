/*
 * fat-tools — FatNotes 开发者常用工具箱插件
 *
 * 布局参考 fat-stock：
 *   - 活动栏图标      → 选中后显示主侧边栏 + 工作台整页
 *   - 主侧边栏（次面板）→ 只放工具菜单（MenuView），点击走 sdk.router.navigate
 *   - 工作台整页（右侧工作区）→ 按当前路由渲染对应工具（WorkPageView）
 *
 * 工具清单（全部纯前端实现，遵循 SDK-First 原则，无需后端）：
 *   文本对比 / 字数统计 / 正则测试 / 计算器 / 进制转换
 *   JSON 工具 / 哈希计算 / UUID 生成器 / 时间戳转换
 *   Base64 / URL 编解码 / 颜色转换 / 摩斯电码 / 条形码生成
 *   命名转换 / 行处理 / Markdown 预览 / URL 解析 / JWT 解析
 *   单位换算 / 元素周期表 / 画板 / 密码生成器 / 随机字符生成
 *   转盘抽签 / 秒表·倒计时 / 时间计算器 / 待办清单
 *   假期日历 / 亲友关系图谱 / 血型图谱 / 汇率计算
 *   农历转换 / DNS 查询 / 汉字拆解 / 星座罗盘 / 科学计算器
 *
 * 其它贡献点：
 *   - 路由页注册（供宿主面包屑 / 全局导航识别）
 *   - 全局搜索注册（每个工具注册为可搜索项，宿主全局搜索可直达）
 *   - 页脚状态、设置页
 *   - 命令：fat-tools.ping / fat-tools.openTool
 *   - 仪表盘块类型：fat-tools.calcCard（迷你计算器卡片）
 *                  fat-tools.toolSwitcher（工具卡片，「其他」分类，
 *                  显示配置支持工具选择 / 是否展示切换按钮 / 样式外框）
 *   - 本插件页激活时隐藏右侧次侧栏与底部面板，让工作区更宽
 */
import React from "react";
import type { Disposable, FatNotesPluginSDK } from "fat-notes-sdk";
import MenuView from "./MenuView";
import WorkPageView from "./WorkPageView";
import CalculatorTool from "./tools/CalculatorTool";
import { TOOLS } from "./tools/registry";
import { ROUTE_PREFIX, getDefaultRoute, toolIdToPath } from "./routes";
import { getPreferredToolId, setPreferredToolId } from "./preferences";
import { initHistoryClient } from "./historyClient";
import { CALCULATOR_ICON_URL } from "./assets/calculatorIcon";
import { TOOL_SWITCHER_ICON_URL } from "./assets/toolSwitcherIcon";
import ToolSwitcherBlock from "./tools/ToolSwitcherBlock";
import ToolSwitcherDisplayConfig from "./tools/ToolSwitcherDisplayConfig";

const disposables: Disposable[] = [];

/** 活动栏项 id —— 必须与工作台页 id 完全一致，宿主据此绑定右侧工作区 */
const ACTIVITY_ID = "fat-tools.main";

/**
 * 逐项注册并吞掉单个贡献点的异常：
 * 某个宿主版本缺少某个 SDK 方法时，不能让它中断整个 activate()，
 * 否则后续贡献点与首屏 UI 都会一起消失（表现为"插件加载后啥都没有"）。
 */
function safeRegister(
  label: string,
  fn: () => Disposable | undefined | null,
): void {
  try {
    const d = fn();
    if (d) disposables.push(d);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[fat-tools] 注册「${label}」失败：`, e);
  }
}

export async function activate(sdk: FatNotesPluginSDK): Promise<void> {
  // 0. 注入 SDK 引用：工具操作记录（SQLite 落库）依赖
  initHistoryClient(sdk);

  // 1. 活动栏图标（点击后：左侧显示主侧边栏菜单 + 右侧显示工作台整页）
  //    不指定 primarySidebarViewId —— 宿主会用本插件的 primarySidebar 视图兜底。
  safeRegister("activityBar", () =>
    sdk.contributions.registerActivityBarItem({
      id: ACTIVITY_ID,
      title: "工具箱 fat-tools",
      icon: "Wrench",
      pluginName: "fat-tools",
    }),
  );

  // 2. 主侧边栏（次面板）：只展示工具菜单
  safeRegister("primarySidebar", () =>
    sdk.contributions.registerPrimarySidebar(() =>
      React.createElement(MenuView, { sdk }),
    ),
  );

  // 3. 工作台整页（右侧工作区）：id 与活动栏项一致，宿主才会在右侧渲染它
  safeRegister("workbenchPage", () =>
    sdk.contributions.registerWorkbenchPage({
      id: ACTIVITY_ID,
      render: () => React.createElement(WorkPageView, { sdk }),
    }),
  );

  // 4. 路由页注册（宿主用于面包屑 / 全局导航；实际渲染由工作台页按路由分发）
  for (const tool of TOOLS) {
    const path = toolIdToPath(tool.id);
    if (!path) continue;
    safeRegister(`route:${path}`, () =>
      sdk.contributions.registerRoutePage({
        path,
        title: tool.title,
        render: () => null,
      }),
    );
  }

  // 5. 页脚状态项（显示当前工具）
  safeRegister("footerItem", () =>
    sdk.contributions.registerFooterItem({
      id: "fat-tools.footer",
      align: "right",
      render: () => {
        const preferred = getPreferredToolId();
        const tool = TOOLS.find((t) => t.id === preferred);
        return React.createElement(
          "span",
          { style: { opacity: 0.75 }, title: "fat-tools 工具箱" },
          `[fat-tools] ${tool ? tool.title : "ready"}`,
        );
      },
    }),
  );

  // 5.5 全局搜索注册：每个工具注册为一个搜索项（匹配文本 / 图标 / 点击直达）
  safeRegister("searchProvider", () =>
    sdk.contributions.registerSearchProvider({
      id: "fat-tools.search",
      name: "fat-tools 工具箱",
      items: TOOLS.map((tool) => ({
        id: tool.id,
        title: tool.title,
        desc: tool.desc,
        icon: tool.icon,
        // 关键词：工具 id、中文分类、id 拆词与连写（"text-diff" → text / diff / "text diff"）
        keywords: Array.from(
          new Set([
            tool.id,
            tool.category,
            ...tool.id.split("-"),
            tool.id.split("-").join(" "),
          ]),
        ),
        tag: "工具",
        activityId: ACTIVITY_ID,
        onSelect: () => {
          setPreferredToolId(tool.id);
          const path = toolIdToPath(tool.id);
          if (path) sdk.router.navigate(path);
        },
      })),
    }),
  );

  // 6. 命令：ping
  safeRegister("command:ping", () =>
    sdk.commands.register("fat-tools.ping", async () => {
      sdk.ui.toast.info(
        `[fat-tools] pong（宿主 ${sdk.host.version}，工具数 ${TOOLS.length}）`,
      );
      return "pong";
    }),
  );

  // 7. 命令：openTool —— 导航到对应工具路由（右侧工作区随之切换）
  safeRegister("command:openTool", () =>
    sdk.commands.register("fat-tools.openTool", async (toolId: unknown) => {
      const id = typeof toolId === "string" ? toolId : TOOLS[0]?.id;
      if (!id) return false;
      const path = toolIdToPath(id);
      if (!path) {
        sdk.ui.toast.warn(`[fat-tools] 未知工具 id：${id}`);
        return false;
      }
      setPreferredToolId(id);
      sdk.router.navigate(path);
      return true;
    }),
  );

  // 8. 设置页：工具清单说明
  safeRegister("settingsPage", () =>
    sdk.contributions.registerSettingsPage({
      id: "fat-tools.settings",
      title: "fat-tools 工具箱",
      render: () =>
        React.createElement(
          "div",
          { style: { padding: 20, maxWidth: 560 } },
          React.createElement(
            "h3",
            { style: { marginTop: 0 } },
            "fat-tools 工具箱",
          ),
          React.createElement(
            "p",
            null,
            `共内置 ${TOOLS.length} 个开发常用工具。左侧菜单选择工具，右侧工作区展示功能；` +
              `使用过的工具会被记忆为下次默认打开的工具。`,
          ),
          React.createElement(
            "ul",
            null,
            TOOLS.map((t) =>
              React.createElement(
                "li",
                { key: t.id },
                React.createElement("b", null, t.title),
                ` — ${t.desc}（路由：${ROUTE_PREFIX}/${t.id}）`,
              ),
            ),
          ),
          React.createElement(
            "p",
            { style: { color: "#888", fontSize: 12 } },
            "提示：可通过命令 fat-tools.openTool（参数为工具 id）从任意位置快速打开指定工具。",
          ),
        ),
    }),
  );

  // 9. 仪表盘块类型：迷你计算器卡片（tools 分类 + 内联 SVG 图标）
  safeRegister("blockType:calcCard", () =>
    sdk.contributions.registerBlockType({
      type: "fat-tools.calcCard",
      title: "计算器",
      iconUrl: CALCULATOR_ICON_URL,
      category: "tools",
      index: 1,
      defaultSize: { w: 4, h: 10, minW: 3, minH: 8 },
      render: () => React.createElement(CalculatorTool, { compact: true }),
    }),
  );

  // 9.5 「其他」分类：工具卡片（在一张卡片内嵌工具并切换）
  safeRegister("blockType:toolSwitcher", () =>
    sdk.contributions.registerBlockType({
      type: "fat-tools.toolSwitcher",
      title: "工具",
      iconUrl: TOOL_SWITCHER_ICON_URL,
      category: "other",
      index: 2,
      defaultSize: { w: 6, h: 24, minW: 4, minH: 8 },
      // 新建卡片写入 options 的默认值（宿主会深拷贝）
      defaultOptions: {
        toolSwitcher: {
          tools: ["calculator", "json", "timestamp", "uuid"],
          defaultTool: "calculator",
          showSwitch: true,
          switchStyle: "segmented",
          switchPosition: "top",
        },
      },
      render: (props) =>
        React.createElement(ToolSwitcherBlock, {
          config: props.config,
          inConfig: props.inConfig,
          sdk,
        }),
    }),
  );

  // 9.6 工具卡片的显示配置面板（组件配置抽屉 > 显示配置）
  safeRegister("blockDisplayConfig:toolSwitcher", () =>
    sdk.contributions.registerBlockDisplayConfig({
      id: "fat-tools.toolSwitcher.config",
      blockType: "fat-tools.toolSwitcher",
      render: () => React.createElement(ToolSwitcherDisplayConfig, { sdk }),
    }),
  );

  // 10. 本插件页激活时隐藏右侧次侧栏与底部面板，让工作区更宽（参考 fat-stock）
  const ACTIVITY_KEY = `bespoke:${ACTIVITY_ID}`;
  const selectActivityMenuKey = (state: unknown): string | undefined => {
    if (state && typeof state === "object") {
      const frame = (state as { frame?: unknown }).frame;
      if (frame && typeof frame === "object") {
        const key = (frame as { activityMenuKey?: unknown }).activityMenuKey;
        if (typeof key === "string") return key;
      }
    }
    return undefined;
  };

  let hideSecondaryDisposable: Disposable | null = null;
  let hidePanelDisposable: Disposable | null = null;
  const syncHide = (activeKey: string | undefined): void => {
    const shouldHide = activeKey === ACTIVITY_KEY;
    if (shouldHide) {
      if (
        !hideSecondaryDisposable &&
        typeof sdk.contributions.registerHideSecondarySidebar === "function"
      ) {
        hideSecondaryDisposable =
          sdk.contributions.registerHideSecondarySidebar();
      }
      if (
        !hidePanelDisposable &&
        typeof sdk.contributions.registerHidePanel === "function"
      ) {
        hidePanelDisposable = sdk.contributions.registerHidePanel();
      }
    } else {
      hideSecondaryDisposable?.dispose();
      hideSecondaryDisposable = null;
      hidePanelDisposable?.dispose();
      hidePanelDisposable = null;
    }
  };

  try {
    syncHide(sdk.store.select(selectActivityMenuKey));
    disposables.push(
      sdk.store.subscribe(selectActivityMenuKey, (nextKey) =>
        syncHide(nextKey),
      ),
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[fat-tools] 注册布局联动失败：", e);
  }
  disposables.push({
    dispose() {
      hideSecondaryDisposable?.dispose();
      hideSecondaryDisposable = null;
      hidePanelDisposable?.dispose();
      hidePanelDisposable = null;
    },
  });

  // 首次激活时确保路由有值（工作区直接可用）
  try {
    if (!toolIdToPath(sdk.router.getCurrent().path)) {
      const preferred = getPreferredToolId();
      const landing =
        (preferred && toolIdToPath(preferred)) || getDefaultRoute();
      sdk.router.navigate(landing);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[fat-tools] 初始化路由失败：", e);
  }
}

export function deactivate(): void {
  while (disposables.length) {
    try {
      disposables.pop()?.dispose();
    } catch (e) {
      // deactivate() 绝不能抛异常
      // eslint-disable-next-line no-console
      console.warn("[fat-tools] dispose error", e);
    }
  }
}
