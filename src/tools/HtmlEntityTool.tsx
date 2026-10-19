/*
 * HTML 实体编解码：&lt; / &#160; / &nbsp; 等互转
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Segmented, Space, Typography } from "antd";
import { countEntities, htmlDecode, htmlEncode, type HtmlEncodeMode } from "./htmlEntity";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;
const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

const MODE_OPTIONS: { value: HtmlEncodeMode; label: string }[] = [
  { value: "minimal", label: "仅特殊字符" },
  { value: "named", label: "命名实体" },
  { value: "numeric", label: "十进制" },
  { value: "hex", label: "十六进制" },
];

const HtmlEntityTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState(`<div class="x">Hello & 你好</div>`);
  const [mode, setMode] = useState<HtmlEncodeMode>("minimal");
  const [dir, setDir] = useState<"encode" | "decode">("encode");

  const output = useMemo(() => {
    if (!input) return "";
    return dir === "encode" ? htmlEncode(input, { mode }) : htmlDecode(input);
  }, [input, mode, dir]);

  useEffect(() => {
    recordUsageDebounced("html-entity", () => {
      if (!input.trim()) return null;
      return {
        toolId: "html-entity",
        toolTitle: "HTML 实体",
        action: dir,
        summary:
          dir === "encode"
            ? `编码 ${input.length} 字 → ${output.length} 字`
            : `解码 ${countEntities(input)} 个实体`,
        detail: { input, mode, dir },
      };
    });
  }, [input, mode, dir, output]);

  const swap = () => {
    setInput(output);
    setDir((d) => (d === "encode" ? "decode" : "encode"));
  };

  return (
    <ToolShell
      title="HTML 实体"
      onBack={onBack}
      extra={<CopyButton text={() => output} label="复制结果" />}
    >
      <Space size={10} wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={dir}
          onChange={(v) => setDir(v as "encode" | "decode")}
          options={[
            { value: "encode", label: "编码" },
            { value: "decode", label: "解码" },
          ]}
        />
        {dir === "encode" ? (
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => setMode(v as HtmlEncodeMode)}
            options={MODE_OPTIONS}
          />
        ) : null}
        <Button size="small" onClick={swap} disabled={!output}>
          结果 ↔ 输入
        </Button>
      </Space>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        输入
      </Text>
      <TextArea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        placeholder={dir === "encode" ? "输入含 HTML 特殊字符的文本" : "输入含实体的文本，如 &lt;div&gt;"}
        style={{ fontFamily: "monospace", marginBottom: 12 }}
      />

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        结果
        {dir === "decode" && input ? ` · 识别到 ${countEntities(input)} 个实体` : null}
      </Text>
      <TextArea
        value={output}
        readOnly
        rows={6}
        style={{ fontFamily: "monospace", background: "rgba(128,128,128,0.06)" }}
      />

      <ToolHistoryPanel
        toolId="html-entity"
        toolTitle="HTML 实体"
        onRestore={(d) => {
          suppressNextRecord("html-entity");
          if (typeof d.input === "string") setInput(d.input);
          if (d.mode === "minimal" || d.mode === "named" || d.mode === "numeric" || d.mode === "hex") {
            setMode(d.mode);
          }
          if (d.dir === "encode" || d.dir === "decode") setDir(d.dir);
        }}
      />
    </ToolShell>
  );
};

export default HtmlEntityTool;
