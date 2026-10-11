/*
 * 工具历史记录面板（通用）
 *
 * 每个工具页底部展示本工具最近的落库记录，
 * 点击任一条记录可通过 onRestore 把历史输入值恢复到当前输入框。
 */
import React, { useCallback, useEffect, useState } from "react";
import { Button, Empty, Popconfirm, Spin, Tag, Tooltip, Typography } from "antd";
import { ClearOutlined, HistoryOutlined, ReloadOutlined } from "@ant-design/icons";
import { clearHistory, listHistory, type HistoryRecord } from "../historyClient";

const { Text } = Typography;

/** action → 标签色，让不同动作一眼可辨 */
const ACTION_COLOR: Record<string, string> = {
  text: "blue",
  file: "geekblue",
  hash: "purple",
  encode: "cyan",
  decode: "cyan",
  calculate: "green",
  format: "orange",
  parse: "volcano",
  convert: "gold",
  generate: "magenta",
};

/** 取 action 的展示色，未收录的用默认蓝 */
function actionColor(action: string): string {
  return ACTION_COLOR[String(action || "").toLowerCase()] || "blue";
}

interface Props {
  toolId: string;
  toolTitle: string;
  /** 点击历史记录时的恢复回调（detail 含当时的完整输入） */
  onRestore: (detail: Record<string, unknown>, record: HistoryRecord) => void;
  limit?: number;
  /** 变化时重新加载（如刚产生新记录） */
  reloadKey?: number;
}

/** 相对时间显示 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return iso.slice(0, 16).replace("T", " ");
}

const ToolHistoryPanel: React.FC<Props> = ({ toolId, toolTitle, onRestore, limit = 15, reloadKey = 0 }) => {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listHistory({ toolId, limit })
      .then((r) => {
        setItems(r.items);
        setExpanded(r.items.length > 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [toolId, limit]);

  useEffect(load, [load, reloadKey]);

  if (!loading && items.length === 0) return null; // 无历史时不占空间

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid rgba(128,128,128,0.25)",
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 22,
          flexWrap: "wrap",
          rowGap: 4,
          marginBottom: expanded ? 8 : 0,
        }}
      >
        {/* 固定尺寸容器：避免 MF 宿主下 icon 基础样式缺失导致 svg 撑破行高、压到文字上 */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            flexShrink: 0,
            opacity: 0.65,
          }}
        >
          <HistoryOutlined style={{ fontSize: 14, lineHeight: 1 }} />
        </span>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: "20px", whiteSpace: "nowrap" }}>
          {toolTitle} · 历史记录（已落库 {items.length} 条，点击可恢复输入）
        </Text>
        <div style={{ flex: 1 }} />
        <Tooltip title="刷新">
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={load} />
        </Tooltip>
        <Popconfirm
          title={`清空「${toolTitle}」的全部历史记录？`}
          okText="清空"
          cancelText="取消"
          onConfirm={() => {
            void clearHistory(toolId).then(load);
          }}
        >
          <Button size="small" type="text" danger icon={<ClearOutlined />} />
        </Popconfirm>
        <Button size="small" type="text" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "收起" : "展开"}
        </Button>
      </div>

      {expanded ? (
        <Spin spinning={loading} size="small">
          {items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
          ) : (
            <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 4, marginTop: 2 }}>
              {items.map((rec, i) => (
                <div
                  key={rec.id}
                  onClick={() => onRestore(rec.detail || {}, rec)}
                  title="点击恢复当时的输入值"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: i % 2 === 0 ? "rgba(128,128,128,0.06)" : "transparent",
                    borderLeft: `2px solid ${i % 2 === 0 ? "rgba(22,119,255,0.45)" : "transparent"}`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(22,119,255,0.12)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = i % 2 === 0 ? "rgba(128,128,128,0.06)" : "transparent")
                  }
                >
                  <Tag
                    color={actionColor(rec.action)}
                    variant="filled"
                    style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px", flexShrink: 0 }}
                  >
                    {rec.action}
                  </Tag>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {rec.summary}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                    {relativeTime(rec.createdAt)}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </Spin>
      ) : null}
    </div>
  );
};

export default ToolHistoryPanel;
