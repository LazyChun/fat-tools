/*
 * 待办清单：轻量任务列表，localStorage 持久化，操作同步写入全局操作记录
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Empty, Input, Popconfirm, Segmented, Space, Tag, Typography } from "antd";
import { ClearOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

const LS_KEY = "fat-tools.todos";

function loadTodos(): Todo[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.text === "string")
      .map((t) => ({
        id: String(t.id ?? `${Date.now()}-${Math.random()}`),
        text: String(t.text),
        done: t.done === true,
        createdAt: Number(t.createdAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

type Filter = "all" | "active" | "done";

const TodoTool: React.FC<Props> = ({ onBack }) => {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(todos));
    } catch {
      /* ignore */
    }
  }, [todos]);

  const add = () => {
    const text = input.trim();
    if (!text) return;
    setTodos((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, done: false, createdAt: Date.now() },
      ...prev,
    ]);
    setInput("");
    recordUsage({
      toolId: "todo",
      toolTitle: "待办清单",
      action: "add",
      summary: `新增待办：${text.slice(0, 40)}`,
      detail: { text },
    });
  };

  const toggle = (id: string) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const remove = (id: string) => setTodos((prev) => prev.filter((t) => t.id !== id));

  const shown = useMemo(() => {
    if (filter === "active") return todos.filter((t) => !t.done);
    if (filter === "done") return todos.filter((t) => t.done);
    return todos;
  }, [todos, filter]);

  const activeCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - activeCount;

  const clearCompleted = () => {
    setTodos((prev) => prev.filter((t) => !t.done));
    recordUsage({
      toolId: "todo",
      toolTitle: "待办清单",
      action: "clear-done",
      summary: `清除 ${doneCount} 条已完成待办`,
    });
  };

  return (
    <ToolShell title="待办清单" onBack={onBack}>
      <Space.Compact style={{ width: "100%", marginBottom: 10 }}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={add}
          placeholder="添加一条待办，回车确认…"
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={add}>
          添加
        </Button>
      </Space.Compact>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: `全部 ${todos.length}` },
            { value: "active", label: `未完成 ${activeCount}` },
            { value: "done", label: `已完成 ${doneCount}` },
          ]}
        />
        <div style={{ flex: 1 }} />
        <Popconfirm
          title={`清除 ${doneCount} 条已完成待办？`}
          okText="清除"
          cancelText="取消"
          disabled={doneCount === 0}
          onConfirm={clearCompleted}
        >
          <Button size="small" danger icon={<ClearOutlined />} disabled={doneCount === 0}>
            清除已完成
          </Button>
        </Popconfirm>
      </div>

      {shown.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={todos.length === 0 ? "暂无待办，添加一条吧" : "当前筛选下没有待办"}
        />
      ) : (
        <div style={{ display: "grid", gap: 4, maxHeight: "calc(100% - 120px)", overflow: "auto" }}>
          {shown.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: "rgba(128,128,128,0.08)",
              }}
            >
              <Checkbox checked={t.done} onChange={() => toggle(t.id)} />
              <Text
                style={{
                  flex: 1,
                  minWidth: 0,
                  textDecoration: t.done ? "line-through" : "none",
                  opacity: t.done ? 0.55 : 1,
                  wordBreak: "break-all",
                }}
              >
                {t.text}
              </Text>
              <Tag bordered={false} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                {new Date(t.createdAt).toLocaleDateString()}
              </Tag>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => remove(t.id)}
              />
            </div>
          ))}
        </div>
      )}

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 10 }}>
        数据保存在本地（localStorage），无需后端；新增 / 清除操作会写入全局操作记录。
      </Text>
    </ToolShell>
  );
};

export default TodoTool;
