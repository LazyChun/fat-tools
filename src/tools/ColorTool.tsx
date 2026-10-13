/*
 * 颜色工具：HEX / RGB / HSL 互转
 */
import React, { useMemo, useState } from "react";
import { ColorPicker, Input } from "antd";
import type { Color } from "antd/es/color-picker";
import { parseHexColor, rgbToHex, rgbToHsl } from "../utils";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

// 颜色转换的全局搜索直达：匹配 HEX（#ff5500）或 rgb()/hsl() 形式的颜色值
export const COLOR_SEARCH_FEED = createToolSearchFeed(
  /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*\d+)/,
);

interface Props {
  onBack?: () => void;
}

const ColorTool: React.FC<Props> = ({ onBack }) => {
  const [hex, setHex] = useState("#1E90FF");

  // 全局搜索直达：命中输入模式后自动填入
  COLOR_SEARCH_FEED.useFeedValue(setHex);

  const parsed = useMemo(() => {
    try {
      const rgb = parseHexColor(hex);
      const hsl = rgbToHsl(rgb);
      return { rgb, hsl, error: "" };
    } catch (e) {
      return { rgb: null, hsl: null, error: (e as Error).message };
    }
  }, [hex]);

  const onPickerChange = (_: Color, hexString: string) =>
    setHex(hexString.toUpperCase());

  // 颜色确定（停顿 2s）后落库
  React.useEffect(() => {
    recordUsageDebounced(
      "color",
      () =>
        parsed.rgb && parsed.hsl
          ? {
              toolId: "color",
              toolTitle: "颜色转换",
              action: "convert",
              summary: `${rgbToHex(parsed.rgb)} ↔ RGB/HSL 互转`,
              detail: {
                hex: rgbToHex(parsed.rgb),
                rgb: `rgb(${parsed.rgb.r}, ${parsed.rgb.g}, ${parsed.rgb.b})`,
                hsl: `hsl(${parsed.hsl.h}, ${parsed.hsl.s}%, ${parsed.hsl.l}%)`,
              },
            }
          : null,
      2000,
    );
  }, [hex, parsed]);

  return (
    <ToolShell title="颜色转换" onBack={onBack}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <ColorPicker
          value={parsed.rgb ? rgbToHex(parsed.rgb) : "#000000"}
          onChange={onPickerChange}
          showText
        />
        <Input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder="#1E90FF"
          style={{ width: 160, fontFamily: "monospace" }}
          status={parsed.error ? "error" : undefined}
        />
        {parsed.rgb ? (
          <div
            style={{
              width: 44,
              height: 32,
              borderRadius: 6,
              border: "1px solid rgba(128,128,128,0.35)",
              background: rgbToHex(parsed.rgb),
            }}
            title={rgbToHex(parsed.rgb)}
          />
        ) : null}
      </div>

      {parsed.rgb && parsed.hsl ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 6,
          }}
        >
          <StatRow label="HEX" value={rgbToHex(parsed.rgb)} copyable />
          <StatRow
            label="RGB"
            value={`rgb(${parsed.rgb.r}, ${parsed.rgb.g}, ${parsed.rgb.b})`}
            copyable
          />
          <StatRow
            label="HSL"
            value={`hsl(${parsed.hsl.h}, ${parsed.hsl.s}%, ${parsed.hsl.l}%)`}
            copyable
          />
          <StatRow
            label="CSS 变量"
            value={`--color: ${rgbToHex(parsed.rgb)};`}
            copyable
          />
        </div>
      ) : (
        <div style={{ color: "#cf1322" }}>{parsed.error}</div>
      )}

      <ToolHistoryPanel
        toolId="color"
        toolTitle="颜色转换"
        reloadKey={parsed.rgb ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("color");
          setHex(String(d.hex ?? "#1E90FF").toUpperCase());
        }}
      />
    </ToolShell>
  );
};

export default ColorTool;
