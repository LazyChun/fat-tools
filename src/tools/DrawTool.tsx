/*
 * 画板：Canvas 手绘板
 *
 * 支持 画笔 / 橡皮 / 直线 / 矩形 / 椭圆 / 箭头，颜色与粗细可调，
 * 背景可切换（白 / 深色 / 透明棋盘），支持撤销 / 重做 / 清空 / 导出 PNG。
 * 画布始终是透明层，背景由外层容器负责 —— 切背景不必重绘笔迹。
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, ColorPicker, Segmented, Slider, Space, Tooltip, Typography } from "antd";
import type { Color } from "antd/es/color-picker";
import {
  ArrowRightOutlined,
  BorderOutlined,
  ClearOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HighlightOutlined,
  LineOutlined,
  PieChartOutlined,
  RedoOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

type ToolKey = "pen" | "eraser" | "line" | "rect" | "ellipse" | "arrow";

const PRESET_COLORS = [
  "#1F1F1F",
  "#1677FF",
  "#52C41A",
  "#FAAD14",
  "#F5222D",
  "#EB2F96",
  "#722ED1",
  "#13C2C2",
  "#FFFFFF",
];

const TOOL_OPTIONS: { value: ToolKey; label: string; icon: React.ReactNode }[] = [
  { value: "pen", label: "画笔", icon: <HighlightOutlined /> },
  { value: "eraser", label: "橡皮", icon: <DeleteOutlined /> },
  { value: "line", label: "直线", icon: <LineOutlined /> },
  { value: "rect", label: "矩形", icon: <BorderOutlined /> },
  { value: "ellipse", label: "椭圆", icon: <PieChartOutlined /> },
  { value: "arrow", label: "箭头", icon: <ArrowRightOutlined /> },
];

type BgKey = "#FFFFFF" | "#1F1F1F" | "transparent";

const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #d9d9d9 25%, transparent 25%), linear-gradient(-45deg, #d9d9d9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d9d9d9 75%), linear-gradient(-45deg, transparent 75%, #d9d9d9 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: ToolKey,
  a: { x: number; y: number },
  b: { x: number; y: number },
  opt: { color: string; size: number; shift: boolean },
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = opt.color;
  ctx.lineWidth = opt.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let end = b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (opt.shift) {
    if (tool === "line") {
      end = Math.abs(dx) > Math.abs(dy) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    } else if (tool !== "arrow") {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      end = { x: a.x + (dx < 0 ? -m : m), y: a.y + (dy < 0 ? -m : m) };
    }
  }

  switch (tool) {
    case "line":
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    case "rect":
      ctx.beginPath();
      ctx.rect(a.x, a.y, end.x - a.x, end.y - a.y);
      ctx.stroke();
      break;
    case "ellipse": {
      const rx = Math.abs(end.x - a.x) / 2;
      const ry = Math.abs(end.y - a.y) / 2;
      ctx.beginPath();
      ctx.ellipse((a.x + end.x) / 2, (a.y + end.y) / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - a.y, end.x - a.x);
      const head = Math.max(9, opt.size * 3);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

const DrawTool: React.FC<Props> = ({ onBack }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef({ x: 0, y: 0 });
  const shapeBaseRef = useRef<HTMLCanvasElement | null>(null);
  const statesRef = useRef<string[]>([]);
  const idxRef = useRef(-1);

  const [tool, setTool] = useState<ToolKey>("pen");
  const [color, setColor] = useState("#1677FF");
  const [size, setSize] = useState(4);
  const [bg, setBg] = useState<BgKey>("#FFFFFF");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const ctx2d = useCallback((): CanvasRenderingContext2D => {
    const canvas = canvasRef.current!;
    return canvas.getContext("2d")!;
  }, []);

  const pushState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    statesRef.current = statesRef.current.slice(0, idxRef.current + 1);
    statesRef.current.push(url);
    if (statesRef.current.length > 50) statesRef.current.shift();
    idxRef.current = statesRef.current.length - 1;
    setCanUndo(idxRef.current > 0);
    setCanRedo(false);
  }, []);

  const restore = useCallback((url: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const img = new Image();
    img.onload = () => {
      context.save();
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, w, h);
      context.drawImage(img, 0, 0, w, h);
      context.restore();
    };
    img.src = url;
  }, []);

  // 尺寸自适应（首次进入 / 容器变化时重建画布，并尽力保留当前画面）
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const applyResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(wrap.clientWidth));
      const h = Math.max(1, Math.floor(wrap.clientHeight));
      const prevW = canvas.clientWidth || w;
      const prevH = canvas.clientHeight || h;
      let snapshot: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d")!.drawImage(canvas, 0, 0);
      }
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const context = canvas.getContext("2d")!;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      if (snapshot) context.drawImage(snapshot, 0, 0, prevW, prevH);
      statesRef.current = [canvas.toDataURL("image/png")];
      idxRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    };
    applyResize();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(applyResize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const snapshotCanvas = useCallback((): HTMLCanvasElement => {
    const canvas = canvasRef.current!;
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    c.getContext("2d")!.drawImage(canvas, 0, 0);
    return c;
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = ctx2d();
    const p = pos(e);
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    startRef.current = p;
    lastRef.current = p;

    if (tool === "pen" || tool === "eraser") {
      context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      context.strokeStyle = color;
      context.lineWidth = size;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + 0.01, p.y + 0.01);
      context.stroke();
    } else {
      shapeBaseRef.current = snapshotCanvas();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = ctx2d();
    const p = pos(e);

    if (tool === "pen" || tool === "eraser") {
      context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      context.strokeStyle = color;
      context.lineWidth = size;
      context.beginPath();
      context.moveTo(lastRef.current.x, lastRef.current.y);
      context.lineTo(p.x, p.y);
      context.stroke();
      lastRef.current = p;
      return;
    }

    const base = shapeBaseRef.current;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, w, h);
    if (base) context.drawImage(base, 0, 0, w, h);
    drawShape(context, tool, startRef.current, p, { color, size, shift: e.shiftKey });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const context = ctx2d();
    context.globalCompositeOperation = "source-over";
    shapeBaseRef.current = null;
    pushState();
  };

  const undo = () => {
    if (idxRef.current <= 0) return;
    idxRef.current -= 1;
    restore(statesRef.current[idxRef.current]);
    setCanUndo(idxRef.current > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (idxRef.current >= statesRef.current.length - 1) return;
    idxRef.current += 1;
    restore(statesRef.current[idxRef.current]);
    setCanUndo(true);
    setCanRedo(idxRef.current < statesRef.current.length - 1);
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = ctx2d();
    context.save();
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    context.restore();
    pushState();
    recordUsage({ toolId: "draw", toolTitle: "画板", action: "clear", summary: "清空画板" });
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d")!;
    if (bg !== "transparent") {
      octx.fillStyle = bg;
      octx.fillRect(0, 0, out.width, out.height);
    }
    octx.drawImage(canvas, 0, 0);
    const url = out.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `draw-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
    a.click();
    recordUsage({
      toolId: "draw",
      toolTitle: "画板",
      action: "export",
      summary: `导出 PNG（${out.width}×${out.height}px）`,
      detail: { width: out.width, height: out.height, background: bg },
    });
  };

  const bgStyle: React.CSSProperties =
    bg === "transparent"
      ? CHECKERBOARD
      : { background: bg };

  return (
    <ToolShell
      title="画板"
      onBack={onBack}
      extra={
        <Space size={6} wrap>
          <Tooltip title="撤销">
            <Button size="small" icon={<UndoOutlined />} disabled={!canUndo} onClick={undo} />
          </Tooltip>
          <Tooltip title="重做">
            <Button size="small" icon={<RedoOutlined />} disabled={!canRedo} onClick={redo} />
          </Tooltip>
          <Tooltip title="清空画板">
            <Button size="small" danger icon={<ClearOutlined />} onClick={clearAll} />
          </Tooltip>
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={exportPng}>
            导出 PNG
          </Button>
        </Space>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <Segmented
            size="small"
            value={tool}
            onChange={(v) => setTool(v as ToolKey)}
            options={TOOL_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: o.icon }))}
          />

          <Space size={4} wrap>
            {PRESET_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => {
                  setColor(c);
                  if (tool === "eraser") setTool("pen");
                }}
                title={c}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  cursor: "pointer",
                  background: c,
                  border:
                    color.toLowerCase() === c.toLowerCase()
                      ? "2px solid #1677FF"
                      : "1px solid rgba(128,128,128,0.5)",
                }}
              />
            ))}
          </Space>

          <ColorPicker
            size="small"
            value={color}
            onChange={(_: Color, hex: string) => setColor(hex.toUpperCase())}
          />

          <Space size={6} style={{ minWidth: 180 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              粗细
            </Text>
            <Slider
              style={{ width: 110 }}
              min={1}
              max={40}
              value={size}
              onChange={setSize}
              tooltip={{ formatter: (v) => `${v}px` }}
            />
            <Text style={{ fontSize: 12, width: 34 }}>{size}px</Text>
          </Space>

          <Segmented
            size="small"
            value={bg}
            onChange={(v) => setBg(v as BgKey)}
            options={[
              { value: "#FFFFFF", label: "白底" },
              { value: "#1F1F1F", label: "深色" },
              { value: "transparent", label: "透明" },
            ]}
          />
        </div>

        <div
          ref={wrapRef}
          style={{
            flex: 1,
            minHeight: 240,
            borderRadius: 8,
            border: "1px solid rgba(128,128,128,0.35)",
            overflow: "hidden",
            ...bgStyle,
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              display: "block",
              touchAction: "none",
              cursor: tool === "eraser" ? "cell" : "crosshair",
            }}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
          提示：按住 Shift 可画水平/垂直直线或正方形/正圆；橡皮擦除后背景透明。
        </Text>
      </div>
    </ToolShell>
  );
};

export default DrawTool;
