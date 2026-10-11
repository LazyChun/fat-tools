/*
 * 哈希计算工具：文本 / 文件，支持 MD5、SHA-1、SHA-2、SHA-3、SM3、CRC-32
 * 共 12 种算法；文件哈希为流式分块单遍读取，多算法同时喂入，支持进度与取消。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  Progress,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  FileOutlined,
  InboxOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  HASH_ALGORITHMS,
  HashCancelledError,
  formatBytes,
  formatDigest,
  hashFile,
  hashText,
  matchesExpected,
  type FileHashResult,
  type HashAlgorithm,
  type HashOutputFormat,
} from "../hash";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import {
  recordUsage,
  recordUsageDebounced,
  suppressNextRecord,
} from "../historyClient";

const { TextArea } = Input;
const { Text } = Typography;
const { Dragger } = Upload;
const { CheckableTag } = Tag;

interface Props {
  onBack?: () => void;
}

const DEFAULT_ALGOS: HashAlgorithm[] = ["MD5", "SHA-256"];

const FORMAT_OPTIONS: { value: HashOutputFormat; label: string }[] = [
  { value: "lower", label: "小写 HEX" },
  { value: "upper", label: "大写 HEX" },
  { value: "base64", label: "Base64" },
];

/** 输入预览：压平空白并截断，保证不同输入的历史记录一眼可辨 */
function textPreview(s: string, max = 20): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 按注册顺序取哈希表中的算法（用于展示历史恢复等含任意算法子集的结果） */
function algoOrderOf(hashes: Record<string, string>): HashAlgorithm[] {
  return HASH_ALGORITHMS.map((m) => m.id).filter((id) => hashes[id]);
}

const HashTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [selected, setSelected] = useState<HashAlgorithm[]>(DEFAULT_ALGOS);
  const [format, setFormat] = useState<HashOutputFormat>("lower");

  // 文本模式
  const [text, setText] = useState("");
  const [textHashes, setTextHashes] = useState<Record<string, string>>({});
  const [computing, setComputing] = useState(false);
  const [expected, setExpected] = useState("");

  // 文件模式
  const [files, setFiles] = useState<FileHashResult[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [error, setError] = useState("");
  const cancelRef = useRef(false);
  const queueRef = useRef<File[]>([]);
  const runningRef = useRef(false);

  /** 选中算法按注册顺序排列（展示与计算都用它，保证顺序稳定） */
  const activeAlgos = useMemo(
    () =>
      HASH_ALGORITHMS.map((m) => m.id).filter((id) => selected.includes(id)),
    [selected],
  );
  const activeRef = useRef(activeAlgos);
  activeRef.current = activeAlgos;

  // 文本哈希：150ms 防抖后同步计算（纯 TS 实现，常规文本毫秒级）
  useEffect(() => {
    if (!text || activeAlgos.length === 0) {
      setTextHashes({});
      setComputing(false);
      return;
    }
    setComputing(true);
    const timer = window.setTimeout(() => {
      setTextHashes(hashText(activeAlgos, text));
      setComputing(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [text, activeAlgos]);

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
              summary: `计算「${textPreview(text)}」的哈希（${activeAlgos.length} 种算法）`,
              detail: {
                mode: "text",
                input: text,
                inputLen: text.length,
                algos: activeAlgos,
                hashes: textHashes,
              },
            }
          : null,
      2000,
    );
  }, [text, activeAlgos, textHashes]);

  /** 期望值比对：命中的算法列表（支持 HEX 大小写与 Base64） */
  const matched = useMemo(() => {
    const e = expected.trim();
    if (!e) return null;
    return activeAlgos.filter(
      (a) => textHashes[a] && matchesExpected(textHashes[a], e),
    );
  }, [expected, activeAlgos, textHashes]);

  /** 串行处理文件队列：每个文件单遍 IO 喂入全部选中算法 */
  const processQueue = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setFileBusy(true);
    setError("");
    cancelRef.current = false;
    try {
      while (queueRef.current.length > 0) {
        if (cancelRef.current) throw new HashCancelledError();
        const file = queueRef.current.shift()!;
        setCurrentName(file.name || "文件");
        const result = await hashFile(activeRef.current, file, {
          onProgress: setProgress,
          shouldCancel: () => cancelRef.current,
        });
        setFiles((prev) => [
          result,
          ...prev.filter(
            (f) => f.name !== result.name || f.size !== result.size,
          ),
        ]);
        recordUsage({
          toolId: "hash",
          toolTitle: "哈希计算",
          action: "file",
          summary: `计算文件哈希：${result.name}（${formatBytes(result.size)}）`,
          detail: {
            mode: "file",
            name: result.name,
            size: result.size,
            hashes: result.hashes,
          },
        });
      }
    } catch (e) {
      queueRef.current.length = 0;
      setError(
        e instanceof HashCancelledError
          ? "已取消剩余文件"
          : (e as Error).message || String(e),
      );
    } finally {
      runningRef.current = false;
      setFileBusy(false);
      setProgress(0);
      setCurrentName("");
    }
  };

  const enqueueFiles = (list: File[]) => {
    if (list.length === 0) return;
    queueRef.current.push(...list);
    void processQueue();
  };

  const algoSelector = (
    <div>
      <Text strong style={{ display: "block", marginBottom: 6 }}>
        算法
      </Text>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        {HASH_ALGORITHMS.map((m) => (
          <Tooltip
            key={m.id}
            title={`${m.family} · 摘要 ${m.digestBytes} 字节${m.legacy ? " · 不适用于安全场景，仅作校验" : ""}`}
          >
            <CheckableTag
              checked={selected.includes(m.id)}
              onChange={(checked) =>
                setSelected((prev) =>
                  checked ? [...prev, m.id] : prev.filter((x) => x !== m.id),
                )
              }
            >
              {m.id}
            </CheckableTag>
          </Tooltip>
        ))}
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => setSelected(HASH_ALGORITHMS.map((m) => m.id))}
        >
          全选
        </Button>
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => setSelected(DEFAULT_ALGOS)}
        >
          默认
        </Button>
        {activeAlgos.length === 0 ? (
          <Text type="warning" style={{ fontSize: 12 }}>
            请至少选择一种算法
          </Text>
        ) : null}
      </div>
    </div>
  );

  const resultRows = (
    hashes: Record<string, string>,
    algos: HashAlgorithm[],
  ) => (
    <div style={{ display: "grid", gap: 6 }}>
      {algos.map((a) => (
        <StatRow
          key={a}
          label={a}
          value={hashes[a] ? formatDigest(hashes[a], format) : "…"}
          copyable={!!hashes[a]}
        />
      ))}
    </div>
  );

  return (
    <ToolShell
      title="哈希计算"
      onBack={onBack}
      extra={
        <Segmented
          size="small"
          options={FORMAT_OPTIONS}
          value={format}
          onChange={(v) => setFormat(v as HashOutputFormat)}
        />
      }
    >
      <div style={{ display: "grid", gap: 20 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as "text" | "file")}
          options={[
            { value: "text", label: "文本哈希" },
            { value: "file", label: "文件哈希" },
          ]}
        />

        {algoSelector}

        {mode === "text" ? (
          <div>
            <TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入任意文本，自动计算选中算法的哈希（UTF-8 编码）…"
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
            <Input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="期望摘要（可选）：粘贴已知哈希值自动比对，支持 HEX 大小写与 Base64"
              allowClear
              style={{ marginTop: 8 }}
            />
            {matched !== null && Object.keys(textHashes).length > 0 ? (
              matched.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <Tag color="success">✓ 与 {matched.join("、")} 匹配</Tag>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <Tag color="error">无匹配：期望值与所选算法结果均不一致</Tag>
                </div>
              )
            ) : null}
            {text && activeAlgos.length > 0 ? (
              <Spin
                spinning={computing}
                size="small"
                style={{ display: "block", marginTop: 8 }}
              >
                {resultRows(textHashes, activeAlgos)}
              </Spin>
            ) : null}
          </div>
        ) : (
          <div>
            <Dragger
              multiple
              showUploadList={false}
              beforeUpload={(file) => {
                enqueueFiles([file as unknown as File]);
                return false;
              }}
              style={{ padding: "6px 0", height: "120px" }}
            >
              <p style={{ margin: 0, fontSize: 28, color: "#1677ff" }}>
                <InboxOutlined />
              </p>
              <p style={{ margin: "6px 0 2px" }}>
                点击或拖拽文件到此处计算哈希
              </p>
              <p style={{ margin: 0 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  文件仅在本机浏览器内计算，不会上传；大文件分块流式处理，多算法单遍完成
                </Text>
              </p>
            </Dragger>

            {fileBusy ? (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Progress
                    percent={progress}
                    size="small"
                    style={{ margin: 0 }}
                  />
                </div>
                <Text
                  type="secondary"
                  style={{ fontSize: 12, flexShrink: 0, maxWidth: 200 }}
                  ellipsis
                >
                  {currentName}
                </Text>
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  取消
                </Button>
              </div>
            ) : null}

            {error ? (
              <div style={{ color: "#cf1322", marginTop: 8 }}>{error}</div>
            ) : null}

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

            {files.length > 0 ? (
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {files.map((f) => {
                  const algos = algoOrderOf(f.hashes);
                  const key = `${f.name}-${f.size}-${algos
                    .map((a) => f.hashes[a])
                    .join(",")
                    .slice(0, 48)}`;
                  return (
                    <div
                      key={key}
                      style={{
                        border: "1px solid rgba(128,128,128,0.25)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <FileOutlined />
                        <Text
                          strong
                          style={{
                            flex: 1,
                            minWidth: 0,
                            wordBreak: "break-all",
                          }}
                        >
                          {f.name || "文件"}
                        </Text>
                        <Text
                          type="secondary"
                          style={{ fontSize: 12, flexShrink: 0 }}
                        >
                          {formatBytes(f.size)}
                          {f.durationMs ? ` · ${f.durationMs} ms` : ""}
                        </Text>
                      </div>
                      {resultRows(f.hashes, algos)}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ position: "relative", paddingTop: 20 }}>
        <ToolHistoryPanel
          toolId="hash"
          toolTitle="哈希计算"
          reloadKey={text ? 1 : 0}
          onRestore={(d) => {
            if (d.mode === "text" || typeof d.input === "string") {
              suppressNextRecord("hash-text");
              setMode("text");
              setText(String(d.input ?? ""));
            } else if (d.mode === "file" || typeof d.name === "string") {
              // 新格式存 hashes；旧格式存 md5 + shas，做一次兼容归一
              const legacy =
                typeof d.md5 === "string"
                  ? {
                      MD5: String(d.md5),
                      ...((d.shas as Record<string, string>) || {}),
                    }
                  : {};
              const hashes = {
                ...legacy,
                ...((d.hashes as Record<string, string>) || {}),
              };
              const name = String(d.name ?? "文件");
              const size = Number(d.size) || 0;
              setMode("file");
              setFiles((prev) => [
                { name, size, hashes, durationMs: 0 },
                ...prev.filter((f) => f.name !== name || f.size !== size),
              ]);
            }
          }}
        />
      </div>
    </ToolShell>
  );
};

export default HashTool;
