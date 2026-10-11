/*
 * MenuView：主侧边栏（次面板）—— 工具卡片列表（菜单）
 *
 * 点击卡片 → sdk.router.navigate("/tools/<toolId>")，
 * 真正的工具界面由工作台页 WorkPageView 在右侧工作区渲染。
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Empty, Input, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { TOOLS, type ToolDef } from "./tools/registry";
import { pathToToolId, toolIdToPath } from "./routes";
import { getPreferredToolId, setPreferredToolId } from "./preferences";
import { matchPinyin } from "./utils";
import ThemeShell from "./ThemeShell";
import styles from "./MenuView.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

const MenuView: React.FC<Props> = ({ sdk }) => {
  const [query, setQuery] = useState("");
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // 订阅路由变化：卡片高亮跟随右侧工作区当前页
  useEffect(() => {
    const d = sdk.router.onChange(() => forceUpdate());
    return () => d.dispose();
  }, [sdk]);

  const currentPath = sdk.router.getCurrent().path;
  const currentToolId = pathToToolId(currentPath) ?? getPreferredToolId();

  const openTool = useCallback(
    (toolId: string) => {
      const path = toolIdToPath(toolId);
      if (!path) return;
      setPreferredToolId(toolId);
      sdk.router.navigate(path);
    },
    [sdk],
  );

  // 首次进入且未选中任何工具时，卡片仍高亮记忆中的工具；
  // 实际的兜底导航由右侧 WorkPageView 负责（避免两处同时导航）。
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) =>
        matchPinyin(t.title, q) ||
        matchPinyin(t.desc, q) ||
        matchPinyin(t.category, q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <ThemeShell sdk={sdk} padding={10}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索工具..."
            allowClear
            size="small"
            className={styles.menuSearch}
          />
          <div className={styles.searchMeta}>共 {TOOLS.length} 个工具</div>
        </div>

        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {filtered.length === 0 ? (
            <Empty
              description="没有匹配的工具"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 8,
                alignContent: "start",
                paddingBottom: 8,
              }}
            >
              {filtered.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  active={tool.id === currentToolId}
                  onOpen={() => openTool(tool.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ThemeShell>
  );
};

/** 工具卡片（选中态蓝框高亮） */
const ToolCard: React.FC<{
  tool: ToolDef;
  active: boolean;
  onOpen: () => void;
}> = ({ tool, active, onOpen }) => {
  const Icon = tool.icon;
  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 12px 10px",
        borderRadius: 10,
        border: `1px solid ${active ? "rgba(22,119,255,0.65)" : "rgba(128,128,128,0.25)"}`,
        background: active ? "rgba(22,119,255,0.08)" : "rgba(128,128,128,0.05)",
        cursor: "pointer",
        userSelect: "none",
        boxShadow: active ? "0 2px 10px rgba(22,119,255,0.18)" : "none",
        transition:
          "transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "rgba(22,119,255,0.55)";
          e.currentTarget.style.boxShadow = "0 2px 10px rgba(22,119,255,0.18)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "rgba(128,128,128,0.25)";
          e.currentTarget.style.boxShadow = "none";
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon style={{ fontSize: 18, color: active ? "#1677ff" : "#1677ff" }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{tool.title}</span>
      </div>
      <span
        style={{
          fontSize: 12,
          opacity: 0.65,
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {tool.desc}
      </span>
      <Tag
        style={{
          alignSelf: "flex-start",
          margin: 0,
          fontSize: 11,
          lineHeight: "16px",
        }}
      >
        {tool.category}
      </Tag>
    </div>
  );
};

export default MenuView;
