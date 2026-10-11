/*
 * XML 工具：格式化 / 压缩 / 校验（带行列定位）/ 转义与反转义
 */
import React, { useMemo, useState } from "react";
import { Alert, Button, Input, Radio, Space, Tag, Typography } from "antd";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";
import {
  checkXmlWellFormed,
  collectXmlStats,
  escapeXml,
  formatXml,
  minifyXml,
  parseXmlNodes,
  unescapeXml,
} from "../utils";

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const PLACEHOLDER = `粘贴 XML，例如：
<?xml version="1.0" encoding="UTF-8"?>
<notes version="1"><item id="1" done="true">买菜</item></notes>`;

const XmlTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<2 | 4>(2);
  const [output, setOutput] = useState("");
  const [action, setAction] = useState("");
  const [error, setError] = useState("");

  // 输入即校验（输入即算类）
  const liveCheck = useMemo(() => {
    const src = input.trim();
    if (!src) return null;
    return checkXmlWellFormed(src);
  }, [input]);

  const run = (mode: "format" | "minify" | "escape" | "unescape"): void => {
    const source = input;
    if (!source.trim()) {
      setError("请先输入 XML 内容");
      setOutput("");
      return;
    }
    setError("");
    try {
      let result = "";
      if (mode === "escape") {
        result = escapeXml(source);
      } else if (mode === "unescape") {
        result = unescapeXml(source);
      } else {
        // 格式化 / 压缩都要求合法 XML
        result = mode === "format" ? formatXml(source, indent) : minifyXml(source);
      }
      setOutput(result);
      setAction(mode);
      recordUsage({
        toolId: "xml",
        toolTitle: "XML 工具",
        action: mode,
        summary:
          mode === "format" ? `格式化成功（输入 ${source.length} 字符）`
          : mode === "minify" ? `压缩成功（${source.length} → ${result.length} 字符）`
          : mode === "escape" ? "转义成功"
          : "反转义成功",
        detail: {
          input: source,
          inputLen: source.length,
          outputLen: result.length,
          indent: mode === "format" ? indent : 0,
          mode,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setOutput("");
    }
  };

  const stats = useMemo(() => {
    const src = input.trim();
    if (!src || liveCheck) return null;
    return collectXmlStats(src);
  }, [input, liveCheck]);

  return (
    <ToolShell
      title="XML 工具"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Radio.Group
            size="small"
            value={indent}
            onChange={(e) => setIndent(e.target.value)}
            optionType="button"
            options={[
              { label: "缩进 2", value: 2 },
              { label: "缩进 4", value: 4 },
            ]}
          />
          <Button size="small" type="primary" onClick={() => run("format")}>
            格式化
          </Button>
          <Button size="small" onClick={() => run("minify")}>
            压缩
          </Button>
          <Button size="small" onClick={() => run("escape")}>
            转义
          </Button>
          <Button size="small" onClick={() => run("unescape")}>
            反转义
          </Button>
        </Space>
      }
    >
      <TextArea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError("");
        }}
        placeholder={PLACEHOLDER}
        autoSize={{ minRows: 6, maxRows: 12 }}
        style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
      />

      {input.trim() ? (
        liveCheck ? (
          <Alert
            type="error"
            message="XML 不合法"
            description={<Text style={{ whiteSpace: "pre-wrap" }}>{liveCheck}</Text>}
            style={{ marginBottom: 12 }}
            showIcon
          />
        ) : (
          <div style={{ marginBottom: 12 }}>
            <Tag color="success">XML 合法（well-formed）</Tag>
            {stats ? (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                根元素 &lt;{stats.root}&gt; · {stats.elements} 个元素 · {stats.attrs} 个属性 · 最大深度 {stats.depth}
              </Text>
            ) : null}
          </div>
        )
      ) : null}

      {error && !liveCheck ? (
        <Alert type="error" message="处理失败" description={<pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{error}</pre>} style={{ marginBottom: 12 }} />
      ) : null}

      {output ? (
        <>
          <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <CopyButton text={output} label="复制结果" />
            <Tag>
              {action === "format" ? "格式化" : action === "minify" ? "压缩" : action === "escape" ? "转义" : "反转义"} · {output.length} 字符
            </Tag>
          </div>
          <TextArea
            value={output}
            readOnly
            autoSize={{ minRows: 6, maxRows: 16 }}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
          {action === "minify" ? (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
              <StatRow label="原始大小" value={`${input.length} 字符`} />
              <StatRow label="压缩后" value={`${output.length} 字符`} />
              <StatRow
                label="节省"
                value={input.length ? `${Math.max(0, 100 - Math.round((output.length / input.length) * 100))}%` : "-"}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <ToolHistoryPanel
        toolId="xml"
        toolTitle="XML 工具"
        reloadKey={output ? 1 : 0}
        onRestore={(d) => {
          setInput(String(d.input ?? ""));
          const ind = Number(d.indent);
          setIndent(ind === 4 ? 4 : 2);
          setOutput("");
          setError("");
        }}
      />
    </ToolShell>
  );
};

export default XmlTool;
