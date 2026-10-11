/*
 * PDF 工具：合并 / 分割（pdf-lib，纯前端处理，文件不上传）
 *
 *  - merge：多个 PDF 按顺序合并为一份（可调整顺序）
 *  - split：单份 PDF 按每页 / 每 N 页 / 自定义页码范围拆分为多份
 */
import React, { useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";
import {
  Alert,
  Button,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Progress,
  Radio,
  Space,
  Tag,
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
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";
import { chunkPageRanges, parsePageRanges, type PageRangeSeg } from "../utils";

const { Text } = Typography;
const { Dragger } = Upload;

interface Props {
  onBack?: () => void;
  mode: "merge" | "split";
}

/** 待处理 PDF 文件（bytes 已读入内存，pages 在异步加载后填充） */
interface PdfItem {
  uid: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  pages: number | null;
}

/** 拆分产物 */
interface SplitOutput {
  name: string;
  blob: Blob;
  url: string;
  size: number;
  seg: PageRangeSeg;
}

let uidSeq = 0;
const nextUid = (): string => `pdf-${Date.now()}-${uidSeq++}`;

/** 文件大小人性化 */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 校验并读取 PDF 文件 → PdfItem（解析失败抛错） */
async function readPdfFile(file: File): Promise<PdfItem> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new Error(`「${file.name}」不是 PDF 文件`);
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 5));
  if (!head.startsWith("%PDF-")) {
    throw new Error(`「${file.name}」缺少 PDF 文件头（可能已损坏）`);
  }
  const item: PdfItem = { uid: nextUid(), name: file.name, size: file.size, bytes: buf, pages: null };
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    item.pages = doc.getPageCount();
  } catch {
    // 读取页数失败不致命：合并时再报错
  }
  return item;
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

/** 文件名去掉扩展名 */
function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

const PdfTool: React.FC<Props> = ({ onBack, mode }) => {
  // ── 合并模式状态 ──
  const [mergeFiles, setMergeFiles] = useState<PdfItem[]>([]);
  const [mergeBusy, setMergeBusy] = useState(false);

  // ── 分割模式状态 ──
  const [splitFile, setSplitFile] = useState<PdfItem | null>(null);
  const [splitMode, setSplitMode] = useState<"each" | "chunk" | "ranges">("each");
  const [chunkSize, setChunkSize] = useState<number>(1);
  const [rangeSpec, setRangeSpec] = useState("");
  const [splitBusy, setSplitBusy] = useState(false);
  const [outputs, setOutputs] = useState<SplitOutput[]>([]);
  const [error, setError] = useState("");

  const totalPages = mergeFiles.reduce((acc, f) => acc + (f.pages ?? 0), 0);

  // 自定义范围实时预览
  const rangePreview = useMemo(() => {
    if (splitMode !== "ranges" || !splitFile?.pages || !rangeSpec.trim()) return null;
    return parsePageRanges(rangeSpec, splitFile.pages);
  }, [splitMode, splitFile, rangeSpec]);

  const addFiles = async (files: File[]): Promise<void> => {
    setError("");
    try {
      const items = await Promise.all(files.map(readPdfFile));
      if (mode === "merge") {
        setMergeFiles((prev) => [...prev, ...items]);
        message.success(`已添加 ${items.length} 个 PDF`);
      } else {
        if (items.length > 1) {
          message.info("分割模式一次处理一个文件，已取第一个");
        }
        setOutputs([]);
        setSplitFile(items[0] ?? null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeMergeFile = (uid: string): void => {
    setMergeFiles((prev) => prev.filter((f) => f.uid !== uid));
  };

  const moveMergeFile = (uid: string, dir: -1 | 1): void => {
    setMergeFiles((prev) => {
      const idx = prev.findIndex((f) => f.uid === uid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const doMerge = async (): Promise<void> => {
    if (mergeFiles.length < 2) {
      setError("请至少添加 2 个 PDF 文件再合并");
      return;
    }
    setError("");
    setMergeBusy(true);
    try {
      const merged = await PDFDocument.create();
      for (const file of mergeFiles) {
        const src = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const bytes = await merged.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const outName = `merged-${mergeFiles.length}files.pdf`;
      downloadBlob(blob, outName);
      message.success(`合并完成：${mergeFiles.length} 个文件 → ${outName}`);
      recordUsage({
        toolId: "pdf-merge",
        toolTitle: "PDF 合并",
        action: "merge",
        summary: `合并 ${mergeFiles.length} 个 PDF（${totalPages} 页）→ ${outName}`,
        detail: {
          files: mergeFiles.map((f) => f.name),
          fileCount: mergeFiles.length,
          totalPages,
          outputName: outName,
          outputSize: blob.size,
        },
      });
    } catch (e) {
      setError(`合并失败：${(e as Error).message}`);
    } finally {
      setMergeBusy(false);
    }
  };

  const doSplit = async (): Promise<void> => {
    if (!splitFile) {
      setError("请先选择要分割的 PDF 文件");
      return;
    }
    setError("");
    setSplitBusy(true);
    setOutputs([]);
    try {
      const src = await PDFDocument.load(splitFile.bytes, { ignoreEncryption: true });
      const total = src.getPageCount();
      let segs: PageRangeSeg[];
      if (splitMode === "each") {
        segs = Array.from({ length: total }, (_, k) => ({ from: k + 1, to: k + 1 }));
      } else if (splitMode === "chunk") {
        const res = chunkPageRanges(total, chunkSize);
        if (!res.ok) throw new Error(res.error);
        segs = res.segs;
      } else {
        const res = parsePageRanges(rangeSpec, total);
        if (!res.ok) throw new Error(res.error);
        segs = res.segs;
      }

      const root = baseName(splitFile.name);
      const results: SplitOutput[] = [];
      for (const seg of segs) {
        const part = await PDFDocument.create();
        const indices = Array.from(
          { length: seg.to - seg.from + 1 },
          (_, k) => seg.from - 1 + k,
        );
        const pages = await part.copyPages(src, indices);
        pages.forEach((p) => part.addPage(p));
        const bytes = await part.save();
        const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
        const label = seg.from === seg.to ? `p${seg.from}` : `p${seg.from}-${seg.to}`;
        results.push({
          name: `${root}_${label}.pdf`,
          blob,
          url: URL.createObjectURL(blob),
          size: blob.size,
          seg,
        });
      }
      setOutputs(results);
      message.success(`拆分完成：${results.length} 份`);

      recordUsage({
        toolId: "pdf-split",
        toolTitle: "PDF 分割",
        action: "split",
        summary: `「${splitFile.name}」（${total} 页）拆分为 ${results.length} 份`,
        detail: {
          name: splitFile.name,
          totalPages: total,
          splitMode,
          chunkSize: splitMode === "chunk" ? chunkSize : undefined,
          rangeSpec: splitMode === "ranges" ? rangeSpec : undefined,
          outputCount: results.length,
          outputs: results.map((r) => ({ name: r.name, pages: r.seg.to - r.seg.from + 1 })),
        },
      });
    } catch (e) {
      setError(`拆分失败：${(e as Error).message}`);
    } finally {
      setSplitBusy(false);
    }
  };

  // 卸载产物 URL
  React.useEffect(() => {
    return () => {
      outputs.forEach((o) => URL.revokeObjectURL(o.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dragger = (
    <div>
      <Dragger
        multiple={mode === "merge"}
        showUploadList={false}
        accept=".pdf,application/pdf"
        beforeUpload={(file) => {
          void addFiles([file as unknown as File]);
          return false;
        }}
        style={{ padding: "6px 0", height: "120px" }}
      >
        <p style={{ margin: 0, fontSize: 28, color: "#1677ff" }}>
          <InboxOutlined />
        </p>
        <p style={{ margin: "6px 0 2px" }}>
          {mode === "merge" ? "点击或拖拽多个 PDF 到此处合并" : "点击或拖拽 PDF 到此处分割"}
        </p>
        <p style={{ margin: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            文件仅在本机浏览器内处理，不会上传
          </Text>
        </p>
      </Dragger>
    </div>
  );

  if (mode === "merge") {
    return (
      <ToolShell
        title="PDF 合并"
        onBack={onBack}
        extra={
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            loading={mergeBusy}
            disabled={mergeFiles.length < 2}
            onClick={doMerge}
          >
            合并并下载
          </Button>
        }
      >
        {dragger}
        {error ? (
          <Alert type="error" message={error} style={{ marginTop: 12 }} showIcon closable />
        ) : null}

        {mergeFiles.length > 0 ? (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {mergeFiles.map((f, idx) => (
              <div
                key={f.uid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "rgba(128,128,128,0.08)",
                }}
              >
                <Tag color="blue" style={{ margin: 0 }}>
                  {idx + 1}
                </Tag>
                <Text style={{ flex: 1, minWidth: 0 }} ellipsis={{ tooltip: f.name }}>
                  {f.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                  {humanSize(f.size)}
                  {f.pages !== null ? ` · ${f.pages} 页` : ""}
                </Text>
                <Space size={2}>
                  <Button
                    size="small"
                    type="text"
                    icon={<UpOutlined />}
                    disabled={idx === 0}
                    onClick={() => moveMergeFile(f.uid, -1)}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<DownOutlined />}
                    disabled={idx === mergeFiles.length - 1}
                    onClick={() => moveMergeFile(f.uid, 1)}
                  />
                  <Popconfirm title="移除该文件？" onConfirm={() => removeMergeFile(f.uid)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
              <StatRow label="文件数" value={mergeFiles.length} />
              <StatRow label="总页数" value={totalPages} />
            </div>
          </div>
        ) : null}

        <ToolHistoryPanel
          toolId="pdf-merge"
          toolTitle="PDF 合并"
          reloadKey={0}
          onRestore={() => {
            message.info("文件内容不随历史保存，请重新添加 PDF 文件");
          }}
        />
      </ToolShell>
    );
  }

  // ── split ──
  return (
    <ToolShell
      title="PDF 分割"
      onBack={onBack}
      extra={
        <Button
          size="small"
          type="primary"
          icon={<DownloadOutlined />}
          loading={splitBusy}
          disabled={!splitFile}
          onClick={doSplit}
        >
          拆分
        </Button>
      }
    >
      {splitFile ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            padding: "6px 10px",
            borderRadius: 6,
            background: "rgba(128,128,128,0.08)",
          }}
        >
          <Text strong style={{ flex: 1, minWidth: 0 }} ellipsis={{ tooltip: splitFile.name }}>
            {splitFile.name}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
            {humanSize(splitFile.size)}
            {splitFile.pages !== null ? ` · ${splitFile.pages} 页` : ""}
          </Text>
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              setSplitFile(null);
              setOutputs([]);
              setRangeSpec("");
            }}
          />
        </div>
      ) : (
        dragger
      )}

      {error ? (
        <Alert type="error" message={error} style={{ marginBottom: 12 }} showIcon closable />
      ) : null}

      {splitFile ? (
        <Radio.Group
          value={splitMode}
          onChange={(e) => setSplitMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
          options={[
            { label: "每页一份", value: "each" },
            { label: "每 N 页一份", value: "chunk" },
            { label: "自定义范围", value: "ranges" },
          ]}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {splitMode === "chunk" && splitFile ? (
        <div style={{ marginBottom: 12 }}>
          <Space size={8}>
            <Text type="secondary">每</Text>
            <InputNumber
              size="small"
              min={1}
              max={splitFile.pages || 1}
              value={chunkSize}
              onChange={(v) => setChunkSize(Math.max(1, Number(v) || 1))}
            />
            <Text type="secondary">页一份</Text>
          </Space>
        </div>
      ) : null}

      {splitMode === "ranges" && splitFile ? (
        <div style={{ marginBottom: 12 }}>
          <Input
            size="small"
            value={rangeSpec}
            onChange={(e) => setRangeSpec(e.target.value)}
            placeholder="页码范围，例如 1-3,5,8-10；支持 3-（到末尾）、-4（从头）"
            style={{ maxWidth: 420 }}
          />
          {rangePreview ? (
            rangePreview.ok ? (
              <Text type="success" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                共 {rangePreview.segs.length} 份 / {rangePreview.pages} 页：
                {rangePreview.segs
                  .map((s) => (s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`))
                  .join("、")}
              </Text>
            ) : (
              <Text type="danger" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                {rangePreview.error}
              </Text>
            )
          ) : null}
        </div>
      ) : null}

      {splitBusy ? <Progress percent={100} status="active" size="small" style={{ maxWidth: 320 }} /> : null}

      {outputs.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => outputs.forEach((o, idx) => {
                // 逐个触发下载，间隔避免浏览器拦截
                window.setTimeout(() => downloadBlob(o.blob, o.name), idx * 250);
              })}
            >
              全部下载（{outputs.length}）
            </Button>
          </div>
          <List
            size="small"
            bordered
            dataSource={outputs}
            renderItem={(o) => (
              <List.Item
                style={{ padding: "6px 12px" }}
                actions={[
                  <Button
                    key="dl"
                    size="small"
                    type="link"
                    icon={<DownloadOutlined />}
                    onClick={() => downloadBlob(o.blob, o.name)}
                  >
                    下载
                  </Button>,
                ]}
              >
                <Text style={{ minWidth: 0 }} ellipsis={{ tooltip: o.name }}>
                  {o.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
                  {o.seg.to - o.seg.from + 1} 页 · {humanSize(o.size)}
                </Text>
              </List.Item>
            )}
          />
        </div>
      ) : null}

      <ToolHistoryPanel
        toolId="pdf-split"
        toolTitle="PDF 分割"
        reloadKey={outputs.length}
        onRestore={(d) => {
          const m = String(d.splitMode ?? "each");
          setSplitMode(m === "chunk" || m === "ranges" ? m : "each");
          if (typeof d.chunkSize === "number") setChunkSize(d.chunkSize);
          if (typeof d.rangeSpec === "string") setRangeSpec(d.rangeSpec);
          message.info("文件内容不随历史保存，请重新添加 PDF 文件");
        }}
      />
    </ToolShell>
  );
};

export default PdfTool;
