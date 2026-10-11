/*
 * 工具卡片（仪表盘块类型 fat-tools.toolSwitcher）
 *
 * 在一张仪表盘卡片内嵌渲染 fat-tools 的任意工具，并通过顶栏/底栏的
 * 切换按钮（按钮组或下拉框）在多个工具间切换：
 *   - options.toolSwitcher.tools      参与切换的工具 id 列表
 *   - options.toolSwitcher.defaultTool 默认展示的工具
 *   - options.toolSwitcher.showSwitch  是否展示切换按钮（配置面板可配）
 *   - options.toolSwitcher.switchStyle 切换控件样式：segmented | select
 *   - options.toolSwitcher.switchPosition 切换按钮位置：top | bottom
 *
 * config 由宿主注入（Block.Item.options，见 PluginSlot.BlockTypeSlot），
 * 外框（背景色/标题/圆角/边框/内边距）由宿主 BlockFrame 按
 * commonOptions 渲染，本组件只负责内容区。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Empty, Segmented, Select, Tooltip } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { TOOLS, ToolDef } from "./registry";
import { recordUsage } from "../historyClient";
import { toolIdToPath } from "../routes";
import { setPreferredToolId } from "../preferences";

/** 卡片私有配置（options.toolSwitcher） */
export interface ToolSwitcherConf {
  /** 参与切换的工具 id 列表；为空时回退为全部工具 */
  tools?: string[];
  /** 默认展示的工具 id */
  defaultTool?: string;
  /** 是否展示切换按钮 */
  showSwitch?: boolean;
  /** 切换控件样式：segmented 按钮组（默认）| select 下拉框 */
  switchStyle?: "segmented" | "select";
  /** 切换按钮位置：top 顶部（默认）| bottom 底部 */
  switchPosition?: "top" | "bottom";
}

/** 从宿主注入的 config（Block.Item.options）中收窄私有配置 */
export function normalizeToolSwitcherConf(config: unknown): ToolSwitcherConf {
  const conf = (
    config as { toolSwitcher?: ToolSwitcherConf } | null | undefined
  )?.toolSwitcher;
  return conf && typeof conf === "object" ? conf : {};
}

interface Props {
  /** 宿主注入的 Block.Item.options */
  config?: unknown;
  /** 是否渲染在配置抽屉预览中 */
  inConfig?: boolean;
  /** 用于「在工具箱中打开」跳转 */
  sdk?: FatNotesPluginSDK;
}

/**
 * 工具箱活动栏项对应的宿主活动菜单 key。
 * 必须与 index.tsx 的 ACTIVITY_ID（"fat-tools.main"）保持一致：
 * 宿主 Workbench 用 `bespoke:<活动栏项id>` 匹配工作台页 id。
 */
const TOOLBOX_ACTIVITY_MENU_KEY = "bespoke:fat-tools.main";

const ToolSwitcherBlock: React.FC<Props> = ({ config, sdk }) => {
  const conf = normalizeToolSwitcherConf(config);
  // 宿主 redux（插件与宿主共享 react-redux 单例，同 DisplayConfig 面板机制）
  const dispatch = useDispatch<
    (action: { type: string; payload?: unknown }) => unknown
  >();

  // 参与切换的工具（过滤掉已下线的 id；配置为空时回退全部）
  const available = useMemo<ToolDef[]>(() => {
    const ids =
      Array.isArray(conf.tools) && conf.tools.length
        ? conf.tools
        : TOOLS.map((t) => t.id);
    return ids
      .map((id) => TOOLS.find((t) => t.id === id))
      .filter((t): t is ToolDef => !!t);
  }, [conf.tools]);

  // 默认工具：配置值失效时回退第一个
  const initialId = useMemo(() => {
    if (conf.defaultTool && available.some((t) => t.id === conf.defaultTool)) {
      return conf.defaultTool;
    }
    return available[0]?.id;
  }, [conf.defaultTool, available]);

  const [activeId, setActiveId] = useState<string | undefined>(initialId);

  // 配置面板里改了工具集/默认工具后，让卡片回到默认工具
  useEffect(() => {
    setActiveId(initialId);
  }, [initialId]);

  const active = available.find((t) => t.id === activeId) || available[0];

  const switchTo = (id: string) => {
    setActiveId(id);
    const tool = available.find((t) => t.id === id);
    if (tool) {
      recordUsage({
        toolId: "tool-switcher",
        toolTitle: "工具",
        action: "switch",
        summary: `切换到「${tool.title}」`,
        detail: { toolId: id },
      });
    }
  };

  const renderSwitchBar = (): React.ReactNode => {
    if (!available.length) return null;
    if (conf.switchStyle === "select") {
      return (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={active?.id}
          onChange={(v) => switchTo(v as string)}
          options={available.map((t) => ({ value: t.id, label: t.title }))}
        />
      );
    }
    return (
      <Segmented
        block
        size="small"
        value={active?.id}
        onChange={(v) => switchTo(v as string)}
        options={available.map((t) => ({
          value: t.id,
          // title 会落到 .ant-segmented-item-label 的原生 title 上（超长时悬停可见全名）
          title: t.title,
          // 直接用字符串，交给 antd 自己的 label 渲染（.ant-segmented-item-label
          // 自带 nowrap + ellipsis）。
          // 不要在 label 里再包一层 inline-block + overflow:hidden 的 span：
          // 那层会改变基线（以底边为基线），把行盒撑高，
          // 结果 tab 文字整体上移 ~3px，看起来"不居中"。
          label: t.title,
        }))}
      />
    );
  };

  const renderBody = (): React.ReactNode => {
    if (!active) {
      return (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未配置工具"
          />
        </div>
      );
    }
    const Active = active.component;
    return (
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingTop: 8 }}>
        <Active />
      </div>
    );
  };

  const showBar = conf.showSwitch !== false && available.length > 1;
  const barOnTop = conf.switchPosition !== "bottom";

  const barNode = showBar ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{renderSwitchBar()}</div>
      {sdk && active ? (
        <Tooltip title="在工具箱中打开">
          <Button
            size="small"
            type="text"
            icon={<ExportOutlined />}
            onClick={() => {
              const path = toolIdToPath(active.id);
              if (!path) return;
              // 1) 切换宿主活动栏到工具箱（关键！）：
              //    sdk.router 是宿主的纯内存路由（registry.routerNavigate），
              //    只改历史栈并通知订阅者，不会切换宿主活动项。仪表盘页面上
              //    工作台页未挂载，单走 navigate() 路由变了但界面毫无反应。
              //    这里直接 dispatch 宿主 frameSlice 的 onActiveMenu
              //    （与宿主 ActivityBar 点击行为一致）把右侧切到工作台页。
              //    非宿主环境（如独立 dev shell，无 redux Provider）时忽略。
              try {
                dispatch({
                  type: "frame/onActiveMenu",
                  payload: TOOLBOX_ACTIVITY_MENU_KEY,
                });
              } catch {
                /* ignore */
              }
              // 2) 再走路由导航，工作台页挂载后按 path 渲染对应工具
              //    （WorkPageView 挂载时若 path 已是本插件路由则原样保留）。
              sdk.router.navigate(path);
              // 3) 与 fat-tools.openTool 命令行为一致：记忆为下次默认工具
              setPreferredToolId(active.id);
            }}
          />
        </Tooltip>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {barNode && barOnTop ? barNode : null}
      {renderBody()}
      {barNode && !barOnTop ? barNode : null}
    </div>
  );
};

export default ToolSwitcherBlock;
