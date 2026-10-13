/*
 * 计算器工具：表达式输入 + 键盘，递归下降解析（无 eval）
 *
 * 历史记录落库（专用 SQLite，经后端 history.* handlers），
 * 每次成功计算写入一条记录，进入工具时回读最近 20 条。
 */
import React, { useCallback, useEffect, useState } from "react";
import { Button, Input, Radio, Space, Tag, Typography } from "antd";
import { evaluateExpression } from "../utils";
import { StatRow, ToolShell } from "../components/Common";
import { listHistory, recordUsage } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

const { Text } = Typography;

/**
 * 计算器的全局搜索直达喂入器：搜索命中算式即可直达并自动填入。
 * 匹配"数字/括号开头且含运算符"的完整算式（1+1、(1+2)*3、2^10），
 * 或函数调用形式（sqrt(16)、sin(pi/2)）；纯数字/纯单词/日期文本不命中
 * （日期样文本如 2026-10-13 由负向断言排除，交给时间类工具）。
 */
export const CALCULATOR_SEARCH_FEED = createToolSearchFeed(
  /^\s*(?!\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:[\d(][\d+\-*/%^().\s]*[+\-*/%^][\d+\-*/%^().\s]*\s*$|[a-z][a-z0-9]*\s*\()/,
);

interface Props {
  onBack?: () => void;
  /** 嵌入仪表盘卡片时的紧凑模式 */
  compact?: boolean;
}

const KEYS: string[][] = [
  ["7", "8", "9", "/", "sqrt("],
  ["4", "5", "6", "*", "^"],
  ["1", "2", "3", "-", "pi"],
  ["0", ".", "(", ")", "+"],
  ["max(", "min(", "abs(", "round(", "ln("],
];

interface HistoryItem {
  expr: string;
  result: string;
  angleMode: "rad" | "deg";
}

const CalculatorTool: React.FC<Props> = ({ onBack, compact }) => {
  const [expr, setExpr] = useState("");
  const [angleMode, setAngleMode] = useState<"rad" | "deg">("rad");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 全局搜索直达：挂载时登记输入 setter，并消费暂存的待填入表达式
  CALCULATOR_SEARCH_FEED.useFeedValue(setExpr);

  // 进入工具时回读落库的历史（最近 20 条）
  useEffect(() => {
    if (compact) return;
    void listHistory({ toolId: "calculator", limit: 20 })
      .then((r) => {
        const items: HistoryItem[] = [];
        for (const rec of r.items) {
          const input = String(
            (rec.detail as { input?: unknown })?.input ?? "",
          );
          const res = String(
            (rec.detail as { result?: unknown })?.result ?? "",
          );
          const mode =
            (rec.detail as { angleMode?: unknown })?.angleMode === "deg"
              ? "deg"
              : "rad";
          if (input) items.push({ expr: input, result: res, angleMode: mode });
        }
        setHistory(items);
      })
      .catch(() => undefined);
  }, [compact]);

  const evaluate = useCallback(
    (input?: string) => {
      const source = (input ?? expr).trim();
      if (!source) return;
      try {
        const value = evaluateExpression(source, { angleMode });
        const formatted = Number.isInteger(value)
          ? String(value)
          : String(Number(value.toPrecision(12)));
        setResult(formatted);
        setError("");
        setHistory((h) =>
          [{ expr: source, result: formatted, angleMode }, ...h].slice(0, 20),
        );
        recordUsage({
          toolId: "calculator",
          toolTitle: "计算器",
          action: "calculate",
          summary: `${source} = ${formatted}`,
          detail: { input: source, result: formatted, angleMode },
        });
      } catch (e) {
        setError((e as Error).message);
        setResult("");
      }
    },
    [expr, angleMode],
  );

  const press = (key: string) => {
    const next = expr + key;
    setExpr(next);
  };

  const body = (
    <>
      <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onPressEnter={() => evaluate()}
          placeholder="输入表达式，如 (1+2)*sqrt(16) 或 2^10，回车计算"
          style={{ fontFamily: "monospace" }}
          allowClear
        />
        <Button type="primary" onClick={() => evaluate()}>
          计算
        </Button>
      </Space.Compact>

      {!compact ? (
        <div style={{ marginBottom: 8 }}>
          <Radio.Group
            size="small"
            value={angleMode}
            onChange={(e) => setAngleMode(e.target.value)}
            optionType="button"
            options={[
              { label: "弧度制", value: "rad" },
              { label: "角度制", value: "deg" },
            ]}
          />
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            支持 + - * / % ^
            括号、sqrt/abs/sin/cos/tan/ln/log/round/floor/ceil/min/max/pow、pi/e、隐式乘法（2pi）
          </Text>
        </div>
      ) : null}

      {result !== "" ? (
        <div style={{ marginBottom: 8 }}>
          <StatRow label="结果" value={result} copyable />
        </div>
      ) : null}
      {error ? (
        <Tag color="error" style={{ marginBottom: 8 }}>
          {error}
        </Tag>
      ) : null}

      <div style={{ display: "grid", gap: 4, maxWidth: 360 }}>
        {KEYS.map((row, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 4,
            }}
          >
            {row.map((key) => (
              <Button
                key={key}
                size="small"
                onClick={() => press(key)}
                style={{ fontFamily: "monospace" }}
              >
                {key.replace("(", "")}
              </Button>
            ))}
          </div>
        ))}
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 4 }}
        >
          <Button
            danger
            size="small"
            onClick={() => {
              setExpr("");
              setResult("");
              setError("");
            }}
          >
            清空
          </Button>
          <Button size="small" onClick={() => setExpr((v) => v.slice(0, -1))}>
            退格
          </Button>
        </div>
      </div>

      {!compact && history.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">
            历史记录（已落库，最近 {history.length} 条）
          </Text>
          <div style={{ marginTop: 4, maxHeight: 160, overflow: "auto" }}>
            {history.map((h, i) => (
              <div
                key={i}
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: "2px 0",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setExpr(h.expr);
                  setAngleMode(h.angleMode);
                }}
                title="点击回填表达式"
              >
                {h.expr} = {h.result}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  if (compact) return <div style={{ padding: 8 }}>{body}</div>;
  return (
    <ToolShell title="计算器" onBack={onBack}>
      {body}
    </ToolShell>
  );
};

export default CalculatorTool;
