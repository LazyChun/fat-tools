/*
 * 操作记录工具：查看所有工具的操作历史（专用 SQLite 落库）
 */
import React, { useCallback, useEffect, useState } from "react";
import { Button, Empty, Select, Space, Spin, Tag, Tooltip, Typography } from "antd";
import { ClearOutlined, DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { getSdk, clearHistory, getDbPath, historyStats, listHistory, type HistoryRecord, type HistoryStats } from "../historyClient";
import { toolIdToPath } from "../routes";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const PAGE_SIZE = 50;

const HistoryTool: React.FC<Props> = ({ onBack }) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stat, path] = await Promise.all([
        listHistory({ toolId: filter, limit: PAGE_SIZE }),
        historyStats(),
        getDbPath(),
      ]);
      setRecords(list.items);
      setTotal(list.total);
      setStats(stat);
      setDbPath(path);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doClear = async () => {
    await clearHistory(filter);
    void refresh();
  };

  return (
    <ToolShell
      title="操作记录"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Select
            size="small"
            allowClear
            placeholder="按工具过滤"
            style={{ minWidth: 140 }}
            value={filter}
            onChange={(v) => setFilter(v)}
            options={(stats?.items || []).map((s) => ({
              value: s.toolId,
              label: `${s.toolTitle}（${s.count}）`,
            }))}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void refresh()}>
            刷新
          </Button>
          <Tooltip title={filter ? `清空当前过滤工具的记录` : "清空全部记录"}>
            <Button size="small" danger icon={<ClearOutlined />} onClick={() => void doClear()}>
              清空
            </Button>
          </Tooltip>
        </Space>
      }
    >
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Tag icon={<DatabaseOutlined />} color="blue">
          共 {stats?.total ?? total} 条记录
        </Tag>
        {dbPath ? (
          <Tooltip title={dbPath}>
            <Text type="secondary" code style={{ fontSize: 11, maxWidth: 420 }} ellipsis>
              {dbPath}
            </Text>
          </Tooltip>
        ) : (
          <Tag>后端未启用，暂存于 localStorage</Tag>
        )}
      </div>

      <Spin spinning={loading}>
        {records.length === 0 ? (
          <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {records.map((r) => (
              <div
                key={`${r.id}-${r.createdAt}`}
                onClick={() => {
                  const sdk = getSdk();
                  const path = toolIdToPath(r.toolId);
                  if (sdk && path) sdk.router.navigate(path);
                }}
                title={toolIdToPath(r.toolId) ? "点击打开对应工具" : undefined}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: "rgba(128,128,128,0.07)",
                  cursor: toolIdToPath(r.toolId) ? "pointer" : "default",
                }}
              >
                <Text type="secondary" style={{ flexShrink: 0, fontSize: 12 }}>
                  {(r.createdAt || "").replace("T", " ").slice(0, 19)}
                </Text>
                <Tag style={{ flexShrink: 0, margin: 0 }} color="geekblue">
                  {r.toolTitle}
                </Tag>
                <Text style={{ fontSize: 13, wordBreak: "break-all" }}>{r.summary}</Text>
              </div>
            ))}
          </div>
        )}
      </Spin>

      {records.length >= PAGE_SIZE ? (
        <div style={{ marginTop: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            仅显示最近 {PAGE_SIZE} 条（共 {total} 条，更多可在 SQLite 文件中查询）
          </Text>
        </div>
      ) : null}
    </ToolShell>
  );
};

export default HistoryTool;
