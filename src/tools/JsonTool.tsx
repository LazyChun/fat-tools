/*
 * JSON 工具：格式化 / 压缩 / 校验（带错误定位）
 */
import React, { useState } from "react";
import { Alert, Button, Input, Radio, Space, Tag } from "antd";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

// JSON 工具的全局搜索直达：匹配 { 或 [ 开头、} 或 ] 结尾且含引号/冒号/逗号的 JSON 文本
export const JSON_SEARCH_FEED = createToolSearchFeed(
  /^\s*[{\[][\s\S]*[":,][\s\S]*[}\]]\s*$/,
);

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

const JsonTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<2 | 4>(2);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [valid, setValid] = useState(false);

  // 全局搜索直达：命中输入模式后自动填入
  JSON_SEARCH_FEED.useFeedValue(setInput);

  const process = (mode: "format" | "minify") => {
    const source = input.trim();
    if (!source) {
      setError("请先输入 JSON 内容");
      setOutput("");
      setValid(false);
      return;
    }
    try {
      const parsed = JSON.parse(source);
      setOutput(
        mode === "format"
          ? JSON.stringify(parsed, null, indent)
          : JSON.stringify(parsed),
      );
      setError("");
      setValid(true);
      recordUsage({
        toolId: "json",
        toolTitle: "JSON 工具",
        action: mode,
        summary: `${mode === "format" ? "格式化" : "压缩"}成功（输入 ${source.length} 字符）`,
        detail: {
          input: source,
          inputLen: source.length,
          outputLen: output.length,
          indent: mode === "format" ? indent : 0,
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      const posMatch = msg.match(/position (\d+)/);
      let hint = msg;
      if (posMatch) {
        const pos = Number(posMatch[1]);
        const around = source.slice(Math.max(0, pos - 20), pos);
        hint = `${msg}\n出错位置附近内容：「…${around}◄这里…」`;
      }
      setError(hint);
      setOutput("");
      setValid(false);
    }
  };

  return (
    <ToolShell
      title="JSON 工具"
      onBack={onBack}
      extra={
        <Space size={8}>
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
          <Button size="small" type="primary" onClick={() => process("format")}>
            格式化
          </Button>
          <Button size="small" onClick={() => process("minify")}>
            压缩
          </Button>
        </Space>
      }
    >
      <TextArea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setValid(false);
          setError("");
        }}
        placeholder='粘贴 JSON，例如 {"name":"fat-tools","version":1}'
        autoSize={{ minRows: 6, maxRows: 10 }}
        style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
      />

      {valid ? (
        <Tag color="success" style={{ marginBottom: 8 }}>
          JSON 合法
        </Tag>
      ) : null}
      {error ? (
        <Alert
          type="error"
          message="解析失败"
          description={
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{error}</pre>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {output ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <CopyButton text={output} label="复制结果" />
          </div>
          <TextArea
            value={output}
            readOnly
            autoSize={{ minRows: 6, maxRows: 14 }}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
        </>
      ) : null}

      <ToolHistoryPanel
        toolId="json"
        toolTitle="JSON 工具"
        reloadKey={output ? 1 : 0}
        onRestore={(d) => {
          setInput(String(d.input ?? ""));
          const ind = Number(d.indent);
          setIndent(ind === 4 ? 4 : 2);
          setOutput("");
          setValid(false);
          setError("");
        }}
      />
    </ToolShell>
  );
};

export default JsonTool;
