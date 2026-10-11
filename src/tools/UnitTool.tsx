/*
 * 单位换算：长度 / 面积 / 质量 / 体积 / 数据 / 时间 / 速度 / 温度
 */
import React, { useMemo, useState } from "react";
import { Input, Select, Space, Typography } from "antd";
import { convertUnit, UNIT_CATEGORIES } from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

type ConvResult = { ok: true; value: number } | { ok: false; error: string };

/** 数值格式化：避免浮点尾数过长，极大/极小值转科学计数法 */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(6);
  return parseFloat(n.toPrecision(12)).toString();
}

const UnitTool: React.FC<Props> = ({ onBack }) => {
  const [categoryId, setCategoryId] = useState("length");
  const [fromId, setFromId] = useState("m");
  const [toId, setToId] = useState("cm");
  const [valueStr, setValueStr] = useState("1");

  const category = useMemo(
    () => UNIT_CATEGORIES.find((c) => c.id === categoryId) || UNIT_CATEGORIES[0],
    [categoryId],
  );

  const value = Number(valueStr);
  const valid = valueStr.trim() !== "" && Number.isFinite(value);

  const result = useMemo<ConvResult | null>(() => {
    if (!valid) return null;
    try {
      return { ok: true, value: convertUnit(categoryId, fromId, toId, value) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [categoryId, fromId, toId, value, valid]);

  const switchCategory = (id: string) => {
    const cat = UNIT_CATEGORIES.find((c) => c.id === id)!;
    setCategoryId(id);
    setFromId(cat.units[0].id);
    setToId(cat.units[1]?.id || cat.units[0].id);
  };

  React.useEffect(() => {
    recordUsageDebounced(
      "unit",
      () =>
        valid
          ? {
              toolId: "unit",
              toolTitle: "单位换算",
              action: "convert",
              summary: `${valueStr}${category.units.find((u) => u.id === fromId)?.name ?? ""} → ${category.units.find((u) => u.id === toId)?.name ?? ""}`,
              detail: { categoryId, fromId, toId, value: valueStr },
            }
          : null,
      2000,
    );
  }, [categoryId, fromId, toId, valueStr, valid, category]);

  return (
    <ToolShell title="单位换算" onBack={onBack}>
      <Space size={10} wrap style={{ marginBottom: 14 }}>
        <Select
          style={{ width: 130 }}
          value={categoryId}
          onChange={switchCategory}
          options={UNIT_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          style={{ width: 180 }}
          value={fromId}
          onChange={setFromId}
          options={category.units.map((u) => ({ value: u.id, label: u.name }))}
        />
        <Input
          value={valueStr}
          onChange={(e) => setValueStr(e.target.value)}
          style={{ width: 140, fontFamily: "monospace" }}
          status={!valid && valueStr.trim() !== "" ? "error" : undefined}
        />
        <Text type="secondary">→</Text>
        <Select
          style={{ width: 180 }}
          value={toId}
          onChange={setToId}
          options={category.units.map((u) => ({ value: u.id, label: u.name }))}
        />
      </Space>

      {result && result.ok ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(22,119,255,0.08)",
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: 600, fontFamily: "monospace" }}>
              {valueStr} {category.units.find((u) => u.id === fromId)?.name} = {fmt(result.value)}{" "}
              {category.units.find((u) => u.id === toId)?.name}
            </Text>
            <CopyButton text={fmt(result.value)} label="复制结果" />
          </div>

          <Text type="secondary" style={{ fontSize: 12 }}>
            换算为同一类别的其它单位
          </Text>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 6,
              marginTop: 6,
            }}
          >
            {category.units.map((u) => (
              <StatRow
                key={u.id}
                label={u.name}
                value={fmt(convertUnit(categoryId, fromId, u.id, value))}
                copyable
              />
            ))}
          </div>
        </>
      ) : result && !result.ok ? (
        <div style={{ color: "#cf1322" }}>{result.error}</div>
      ) : (
        <Text type="secondary">输入数值后自动换算</Text>
      )}

      <ToolHistoryPanel
        toolId="unit"
        toolTitle="单位换算"
        onRestore={(d) => {
          suppressNextRecord("unit");
          if (typeof d.categoryId === "string") setCategoryId(d.categoryId);
          if (typeof d.fromId === "string") setFromId(d.fromId);
          if (typeof d.toId === "string") setToId(d.toId);
          if (typeof d.value === "string") setValueStr(d.value);
        }}
      />
    </ToolShell>
  );
};

export default UnitTool;
