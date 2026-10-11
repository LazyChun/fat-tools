/*
 * 哈希计算工具：文本与文件（分块）计算 MD5 + SHA-1/256/384/512
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Space, Spin, Tag, Typography, Upload } from "antd";
import {
  FileOutlined,
  InboxOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  hashFile,
  md5,
  shaHash,
  type FileHashResult,
  type ShaAlgorithm,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import {
  recordUsage,
  recordUsageDebounced,
  suppressNextRecord,
} from "../historyClient";

const { TextArea } = Input;
const { Text } = Typography;
const { Dragger } = Upload;

interface Props {
  onBack?: () => void;
}

const ALGOS: ShaAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** 摘要用输入预览：压平空白并截断，保证不同输入的历史记录一眼可辨 */
function textPreview(s: string, max = 20): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const HashTool: React.FC<Props> = ({ onBack }) => {
  const [text, setText] = useState("");
  const [textShas, setTextShas] = useState<Record<string, string>>({});
  const [textBusy, setTextBusy] = useState(false);
  const [files, setFiles] = useState<FileHashResult[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const md5Hex = useMemo(() => (text ? md5(text) : ""), [text]);

  useEffect(() => {
    if (!text) {
      setTextShas({});
      return;
    }
    let cancelled = false;
    setTextBusy(true);
    Promise.all(ALGOS.map(async (a) => [a, await shaHash(a, text)] as const))
      .then((pairs) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [a, h] of pairs) next[a] = h;
        setTextShas(next);
      })
      .finally(() => {
        if (!cancelled) setTextBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  // 文本输入停顿 2s 后落库
  useEffect(() => {
    recordUsageDebounced(
      "hash-text",
      () =>
        text
          ? {
              toolId: "hash",
              toolTitle: "哈希计算",
              action: "text",
              summary: `计算「${textPreview(text)}」的 MD5 + SHA 系列哈希`,
              detail: {
                mode: "text",
                input: text,
                inputLen: text.length,
                md5: md5Hex,
              },
            }
          : null,
      2000,
    );
  }, [text, md5Hex]);

  const hashFiles = async (list: File[]) => {
    if (list.length === 0) return;
    setFileBusy(true);
    setError("");
    try {
      for (const file of list) {
        const result = await hashFile(file, setProgress);
        setFiles((prev) => [
          result,
          ...prev.filter((f) => f.size !== result.size || f.md5 !== result.md5),
        ]);
        recordUsage({
          toolId: "hash",
          toolTitle: "哈希计算",
          action: "file",
          summary: `计算文件哈希：${file.name}（${formatSize(file.size)}）`,
          detail: {
            mode: "file",
            name: file.name,
            size: file.size,
            md5: result.md5,
            shas: result.shas,
          },
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFileBusy(false);
      setProgress(0);
    }
  };

  const StatList: React.FC<{ md5: string; shas: Record<string, string> }> = ({
    md5: m,
    shas,
  }) => (
    <div style={{ display: "grid", gap: 6 }}>
      <StatRow label="MD5" value={m} copyable />
      {ALGOS.map((a) => (
        <StatRow
          key={a}
          label={a}
          value={shas[a] || "…"}
          copyable={!!shas[a]}
        />
      ))}
    </div>
  );

  return (
    <ToolShell title="哈希计算" onBack={onBack}>
      <div style={{ display: "grid", gap: 20 }}>
        {/* 文本哈希 */}
        <div>
          <Text strong style={{ display: "block", marginBottom: 6 }}>
            文本哈希
          </Text>
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入任意文本，自动计算 MD5 与 SHA 系列哈希（UTF-8 编码）…"
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{ marginBottom: 8 }}
          />
          <Spin spinning={textBusy} size="small">
            {text ? <StatList md5={md5Hex} shas={textShas} /> : null}
          </Spin>
        </div>

        {/* 文件哈希 */}
        <div>
          <Text strong style={{ display: "block", marginBottom: 6 }}>
            文件哈希（分块 MD5 + SHA）
          </Text>
          <Dragger
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              void hashFiles([file as unknown as File]);
              return false;
            }}
            style={{ padding: "6px 0" }}
          >
            <p style={{ margin: 0, fontSize: 28, color: "#1677ff" }}>
              <InboxOutlined />
            </p>
            <p style={{ margin: "6px 0 2px" }}>点击或拖拽文件到此处计算哈希</p>
            <p style={{ margin: 0 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                文件仅在本机浏览器内计算，不会上传；大文件采用分块流式处理
              </Text>
            </p>
          </Dragger>
          {files.length > 0 ? (
            <Space size={8} style={{ marginTop: 8 }} wrap>
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => setFiles([])}
              >
                清空结果
              </Button>
            </Space>
          ) : null}

          {fileBusy ? (
            <div style={{ marginTop: 8 }}>
              <Tag color="processing">计算中… {progress}%</Tag>
            </div>
          ) : null}
          {error ? (
            <div style={{ color: "#cf1322", marginTop: 8 }}>{error}</div>
          ) : null}

          {files.length > 0 ? (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {files.map((f) => (
                <div
                  key={`${f.md5}-${f.size}`}
                  style={{
                    border: "1px solid rgba(128,128,128,0.25)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <FileOutlined />
                    <Text
                      strong
                      style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}
                    >
                      {f.name || "文件"}
                    </Text>
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, flexShrink: 0 }}
                    >
                      {formatSize(f.size)}
                    </Text>
                  </div>
                  <StatList md5={f.md5} shas={f.shas} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <ToolHistoryPanel
        toolId="hash"
        toolTitle="哈希计算"
        reloadKey={text ? 1 : 0}
        onRestore={(d) => {
          if (d.mode === "text" || typeof d.input === "string") {
            suppressNextRecord("hash-text");
            setText(String(d.input ?? ""));
          } else if (typeof d.md5 === "string") {
            setFiles((prev) => [
              {
                name: String(d.name ?? "文件"),
                md5: String(d.md5),
                size: Number(d.size) || 0,
                shas: (d.shas as Record<string, string>) || {},
              },
              ...prev,
            ]);
          }
        }}
      />
    </ToolShell>
  );
};

export default HashTool;
