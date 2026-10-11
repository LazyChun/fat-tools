/*
 * 元素周期表：按标准布局渲染 118 个元素，支持搜索 / 分类高亮 /
 * 点击查看详情（电子排布、相对原子质量等）。
 */
import React, { useMemo, useState } from "react";
import { Drawer, Input, Space, Tag, Typography } from "antd";
import {
  ELEMENTS,
  ELEMENT_CATEGORIES,
  searchElements,
  type ChemElement,
  type ElementCategory,
} from "./periodicData";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const CELL_W = 46;
const CELL_H = 46;
const GAP = 3;
const MAX_ROW = 10; // 7 主行 + 空行 + 2 附加行

const PeriodicTableTool: React.FC<Props> = ({ onBack }) => {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ChemElement | null>(null);
  const [highlight, setHighlight] = useState<ElementCategory | null>(null);

  const matched = useMemo(() => searchElements(query), [query]);
  const matchedSet = useMemo(() => new Set(matched.map((e) => e.z)), [matched]);

  const open = (el: ChemElement) => {
    setActive(el);
    recordUsage({
      toolId: "periodic",
      toolTitle: "元素周期表",
      action: "view",
      summary: `查看元素：${el.z} ${el.sym} ${el.cn}`,
      detail: { z: el.z, sym: el.sym, cn: el.cn, en: el.en, mass: el.mass, config: el.config },
    });
  };

  const gridWidth = 18 * (CELL_W + GAP);
  const gridHeight = MAX_ROW * (CELL_H + GAP);

  return (
    <ToolShell
      title="元素周期表"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Input.Search
            size="small"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索：名称 / 符号 / 序数"
            style={{ width: 220 }}
          />
        </Space>
      }
    >
      {/* 分类图例 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {Object.entries(ELEMENT_CATEGORIES).map(([key, v]) => (
          <Tag
            key={key}
            onClick={() => setHighlight((h) => (h === key ? null : (key as ElementCategory)))}
            style={{
              cursor: "pointer",
              background: v.color,
              color: "#1a1a1a",
              border: highlight === key ? "2px solid #1677ff" : "1px solid rgba(0,0,0,0.12)",
              marginInlineEnd: 0,
            }}
          >
            {v.label}
          </Tag>
        ))}
        {highlight ? (
          <Tag
            onClick={() => setHighlight(null)}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
          >
            清除高亮 ✕
          </Tag>
        ) : null}
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div
          style={{
            position: "relative",
            width: gridWidth,
            height: gridHeight,
            minWidth: gridWidth,
          }}
        >
          {/* 主表 + 镧系/锕系单元格 */}
          {ELEMENTS.map((el) => {
            const dim = query !== "" && !matchedSet.has(el.z);
            const highlighted = highlight !== null && el.cat === highlight;
            const isMatch = query !== "" && matchedSet.has(el.z);
            return (
              <div
                key={el.z}
                onClick={() => open(el)}
                title={`${el.z} ${el.sym} ${el.cn} · ${ELEMENT_CATEGORIES[el.cat].label}`}
                style={{
                  position: "absolute",
                  left: (el.col - 1) * (CELL_W + GAP),
                  top: (el.row - 1) * (CELL_H + GAP),
                  width: CELL_W,
                  height: CELL_H,
                  borderRadius: 6,
                  background: ELEMENT_CATEGORIES[el.cat].color,
                  opacity: dim ? 0.22 : 1,
                  outline: isMatch ? "2px solid #1677ff" : highlight === el.cat ? "2px solid #1677ff" : "1px solid rgba(0,0,0,0.12)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1a1a1a",
                  userSelect: "none",
                  transition: "transform 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <span style={{ fontSize: 9, lineHeight: "10px", opacity: 0.7 }}>{el.z}</span>
                <span style={{ fontSize: 15, fontWeight: 700, lineHeight: "16px" }}>{el.sym}</span>
                <span style={{ fontSize: 10, lineHeight: "12px" }}>{el.cn}</span>
              </div>
            );
          })}

          {/* 镧系 / 锕系占位提示 */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 5 * (CELL_H + GAP),
              width: CELL_W,
              height: CELL_H * 2 + GAP,
              borderRadius: 6,
              border: "1px dashed rgba(128,128,128,0.5)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "#888",
            }}
          >
            <span>57-71</span>
            <span>89-103</span>
          </div>
        </div>
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
        共 118 种元素 · 点击任意单元格查看详情；点击上方分类标签可高亮同类元素（数据：IUPAC 标准原子量）。
      </Text>

      {/* 详情抽屉 */}
      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        width={360}
        title={active ? `${active.z} · ${active.sym} · ${active.cn}` : ""}
      >
        {active ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 12,
                borderRadius: 8,
                background: ELEMENT_CATEGORIES[active.cat].color,
                color: "#1a1a1a",
              }}
            >
              <div style={{ textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{active.sym}</div>
                <div style={{ fontSize: 12 }}>{active.z}</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{active.cn}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{active.en}</div>
                <Tag style={{ marginTop: 6, marginInlineEnd: 0 }} bordered={false}>
                  {ELEMENT_CATEGORIES[active.cat].label}
                </Tag>
              </div>
            </div>
            <StatRow label="原子序数" value={active.z} copyable />
            <StatRow label="元素符号" value={active.sym} copyable />
            <StatRow label="中文名称" value={active.cn} copyable />
            <StatRow label="英文名称" value={active.en} copyable />
            <StatRow label="相对原子质量" value={active.mass} copyable />
            <StatRow label="周期" value={active.period} />
            <StatRow label="族" value={active.group === 0 ? "镧系/锕系" : `第 ${active.group} 族`} />
            <StatRow label="电子排布" value={active.config} copyable />
            <div style={{ marginTop: 6 }}>
              <CopyButton text={`${active.z} ${active.sym} ${active.cn} ${active.en} ${active.mass}`} label="复制摘要" />
            </div>
          </div>
        ) : null}
      </Drawer>

      <ToolHistoryPanel
        toolId="periodic"
        toolTitle="元素周期表"
        onRestore={(d) => {
          if (typeof d.z === "number") {
            const el = ELEMENTS.find((e) => e.z === d.z);
            if (el) setActive(el);
          }
        }}
      />
    </ToolShell>
  );
};

export default PeriodicTableTool;
