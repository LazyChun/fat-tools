/*
 * 转盘抽签：列表式候选条目，每项可设权重（默认 1）与颜色（默认自动，不重复），
 * 点击「开始」带动画旋转，指针指向的扇区即为抽中结果。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Input, InputNumber, Space, Typography } from "antd";
import { ClearOutlined, DeleteOutlined, PlusOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { secureRandomInt } from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

interface Item {
  id: string;
  label: string;
  weight: number;
  color: string; // 空字符串表示使用默认自动色
}

/** 默认色板（与浅色/深色主题都能搭配），用户未指定颜色时按顺序不重复分配 */
const PALETTE = [
  "#5B8FF9", "#61DDAA", "#F6BD16", "#7262FD", "#78D3F8",
  "#9661BC", "#F6903D", "#008685", "#F08BB4", "#FF9D4D",
  "#7CB305", "#36CFC9", "#FAAD14", "#597EF7", "#9254DE",
];

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

type Easing = (t: number) => number;
const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

function formatColorInput(hex: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : "";
}

/** 为每个条目分配颜色：优先使用用户指定的颜色，未指定的按 PALETTE 顺序取未用过的颜色 */
function assignColors(items: Item[]): string[] {
  const used = new Set<string>();
  const autoQueue: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const color = formatColorInput(items[i].color);
    if (color) {
      used.add(color);
    } else {
      autoQueue.push(i);
    }
  }
  const result = items.map((it) => formatColorInput(it.color) || "");
  let paletteIndex = 0;
  for (const idx of autoQueue) {
    while (paletteIndex < PALETTE.length && used.has(PALETTE[paletteIndex])) {
      paletteIndex++;
    }
    const color = PALETTE[paletteIndex % PALETTE.length];
    result[idx] = color;
    used.add(color);
    paletteIndex++;
  }
  return result;
}

const DEFAULT_ITEMS: Item[] = [
  { id: "1", label: "一等奖", weight: 1, color: "" },
  { id: "2", label: "二等奖", weight: 1, color: "" },
  { id: "3", label: "三等奖", weight: 1, color: "" },
  { id: "4", label: "谢谢参与", weight: 1, color: "" },
];

const WheelTool: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [removeWinner, setRemoveWinner] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const rafRef = useRef<number | null>(null);

  const total = items.reduce((s, it) => s + it.weight, 0);
  const colors = useMemo(() => assignColors(items), [items]);

  // 每个条目对应的累计起止角（起始在 -90° 即正上方，顺时针铺开）
  const slices = useMemo(() => {
    let acc = 0;
    return items.map((it, i) => {
      const start = (acc / total) * 360;
      acc += it.weight;
      const end = (acc / total) * 360;
      return { ...it, index: i, start, end, color: colors[i] };
    });
  }, [items, total, colors]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const updateItem = (id: string, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              ...patch,
              weight: patch.weight === undefined ? it.weight : Math.max(0.0001, Number(patch.weight) || 1),
            }
          : it,
      ),
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: nextId(), label: `新条目 ${prev.length + 1}`, weight: 1, color: "" }]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearItems = () => setItems([]);

  // 按权重选中条目索引
  const pickWeighted = (): number => {
    if (items.length === 0) return -1;
    let r = (secureRandomInt(1_000_000) / 1_000_000) * total;
    for (let i = 0; i < slices.length; i++) {
      r -= slices[i].weight;
      if (r < 0) return i;
    }
    return slices.length - 1;
  };

  const spin = () => {
    if (spinning || slices.length === 0) return;
    const idx = pickWeighted();
    if (idx < 0) return;
    const slice = slices[idx];
    const mid = (slice.start + slice.end) / 2;
    const extraTurns = 5 + secureRandomInt(3);
    const targetMod = (360 - mid + 360 * 10) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 360;
    const finalRotation = rotation + extraTurns * 360 + delta;

    const start = rotation;
    const duration = 3600 + secureRandomInt(600);
    const t0 = performance.now();
    setSpinning(true);

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = easeOutCubic(t);
      setRotation(start + (finalRotation - start) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setRotation(finalRotation);
        setSpinning(false);
        rafRef.current = null;
        const winner = slice;
        setHistory((prev) => [winner.label, ...prev]);
        if (removeWinner) {
          setItems((prev) => prev.filter((it) => it.id !== winner.id));
        }
        recordUsage({
          toolId: "wheel",
          toolTitle: "转盘抽签",
          action: "spin",
          summary: `转盘抽中：${winner.label}`,
          detail: { winner: winner.label, items: items.map((i) => i.label), removeWinner },
        });
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const SIZE = 340;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = SIZE / 2 - 12;
  const single = slices.length === 1;

  return (
    <ToolShell
      title="转盘抽签"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Space size={6}>
            <Text type="secondary">抽中后移除</Text>
          </Space>
          <Checkbox checked={removeWinner} onChange={(e) => setRemoveWinner(e.target.checked)} />
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={spinning}
            disabled={slices.length === 0}
            onClick={spin}
          >
            开始抽签
          </Button>
        </Space>
      }
    >
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* 左侧：列表输入 */}
        <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: 460 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text strong>候选条目</Text>
            <Space size={4}>
              <Button size="small" type="text" icon={<PlusOutlined />} onClick={addItem}>
                添加
              </Button>
              <Button size="small" type="text" danger icon={<ClearOutlined />} disabled={items.length === 0} onClick={clearItems}>
                清空
              </Button>
            </Space>
          </div>

          <div
            style={{
              display: "grid",
              gap: 6,
              maxHeight: 360,
              overflow: "auto",
              padding: 8,
              borderRadius: 8,
              border: "1px solid rgba(128,128,128,0.25)",
            }}
          >
            {items.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                点击「添加」创建候选条目，可设置权重与颜色。
              </Text>
            ) : (
              items.map((it, idx) => {
                const resolvedColor = colors[idx];
                return (
                  <div
                    key={it.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "18px 1fr 72px 72px 28px",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 6px",
                      borderRadius: 6,
                      background: "rgba(128,128,128,0.06)",
                    }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        background: resolvedColor,
                        border: "1px solid rgba(0,0,0,0.1)",
                      }}
                    />
                    <Input
                      size="small"
                      value={it.label}
                      onChange={(e) => updateItem(it.id, { label: e.target.value })}
                      placeholder="条目名称"
                      style={{ minWidth: 0 }}
                    />
                    <InputNumber
                      size="small"
                      min={0.0001}
                      step={1}
                      value={it.weight}
                      onChange={(v) => updateItem(it.id, { weight: v || 1 })}
                      style={{ width: 72 }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="color"
                        value={it.color || resolvedColor}
                        onChange={(e) => updateItem(it.id, { color: e.target.value })}
                        style={{ width: 28, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                        title="选择颜色，清空则自动分配"
                      />
                      <Input
                        size="small"
                        value={it.color}
                        onChange={(e) => updateItem(it.id, { color: e.target.value })}
                        placeholder="自动"
                        style={{ width: 64, fontSize: 11 }}
                      />
                    </div>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(it.id)} />
                  </div>
                );
              })
            )}
          </div>

          <Space size={8} style={{ marginTop: 8 }} wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {items.length} 项 · 总权重 {Number.isInteger(total) ? total : total.toFixed(2)}
            </Text>
            <Checkbox checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)}>
              显示标签
            </Checkbox>
          </Space>
        </div>

        {/* 右侧：转盘 */}
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", width: SIZE, height: SIZE }}>
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              style={{ transform: `rotate(${rotation}deg)`, transition: "none" }}
            >
              <circle cx={cx} cy={cy} r={R + 8} fill="rgba(128,128,128,0.15)" />
              {single ? (
                <circle cx={cx} cy={cy} r={R} fill={colors[0]} />
              ) : (
                slices.map((s) => (
                  <path
                    key={s.id}
                    d={arcPath(cx, cy, R, s.start, s.end)}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                ))
              )}
              {showLabels
                ? slices.map((s) => {
                    const mid = (s.start + s.end) / 2;
                    const [tx, ty] = polar(cx, cy, R * 0.62, mid);
                    const label = s.label.length > 10 ? `${s.label.slice(0, 9)}…` : s.label;
                    return (
                      <text
                        key={s.id}
                        x={tx}
                        y={ty}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={13}
                        fill="#ffffff"
                        style={{ pointerEvents: "none" }}
                        transform={`rotate(${mid} ${tx} ${ty})`}
                      >
                        {label}
                      </text>
                    );
                  })
                : null}
              <circle cx={cx} cy={cy} r={18} fill="#ffffff" stroke="rgba(0,0,0,0.15)" />
            </svg>
            {/* 指针（固定在正上方） */}
            <div
              style={{
                position: "absolute",
                top: -2,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderTop: "22px solid #ff4d4f",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
              }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {spinning ? "旋转中…" : slices.length === 0 ? "请添加候选条目" : "点击右上角「开始抽签」"}
          </Text>
        </div>

        {/* 右侧：结果历史 */}
        <div style={{ flex: "1 1 180px", minWidth: 160 }}>
          <Space size={8}>
            <Text strong>抽签结果</Text>
            {history.length > 0 ? (
              <>
                <CopyButton text={() => history.join("\n")} label="复制" />
                <Button size="small" type="text" icon={<ClearOutlined />} onClick={() => setHistory([])}>
                  清空
                </Button>
              </>
            ) : null}
          </Space>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {history.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                暂无记录
              </Text>
            ) : (
              history.map((h, i) => <StatRow key={`${i}-${h}`} label={`#${history.length - i}`} value={h} />)
            )}
          </div>
        </div>
      </div>

      <ToolHistoryPanel
        toolId="wheel"
        toolTitle="转盘抽签"
        onRestore={(d) => {
          if (typeof d.winner === "string") setHistory((prev) => [String(d.winner), ...prev]);
        }}
      />
    </ToolShell>
  );
};

export default WheelTool;
