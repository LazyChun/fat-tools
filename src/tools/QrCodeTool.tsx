/*
 * 二维码工具：生成（可调纠错级别/尺寸/静区/颜色，导出 PNG / SVG）
 * 与解析（上传图片识别二维码内容）
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Checkbox,
  ColorPicker,
  Segmented,
  Select,
  Slider,
  Space,
  Typography,
  Upload,
  message,
} from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import {
  recordUsage,
  recordUsageDebounced,
  suppressNextRecord,
} from "../historyClient";

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

type Mode = "generate" | "decode";

const LEVELS: { value: "L" | "M" | "Q" | "H"; label: string }[] = [
  { value: "L", label: "L（约 7%，容量最大）" },
  { value: "M", label: "M（约 15%，默认）" },
  { value: "Q", label: "Q（约 25%）" },
  { value: "H", label: "H（约 30%，容错最强）" },
];

/** 转为 qrcode 需要的 8 位十六进制颜色（#RRGGBBAA） */
function toHex8(hex: string, alpha = "ff"): string {
  const h = hex.replace("#", "");
  const six =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  return `#${six}${alpha}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Props {
  onBack?: () => void;
}

const QrCodeTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<Mode>("generate");

  // ── 生成 ─────────────────────────────────────────────
  const [text, setText] = useState("https://www.example.com");
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(4);
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const lightColor = useMemo(
    () => (transparent ? "#ffffff00" : toHex8(light)),
    [transparent, light],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!text.trim()) {
      setError("");
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    QRCode.toCanvas(canvas, text, {
      errorCorrectionLevel: level,
      width: size,
      margin,
      color: { dark: toHex8(dark), light: lightColor },
    })
      .then(() => setError(""))
      .catch((e: Error) => setError(e.message || "生成失败"));
    // mode 参与依赖：从「解析」切回「生成」时画布是新建的，需要重新绘制
  }, [mode, text, level, size, margin, dark, lightColor]);

  // 生成内容停顿 2s 后落库
  useEffect(() => {
    recordUsageDebounced(
      "qrcode",
      () => {
        if (!text.trim()) return null;
        return {
          toolId: "qrcode",
          toolTitle: "二维码工具",
          action: "generate",
          summary: `生成二维码：${text.slice(0, 40)}`,
          detail: { text, level, size, margin, dark, light, transparent },
        };
      },
      2000,
    );
  }, [text, level, size, margin, dark, light, transparent]);

  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !text.trim()) return;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, "qrcode.png");
    }, "image/png");
  }, [text]);

  const exportSvg = useCallback(async () => {
    if (!text.trim()) return;
    try {
      const svg = await QRCode.toString(text, {
        type: "svg",
        margin,
        width: size,
        color: { dark: toHex8(dark), light: lightColor },
      });
      downloadBlob(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
        "qrcode.svg",
      );
    } catch (e) {
      message.error((e as Error).message || "导出 SVG 失败");
    }
  }, [text, margin, size, dark, lightColor]);

  // ── 解析 ─────────────────────────────────────────────
  const [decoded, setDecoded] = useState("");
  const [decodeError, setDecodeError] = useState("");
  const [preview, setPreview] = useState("");

  // 预览图切换/卸载时释放旧的 objectURL
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const decodeFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxSide = 1200;
      const ratio = Math.min(
        1,
        maxSide / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setDecodeError("无法创建画布");
        URL.revokeObjectURL(url);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const found = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
      if (found && found.data) {
        setDecoded(found.data);
        setDecodeError("");
        recordUsage({
          toolId: "qrcode",
          toolTitle: "二维码工具",
          action: "decode",
          summary: `识别二维码：${found.data.slice(0, 40)}`,
          detail: { decoded: found.data, file: file.name },
        });
        setHistoryKey((k) => k + 1);
      } else {
        setDecoded("");
        setDecodeError("未识别到二维码，请换更清晰、更完整的图片");
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setDecodeError("图片读取失败");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            setPreview(URL.createObjectURL(file));
            decodeFile(file);
          }
          return;
        }
      }
    },
    [decodeFile],
  );

  const generateExtra = (
    <Space size={8}>
      <Button
        size="small"
        icon={<DownloadOutlined />}
        disabled={!text.trim()}
        onClick={exportSvg}
      >
        导出 SVG
      </Button>
      <Button
        size="small"
        type="primary"
        icon={<DownloadOutlined />}
        disabled={!text.trim()}
        onClick={exportPng}
      >
        导出 PNG
      </Button>
    </Space>
  );

  return (
    <ToolShell
      title="二维码工具"
      onBack={onBack}
      extra={
        <Space size={12}>
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: "generate", label: "生成" },
              { value: "decode", label: "解析" },
            ]}
          />
          {mode === "generate" ? generateExtra : null}
        </Space>
      }
    >
      {mode === "generate" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, auto)",
            gap: 20,
          }}
        >
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              二维码内容（文本 / 网址 / 文本片段，支持换行）
            </Text>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="输入要生成二维码的内容…"
              style={{
                width: "100%",
                marginTop: 4,
                marginBottom: 12,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(128,128,128,0.35)",
                background: "transparent",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: 13,
                resize: "vertical",
              }}
            />

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  纠错级别
                </Text>
                <Select
                  size="small"
                  value={level}
                  onChange={setLevel}
                  options={LEVELS}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  尺寸：{size}px
                </Text>
                <Slider
                  min={128}
                  max={1024}
                  step={32}
                  value={size}
                  onChange={setSize}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  静区（白边）：{margin}
                </Text>
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={margin}
                  onChange={setMargin}
                />
              </div>
              <Space size={16} wrap>
                <Space size={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    前景色
                  </Text>
                  <ColorPicker
                    size="small"
                    value={dark}
                    onChange={(c) => setDark(c.toHexString())}
                  />
                </Space>
                <Space size={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    背景色
                  </Text>
                  <ColorPicker
                    size="small"
                    value={light}
                    disabled={transparent}
                    onChange={(c) => setLight(c.toHexString())}
                  />
                </Space>
                <Checkbox
                  checked={transparent}
                  onChange={(e) => setTransparent(e.target.checked)}
                >
                  透明背景
                </Checkbox>
              </Space>
            </div>

            {error ? (
              <div style={{ color: "#cf1322", marginTop: 12 }}>
                生成失败：{error}
              </div>
            ) : null}

            <Space size={8} style={{ marginTop: 12 }}>
              <CopyButton text={text} label="复制内容" />
            </Space>
          </div>

          <div>
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                border: "1px solid rgba(128,128,128,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 200,
                // 棋盘格底纹，便于观察透明背景
                backgroundImage: transparent
                  ? "linear-gradient(45deg, rgba(128,128,128,0.2) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.2) 75%), linear-gradient(45deg, rgba(128,128,128,0.2) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.2) 75%)"
                  : undefined,
                backgroundSize: transparent ? "16px 16px" : undefined,
                backgroundPosition: transparent ? "0 0, 8px 8px" : undefined,
              }}
            >
              <canvas
                ref={canvasRef}
                style={{ maxWidth: "100%", height: "auto" }}
              />
            </div>
            {text.trim() ? (
              <Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginTop: 8 }}
              >
                内容长度：{text.length} 字符
              </Text>
            ) : (
              <Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginTop: 8 }}
              >
                输入内容后实时生成二维码
              </Text>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, auto)",
            gap: 20,
          }}
        >
          <div onPaste={handlePaste} tabIndex={0} style={{ outline: "none" }}>
            <Dragger
              showUploadList={false}
              accept="image/*"
              beforeUpload={(file) => {
                setPreview(URL.createObjectURL(file as unknown as File));
                decodeFile(file as unknown as File);
                return false;
              }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">
                点击 / 拖拽图片到此处，或直接按 Ctrl+V 粘贴截图
              </p>
              <p className="ant-upload-hint">
                支持 PNG / JPG / WebP 等常见图片格式
              </p>
            </Dragger>

            {decodeError ? (
              <div style={{ color: "#cf1322", marginTop: 12 }}>
                {decodeError}
              </div>
            ) : null}

            {decoded ? (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  识别结果
                </Text>
                <Paragraph
                  copyable={{ text: decoded, tooltips: ["复制", "已复制"] }}
                  style={{
                    marginTop: 4,
                    marginBottom: 0,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(128,128,128,0.08)",
                    wordBreak: "break-all",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {decoded}
                </Paragraph>
                {/^https?:\/\//i.test(decoded) ? (
                  <Button
                    size="small"
                    type="link"
                    style={{ paddingLeft: 0 }}
                    href={decoded}
                    target="_blank"
                  >
                    打开链接
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              图片预览
            </Text>
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(128,128,128,0.25)",
                minHeight: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="待识别图片"
                  style={{ maxWidth: "100%", maxHeight: 320 }}
                />
              ) : (
                <Text type="secondary">上传图片后在此预览</Text>
              )}
            </div>
          </div>
        </div>
      )}

      <ToolHistoryPanel
        toolId="qrcode"
        toolTitle="二维码工具"
        reloadKey={historyKey}
        onRestore={(d) => {
          suppressNextRecord("qrcode");
          if (typeof d.text === "string") {
            setText(d.text);
            setMode("generate");
          }
          if (
            d.level === "L" ||
            d.level === "M" ||
            d.level === "Q" ||
            d.level === "H"
          )
            setLevel(d.level);
          if (typeof d.size === "number") setSize(d.size);
          if (typeof d.margin === "number") setMargin(d.margin);
          if (typeof d.dark === "string") setDark(d.dark);
          if (typeof d.light === "string") setLight(d.light);
          if (typeof d.transparent === "boolean") setTransparent(d.transparent);
        }}
      />
    </ToolShell>
  );
};

export default QrCodeTool;
