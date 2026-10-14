/*
 * 发票工具（电子发票处理）
 *
 * 纯前端处理，发票文件不上传：
 *  - 智能合并：多份发票 PDF 合并为一份（pdf-lib）
 *  - 信息提取：pdf.js 提取文本 → 正则解析发票号码 / 日期 / 金额 / 购销方
 *  - 批量重命名：按命名模板（{date} {invoiceNo} {seller} …）重命名
 *  - 自动归档：按开票年月 / 销售方 / 购买方 / 类型分目录，ZIP 打包（jszip）
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// pdf.worker 由 webpack 的 asset/resource 规则输出为独立文件（见 webpack.config.js），
// pdf.js 运行时以 module worker 加载，避免主线程解析卡顿
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import {
  Alert,
  Button,
  Input,
  Progress,
  Radio,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InboxOutlined,
  MergeCellsOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";
import "./invoice.css";
import {
  ARCHIVE_MODES,
  DEFAULT_INVOICE_TEMPLATE,
  INVOICE_TEMPLATE_TOKENS,
  archiveFolderFor,
  invoicesToCsv,
  parseInvoiceText,
  renderInvoiceTemplate,
  type ArchiveMode,
  type InvoiceInfo,
} from "./invoice/core";

const { Text } = Typography;
const { Dragger } = Upload;

// ── pdf.js worker（仅浏览器端，模块加载即就绪） ──
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** 待处理发票文件 */
interface InvoiceItem {
  uid: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  pages: number | null;
  info: InvoiceInfo | null;
  /** 文本提取失败（如扫描件）时的说明 */
  error: string;
  parsed: boolean;
  /** 渲染后的目标文件名（不含扩展名） */
  outName: string;
}

let uidSeq = 0;
const nextUid = (): string => `inv-${Date.now()}-${uidSeq++}`;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

/** 用 pdf.js 提取 PDF 全部文本 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join("\n");
      parts.push(text);
    }
    return parts.join("\n");
  } finally {
    void task.destroy();
  }
}

/** 校验并读取 PDF 文件 → 基础条目（不含解析结果） */
async function readPdfFile(file: File): Promise<InvoiceItem> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new Error(`「${file.name}」不是 PDF 文件`);
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 5));
  if (!head.startsWith("%PDF-")) {
    throw new Error(`「${file.name}」缺少 PDF 文件头（可能已损坏）`);
  }
  const item: InvoiceItem = {
    uid: nextUid(),
    name: file.name,
    size: file.size,
    bytes: buf,
    pages: null,
    info: null,
    error: "",
    parsed: false,
    outName: file.name.replace(/\.pdf$/i, ""),
  };
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    item.pages = doc.getPageCount();
  } catch {
    // 页数读取失败不致命
  }
  return item;
}

interface Props {
  onBack?: () => void;
}

const InvoiceTool: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseTotal, setParseTotal] = useState(0);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState(DEFAULT_INVOICE_TEMPLATE);
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("year-month");
  const [busy, setBusy] = useState(false);

  const parsedCount = items.filter((i) => i.parsed).length;

  const refreshOutNames = useCallback(
    (list: InvoiceItem[]): InvoiceItem[] =>
      list.map((it, idx) => ({
        ...it,
        outName:
          it.error || !it.info
            ? it.name.replace(/\.pdf$/i, "")
            : renderInvoiceTemplate(template, it.info, idx + 1),
      })),
    [template],
  );
  const addFiles = async (files: File[]): Promise<void> => {
    setError("");
    let newItems: InvoiceItem[] = [];
    try {
      newItems = await Promise.all(files.map(readPdfFile));
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setItems((prev) => refreshOutNames([...prev, ...newItems]));
    setParsing(true);
    setParseProgress(0);
    setParseTotal(newItems.length);
    // 逐份解析：解析失败（如扫描件）标记 error，不影响其它文件
    const done: InvoiceItem[] = [];
    for (const it of newItems) {
      const next: InvoiceItem = { ...it, parsed: true };
      try {
        const text = await extractPdfText(it.bytes);
        next.info = parseInvoiceText(text);
        if (!text.trim()) {
          next.error = "未提取到文本（可能为扫描件）";
        }
      } catch (e) {
        next.error = `解析失败：${(e as Error).message}`;
      }
      done.push(next);
      setParseProgress((p) => p + 1);
    }
    setItems((prev) =>
      refreshOutNames(
        prev.map((it) => done.find((d) => d.uid === it.uid) ?? it),
      ),
    );
    setParsing(false);
    if (done.some((d) => d.error)) {
      message.warning(
        `${done.length} 份解析完成，其中 ${done.filter((d) => d.error).length} 份未能提取完整信息`,
      );
    } else {
      message.success(`${done.length} 份发票解析完成`);
    }
  };

  // 模板变更时刷新文件名预览
  useEffect(() => {
    setItems((prev) => refreshOutNames(prev));
  }, [template, refreshOutNames]);

  const removeItem = (uid: string): void => {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  };

  const previewLines = useMemo(() => {
    const sample = items.find((it) => it.parsed && !it.error);
    const info = sample?.info;
    if (!info) return [];
    return [1, 2, 3].map((idx) => renderInvoiceTemplate(template, info, idx));
  }, [template, items]);

  const totalAmount = items.reduce(
    (acc, it) => acc + (it.info?.amount ?? 0),
    0,
  );

  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // ── 合并全部 ──
  const doMerge = async (): Promise<void> => {
    if (items.length < 2) {
      setError("请至少添加 2 份发票 PDF 再合并");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const merged = await PDFDocument.create();
      for (const it of items) {
        const src = await PDFDocument.load(it.bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const bytes = await merged.save();
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      const outName = `发票合并_${dateStamp}_${items.length}份.pdf`;
      downloadBlob(blob, outName);
      message.success(`合并完成：${items.length} 份 → ${outName}`);
      recordUsage({
        toolId: "invoice",
        toolTitle: "发票工具",
        action: "merge",
        summary: `合并 ${items.length} 份发票 PDF → ${outName}`,
        detail: {
          files: items.map((i) => i.name),
          count: items.length,
          outputName: outName,
        },
      });
    } catch (e) {
      setError(`合并失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── 归档 ZIP（重命名 + 分目录 + 附 CSV） ──
  const doArchive = async (): Promise<void> => {
    if (items.length === 0) {
      setError("请先添加发票 PDF 文件");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const zip = new JSZip();
      const rows: { fileName: string; info: InvoiceInfo }[] = [];
      const valid = items.filter((it) => it.parsed && !it.error && it.info);
      const others = items.filter(
        (it) => !it.parsed || !!it.error || !it.info,
      );
      let seq = 0;
      for (const it of valid) {
        seq += 1;
        const info = it.info as InvoiceInfo;
        const outName = renderInvoiceTemplate(template, info, seq);
        const folder = archiveFolderFor(info, archiveMode);
        const path = folder ? `${folder}/${outName}.pdf` : `${outName}.pdf`;
        zip.file(path, it.bytes);
        rows.push({ fileName: outName, info });
      }
      for (const it of others) {
        const folder = "未识别";
        zip.file(`${folder}/${it.name}`, it.bytes);
        rows.push({
          fileName: it.name.replace(/\.pdf$/i, ""),
          info: it.info ?? {
            invoiceNo: "",
            invoiceCode: "",
            date: "",
            amount: null,
            buyer: "",
            seller: "",
            buyerTaxId: "",
            sellerTaxId: "",
            type: "",
            missing: ["invoiceNo", "date", "amount", "buyer", "seller"],
          },
        });
      }
      if (rows.length > 0) {
        zip.file("发票信息.csv", invoicesToCsv(rows));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipName = `发票归档_${dateStamp}.zip`;
      downloadBlob(zipBlob, zipName);
      message.success(`归档完成：${rows.length} 份 → ${zipName}`);
      recordUsage({
        toolId: "invoice",
        toolTitle: "发票工具",
        action: "archive",
        summary: `归档 ${rows.length} 份发票（${archiveMode}）→ ${zipName}`,
        detail: {
          mode: archiveMode,
          template,
          count: rows.length,
          totalAmount,
          outputName: zipName,
        },
      });
    } catch (e) {
      setError(`归档失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── 导出 CSV ──
  const doExportCsv = (): void => {
    const rows = items
      .filter((it) => it.parsed && it.info)
      .map((it) => ({ fileName: it.outName, info: it.info as InvoiceInfo }));
    if (rows.length === 0) {
      setError("暂无可导出的解析结果");
      return;
    }
    const csv = invoicesToCsv(rows);
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `发票信息_${dateStamp}.csv`,
    );
    message.success(`已导出 ${rows.length} 条发票信息`);
    recordUsage({
      toolId: "invoice",
      toolTitle: "发票工具",
      action: "export",
      summary: `导出发票信息 CSV（${rows.length} 条）`,
      detail: { count: rows.length },
    });
  };

  const dragger = (
    <Dragger
      multiple
      showUploadList={false}
      accept=".pdf,application/pdf"
      beforeUpload={(file) => {
        void addFiles([file as unknown as File]);
        return false;
      }}
      disabled={parsing || busy}
      className="invoice-upload"
      style={{ height: 56, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          flexWrap: "wrap",
          height: "100%",
          minHeight: 0,
          padding: "0 12px",
        }}
      >
        <InboxOutlined style={{ fontSize: 18, color: "#1677ff", flexShrink: 0 }} />
        <span style={{ fontSize: 13, flexShrink: 0 }}>点击或拖拽多份发票 PDF 到此处</span>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: "20px" }}>
          自动提取发票号码 / 日期 / 金额 / 购销方；仅本机处理，不会上传
        </Text>
      </div>
    </Dragger>
  );

  const missingLabel = (it: InvoiceItem): React.ReactNode => {
    if (it.error) {
      return <Tag color="red">{it.error}</Tag>;
    }
    if (!it.parsed) {
      return <Tag>解析中…</Tag>;
    }
    if (!it.info) return null;
    return it.info.missing.length > 0 ? (
      <Tooltip title={`缺失：${it.info.missing.join("、")}`}>
        <Tag color="orange">部分缺失</Tag>
      </Tooltip>
    ) : (
      <Tag color="green">完整</Tag>
    );
  };

  return (
    <ToolShell
      title="发票工具"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Button
            size="small"
            icon={<FileExcelOutlined />}
            disabled={parsedCount === 0}
            onClick={doExportCsv}
          >
            导出 CSV
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={busy}
            disabled={items.length < 2}
            onClick={doMerge}
          >
            合并下载
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<MergeCellsOutlined />}
            loading={busy}
            disabled={items.length === 0}
            onClick={doArchive}
          >
            归档 ZIP
          </Button>
        </Space>
      }
    >
      {dragger}

      {error ? (
        <Alert
          type="error"
          message={error}
          style={{ marginTop: 12 }}
          showIcon
          closable
          onClose={() => setError("")}
        />
      ) : null}

      {parsing ? (
        <div style={{ marginTop: 12, maxWidth: 320 }}>
          <Progress
            percent={parseTotal > 0 ? Math.round((parseProgress / parseTotal) * 100) : 0}
            status="active"
            size="small"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            正在解析发票信息（{parseProgress} / {parseTotal}）…
          </Text>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* 命名模板 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Text type="secondary" style={{ flexShrink: 0 }}>
                命名模板
              </Text>
              <Input
                size="small"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                style={{ maxWidth: 340, fontFamily: "monospace" }}
                placeholder={DEFAULT_INVOICE_TEMPLATE}
              />
              <Tooltip
                title={
                  <div>
                    {INVOICE_TEMPLATE_TOKENS.map((t) => (
                      <div key={t.token}>
                        <Text code style={{ color: "#fff" }}>
                          {t.token}
                        </Text>{" "}
                        {t.desc}
                      </div>
                    ))}
                  </div>
                }
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  占位符
                </Text>
              </Tooltip>
              {previewLines.length > 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  例：{previewLines[0]}.pdf
                </Text>
              ) : null}
            </div>

            {/* 归档规则 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Text type="secondary" style={{ flexShrink: 0 }}>
                归档规则
              </Text>
              <Radio.Group
                size="small"
                value={archiveMode}
                onChange={(e) => setArchiveMode(e.target.value)}
                options={ARCHIVE_MODES.map((m) => ({
                  label: m.label,
                  value: m.value,
                }))}
                optionType="button"
                buttonStyle="solid"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {ARCHIVE_MODES.find((m) => m.value === archiveMode)?.hint}
              </Text>
            </div>
          </div>

          {/* 解析结果表 */}
          <Table
            size="small"
            rowKey="uid"
            dataSource={items}
            pagination={false}
            style={{ marginTop: 12 }}
            scroll={{ x: 860 }}
            columns={[
              {
                title: "文件名",
                dataIndex: "name",
                width: 200,
                ellipsis: true,
                render: (v: string, it) => (
                  <Space size={4}>
                    <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
                      {v}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {humanSize(it.size)}
                    </Text>
                  </Space>
                ),
              },
              {
                title: "发票号码",
                dataIndex: ["info", "invoiceNo"],
                width: 130,
                render: (v: string, it) =>
                  it.error || !it.info ? (
                    <Text type="secondary">—</Text>
                  ) : (
                    <Text style={{ fontSize: 12, fontFamily: "monospace" }}>
                      {v || "—"}
                    </Text>
                  ),
              },
              {
                title: "开票日期",
                dataIndex: ["info", "date"],
                width: 100,
                render: (v: string) => (v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>),
              },
              {
                title: "金额",
                dataIndex: ["info", "amount"],
                width: 90,
                align: "right",
                render: (v: number | null) =>
                  v !== null && v !== undefined ? (
                    <Text style={{ fontSize: 12 }}>{v.toFixed(2)}</Text>
                  ) : (
                    <Text type="secondary">—</Text>
                  ),
              },
              {
                title: "购买方",
                dataIndex: ["info", "buyer"],
                width: 140,
                ellipsis: true,
                render: (v: string, it) =>
                  it.info ? (
                    <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
                      {v || "—"}
                    </Text>
                  ) : (
                    <Text type="secondary">—</Text>
                  ),
              },
              {
                title: "销售方",
                dataIndex: ["info", "seller"],
                width: 140,
                ellipsis: true,
                render: (v: string, it) =>
                  it.info ? (
                    <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
                      {v || "—"}
                    </Text>
                  ) : (
                    <Text type="secondary">—</Text>
                  ),
              },
              {
                title: "归档文件名",
                dataIndex: "outName",
                width: 200,
                ellipsis: true,
                render: (v: string) => (
                  <Text
                    style={{ fontSize: 12, fontFamily: "monospace" }}
                    ellipsis={{ tooltip: `${v}.pdf` }}
                  >
                    {v}.pdf
                  </Text>
                ),
              },
              {
                title: "状态",
                width: 110,
                render: (_: unknown, it) => missingLabel(it),
              },
              {
                title: "",
                width: 44,
                render: (_: unknown, it) => (
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={parsing || busy}
                    onClick={() => removeItem(it.uid)}
                  />
                ),
              },
            ]}
          />

          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {items.length} 份 · 已解析 {parsedCount} 份
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              合计金额：¥{totalAmount.toFixed(2)}
            </Text>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <Spin spinning={parsing} />
        </div>
      )}

      <ToolHistoryPanel
        toolId="invoice"
        toolTitle="发票工具"
        reloadKey={parsedCount}
        onRestore={(d) => {
          if (typeof d.template === "string") setTemplate(d.template);
          const mode = String(d.mode ?? "year-month");
          if (ARCHIVE_MODES.some((m) => m.value === mode)) {
            setArchiveMode(mode as ArchiveMode);
          }
          message.info("发票文件内容不随历史保存，请重新添加 PDF");
        }}
      />
    </ToolShell>
  );
};

export default InvoiceTool;
