/*
 * 屏幕截图（系统级框选，跨多显示器，微信/QQ 风格覆盖层）
 *
 * 流程：
 *   1. 点「开始截图」→ 调后端 screenshot.capture（可选隐藏 FatNotes 窗口）
 *   2. 后端冻结所有屏幕画面：选区外压暗、选区内高亮，可拖拽/调整/确认
 *   3. 确认 → 后端从冻结帧裁剪 PNG base64 返回
 *   4. 前端展示结果图，可标注（箭头/形状/画笔/马赛克/文字），可矩形框选裁剪
 *   5. 完成后自动复制到剪贴板，或下载 PNG
 *
 * 依赖：Python 后端（Pillow + tkinter）。后端不可用时提示降级。
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Segmented,
  Space,
  Tooltip,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  BorderOutlined,
  CameraOutlined,
  CheckOutlined,
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  FontSizeOutlined,
  ScissorOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { getSdk, recordUsage } from "../historyClient";

const { Paragraph, Text } = Typography;

interface Props {
  onBack?: () => void;
}

type ShapeType = "rect" | "ellipse" | "triangle" | "hexagon" | "star";
type AnnTool = "arrow" | "shape" | "pen" | "mosaic" | "text";
type Mode = AnnTool | "crop";

interface Annotation {
  tool: AnnTool;
  shape?: ShapeType;
  color: string;
  size: number;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  points?: { x: number; y: number }[];
  text?: string;
}

const PRESET_COLORS = [
  { c: "#F5222D", name: "红" },
  { c: "#FA8C16", name: "橙" },
  { c: "#FAAD14", name: "黄" },
  { c: "#52C41A", name: "绿" },
  { c: "#1677FF", name: "蓝" },
  { c: "#722ED1", name: "紫" },
  { c: "#FFFFFF", name: "白" },
  { c: "#1F1F1F", name: "黑" },
];

const HIDE_KEY = "fat-tools:screenshot:hideHost";
const MOSAIC_BLOCK = 12;

function timestampName(): string {
  return `screenshot-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
}

/** 在外接矩形内构建形状路径（不描边，调用方负责 stroke） */
function traceShapePath(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  shape: ShapeType,
): void {
  const lx1 = Math.min(x1, x2);
  const ly1 = Math.min(y1, y2);
  const lx2 = Math.max(x1, x2);
  const ly2 = Math.max(y1, y2);
  const w = lx2 - lx1;
  const h = ly2 - ly1;
  const cx = (lx1 + lx2) / 2;
  const cy = (ly1 + ly2) / 2;
  ctx.beginPath();
  switch (shape) {
    case "ellipse":
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(cx, ly1);
      ctx.lineTo(lx2, ly2);
      ctx.lineTo(lx1, ly2);
      ctx.closePath();
      break;
    case "hexagon": {
      for (let i = 0; i < 6; i++) {
        const a = i * (Math.PI / 3) - Math.PI / 2;
        const px = cx + (w / 2) * Math.cos(a);
        const py = cy + (h / 2) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "star": {
      const inner = 0.4;
      for (let i = 0; i < 10; i++) {
        const f = i % 2 === 0 ? 1 : inner;
        const a = i * (Math.PI / 5) - Math.PI / 2;
        const px = cx + (w / 2) * f * Math.cos(a);
        const py = cy + (h / 2) * f * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "rect":
    default:
      ctx.rect(lx1, ly1, w, h);
      break;
  }
}

/** 在导出 canvas 上画一条标注（坐标为图片像素） */
function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (ann.tool) {
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(ann.p1.x, ann.p1.y);
      ctx.lineTo(ann.p2.x, ann.p2.y);
      ctx.stroke();
      const angle = Math.atan2(ann.p2.y - ann.p1.y, ann.p2.x - ann.p1.x);
      const head = Math.max(10, ann.size * 3);
      ctx.beginPath();
      ctx.moveTo(ann.p2.x, ann.p2.y);
      ctx.lineTo(
        ann.p2.x - head * Math.cos(angle - Math.PI / 7),
        ann.p2.y - head * Math.sin(angle - Math.PI / 7),
      );
      ctx.moveTo(ann.p2.x, ann.p2.y);
      ctx.lineTo(
        ann.p2.x - head * Math.cos(angle + Math.PI / 7),
        ann.p2.y - head * Math.sin(angle + Math.PI / 7),
      );
      ctx.stroke();
      break;
    }
    case "shape": {
      traceShapePath(
        ctx,
        ann.p1.x,
        ann.p1.y,
        ann.p2.x,
        ann.p2.y,
        ann.shape || "rect",
      );
      ctx.stroke();
      break;
    }
    case "pen": {
      if (ann.points && ann.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++)
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        ctx.stroke();
      }
      break;
    }
    case "text": {
      if (ann.text) {
        ctx.font = `${Math.max(14, ann.size * 3)}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(ann.text, ann.p1.x, ann.p1.y);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

const ScreenshotTool: React.FC<Props> = ({ onBack }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgDataUrl, setImgDataUrl] = useState<string | null>(null);
  const [imgW, setImgW] = useState(0);
  const [imgH, setImgH] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [mode, setMode] = useState<Mode>("arrow");
  const [shape, setShape] = useState<ShapeType>("rect");
  const [color, setColor] = useState("#F5222D");
  const [brushSize, setBrushSize] = useState<2 | 4 | 6>(2);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingTextAt, setPendingTextAt] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [textInput, setTextInput] = useState("");
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [hideHost, setHideHost] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const displayRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const penPointsRef = useRef<{ x: number; y: number }[]>([]);

  const toggleHideHost = (v: boolean) => {
    setHideHost(v);
    try {
      localStorage.setItem(HIDE_KEY, v ? "1" : "0");
    } catch {
      /* 持久化失败不影响功能 */
    }
  };

  // 调后端系统级截图（跨所有显示器）
  const startCapture = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) {
      setError("SDK 未初始化，请重新进入工具。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await sdk.backend.invoke<{
        ok: boolean;
        cancelled?: boolean;
        data?: string;
        width?: number;
        height?: number;
      }>("screenshot.capture", { hideHost }, 120);

      if (!resp || !resp.ok) {
        if (resp?.cancelled) setError("已取消截图。");
        else setError("截图未完成，请重试。");
        return;
      }
      const dataUrl = `data:image/png;base64,${resp.data}`;
      setImgDataUrl(dataUrl);
      setImgW(resp.width || 0);
      setImgH(resp.height || 0);
      setAnnotations([]);
      setMode("arrow");
      recordUsage({
        toolId: "screenshot",
        toolTitle: "屏幕截图",
        action: "capture",
        summary: `截取 ${resp.width}×${resp.height}`,
        detail: { width: resp.width, height: resp.height, hideHost },
      });
    } catch (e) {
      setError(
        `调用后端截图失败：${(e as Error)?.message || e}。请确认 Python 后端已启动（Pillow 依赖）。`,
      );
    } finally {
      setBusy(false);
    }
  }, [hideHost]);

  // 把鼠标事件坐标换算为图片像素坐标
  const toImgPos = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * imgW,
        y: ((e.clientY - rect.top) / rect.height) * imgH,
      };
    },
    [imgW, imgH],
  );

  // 在展示 canvas 上画马赛克实时预览（从底图取像素化区域）
  const drawMosaicPreview = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      ann: Annotation,
      sx: number,
      sy: number,
    ) => {
      const img = baseImg;
      const mx1 = Math.min(ann.p1.x, ann.p2.x);
      const my1 = Math.min(ann.p1.y, ann.p2.y);
      const mx2 = Math.max(ann.p1.x, ann.p2.x);
      const my2 = Math.max(ann.p1.y, ann.p2.y);
      if (mx2 <= mx1 || my2 <= my1) return;
      if (!img || !img.complete) {
        ctx.strokeStyle = "rgba(128,128,128,0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(mx1 * sx, my1 * sy, (mx2 - mx1) * sx, (my2 - my1) * sy);
        ctx.setLineDash([]);
        return;
      }
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round((mx2 - mx1) / MOSAIC_BLOCK));
      small.height = Math.max(1, Math.round((my2 - my1) / MOSAIC_BLOCK));
      const sctx = small.getContext("2d")!;
      sctx.drawImage(
        img,
        mx1,
        my1,
        mx2 - mx1,
        my2 - my1,
        0,
        0,
        small.width,
        small.height,
      );
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        small,
        0,
        0,
        small.width,
        small.height,
        mx1 * sx,
        my1 * sy,
        (mx2 - mx1) * sx,
        (my2 - my1) * sy,
      );
      ctx.imageSmoothingEnabled = true;
    },
    [baseImg],
  );

  // 重绘标注 canvas（按显示尺寸）
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgW || !imgH) return;
    const display = displayRef.current;
    if (!display) return;
    const cw = display.clientWidth;
    const ch = (cw * imgH) / imgW;
    canvas.width = Math.round(cw);
    canvas.height = Math.round(ch);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    const sx = cw / imgW;
    const sy = ch / imgH;

    annotations.forEach((ann) => {
      if (ann.tool === "mosaic") {
        drawMosaicPreview(ctx, ann, sx, sy);
        return;
      }
      ctx.save();
      ctx.scale(sx, sy);
      drawAnnotation(ctx, ann);
      ctx.restore();
    });

    // 正在画的临时预览
    if (drawingRef.current) {
      const p1 = startRef.current;
      const p2 = currentRef.current;
      ctx.save();
      if (mode === "crop" || mode === "mosaic") {
        // 框选/马赛克：蓝色虚线框
        ctx.strokeStyle = "#1677FF";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          p1.x * sx,
          p1.y * sy,
          (p2.x - p1.x) * sx,
          (p2.y - p1.y) * sy,
        );
        ctx.setLineDash([]);
      } else {
        ctx.scale(sx, sy);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (mode === "pen" && penPointsRef.current.length > 1) {
          ctx.beginPath();
          ctx.moveTo(penPointsRef.current[0].x, penPointsRef.current[0].y);
          for (let i = 1; i < penPointsRef.current.length; i++) {
            ctx.lineTo(penPointsRef.current[i].x, penPointsRef.current[i].y);
          }
          ctx.stroke();
        } else if (mode === "shape") {
          traceShapePath(ctx, p1.x, p1.y, p2.x, p2.y, shape);
          ctx.stroke();
        } else if (mode === "arrow") {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }, [
    imgW,
    imgH,
    annotations,
    baseImg,
    drawMosaicPreview,
    mode,
    shape,
    color,
    brushSize,
  ]);

  // 底图加载（马赛克预览/裁剪用）
  useEffect(() => {
    if (!imgDataUrl) {
      setBaseImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBaseImg(img);
    img.src = imgDataUrl;
    return () => {
      img.onload = null;
    };
  }, [imgDataUrl]);

  useEffect(() => {
    redraw();
  }, [redraw, imgDataUrl]);

  // 窗口尺寸变化时保持画布与图片对齐
  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  // 矩形框选裁剪：把图片裁剪到选区
  const applyCrop = useCallback(
    async (ix1: number, iy1: number, ix2: number, iy2: number) => {
      const x1 = Math.max(0, Math.round(Math.min(ix1, ix2)));
      const y1 = Math.max(0, Math.round(Math.min(iy1, iy2)));
      const x2 = Math.min(imgW, Math.round(Math.max(ix1, ix2)));
      const y2 = Math.min(imgH, Math.round(Math.max(iy1, iy2)));
      const w = x2 - x1;
      const h = y2 - y1;
      if (w < 8 || h < 8) return;
      const img = new Image();
      img.src = imgDataUrl!;
      await new Promise<void>((res) => {
        if (img.complete) res();
        else img.onload = () => res();
      });
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d")!.drawImage(img, x1, y1, w, h, 0, 0, w, h);
      setImgDataUrl(out.toDataURL("image/png"));
      setImgW(w);
      setImgH(h);
      setAnnotations([]);
      recordUsage({
        toolId: "screenshot",
        toolTitle: "屏幕截图",
        action: "crop",
        summary: `裁剪为 ${w}×${h}`,
        detail: { width: w, height: h },
      });
    },
    [imgDataUrl, imgW, imgH],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !imgDataUrl) return;
    const p = toImgPos(e);
    if (mode === "text") {
      setPendingTextAt(p);
      setTextInput("");
      return;
    }
    drawingRef.current = true;
    startRef.current = p;
    currentRef.current = p;
    penPointsRef.current = [p];
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawingRef.current) return;
    const p = toImgPos(e);
    currentRef.current = p;
    if (mode === "pen") penPointsRef.current = [...penPointsRef.current, p];
    redraw();
  };

  const onMouseUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const p1 = startRef.current;
    const p2 = currentRef.current;
    if (mode === "crop") {
      void applyCrop(p1.x, p1.y, p2.x, p2.y);
      redraw();
      return;
    }
    if (mode === "pen") {
      if (penPointsRef.current.length > 1) {
        setAnnotations((anns) => [
          ...anns,
          {
            tool: "pen",
            color,
            size: brushSize,
            p1: penPointsRef.current[0],
            p2: penPointsRef.current[penPointsRef.current.length - 1],
            points: penPointsRef.current,
          },
        ]);
      }
    } else if (mode === "arrow" || mode === "shape" || mode === "mosaic") {
      if (Math.abs(p2.x - p1.x) > 3 && Math.abs(p2.y - p1.y) > 3) {
        setAnnotations((anns) => [
          ...anns,
          {
            tool: mode,
            shape: mode === "shape" ? shape : undefined,
            color,
            size: brushSize,
            p1,
            p2,
          },
        ]);
      }
    }
    redraw();
  };

  const confirmText = () => {
    if (pendingTextAt && textInput.trim()) {
      setAnnotations((anns) => [
        ...anns,
        {
          tool: "text",
          color,
          size: brushSize,
          p1: pendingTextAt,
          p2: pendingTextAt,
          text: textInput.trim(),
        },
      ]);
    }
    setPendingTextAt(null);
    setTextInput("");
  };

  const undo = () => setAnnotations((anns) => anns.slice(0, -1));
  const clearAll = () => setAnnotations([]);

  // 合成导出：原图 + 马赛克像素化 + 标注
  const composeBlob = useCallback(async (): Promise<{
    blob: Blob;
    dataUrl: string;
  }> => {
    const out = document.createElement("canvas");
    out.width = imgW;
    out.height = imgH;
    const ctx = out.getContext("2d")!;
    const img = new Image();
    img.src = imgDataUrl!;
    await new Promise<void>((res) => {
      if (img.complete) res();
      else img.onload = () => res();
    });
    ctx.drawImage(img, 0, 0, imgW, imgH);

    // 马赛克像素化
    for (const ann of annotations) {
      if (ann.tool !== "mosaic") continue;
      const mx1 = Math.min(ann.p1.x, ann.p2.x);
      const my1 = Math.min(ann.p1.y, ann.p2.y);
      const mx2 = Math.max(ann.p1.x, ann.p2.x);
      const my2 = Math.max(ann.p1.y, ann.p2.y);
      if (mx2 <= mx1 || my2 <= my1) continue;
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round((mx2 - mx1) / MOSAIC_BLOCK));
      small.height = Math.max(1, Math.round((my2 - my1) / MOSAIC_BLOCK));
      const sctx = small.getContext("2d")!;
      sctx.drawImage(
        out,
        mx1,
        my1,
        mx2 - mx1,
        my2 - my1,
        0,
        0,
        small.width,
        small.height,
      );
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        small,
        0,
        0,
        small.width,
        small.height,
        mx1,
        my1,
        mx2 - mx1,
        my2 - my1,
      );
      ctx.imageSmoothingEnabled = true;
    }

    annotations.forEach((ann) => {
      if (ann.tool === "mosaic") return;
      drawAnnotation(ctx, ann);
    });
    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG 编码失败"))),
        "image/png",
      ),
    );
    return { blob, dataUrl: out.toDataURL("image/png") };
  }, [imgDataUrl, imgW, imgH, annotations]);

  const doExport = useCallback(async () => {
    try {
      const { blob } = await composeBlob();
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setDone(true);
        window.setTimeout(() => setDone(false), 2000);
      } catch {
        /* 自动复制失败不阻塞 */
      }
      recordUsage({
        toolId: "screenshot",
        toolTitle: "屏幕截图",
        action: "export",
        summary: `导出 ${imgW}×${imgH} PNG`,
        detail: { width: imgW, height: imgH, annotations: annotations.length },
      });
    } catch (e) {
      setError(`导出失败：${(e as Error).message}`);
    }
  }, [composeBlob, imgW, imgH, annotations]);

  const copy = useCallback(async () => {
    try {
      const { blob } = await composeBlob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("复制失败。");
    }
  }, [composeBlob]);

  const download = useCallback(async () => {
    try {
      const { dataUrl } = await composeBlob();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = timestampName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      setError(`下载失败：${(e as Error).message}`);
    }
  }, [composeBlob]);

  const retake = () => {
    setImgDataUrl(null);
    setAnnotations([]);
    startCapture();
  };

  const toolOptions: {
    value: Mode;
    label: string;
    icon: React.ReactNode;
    tip: string;
  }[] = [
    {
      value: "arrow",
      label: "箭头",
      icon: <ArrowRightOutlined />,
      tip: "箭头标注",
    },
    {
      value: "shape",
      label: "形状",
      icon: <BorderOutlined />,
      tip: "矩形/圆形/三角形/六边形/五角星标注",
    },
    { value: "pen", label: "画笔", icon: <EditOutlined />, tip: "自由画笔" },
    {
      value: "mosaic",
      label: "马赛克",
      icon: <AppstoreOutlined />,
      tip: "马赛克遮盖",
    },
    {
      value: "text",
      label: "文字",
      icon: <FontSizeOutlined />,
      tip: "文字标注",
    },
    {
      value: "crop",
      label: "框选裁剪",
      icon: <ScissorOutlined />,
      tip: "矩形框选裁剪图片",
    },
  ];

  // 文字输入框定位：换算成显示坐标
  const textPosStyle = (() => {
    const canvas = canvasRef.current;
    const scale = canvas && imgW ? canvas.width / imgW : 0;
    if (!pendingTextAt || !scale) return { left: 0, top: 0 };
    return { left: pendingTextAt.x * scale, top: pendingTextAt.y * scale };
  })();

  return (
    <ToolShell
      title="屏幕截图"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Tooltip title="截图时隐藏 FatNotes 窗口，避免它出现在截图里">
            <Checkbox
              checked={hideHost}
              onChange={(e) => toggleHideHost(e.target.checked)}
            >
              隐藏 FatNotes 窗口
            </Checkbox>
          </Tooltip>
          <Button
            size="small"
            type="primary"
            icon={<CameraOutlined />}
            loading={busy}
            onClick={startCapture}
          >
            {busy ? "请在屏幕上框选…" : imgDataUrl ? "重新截图" : "开始截图"}
          </Button>
          {imgDataUrl && (
            <>
              <Button
                size="small"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={copy}
              >
                {copied ? "已复制" : "复制"}
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={download}
              >
                下载
              </Button>
            </>
          )}
        </Space>
      }
    >
      {error && (
        <Alert
          type={error.includes("已取消") ? "info" : "warning"}
          showIcon
          closable
          onClose={() => setError(null)}
          message={error}
          style={{ marginBottom: 12 }}
        />
      )}

      {!imgDataUrl ? (
        <div style={{ padding: "32px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🖥️</div>
            <Paragraph style={{ marginBottom: 4, fontSize: 15 }}>
              系统级框选截图 · 支持所有显示器
            </Paragraph>
            <Text type="secondary" style={{ fontSize: 12 }}>
              可选隐藏 FatNotes 窗口 · 标注箭头/形状/画笔/马赛克/文字 ·
              矩形框选裁剪
            </Text>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 28,
              flexWrap: "wrap",
              marginBottom: 28,
              padding: "0 16px",
            }}
          >
            {[
              { t: "开始截图", d: "整个桌面（含所有屏幕）变暗" },
              { t: "拖拽框选", d: "在任意屏幕上框选区域" },
              { t: "标注/裁剪", d: "松开自动返回并编辑" },
              { t: "完成复制", d: "自动复制到剪贴板" },
            ].map((s, i) => (
              <div key={s.t} style={{ textAlign: "center", maxWidth: 150 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "#1677FF",
                    color: "#fff",
                    fontWeight: 600,
                    lineHeight: "26px",
                    margin: "0 auto 8px",
                    fontSize: 13,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.t}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {s.d}
                </Text>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <Button
              type="primary"
              size="large"
              icon={<CameraOutlined />}
              loading={busy}
              onClick={startCapture}
            >
              {busy ? "请在屏幕上框选…" : "开始截图"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {/* 标注工具栏 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(128,128,128,0.08)",
              marginBottom: 12,
            }}
          >
            <Segmented
              size="small"
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={toolOptions.map((o) => ({
                value: o.value,
                label: (
                  <Tooltip title={o.tip}>
                    <span style={{ padding: "0 2px" }}>
                      {o.icon} {o.label}
                    </span>
                  </Tooltip>
                ),
              }))}
            />
            {mode === "shape" && (
              <Tooltip title="切换标注形状">
                <Segmented
                  size="small"
                  value={shape}
                  onChange={(v) => setShape(v as ShapeType)}
                  options={[
                    { label: "矩形", value: "rect" },
                    { label: "圆形", value: "ellipse" },
                    { label: "三角形", value: "triangle" },
                    { label: "六边形", value: "hexagon" },
                    { label: "五角星", value: "star" },
                  ]}
                />
              </Tooltip>
            )}
            <div
              style={{
                width: 1,
                height: 18,
                background: "rgba(128,128,128,0.3)",
              }}
            />
            {PRESET_COLORS.map(({ c, name }) => (
              <Tooltip key={c} title={name}>
                <div
                  onClick={() => setColor(c)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    cursor: "pointer",
                    background: c,
                    border:
                      color === c
                        ? "2px solid #1677FF"
                        : "1px solid rgba(128,128,128,0.4)",
                    boxSizing: "border-box",
                  }}
                />
              </Tooltip>
            ))}
            <div
              style={{
                width: 1,
                height: 18,
                background: "rgba(128,128,128,0.3)",
              }}
            />
            <Tooltip title="线条粗细 / 文字大小">
              <Segmented
                size="small"
                value={brushSize}
                onChange={(v) => setBrushSize(v as 2 | 4 | 6)}
                options={[
                  { label: "细", value: 2 },
                  { label: "中", value: 4 },
                  { label: "粗", value: 6 },
                ]}
              />
            </Tooltip>
            <div
              style={{
                width: 1,
                height: 18,
                background: "rgba(128,128,128,0.3)",
              }}
            />
            <Tooltip title="撤销 (最后一笔)">
              <Button
                size="small"
                type="text"
                icon={<UndoOutlined />}
                onClick={undo}
                disabled={annotations.length === 0}
              />
            </Tooltip>
            <Tooltip title="清空标注">
              <Button
                size="small"
                type="text"
                danger
                icon={<ClearOutlined />}
                onClick={clearAll}
                disabled={annotations.length === 0}
              />
            </Tooltip>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Button size="small" icon={<CameraOutlined />} onClick={retake}>
                重截
              </Button>
              <Button
                size="small"
                type="primary"
                icon={done ? <CheckOutlined /> : undefined}
                onClick={doExport}
              >
                {done ? "已复制到剪贴板" : "完成（复制）"}
              </Button>
            </div>
          </div>

          {/* 图片 + 标注 canvas */}
          <div
            ref={displayRef}
            style={{
              position: "relative",
              display: "inline-block",
              maxWidth: "100%",
            }}
          >
            <img
              src={imgDataUrl}
              alt="screenshot"
              onLoad={redraw}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "calc(100vh - 320px)",
                border: "1px solid rgba(128,128,128,0.35)",
                borderRadius: 6,
              }}
            />
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                cursor: mode === "text" ? "text" : "crosshair",
              }}
            />
            {pendingTextAt && (
              <input
                autoFocus
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmText();
                  if (e.key === "Escape") setPendingTextAt(null);
                }}
                placeholder="输入文字，回车确认"
                style={{
                  position: "absolute",
                  ...textPosStyle,
                  border: `2px solid ${color}`,
                  outline: "none",
                  padding: "2px 6px",
                  fontSize: 13,
                  background: "rgba(255,255,255,0.95)",
                  color: color,
                  fontWeight: 600,
                  minWidth: 160,
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                }}
              />
            )}
          </div>
          <div
            style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {imgW} × {imgH} px · PNG · 已标注 {annotations.length} 处
            </Text>
            {mode === "crop" && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                框选裁剪：拖拽选择要保留的区域，松开即裁剪（会清空标注）
              </Text>
            )}
            {mode === "mosaic" && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                马赛克：拖拽选择要遮盖的区域，松开生效
              </Text>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
};

export default ScreenshotTool;
