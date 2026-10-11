/*
 * 条形码生成：把文本编码为 Code 128（code-set B）条形码并渲染为 SVG，
 * 支持调整模块宽度 / 高度 / 是否显示文字，可下载 SVG 或 PNG。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Input, InputNumber, Slider, Space, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { encodeCode128 } from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const BarcodeTool: React.FC<Props> = ({ onBack }) => {
  const [text, setText] = useState("FAT-TOOLS-2026");
  const [moduleWidth, setModuleWidth] = useState(2);
  const [height, setHeight] = useState(90);
  const [showText, setShowText] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const result = useMemo(() => encodeCode128(text), [text]);

  const quietZone = 10; // 静区（模块数）
  const moduleCount = result.valid ? result.bits.length : 0;
  const widthModules = moduleCount + quietZone * 2;
  const svgWidth = widthModules * moduleWidth;
  const textZone = showText ? 22 : 0;
  const svgHeight = height + textZone;

  // 输入停顿 2s 后落库
  useEffect(() => {
    recordUsageDebounced("barcode", () =>
      text && result.valid
        ? {
            toolId: "barcode",
            toolTitle: "条形码生成",
            action: "encode",
            summary: `生成 Code128 条形码：${text.slice(0, 40)}`,
            detail: { text, moduleWidth, height, showText },
          }
        : null,
      2000,
    );
  }, [text, moduleWidth, height, showText, result.valid]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const safeName = (): string => {
    const base = text.replace(/[^\w.\-]+/g, "_").slice(0, 40) || "barcode";
    return `barcode-${base}`;
  };

  const exportSvg = () => {
    if (!result.valid || !svgRef.current) return;
    const data = new XMLSerializer().serializeToString(svgRef.current);
    downloadBlob(new Blob([data], { type: "image/svg+xml;charset=utf-8" }), `${safeName()}.svg`);
  };

  const exportPng = () => {
    if (!result.valid || !svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const scale = 3;
    const img = new Image();
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${safeName()}.png`);
      }, "image/png");
    };
    img.src = svgUrl;
  };

  // 生成条（黑）矩形：bits 中为 '1' 的连续段
  const bars = useMemo(() => {
    if (!result.valid) return [] as { x: number; w: number }[];
    const out: { x: number; w: number }[] = [];
    let x = 0;
    const bits = result.bits;
    while (x < bits.length) {
      if (bits[x] === "1") {
        let w = 0;
        while (x + w < bits.length && bits[x + w] === "1") w++;
        out.push({ x: (quietZone + x) * moduleWidth, w: w * moduleWidth });
        x += w;
      } else {
        x++;
      }
    }
    return out;
  }, [result, moduleWidth]);

  const bitsText = result.valid ? result.bits : "";

  return (
    <ToolShell
      title="条形码生成"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Button size="small" icon={<DownloadOutlined />} disabled={!result.valid} onClick={exportSvg}>
            导出 SVG
          </Button>
          <Button size="small" type="primary" icon={<DownloadOutlined />} disabled={!result.valid} onClick={exportPng}>
            导出 PNG
          </Button>
        </Space>
      }
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入要编码的内容（Code 128，支持 ASCII 32–126）…"
        allowClear
        style={{ marginBottom: 12 }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
          marginBottom: 12,
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            模块宽度：{moduleWidth}px（条码总宽约 {svgWidth}px）
          </Text>
          <Slider min={1} max={6} step={1} value={moduleWidth} onChange={setModuleWidth} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            条码高度：{height}px
          </Text>
          <Slider min={40} max={200} step={10} value={height} onChange={setHeight} />
        </div>
        <Space direction="vertical" size={4} style={{ paddingTop: 4 }}>
          <Checkbox checked={showText} onChange={(e) => setShowText(e.target.checked)}>
            在条码下方显示文字
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12 }}>
            编码字符数：{text.length}
          </Text>
        </Space>
      </div>

      {!result.valid ? (
        <div style={{ color: "#cf1322" }}>
          无法编码：Code 128 仅支持 ASCII 32–126 的字符（请去掉中文 / 控制字符）。
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            padding: 12,
            borderRadius: 8,
            background: "#fff",
            border: "1px solid rgba(128,128,128,0.25)",
          }}
        >
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: "block" }}
          >
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#ffffff" />
            {bars.map((b, i) => (
              <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000000" />
            ))}
            {showText ? (
              <text
                x={svgWidth / 2}
                y={height + 16}
                textAnchor="middle"
                fontFamily="monospace"
                fontSize={14}
                fill="#000000"
              >
                {text}
              </text>
            ) : null}
          </svg>
        </div>
      )}

      {result.valid ? (
        <Space size={8} style={{ marginTop: 12 }} wrap>
          <CopyButton text={text} label="复制内容" />
          <InputNumber
            size="small"
            addonBefore="校验位"
            value={result.codes[result.codes.length - 2]}
            readOnly
            style={{ width: 130 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            编码值：[{result.codes.join(", ")}]
          </Text>
        </Space>
      ) : null}

      <ToolHistoryPanel
        toolId="barcode"
        toolTitle="条形码生成"
        reloadKey={result.valid ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("barcode");
          if (typeof d.text === "string") setText(d.text);
          if (typeof d.moduleWidth === "number") setModuleWidth(d.moduleWidth);
          if (typeof d.height === "number") setHeight(d.height);
          if (typeof d.showText === "boolean") setShowText(d.showText);
        }}
      />
      {/* 隐藏的位串副本，便于需要时复制原始模块序列 */}
      {bitsText ? <div style={{ display: "none" }}>{bitsText}</div> : null}
    </ToolShell>
  );
};

export default BarcodeTool;
