/*
 * 工具卡片 — 显示配置面板
 *
 * 渲染于宿主「组件配置抽屉 > 显示配置」内（registerBlockDisplayConfig）。
 *
 * 读写方式与宿主一致（fat-charts 同款模式）：
 *   - 插件与宿主共享 react-redux 单例，插件组件渲染在宿主 Provider 树内，
 *     可直接 useSelector/useDispatch 访问宿主 store：
 *     读 state.blockEdit.currentBlock（当前编辑中的卡片草稿）；
 *     写 dispatch "blockEdit/onUpdateEditBlock" { path, value }（lodash set 语义）。
 *   - 折叠区 / 卡片名称 / 卡片外框（背景色、标题、圆角、边框宽度、内边距）
 *     复用宿主 sdk.remoteComponents.BlockConfigCommon 公共组件，它们内部
 *     自读写 commonOptions，本面板只负责私有配置 options.toolSwitcher。
 */
import React, { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Divider, Radio, Select, Switch, Typography } from "antd";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { TOOLS } from "./registry";
import { normalizeToolSwitcherConf } from "./ToolSwitcherBlock";

// 宿主编辑中的卡片（仅使用已知的 blockEdit 片段）
interface HostBlockEditState {
  blockEdit?: {
    currentBlock?: { type?: string } & Record<string, unknown>;
  };
}

// 宿主 dispatch 类型（仅使用已知的编辑 action）
type HostDispatch = (action: { type: string; payload?: unknown }) => unknown;

interface Props {
  sdk: FatNotesPluginSDK;
}

const ToolSwitcherDisplayConfig: React.FC<Props> = ({ sdk }) => {
  const currentBlock = useSelector(
    (state: HostBlockEditState) => state.blockEdit?.currentBlock,
  );
  const dispatch = useDispatch<HostDispatch>();

  const conf = normalizeToolSwitcherConf(
    (currentBlock as { options?: unknown } | undefined)?.options,
  );

  const update = useCallback(
    (key: string, value: unknown) => {
      dispatch({
        type: "blockEdit/onUpdateEditBlock",
        payload: { path: `options.toolSwitcher.${key}`, value },
      });
    },
    [dispatch],
  );

  // 非本类型卡片时不渲染（宿主 DisplayConfig 对所有插件面板统一渲染）
  if (currentBlock?.type !== "fat-tools.toolSwitcher") {
    return null;
  }

  const selectedIds: string[] =
    Array.isArray(conf.tools) && conf.tools.length
      ? conf.tools
      : TOOLS.map((t) => t.id);
  const showSwitch = conf.showSwitch !== false;

  // 宿主公共配置组件（外框等）；独立调试等场景可能缺失，缺失时降级为纯私有配置
  const common = (
    sdk.remoteComponents as unknown as {
      BlockConfigCommon?: Record<
        string,
        React.ComponentType<Record<string, unknown>>
      >;
    }
  ).BlockConfigCommon;
  const DisplayCollapse = common?.DisplayCollapse;
  const BlockName = common?.BlockName;
  const PanelDisplay = common?.PanelDisplay;

  const section = (
    title: string,
    node: React.ReactNode,
    extra?: Record<string, unknown>,
  ): React.ReactNode =>
    DisplayCollapse ? (
      <DisplayCollapse title={title} {...(extra || {})}>
        {node}
      </DisplayCollapse>
    ) : (
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <Divider style={{ margin: "8px 0" }} />
        {node}
      </div>
    );

  const row = (
    label: string,
    control: React.ReactNode,
  ): React.ReactNode => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      }}
    >
      <Typography.Text style={{ flexShrink: 0 }}>{label}</Typography.Text>
      {control}
    </div>
  );

  const toolsSectionNode = (
    <div style={{ marginTop: 12 }}>
      {BlockName ? (
        <>
          {/* 宿主远程组件：卡片名称（读写 title/showTitle） */}
          <BlockName />
          <Divider style={{ margin: "8px 0 12px" }} />
        </>
      ) : null}
      {row(
        "参与切换的工具",
        <Select
          mode="multiple"
          allowClear
          size="small"
          style={{ minWidth: 200, maxWidth: 280 }}
          placeholder="不选时默认全部工具"
          value={Array.isArray(conf.tools) ? conf.tools : []}
          onChange={(v) => update("tools", v)}
          options={TOOLS.map((t) => ({ value: t.id, label: t.title }))}
        />,
      )}
      {row(
        "默认展示工具",
        <Select
          size="small"
          style={{ minWidth: 160, maxWidth: 280 }}
          value={conf.defaultTool || selectedIds[0]}
          onChange={(v) => update("defaultTool", v)}
          options={TOOLS.filter((t) => selectedIds.includes(t.id)).map((t) => ({
            value: t.id,
            label: t.title,
          }))}
        />,
      )}
    </div>
  );

  const styleSectionNode = (
    <div style={{ marginTop: 12 }}>
      {row(
        "展示切换按钮",
        <Switch
          size="small"
          checked={showSwitch}
          onChange={(v) => update("showSwitch", v)}
        />,
      )}
      {row(
        "切换控件样式",
        <Radio.Group
          size="small"
          value={conf.switchStyle || "segmented"}
          disabled={!showSwitch}
          onChange={(e) => update("switchStyle", e.target.value)}
          options={[
            { value: "segmented", label: "按钮组" },
            { value: "select", label: "下拉框" },
          ]}
          optionType="button"
        />,
      )}
      {row(
        "切换按钮位置",
        <Radio.Group
          size="small"
          value={conf.switchPosition || "top"}
          disabled={!showSwitch}
          onChange={(e) => update("switchPosition", e.target.value)}
          options={[
            { value: "top", label: "顶部" },
            { value: "bottom", label: "底部" },
          ]}
          optionType="button"
        />,
      )}
    </div>
  );

  return (
    <div>
      {section("工具设置", toolsSectionNode)}
      {section("样式", styleSectionNode)}
      {PanelDisplay ? (
        // 宿主远程组件：卡片外框（背景色/标题/圆角/边框/内边距）
        <PanelDisplay />
      ) : null}
    </div>
  );
};

export default ToolSwitcherDisplayConfig;
