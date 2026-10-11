/*
 * 进制转换工具：2/8/10/16/36 进制互转（整数）
 */
import React, { useMemo, useState } from "react";
import { Input, InputNumber, Space } from "antd";
import { convertRadix } from "../utils";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

interface Props {
  onBack?: () => void;
}

const TARGETS: Array<[string, number]> = [
  ["二进制 (2)", 2],
  ["八进制 (8)", 8],
  ["十进制 (10)", 10],
  ["十六进制 (16)", 16],
  ["三十六进制 (36)", 36],
];

const RadixTool: React.FC<Props> = ({ onBack }) => {
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(10);

  const results = useMemo(() => {
    if (!value.trim()) return null;
    try {
      return TARGETS.map(([label, base]) => ({
        label,
        value: convertRadix(value, from, base),
      }));
    } catch {
      return "error" as const;
    }
  }, [value, from]);

  // 输入停顿后把本次转换落库
  React.useEffect(() => {
    recordUsageDebounced("radix", () => {
      if (!value.trim() || !results || results === "error") return null;
      return {
        toolId: "radix",
        toolTitle: "进制转换",
        action: "convert",
        summary: `${value}（${from} 进制）→ 2/8/10/16/36 进制`,
        detail: { input: value, fromBase: from, decimal: results[2]?.value ?? "" },
      };
    }, 1500);
  }, [value, from, results]);

  return (
    <ToolShell title="进制转换" onBack={onBack}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入整数，如 255"
          style={{ width: 240, fontFamily: "monospace" }}
          status={results === "error" ? "error" : undefined}
        />
        <Space.Compact>
          <span
            style={{
              padding: "4px 11px",
              border: "1px solid rgba(128,128,128,0.35)",
              borderRadius: "6px 0 0 6px",
              display: "inline-flex",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            原进制
          </span>
          <InputNumber
            min={2}
            max={36}
            value={from}
            onChange={(v) => setFrom(v || 10)}
            style={{ width: 80 }}
          />
        </Space.Compact>
      </Space>

      {results && results !== "error" ? (
        <div style={{ display: "grid", gap: 6 }}>
          {results.map((r) => (
            <StatRow key={r.label} label={r.label} value={r.value} copyable />
          ))}
        </div>
      ) : results === "error" ? (
        <div style={{ color: "#cf1322" }}>输入与原进制不匹配，请检查（仅支持整数）</div>
      ) : null}

      <ToolHistoryPanel
        toolId="radix"
        toolTitle="进制转换"
        reloadKey={results && results !== "error" ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("radix");
          setValue(String(d.input ?? ""));
          const base = Number(d.fromBase);
          setFrom(base >= 2 && base <= 36 ? base : 10);
        }}
      />
    </ToolShell>
  );
};

export default RadixTool;
