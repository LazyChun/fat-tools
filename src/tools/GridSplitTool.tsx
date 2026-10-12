/*
 * 格子拆图：把一张图片按 rows×cols 网格拆分为 N 张 PNG 小图
 *
 * 常用于游戏开发精灵图（sprite sheet）拆分：默认 3×3 九宫格，
 * 行列可自定义（1–20）。支持把全部格子打包为 ZIP 一次性下载，
 * 也可在结果区逐个下载单张。
 * 图片仅在本机浏览器内处理，不会上传。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Alert, Button, InputNumber, Space, Spin, Typography, Upload, message } from "antd";
import { DownloadOutlined, InboxOutlined, FileImageOutlined } from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, suppressNextRecord } from "../historyClient";
import { gridCellBounds, gridCellFileName, humanFileSize, safeFileBase } from "../utils";

const { Text } = Typography;
const { Dragger } = Upload;

interface Props {
  onBack?: () => void;
}

/** 已加载的源图 */
interface LoadedImage {
  name: string;
  size: number;
  width: number;
  height: number;
  img: HTMLImageElement;
  /** objectURL（卸载 / 更换时统一 revoke） */
  url: string;
}

/** 单个拆分产物 */
interface TileOut {
  name: string;
  w: number;
  h: number;
  size: number;
  blob: Blob;
  url: string;
}

const MIN_GRID = 1;
const MAX_GRID = 20;

/** 读取图片文件 → HTMLImageElement（URL 保留至卸载时由组件统一 revoke） */
function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        name: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        img,
        url,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片「${file.name}」（格式不支持或文件已损坏）`));
    };
    img.src = url;
  });
}

/** 把源图指定区域绘制为 PNG blob */
function drawTileBlob(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("无法创建画布"));
      return;
    }
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("导出 PNG 失败"))), "image/png");
  });
}

/** 触发浏览器下载 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const GridSplitTool: React.FC<Props> = ({ onBack }) => {
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [rows, setRows] = useState<number>(3);
  const [cols, setCols] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tiles, setTiles] = useState<TileOut[]>([]);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  // 网格边界（源图加载后实时可算，供预览与拆分共用）
  const bounds = useMemo(() => {
    if (!source) return [];
    return gridCellBounds(rows, cols, source.width, source.height);
  }, [source, rows, cols]);

  const tileCount = rows * cols;

  // 预览：等比缩略图 + 网格线
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !source) return;
    const scale = Math.min(1, 440 / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source.img, 0, 0, canvas.width, canvas.height);
    // 网格线
    if (bounds.length) {
      ctx.strokeStyle = "rgba(22, 119, 255, 0.85)";
      ctx.lineWidth = 1;
      for (let c = 1; c < cols; c++) {
        const x = Math.round((c * canvas.width) / cols) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let r = 1; r < rows; r++) {
        const y = Math.round((r * canvas.height) / rows) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
  }, [source, rows, cols, bounds]);

  const addFile = useCallback(async (file: File) => {
    setError("");
    setTiles([]);
    try {
      if (!file.type.startsWith("image/") && !/\.(png|jpe?g|gif|bmp|webp|avif)$/i.test(file.name)) {
        throw new Error(`「${file.name}」不是支持的图片文件`);
      }
      const loaded = await loadImageFile(file);
      if (loaded.width < cols || loaded.height < rows) {
        setSource(loaded);
        setError(`图片尺寸（${loaded.width}×${loaded.height}）小于当前网格（${cols}×${rows}），请调小行列数或换一张图`);
        return;
      }
      setSource(loaded);
      message.success(`已载入「${file.name}」（${loaded.width}×${loaded.height}）`);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [cols, rows]);

  const doSplit = useCallback(async (): Promise<void> => {
    if (!source) {
      setError("请先选择要拆分的图片");
      return;
    }
    if (bounds.length !== tileCount) {
      setError(`图片尺寸（${source.width}×${source.height}）不足以拆成 ${rows}×${cols} 格，请调小行列数`);
      return;
    }
    setError("");
    setBusy(true);
    const base = safeFileBase(source.name);
    const outTiles: TileOut[] = [];
    try {
      for (const b of bounds) {
        const blob = await drawTileBlob(source.img, b.x, b.y, b.w, b.h);
        const name = gridCellFileName(base, rows, cols, b.row, b.col);
        outTiles.push({ name, w: b.w, h: b.h, size: blob.size, blob, url: URL.createObjectURL(blob) });
      }
      // 打包 ZIP 并下载
      const zip = new JSZip();
      for (const t of outTiles) {
        zip.file(t.name, t.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipName = `${base}_${rows}x${cols}.zip`;
      downloadBlob(zipBlob, zipName);

      setTiles(outTiles);
      message.success(`拆分完成：${outTiles.length} 张 → ${zipName}（${humanFileSize(zipBlob.size)}）`);
      recordUsage({
        toolId: "grid-split",
        toolTitle: "格子拆图",
        action: "split",
        summary: `「${source.name}」（${source.width}×${source.height}）拆为 ${rows}×${cols} 共 ${outTiles.length} 张`,
        detail: {
          name: source.name,
          sourceSize: `${source.width}×${source.height}`,
          rows,
          cols,
          tileCount: outTiles.length,
          zipName,
        },
      });
    } catch (e) {
      setError(`拆分失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [source, rows, cols, bounds, tileCount]);

  // 卸载 / 更换时释放产物与源图 URL
  useEffect(() => {
    const prev = tiles;
    return () => prev.forEach((t) => URL.revokeObjectURL(t.url));
  }, [tiles]);

  useEffect(() => {
    const prev = source;
    return () => {
      if (prev) URL.revokeObjectURL(prev.url);
    };
  }, [source]);

  return (
    <ToolShell
      title="格子拆图"
      onBack={onBack}
      extra={
        <Button
          size="small"
          type="primary"
          icon={<DownloadOutlined />}
          loading={busy}
          disabled={!source || bounds.length !== tileCount}
          onClick={() => void doSplit()}
        >
          {busy ? "拆分中…" : `拆分下载 ZIP（${tileCount} 张）`}
        </Button>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <Dragger
            showUploadList={false}
            accept="image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp,.avif"
            beforeUpload={(file) => {
              void addFile(file as unknown as File);
              return false;
            }}
            style={{ padding: 0, height: 64, minHeight: 64 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 64,
                flexWrap: "wrap",
                padding: "0 8px",
              }}
            >
              <InboxOutlined style={{ fontSize: 20, color: "#1677ff" }} />
              <span>点击或拖拽图片到此处进行格子拆分</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                仅本机处理，不会上传
              </Text>
            </div>
          </Dragger>
        </div>
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
            height: 64,
          }}
        >
          <Space size={12} wrap>
            <Space size={4}>
              <Text type="secondary">行数</Text>
              <InputNumber
                min={MIN_GRID}
                max={MAX_GRID}
                value={rows}
                onChange={(v) => setRows(Math.max(MIN_GRID, Math.min(MAX_GRID, v ?? MIN_GRID)))}
                style={{ width: 72 }}
              />
            </Space>
            <Space size={4}>
              <Text type="secondary">列数</Text>
              <InputNumber
                min={MIN_GRID}
                max={MAX_GRID}
                value={cols}
                onChange={(v) => setCols(Math.max(MIN_GRID, Math.min(MAX_GRID, v ?? MIN_GRID)))}
                style={{ width: 72 }}
              />
            </Space>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {tileCount} 格{source ? `（每格约 ${Math.floor(source.width / cols)}×${Math.floor(source.height / rows)}px，余数并入末行末列）` : ""}
          </Text>
        </div>
      </div>

      {error ? (
        <Alert type="error" message={error} showIcon closable style={{ marginTop: 12 }} onClose={() => setError("")} />
      ) : null}

      {source ? (
        <div style={{ marginTop: 12 }}>
          <Space size={8} wrap style={{ marginBottom: 8 }}>
            <FileImageOutlined />
            <Text strong>{source.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {source.width}×{source.height}px · {humanFileSize(source.size)}
            </Text>
          </Space>
          <div
            style={{
              display: "inline-block",
              padding: 8,
              borderRadius: 8,
              border: "1px solid rgba(128,128,128,0.25)",
              background: "rgba(128,128,128,0.06)",
            }}
          >
            <canvas ref={previewRef} style={{ display: "block", maxWidth: "100%" }} />
          </div>
        </div>
      ) : null}

      {tiles.length ? (
        <div style={{ marginTop: 16 }}>
          <Space size={8} style={{ marginBottom: 8 }} wrap>
            <Text strong>拆分结果（{tiles.length} 张）</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已随 ZIP 一起下载，也可单张保存
            </Text>
          </Space>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 8,
            }}
          >
            {tiles.map((t) => (
              <div
                key={t.name}
                style={{
                  border: "1px solid rgba(128,128,128,0.25)",
                  borderRadius: 8,
                  padding: 6,
                  background: "rgba(128,128,128,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <img
                  src={t.url}
                  alt={t.name}
                  style={{ width: "100%", height: 88, objectFit: "contain", background: "transparent", borderRadius: 4 }}
                />
                <Text style={{ fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }} title={t.name}>
                  {t.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t.w}×{t.h} · {humanFileSize(t.size)}
                </Text>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => downloadBlob(t.blob, t.name)}
                >
                  下载
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {busy ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin tip="正在逐格拆分…" />
        </div>
      ) : null}

      <ToolHistoryPanel
        toolId="grid-split"
        toolTitle="格子拆图"
        reloadKey={tiles.length ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("grid-split");
          if (typeof d.rows === "number") setRows(Math.max(MIN_GRID, Math.min(MAX_GRID, d.rows)));
          if (typeof d.cols === "number") setCols(Math.max(MIN_GRID, Math.min(MAX_GRID, d.cols)));
        }}
      />
    </ToolShell>
  );
};

export default GridSplitTool;
