/*
 * 表情包制作：选模板或上传图片作底图，加顶部 / 底部文字，
 * 支持字号自动适配、描边、填色、留白与文字底条，一键导出 PNG。
 *
 * 渲染全部在 Canvas 上完成：预览画布按 devicePixelRatio 缩放，
 * 导出时用 2 倍尺寸重绘一次，保证清晰度。
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  ColorPicker,
  Input,
  Segmented,
  Slider,
  Space,
  Typography,
  Upload,
} from "antd";
import type { Color } from "antd/es/color-picker";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  MEME_TEMPLATES,
  memeFileName,
  memeTemplateOf,
  memeTextLayout,
  type MemeLayout,
  type MemeTemplateKey,
  type MemeZone,
} from "../utils";
import { ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

/** 表情包文字统一用粗黑字体，中文回落到系统中文字体 */
const MEME_FONT = (fs: number): string =>
  `900 ${fs}px "Impact","Arial Black","PingFang SC","Microsoft YaHei",sans-serif`;

/** 深空模板的固定星星（伪随机但稳定，重绘不闪） */
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const STAR_RAND = seededRand(42);
const STARS = Array.from({ length: 36 }, () => ({
  x: STAR_RAND(),
  y: STAR_RAND(),
  r: 0.6 + STAR_RAND() * 1.8,
}));

/** 程序化绘制内置模板背景（无版权素材依赖） */
function drawMemeTemplate(
  ctx: CanvasRenderingContext2D,
  key: MemeTemplateKey,
  w: number,
  h: number,
): void {
  ctx.save();
  switch (key) {
    case "plain":
      ctx.fillStyle = "#FAFAFA";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#D9D9D9";
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      break;
    case "yellow": {
      // 经典黄豆震惊脸
      ctx.fillStyle = "#FFD800";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.55;
      const r = Math.min(w, h) * 0.36;
      ctx.fillStyle = "#FFD800";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1F1F1F";
      ctx.lineWidth = Math.max(2, w * 0.012);
      ctx.stroke();
      // 眼（两个独立圆）
      ctx.fillStyle = "#1F1F1F";
      const er = Math.max(3, w * 0.026);
      ctx.beginPath();
      ctx.arc(cx - r * 0.48, cy - r * 0.38, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.48, cy - r * 0.38, er, 0, Math.PI * 2);
      ctx.fill();
      // O 形嘴
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.42, r * 0.2, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "green": {
      // 绿蛙无语脸
      ctx.fillStyle = "#A8D948";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.54;
      const r = Math.min(w, h) * 0.4;
      ctx.fillStyle = "#A8D948";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3D5A12";
      ctx.lineWidth = Math.max(2, w * 0.012);
      ctx.stroke();
      // 两个大白眼珠
      const wr = r * 0.24;
      const wOff = r * 0.42;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(cx - wOff, cy - r * 0.1, wr, 0, Math.PI * 2);
      ctx.arc(cx + wOff, cy - r * 0.1, wr, 0, Math.PI * 2);
      ctx.fill();
      // 上翻黑瞳
      ctx.fillStyle = "#1F1F1F";
      const pr = wr * 0.42;
      ctx.beginPath();
      ctx.arc(cx - wOff, cy - r * 0.16, pr, 0, Math.PI * 2);
      ctx.arc(cx + wOff, cy - r * 0.16, pr, 0, Math.PI * 2);
      ctx.fill();
      // 大嘴弧
      ctx.strokeStyle = "#1F1F1F";
      ctx.lineWidth = Math.max(2.5, w * 0.018);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.55, r * 0.5, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      break;
    }
    case "dark": {
      ctx.fillStyle = "#1A1A2E";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#F5F5FF";
      for (const s of STARS) {
        ctx.globalAlpha = 0.5 + s.r * 0.15;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "rainbow": {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#FF9A9E");
      g.addColorStop(0.5, "#A18CD1");
      g.addColorStop(1, "#4FACFE");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "grid": {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#E0E0E0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = 40;
      for (let x = step; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = step; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** 绘制一个文字区（含可选的半透明底条；w/h 为逻辑画布尺寸） */
function drawMemeZone(
  ctx: CanvasRenderingContext2D,
  zone: MemeZone,
  w: number,
  h: number,
  opts: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    band: boolean;
  },
): void {
  if (opts.band) {
    const minY = Math.min(...zone.ys) - zone.fontSize * 0.35;
    const maxY = Math.max(...zone.ys) + zone.fontSize * 0.15;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, Math.max(0, minY), w, Math.min(h, maxY) - Math.max(0, minY));
  }
  ctx.font = MEME_FONT(zone.fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = opts.strokeWidth;
  ctx.strokeStyle = opts.stroke;
  ctx.fillStyle = opts.fill;
  zone.lines.forEach((line, i) => {
    ctx.strokeText(line, zone.x, zone.ys[i]);
    ctx.fillText(line, zone.x, zone.ys[i]);
  });
}

interface MemeRenderOpts {
  template: MemeTemplateKey;
  image: HTMLImageElement | null;
  topText: string;
  bottomText: string;
  baseFontSize: number;
  strokeWidth: number;
  fill: string;
  stroke: string;
  uppercase: boolean;
  band: boolean;
  topPadRatio: number;
  bottomPadRatio: number;
}

/** 在任意尺寸画布上渲染表情包；refW/refH 为参考逻辑尺寸，字号/描边按宽比例缩放 */
function renderMeme(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  refW: number,
  refH: number,
  opts: MemeRenderOpts,
): void {
  const scale = w / refW;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (opts.image) {
    ctx.drawImage(opts.image, 0, 0, w, h);
  } else {
    drawMemeTemplate(ctx, opts.template, w, h);
  }

  const layout: MemeLayout = memeTextLayout({
    width: w,
    height: h,
    topText: opts.uppercase ? opts.topText.toUpperCase() : opts.topText,
    bottomText: opts.uppercase ? opts.bottomText.toUpperCase() : opts.bottomText,
    baseFontSize: opts.baseFontSize * scale,
    minFontSize: 14,
    topPadding: opts.topPadRatio * h,
    bottomPadding: opts.bottomPadRatio * h,
    measure: (t, fs) => {
      ctx.font = MEME_FONT(fs);
      return ctx.measureText(t).width;
    },
  });

  if (layout.top) {
    drawMemeZone(ctx, layout.top, w, h, {
      fill: opts.fill,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth * scale,
      band: opts.band,
    });
  }
  if (layout.bottom) {
    drawMemeZone(ctx, layout.bottom, w, h, {
      fill: opts.fill,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth * scale,
      band: opts.band,
    });
  }
  ctx.restore();
}

const MAX_EDGE = 1600; // 上传图片最大边长（px）

/** 模板缩略小块的背景样式 */
const TEMPLATE_THUMB_BG: Record<MemeTemplateKey, string> = {
  plain: "#FAFAFA",
  yellow: "#FFD800",
  green: "#A8D948",
  dark: "#1A1A2E",
  rainbow: "linear-gradient(90deg,#FF9A9E,#A18CD1)",
  grid: "repeating-linear-gradient(45deg,#fff 0 7px,#E8E8E8 7px 14px)",
};

type SourceKey = MemeTemplateKey | "custom";

const MemeTool: React.FC<Props> = ({ onBack }) => {
  const [template, setTemplate] = useState<MemeTemplateKey>("yellow");
  const [image, setImage] = useState<{ name: string; url: string; img: HTMLImageElement } | null>(null);
  const [topText, setTopText] = useState("我真的会谢");
  const [bottomText, setBottomText] = useState("你开心就好");
  const [fontSize, setFontSize] = useState(64);
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [fill, setFill] = useState("#FFFFFF");
  const [stroke, setStroke] = useState("#000000");
  const [uppercase, setUppercase] = useState(false);
  const [band, setBand] = useState(false);
  const [topPad, setTopPad] = useState(0.06);
  const [bottomPad, setBottomPad] = useState(0.06);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 当前参考逻辑尺寸：有上传图用图片尺寸，否则用模板尺寸
  const refSize = useCallback((): { w: number; h: number } => {
    if (image) {
      const m = Math.max(image.img.naturalWidth, image.img.naturalHeight);
      if (m <= MAX_EDGE) return { w: image.img.naturalWidth, h: image.img.naturalHeight };
      const k = MAX_EDGE / m;
      return {
        w: Math.max(1, Math.round(image.img.naturalWidth * k)),
        h: Math.max(1, Math.round(image.img.naturalHeight * k)),
      };
    }
    const t = memeTemplateOf(template);
    return { w: t.width, h: t.height };
  }, [image, template]);

  const renderOpts = useCallback(
    (): MemeRenderOpts => ({
      template,
      image: image ? image.img : null,
      topText,
      bottomText,
      baseFontSize: fontSize,
      strokeWidth,
      fill,
      stroke,
      uppercase,
      band,
      topPadRatio: topPad,
      bottomPadRatio: bottomPad,
    }),
    [template, image, topText, bottomText, fontSize, strokeWidth, fill, stroke, uppercase, band, topPad, bottomPad],
  );

  // 预览画布：每次状态变化后按逻辑尺寸重绘
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = refSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderMeme(ctx, w, h, w, h, renderOpts());
  }, [refSize, renderOpts, reload]);

  // 输入停顿 2s 落库
  useEffect(() => {
    recordUsageDebounced(
      "meme",
      () => ({
        toolId: "meme",
        toolTitle: "表情包制作",
        action: "edit",
        summary: `表情包：${(topText || bottomText || "未填文字").slice(0, 30)}`,
        detail: {
          template,
          imageName: image ? image.name : null,
          topText,
          bottomText,
          fontSize,
          strokeWidth,
          fill,
          stroke,
          uppercase,
          band,
          topPad,
          bottomPad,
        },
      }),
      2000,
    );
  }, [template, image, topText, bottomText, fontSize, strokeWidth, fill, stroke, uppercase, band, topPad, bottomPad]);

  const pickTemplate = (key: MemeTemplateKey) => {
    setTemplate(key);
    setImage(null); // 模板与上传互斥
    setErr("");
  };

  const onUploadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErr("请选择图片文件（PNG / JPG / GIF / WebP）");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("图片过大，请选择 ≤10MB 的图片");
      return;
    }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage({ name: file.name, url: String(reader.result), img });
        setReload((v) => v + 1);
      };
      img.onerror = () => setErr("图片加载失败，请换一张试试");
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const exportPng = () => {
    const { w, h } = refSize();
    const scale = 2;
    const out = document.createElement("canvas");
    out.width = Math.max(1, w * scale);
    out.height = Math.max(1, h * scale);
    const ctx = out.getContext("2d");
    if (!ctx) return;
    renderMeme(ctx, out.width, out.height, w, h, renderOpts());
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = memeFileName("png");
    a.click();
    recordUsage({
      toolId: "meme",
      toolTitle: "表情包制作",
      action: "export",
      summary: `导出表情包 PNG（${out.width}×${out.height}px）`,
      detail: {
        template,
        imageName: image ? image.name : null,
        topText,
        bottomText,
        fontSize,
        strokeWidth,
        fill,
        stroke,
        uppercase,
        band,
        topPad,
        bottomPad,
      },
    });
  };

  const sourceValue: SourceKey = image ? "custom" : template;

  const segOptions: { value: SourceKey; label: React.ReactNode }[] = [
    ...MEME_TEMPLATES.map((t) => ({
      value: t.key,
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 26,
              height: 18,
              borderRadius: 3,
              border: "1px solid rgba(128,128,128,0.45)",
              background: TEMPLATE_THUMB_BG[t.key],
            }}
          />
          {t.name}
        </span>
      ),
    })),
    {
      value: "custom" as SourceKey,
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 26,
              height: 18,
              borderRadius: 3,
              border: "1px dashed #1677FF",
              background: "#EEF5FF",
            }}
          />
          自定义
        </span>
      ),
    },
  ];

  return (
    <ToolShell
      title="表情包制作"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            导出尺寸：{refSize().w * 2}×{refSize().h * 2}px
          </Text>
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={exportPng}>
            导出 PNG
          </Button>
        </Space>
      }
    >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", minHeight: 0 }}>
        {/* 左栏：控制面板 */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                底图来源
              </Text>
              <Segmented
                size="small"
                block
                value={sourceValue}
                options={segOptions}
                onChange={(v) => {
                  const key = v as SourceKey;
                  if (key === "custom") {
                    if (!image) fileInputRef.current?.click();
                    return; // 已上传图时保持现状；未上传时触发选择
                  }
                  pickTemplate(key);
                }}
                style={{ marginTop: 4 }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFile(f);
                  e.target.value = "";
                }}
              />
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={() => false}
                onChange={({ file }) => {
                  if (file.originFileObj) onUploadFile(file.originFileObj);
                }}
                style={{ marginTop: 6 }}
              >
                <Button size="small" icon={<UploadOutlined />} block style={{ marginTop: 6 }}>
                  上传本地图片
                </Button>
              </Upload>
              {image ? (
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                  已上传：{image.name}
                </Text>
              ) : null}
              {err ? (
                <Text type="danger" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                  {err}
                </Text>
              ) : null}
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                顶部文字（自动换行最多 2 行）
              </Text>
              <Input
                value={topText}
                onChange={(e) => setTopText(e.target.value)}
                placeholder="顶部文字…"
                allowClear
                maxLength={80}
                style={{ marginTop: 4 }}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                底部文字
              </Text>
              <Input
                value={bottomText}
                onChange={(e) => setBottomText(e.target.value)}
                placeholder="底部文字…"
                allowClear
                maxLength={80}
                style={{ marginTop: 4 }}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                字号：{fontSize}px（过长自动缩小适配）
              </Text>
              <Slider min={36} max={140} step={2} value={fontSize} onChange={setFontSize} />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                描边粗细：{strokeWidth}px
              </Text>
              <Slider min={0} max={20} step={1} value={strokeWidth} onChange={setStrokeWidth} />
            </div>

            <Space size={12} wrap>
              <span>
                <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  文字颜色
                </Text>
                <ColorPicker size="small" value={fill} onChange={(_: Color, hex: string) => setFill(hex.toUpperCase())} />
              </span>
              <span>
                <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  描边颜色
                </Text>
                <ColorPicker size="small" value={stroke} onChange={(_: Color, hex: string) => setStroke(hex.toUpperCase())} />
              </span>
            </Space>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                顶部留白：{Math.round(topPad * 100)}%
              </Text>
              <Slider min={0.03} max={0.14} step={0.01} value={topPad} onChange={setTopPad} />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                底部留白：{Math.round(bottomPad * 100)}%
              </Text>
              <Slider min={0.03} max={0.14} step={0.01} value={bottomPad} onChange={setBottomPad} />
            </div>

            <Space direction="vertical" size={4}>
              <Checkbox checked={uppercase} onChange={(e) => setUppercase(e.target.checked)}>
                英文字母强制大写
              </Checkbox>
              <Checkbox checked={band} onChange={(e) => setBand(e.target.checked)}>
                文字底部加深色半透明底条
              </Checkbox>
            </Space>
          </div>
        </div>

        {/* 右区：画布预览 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              display: "flex",
              justifyContent: "center",
              padding: 16,
              borderRadius: 8,
              border: "1px solid rgba(128,128,128,0.25)",
              background: "#F5F5F5",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                display: "block",
                maxWidth: "100%",
                width: "100%",
                aspectRatio: `${refSize().w} / ${refSize().h}`,
                borderRadius: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                background:
                  "linear-gradient(45deg,#E8E8E8 25%,transparent 25%),linear-gradient(-45deg,#E8E8E8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#E8E8E8 75%),linear-gradient(-45deg,transparent 75%,#E8E8E8 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
              }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
            提示：文字过长时字号会自动缩小适配；导出为 2 倍分辨率 PNG，可直接用于微信 / 微博 / 群聊。
          </Text>
        </div>
      </div>

      <ToolHistoryPanel
        toolId="meme"
        toolTitle="表情包制作"
        reloadKey={reload + (image ? 1 : 0)}
        onRestore={(d) => {
          suppressNextRecord("meme");
          if (typeof d.topText === "string") setTopText(d.topText);
          if (typeof d.bottomText === "string") setBottomText(d.bottomText);
          if (typeof d.fontSize === "number") setFontSize(d.fontSize);
          if (typeof d.strokeWidth === "number") setStrokeWidth(d.strokeWidth);
          if (typeof d.fill === "string") setFill(d.fill);
          if (typeof d.stroke === "string") setStroke(d.stroke);
          if (typeof d.uppercase === "boolean") setUppercase(d.uppercase);
          if (typeof d.band === "boolean") setBand(d.band);
          if (typeof d.topPad === "number") setTopPad(d.topPad);
          if (typeof d.bottomPad === "number") setBottomPad(d.bottomPad);
          if (typeof d.template === "string" && !image) {
            const k = MEME_TEMPLATES.find((t) => t.key === d.template);
            if (k) setTemplate(k.key);
          }
        }}
      />
    </ToolShell>
  );
};

export default MemeTool;
