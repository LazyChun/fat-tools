/*
 * 格式转换（批量）：图片 / 视频 / 音频，复用宿主 ffmpeg。
 *
 * 流程：
 *   1. 环境检测（convert.env）—— 宿主 ffmpeg 未安装时提示，不可转换
 *   2. 添加文件（宿主原生对话框）或添加文件夹（递归扫描媒体）
 *   3. 后台 probe 音视频元信息（时长 / 分辨率），列表展示
 *   4. 按媒体类型选目标格式 + 质量档位，开始批量转换
 *   5. 1s 轮询 convert.status：总体进度 + 每文件进度，可取消
 *   6. 完成后统计 + 打开输出目录
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Button,
  Empty,
  message,
  Popconfirm,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ClearOutlined,
  DeleteOutlined,
  FileSyncOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SelectOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { getSdk, recordUsage } from "../historyClient";
import { humanFileSize } from "../utils";

const { Text } = Typography;

type MediaType = "image" | "video" | "audio" | "document";
type ItemStatus =
  | "queued"
  | "converting"
  | "done"
  | "failed"
  | "skipped"
  | "cancelled";

interface MediaSummary {
  formatName?: string | null;
  durationMs?: number | null;
  video?: { codec?: string; width?: number; height?: number } | null;
  audio?: { codec?: string; sampleRate?: string; channels?: number } | null;
}

interface ConvertItem {
  id: string;
  path: string;
  name: string;
  ext: string;
  mediaType: MediaType;
  sizeBytes: number;
  summary?: MediaSummary | null;
  probeError?: string | null;
  status: ItemStatus;
  percent?: number | null;
  speed?: string | null;
  error?: string | null;
  outputPath?: string | null;
  outputSize?: number | null;
  target?: string | null;
}

interface TaskState {
  running: boolean;
  outputDir?: string | null;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  items: ConvertItem[];
}

const MEDIA_LABEL: Record<MediaType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
};
const MEDIA_COLOR: Record<MediaType, string> = {
  image: "blue",
  video: "purple",
  audio: "green",
  document: "orange",
};
const STATUS_LABEL: Record<ItemStatus, string> = {
  queued: "排队中",
  converting: "转换中",
  done: "完成",
  failed: "失败",
  skipped: "跳过",
  cancelled: "已取消",
};

const FALLBACK_FORMATS: Record<MediaType, string[]> = {
  image: ["png", "jpg", "webp", "bmp", "gif", "tiff"],
  video: ["mp4", "mkv", "mov", "avi", "webm", "ts"],
  audio: ["mp3", "wav", "aac", "flac", "ogg", "m4a", "opus", "wma"],
  document: ["pdf"],
};
const DEFAULT_TARGET: Record<MediaType, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3",
  document: "pdf",
};

function fmtDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function fmtSummary(it: ConvertItem): string {
  const s = it.summary;
  if (!s) return it.probeError ? "信息探测失败" : "—";
  const parts: string[] = [];
  if (s.video?.width && s.video?.height) {
    parts.push(`${s.video.width}×${s.video.height}`);
  }
  const dur = fmtDuration(s.durationMs);
  if (dur) parts.push(dur);
  if (s.video?.codec) parts.push(String(s.video.codec));
  if (!s.video && s.audio?.sampleRate) parts.push(`${s.audio.sampleRate} Hz`);
  return parts.length ? parts.join(" · ") : "—";
}

const ConvertTool: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [envReady, setEnvReady] = useState<boolean | null>(null);
  const [envVersion, setEnvVersion] = useState<string | null>(null);
  const [formats, setFormats] =
    useState<Record<MediaType, string[]>>(FALLBACK_FORMATS);

  const [state, setState] = useState<TaskState>({
    running: false,
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    items: [],
  });
  const [targets, setTargets] = useState<Record<MediaType, string>>({
    ...DEFAULT_TARGET,
  });
  const [quality, setQuality] = useState<"high" | "medium" | "low">("medium");
  const [audioBitrate, setAudioBitrate] = useState("192k");
  const [outputMode, setOutputMode] = useState<"same" | "custom">("same");
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const recordedRef = useRef(false);

  const items = state.items;
  const running = state.running;

  const mediaTypes = useMemo(() => {
    const set = new Set<MediaType>();
    items.forEach((it) => {
      if (it.status === "queued") set.add(it.mediaType);
    });
    return set;
  }, [items]);

  // 音/视频刚入列、probe 未返回时做慢速轮询刷新元信息
  const probing = useMemo(
    () =>
      items.some(
        (it) =>
          it.status === "queued" &&
          (it.mediaType === "video" || it.mediaType === "audio") &&
          !it.summary &&
          !it.probeError,
      ),
    [items],
  );

  const refresh = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    try {
      const s = await sdk.backend.invoke<TaskState>("convert.status", {}, 30);
      if (s && Array.isArray(s.items)) {
        setState(s);
      }
    } catch {
      /* 后端重启等场景忽略本次刷新 */
    }
  }, []);

  // 挂载即拉取状态与环境
  useEffect(() => {
    void (async () => {
      const sdk = getSdk();
      if (!sdk) return;
      try {
        const env = await sdk.backend.invoke<{
          ready?: boolean;
          version?: string | null;
          outputFormats?: Record<MediaType, string[]>;
        }>("convert.env", {}, 30);
        setEnvReady(Boolean(env?.ready));
        setEnvVersion(env?.version || null);
        if (env?.outputFormats && env.outputFormats.image?.length) {
          setFormats(env.outputFormats);
        }
      } catch (e) {
        setEnvReady(false);
        void e;
      }
      void refresh();
    })();
  }, [refresh]);

  // 智能轮询：转换中 1s；probe 未完成 2s；否则停
  useEffect(() => {
    if (!running && !probing) return;
    const iv = window.setInterval(refresh, running ? 1000 : 2000);
    return () => window.clearInterval(iv);
  }, [running, probing, refresh]);

  // 任务刚结束时记录操作历史
  useEffect(() => {
    if (running || startingRef.current) {
      recordedRef.current = false;
      return;
    }
    if (recordedRef.current) return;
    if (
      state.items.some((it) => it.status === "done" || it.status === "failed")
    ) {
      recordedRef.current = true;
      recordUsage({
        toolId: "media-convert",
        toolTitle: "格式转换",
        action: "convert",
        summary: `成功 ${state.done} · 失败 ${state.failed} · 跳过 ${state.skipped}`,
        detail: {
          done: state.done,
          failed: state.failed,
          skipped: state.skipped,
          targets,
          quality,
          audioBitrate,
        },
      });
    }
  }, [running, state, targets, quality, audioBitrate]);

  const addFiles = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    try {
      const r = await sdk.backend.invoke<{
        cancelled?: boolean;
        items?: ConvertItem[];
        skipped?: number;
        error?: string;
      }>("convert.pickFiles", {}, 600);
      if (r?.error) {
        message.error(`选择文件失败：${r.error}`);
        return;
      }
      if (r?.items?.length) {
        message.success(
          `已添加 ${r.items.length} 个文件${r.skipped ? `（跳过 ${r.skipped} 个非媒体/重复项）` : ""}`,
        );
        void refresh();
      }
    } catch (e) {
      message.error(`调用失败：${(e as Error)?.message || e}`);
    }
  }, [refresh]);

  const addFolder = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    try {
      const r = await sdk.backend.invoke<{
        cancelled?: boolean;
        items?: ConvertItem[];
        skipped?: number;
        error?: string;
      }>("convert.pickFolder", {}, 600);
      if (r?.error) {
        message.error(`选择文件夹失败：${r.error}`);
        return;
      }
      if (r?.items?.length) {
        message.success(`已扫描添加 ${r.items.length} 个媒体文件`);
        void refresh();
      } else if (!r?.cancelled) {
        message.info("该文件夹内未发现媒体文件");
      }
    } catch (e) {
      message.error(`调用失败：${(e as Error)?.message || e}`);
    }
  }, [refresh]);

  const removeItems = useCallback(
    async (ids: string[]) => {
      const sdk = getSdk();
      if (!sdk || !ids.length) return;
      try {
        await sdk.backend.invoke("convert.remove", { ids }, 30);
        void refresh();
      } catch (e) {
        message.error(`移除失败：${(e as Error)?.message || e}`);
      }
    },
    [refresh],
  );

  const clearAll = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    try {
      await sdk.backend.invoke("convert.clear", {}, 30);
      void refresh();
    } catch (e) {
      message.error(`清空失败：${(e as Error)?.message || e}`);
    }
  }, [refresh]);

  const chooseOutputDir = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    try {
      const r = await sdk.backend.invoke<{
        cancelled?: boolean;
        path?: string | null;
        error?: string;
      }>("convert.selectFolder", {}, 600);
      if (r?.error) {
        message.error(`选择目录失败：${r.error}`);
        return;
      }
      if (r?.path) {
        setOutputDir(r.path);
        setOutputMode("custom");
      }
    } catch (e) {
      message.error(`调用失败：${(e as Error)?.message || e}`);
    }
  }, []);

  const startConvert = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    if (envReady === false) {
      message.error("宿主 ffmpeg 不可用，请先在宿主设置中安装");
      return;
    }
    const t: Record<string, string> = {};
    mediaTypes.forEach((m) => {
      t[m] = targets[m];
    });
    if (!Object.keys(t).length) {
      message.warning("没有待转换的文件");
      return;
    }
    if (outputMode === "custom" && !outputDir) {
      message.warning("请先选择输出目录");
      return;
    }
    setStarting(true);
    startingRef.current = true;
    try {
      await sdk.backend.invoke(
        "convert.start",
        {
          targets: t,
          options: { quality, audioBitrate },
          outputDir: outputMode === "custom" ? outputDir : "",
        },
        60,
      );
      message.info("开始转换");
      await refresh();
    } catch (e) {
      message.error(`启动失败：${(e as Error)?.message || e}`);
    } finally {
      setStarting(false);
      startingRef.current = false;
    }
  }, [
    envReady,
    mediaTypes,
    targets,
    quality,
    audioBitrate,
    outputMode,
    outputDir,
    refresh,
  ]);

  const cancelConvert = useCallback(async () => {
    const sdk = getSdk();
    if (!sdk) return;
    try {
      await sdk.backend.invoke("convert.cancel", {}, 30);
      message.info("正在取消…");
      void refresh();
    } catch (e) {
      message.error(`取消失败：${(e as Error)?.message || e}`);
    }
  }, [refresh]);

  const openOutput = useCallback(
    async (path?: string | null) => {
      const sdk = getSdk();
      if (!sdk) return;
      const target = path || (outputMode === "custom" ? outputDir : null);
      if (!target) {
        message.info("输出位置为源文件所在目录");
        return;
      }
      try {
        await sdk.backend.invoke("convert.openOutput", { path: target }, 30);
      } catch (e) {
        message.error(`打开失败：${(e as Error)?.message || e}`);
      }
    },
    [outputMode, outputDir],
  );

  const queuedCount = items.filter((it) => it.status === "queued").length;
  const overallPercent = useMemo(() => {
    const finished = state.done + state.failed + state.skipped;
    if (!state.total) return 0;
    const convertingPct = items
      .filter((it) => it.status === "converting")
      .reduce((acc, it) => acc + (it.percent || 0), 0);
    return Math.min(
      100,
      ((finished + convertingPct / 100) / state.total) * 100,
    );
  }, [state, items]);

  const columns = useMemo(
    () => [
      {
        title: "类型",
        key: "mediaType",
        width: 72,
        render: (_: unknown, it: ConvertItem) => (
          <Tag color={MEDIA_COLOR[it.mediaType]} style={{ marginInlineEnd: 0 }}>
            {MEDIA_LABEL[it.mediaType]}
          </Tag>
        ),
      },
      {
        title: "文件",
        key: "name",
        ellipsis: true,
        render: (_: unknown, it: ConvertItem) => (
          <Tooltip title={it.path} placement="topLeft">
            <Text
              strong={it.status === "converting"}
              style={{ fontSize: 12.5 }}
            >
              {it.name}
            </Text>
          </Tooltip>
        ),
      },
      {
        title: "源 → 目标",
        key: "format",
        width: 130,
        render: (_: unknown, it: ConvertItem) => (
          <Space size={4}>
            <Text type="secondary" style={{ textTransform: "uppercase" }}>
              {it.ext}
            </Text>
            {it.target && it.target !== it.ext ? (
              <>
                <Text type="secondary">→</Text>
                <Text style={{ textTransform: "uppercase" }}>{it.target}</Text>
              </>
            ) : null}
          </Space>
        ),
      },
      {
        title: "大小",
        key: "size",
        width: 90,
        render: (_: unknown, it: ConvertItem) => (
          <Text type="secondary">{humanFileSize(it.sizeBytes || 0)}</Text>
        ),
      },
      {
        title: "媒体信息",
        key: "info",
        width: 190,
        ellipsis: true,
        render: (_: unknown, it: ConvertItem) => (
          <Text type="secondary">{fmtSummary(it)}</Text>
        ),
      },
      {
        title: "状态",
        key: "status",
        width: 170,
        render: (_: unknown, it: ConvertItem) => {
          if (it.status === "converting") {
            const pct = it.percent;
            return (
              <Space size={4} style={{ width: "100%" }}>
                <Progress
                  percent={pct ?? 0}
                  size="small"
                  status={pct == null ? "active" : "normal"}
                  showInfo={pct != null}
                  style={{ width: pct == null ? 100 : 110, marginBottom: 0 }}
                />
                {it.speed ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {it.speed}
                  </Text>
                ) : null}
              </Space>
            );
          }
          const statusText =
            it.status === "failed" && it.error ? (
              <Tooltip title={it.error}>
                <Text type="danger" style={{ cursor: "help" }}>
                  失败（查看原因）
                </Text>
              </Tooltip>
            ) : (
              <Text
                type={
                  it.status === "done"
                    ? "success"
                    : it.status === "failed"
                      ? "danger"
                      : "secondary"
                }
              >
                {it.status === "done" && it.outputSize
                  ? `完成（${humanFileSize(it.outputSize)}）`
                  : STATUS_LABEL[it.status]}
              </Text>
            );
          return statusText;
        },
      },
      {
        title: "",
        key: "actions",
        width: 60,
        render: (_: unknown, it: ConvertItem) => {
          if (it.status === "done" && it.outputPath) {
            return (
              <Tooltip title="打开输出位置">
                <Button
                  type="text"
                  size="small"
                  icon={<SelectOutlined />}
                  onClick={() => void openOutput(it.outputPath)}
                />
              </Tooltip>
            );
          }
          if (running || it.status === "converting") return null;
          return (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => void removeItems([it.id])}
            />
          );
        },
      },
    ],
    [running, removeItems, openOutput],
  );

  const formatSelect = (m: MediaType) => (
    <Select
      size="small"
      value={targets[m]}
      onChange={(v) => setTargets((prev) => ({ ...prev, [m]: v }))}
      disabled={running}
      style={{ width: 120 }}
      options={formats[m].map((f) => ({
        value: f,
        label: f.toUpperCase(),
      }))}
    />
  );

  return (
    <ToolShell
      title="格式转换"
      onBack={onBack}
      extra={
        envReady === false ? (
          <Tag color="error">宿主 ffmpeg 未安装</Tag>
        ) : envReady ? (
          <Tag color="success" icon={<ThunderboltOutlined />}>
            {envVersion ? "ffmpeg 就绪" : "ffmpeg 就绪"}
          </Tag>
        ) : null
      }
    >
      {envReady === false && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="宿主 ffmpeg 不可用"
          description="转换能力依赖宿主的 ffmpeg。请在 FatNotes 设置中安装 ffmpeg 后重试。"
        />
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <Button
          icon={<PlusOutlined />}
          onClick={() => void addFiles()}
          disabled={running}
        >
          添加文件
        </Button>
        <Button
          icon={<FolderOpenOutlined />}
          onClick={() => void addFolder()}
          disabled={running}
        >
          添加文件夹
        </Button>
        {items.length > 0 && (
          <Popconfirm
            title="清空文件清单？"
            onConfirm={() => void clearAll()}
            disabled={running}
          >
            <Button icon={<ClearOutlined />} disabled={running}>
              清空
            </Button>
          </Popconfirm>
        )}
        {queuedCount > 0 && (
          <Text type="secondary">待转换 {queuedCount} 个文件</Text>
        )}
      </Space>

      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={items}
        pagination={
          items.length > 50 ? { pageSize: 50, hideOnSinglePage: true } : false
        }
        scroll={{ y: 300 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无文件，点击「添加文件」或「添加文件夹」"
            >
              <Button
                type="primary"
                icon={<FileSyncOutlined />}
                onClick={() => void addFiles()}
                disabled={running}
              >
                添加文件
              </Button>
            </Empty>
          ),
        }}
        style={{ marginBottom: 12 }}
      />

      <Space
        direction="vertical"
        size={8}
        style={{ width: "100%", maxWidth: 560 }}
      >
        {mediaTypes.size > 0 && (
          <Space wrap size={16}>
            {Array.from(mediaTypes).map((m) => (
              <Space key={m} size={6}>
                <Text type="secondary">{MEDIA_LABEL[m]}转为</Text>
                {formatSelect(m)}
              </Space>
            ))}
          </Space>
        )}
        <Space wrap size={16}>
          {(mediaTypes.has("image") || mediaTypes.has("video")) && (
            <Space size={6}>
              <Text type="secondary">质量</Text>
              <Segmented
                size="small"
                value={quality}
                onChange={(v) => setQuality(v as "high" | "medium" | "low")}
                disabled={running}
                options={[
                  { value: "high", label: "高" },
                  { value: "medium", label: "中" },
                  { value: "low", label: "低" },
                ]}
              />
            </Space>
          )}
          {mediaTypes.has("audio") && (
            <Space size={6}>
              <Text type="secondary">音频码率</Text>
              <Select
                size="small"
                value={audioBitrate}
                onChange={setAudioBitrate}
                disabled={running}
                style={{ width: 100 }}
                options={["96k", "128k", "192k", "320k"].map((b) => ({
                  value: b,
                  label: b,
                }))}
              />
            </Space>
          )}
          <Space size={6}>
            <Text type="secondary">输出到</Text>
            <Segmented
              size="small"
              value={outputMode}
              onChange={(v) => setOutputMode(v as "same" | "custom")}
              disabled={running}
              options={[
                { value: "same", label: "源文件目录" },
                { value: "custom", label: "指定目录" },
              ]}
            />
            {outputMode === "custom" && (
              <Button
                size="small"
                icon={<FolderOpenOutlined />}
                onClick={() => void chooseOutputDir()}
              >
                {outputDir || "选择目录"}
              </Button>
            )}
          </Space>
        </Space>
      </Space>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {running ? (
          <>
            <Button danger loading onClick={() => void cancelConvert()}>
              取消转换
            </Button>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Progress
                percent={Math.round(overallPercent * 10) / 10}
                size="small"
                status="active"
              />
            </div>
            <Text type="secondary">
              {state.done + state.failed + state.skipped} / {state.total} 完成
            </Text>
          </>
        ) : (
          <>
            <Button
              type="primary"
              icon={<FileSyncOutlined />}
              loading={starting}
              disabled={queuedCount === 0 || envReady === false}
              onClick={() => void startConvert()}
            >
              开始转换{queuedCount > 0 ? `（${queuedCount}）` : ""}
            </Button>
            {!running &&
              state.total > 0 &&
              (state.done > 0 || state.failed > 0) && (
                <>
                  <Text>
                    上次结果：<Text type="success">成功 {state.done}</Text>
                    {state.failed > 0 && (
                      <Text type="danger"> · 失败 {state.failed}</Text>
                    )}
                    {state.skipped > 0 && (
                      <Text type="secondary"> · 跳过 {state.skipped}</Text>
                    )}
                  </Text>
                  <Button
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={() => void openOutput(null)}
                  >
                    打开输出目录
                  </Button>
                </>
              )}
          </>
        )}
      </div>
    </ToolShell>
  );
};

export default ConvertTool;
