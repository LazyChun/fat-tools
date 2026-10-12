/*
 * 格子合图：把多张图片按 rows×cols 顺序拼成一张大图
 *
 * 常用于游戏开发精灵图（sprite sheet）合并：默认 3×3 九宫格（9 张），
 * 行列可自定义（1–20）。单元格尺寸默认取第一张图，也可自适应取最大；
 * 支持在列表中调整顺序（上移 / 下移 / 删除）。
 * 图片仅在本机浏览器内处理，不会上传。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  InputNumber,
  List,
  Radio,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  InboxOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, suppressNextRecord } from "../historyClient";
import { gridCellBounds, humanFileSize } from "../utils";

const { Text } = Typography;
const { Dragger } = Upload;

interface Props {
  onBack?: () => void;
}

interface MergeItem {
  uid: string;
  name: string;
  size: number;
  width: number;
  height: number;
  img: HTMLImageElement;
  /** objectURL（卸载 / 移除时统一 revoke） */
  url: string;
}

const MIN_GRID = 1;
const MAX_GRID = 20;
const MAX_FILES = 20 * 20;

let uidSeq = 0;
const nextUid = (): string => `grid-merge-${Date.now()}-${uidSeq++}`;

/** 读取图片文件 → HTMLImageElement（URL 保留至组件卸载时统一 revoke） */
function loadImageFile(file: File): Promise<MergeItem> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        uid: nextUid(),
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

const GridMergeTool: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [rows, setRows] = useState<number>(3);
  const [cols, setCols] = useState<number>(3);
  /** 单元格尺寸策略：first = 取第一张图尺寸；max = 取所有图最大宽高 */
  const [cellMode, setCellMode] = useState<"first" | "max">("first");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const need = rows * cols;
  const complete = items.length === need;

  // 统一单元格尺寸
  const cellSize = useMemo(() => {
    if (!items.length) return null;
    if (cellMode === "max") {
      return {
        w: Math.max(...items.map((i) => i.width)),
        h: Math.max(...items.map((i) => i.height)),
      };
    }
    return { w: items[0].width, h: items[0].height };
  }, [items, cellMode]);

  // 合并预览：统一尺寸网格 + 逐格绘制（限宽等比缩放）
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !items.length || !cellSize) return;
    const outW = cols * cellSize.w;
    const outH = rows * cellSize.h;
    const scale = Math.min(1, 460 / Math.max(outW, outH));
    canvas.width = Math.max(1, Math.round(outW * scale));
    canvas.height = Math.max(1, Math.round(outH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const bounds = gridCellBounds(rows, cols, outW, outH);
    bounds.forEach((b, idx) => {
      const item = items[idx];
      if (!item) return;
      const sx = b.x * scale;
      const sy = b.y * scale;
      const sw = b.w * scale;
      const sh = b.h * scale;
      ctx.drawImage(item.img, sx, sy, sw, sh);
    });
    // 网格分隔线（浅色，便于观察）
    ctx.strokeStyle = "rgba(128,128,128,0.35)";
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
  }, [items, rows, cols, cellSize]);

  // 卸载 / 移除时释放图片 URL
  useEffect(() => {
    const prev = items;
    return () => prev.forEach((i) => URL.revokeObjectURL(i.url));
  }, [items]);

  const addFiles = useCallback(
    async (files: File[]) => {
      setError("");
      try {
        const loaded = await Promise.all(files.map(loadImageFile));
        setItems((prev) => {
          const next = [...prev, ...loaded];
          if (next.length > MAX_FILES) {
            message.warning(`最多支持 ${MAX_FILES} 张，已截断多余文件`);
            return next.slice(0, MAX_FILES);
          }
          return next;
        });
        message.success(`已添加 ${loaded.length} 张（当前 ${items.length + loaded.length} / 需要 ${need} 张）`);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [items.length, need],
  );

  const removeItem = (uid: string): void => {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  };

  const moveItem = (uid: string, dir: -1 | 1): void => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.uid === uid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const doMerge = useCallback((): void => {
    if (!items.length) {
      setError("请先添加要合并的图片");
      return;
    }
    if (!complete) {
      setError(`需要 ${rows}×${cols} = ${need} 张图，当前已添加 ${items.length} 张（可继续添加或调小行列数）`);
      return;
    }
    if (!cellSize) return;
    setError("");
    setBusy(true);
    const outW = cols * cellSize.w;
    const outH = rows * cellSize.h;
    const outName = `merged_${rows}x${cols}.png`;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建画布");
      // 透明背景
      ctx.clearRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const bounds = gridCellBounds(rows, cols, outW, outH);
      bounds.forEach((b, idx) => {
        const item = items[idx];
        if (item) ctx.drawImage(item.img, b.x, b.y, b.w, b.h);
      });
      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) {
          setError("导出 PNG 失败");
          return;
        }
        downloadBlob(blob, outName);
        message.success(`合并完成：${items.length} 张 → ${outName}（${outW}×${outH}，${humanFileSize(blob.size)}）`);
        recordUsage({
          toolId: "grid-merge",
          toolTitle: "格子合图",
          action: "merge",
          summary: `${rows}×${cols} 共 ${items.length} 张拼为 ${outW}×${outH} 大图`,
          detail: {
            rows,
            cols,
            tileCount: items.length,
            cellMode,
            cellSize: `${cellSize.w}×${cellSize.h}`,
            output: `${outW}×${outH}`,
            outputName: outName,
            files: items.map((i) => i.name),
          },
        });
      }, "image/png");
    } catch (e) {
      setBusy(false);
      setError(`合并失败：${(e as Error).message}`);
    }
  }, [items, rows, cols, need, complete, cellSize, cellMode]);

  return (
    <ToolShell
      title="格子合图"
      onBack={onBack}
      extra={
        <Button
          size="small"
          type="primary"
          icon={<DownloadOutlined />}
          loading={busy}
          disabled={!complete}
          onClick={doMerge}
        >
          {busy ? "合并中…" : `合并导出 PNG`}
        </Button>
      }
    >
      <Dragger
        multiple
        showUploadList={false}
        accept="image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp,.avif"
        beforeUpload={(file) => {
          void addFiles([file as unknown as File]);
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
          <span>点击或拖拽多张图片到此处（按添加顺序拼入网格）</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            需要 {rows}×{cols} = {need} 张，当前已添加 {items.length} 张 · 仅本机处理，不会上传
          </Text>
        </div>
      </Dragger>

      <Space size={12} wrap style={{ marginTop: 8 }}>
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
        <Radio.Group
          value={cellMode}
          onChange={(e) => setCellMode(e.target.value)}
          size="small"
          optionType="button"
          buttonStyle="solid"
          options={[
            { label: "单元格=首图尺寸", value: "first" },
            { label: "单元格=最大尺寸", value: "max" },
          ]}
        />
        {cellSize ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            单格 {cellSize.w}×{cellSize.h}px · 输出 {cols * cellSize.w}×{rows * cellSize.h}px
          </Text>
        ) : null}
      </Space>

      {error ? (
        <Alert type="error" message={error} showIcon closable style={{ marginTop: 12 }} onClose={() => setError("")} />
      ) : null}

      {items.length ? (
        <List
          size="small"
          style={{ marginTop: 12, maxHeight: 260, overflow: "auto", border: "1px solid rgba(128,128,128,0.15)", borderRadius: 8, padding: "0 8px" }}
          dataSource={items}
          renderItem={(item, idx) => (
            <List.Item
              style={{ padding: "6px 4px", display: "flex", alignItems: "center", gap: 8 }}
              actions={[
                <Button
                  key="up"
                  size="small"
                  type="text"
                  icon={<UpOutlined />}
                  disabled={idx === 0}
                  onClick={() => moveItem(item.uid, -1)}
                />,
                <Button
                  key="down"
                  size="small"
                  type="text"
                  icon={<DownOutlined />}
                  disabled={idx === items.length - 1}
                  onClick={() => moveItem(item.uid, 1)}
                />,
                <Button
                  key="del"
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeItem(item.uid)}
                />,
              ]}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: "rgba(128,128,128,0.12)",
                  fontSize: 12,
                  flexShrink: 0,
                  fontFamily: "monospace",
                }}
              >
                {idx + 1}
              </span>
              <img
                src={item.url}
                alt={item.name}
                style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 4, flexShrink: 0, background: "rgba(128,128,128,0.06)" }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }} title={item.name}>
                  {item.name}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {item.width}×{item.height} · {humanFileSize(item.size)}
                </Text>
              </div>
            </List.Item>
          )}
        />
      ) : null}

      {items.length && cellSize ? (
        <div style={{ marginTop: 12 }}>
          <Text strong>合并预览</Text>
          <div
            style={{
              display: "inline-block",
              marginTop: 6,
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

      {busy ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin tip="正在合并…" />
        </div>
      ) : null}

      <ToolHistoryPanel
        toolId="grid-merge"
        toolTitle="格子合图"
        reloadKey={complete ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("grid-merge");
          if (typeof d.rows === "number") setRows(Math.max(MIN_GRID, Math.min(MAX_GRID, d.rows)));
          if (typeof d.cols === "number") setCols(Math.max(MIN_GRID, Math.min(MAX_GRID, d.cols)));
          if (d.cellMode === "first" || d.cellMode === "max") setCellMode(d.cellMode);
        }}
      />
    </ToolShell>
  );
};

export default GridMergeTool;
