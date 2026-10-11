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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: expanded ? 6 : 0 }}>
        <HistoryOutlined style={{ opacity: 0.6 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
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
            <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 2 }}>
              {items.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => onRestore(rec.detail || {}, rec)}
                  title="点击恢复当时的输入值"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 6px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(22,119,255,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Tag style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px" }} bordered={false}>
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
