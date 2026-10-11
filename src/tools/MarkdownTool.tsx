/*
 * Markdown 预览：左侧编辑、右侧实时渲染（自研轻量渲染器）
 */
import React, { useMemo, useState } from "react";
import { Input, Typography } from "antd";
import { renderMarkdown } from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const SAMPLE = `# Markdown 预览

支持 **粗体**、*斜体*、~~删除线~~、\`行内代码\` 与 [链接](https://example.com)。

## 列表

- 第一项
- 第二项
- 第三项

1. 有序项一
2. 有序项二

> 引用块：支持换行
> 第二行

\`\`\`js
function hello(name) {
  return \`hi, \${name}\`;
}
\`\`\`

---

结束。
`;

const MD_CSS = `
.fatmd-body { line-height: 1.7; word-break: break-word; }
.fatmd-body h1, .fatmd-body h2, .fatmd-body h3,
.fatmd-body h4, .fatmd-body h5, .fatmd-body h6 { margin: 12px 0 8px; font-weight: 600; }
.fatmd-body h1 { font-size: 22px; border-bottom: 1px solid rgba(128,128,128,0.3); padding-bottom: 4px; }
.fatmd-body h2 { font-size: 19px; border-bottom: 1px solid rgba(128,128,128,0.2); padding-bottom: 3px; }
.fatmd-body h3 { font-size: 16px; }
.fatmd-body p { margin: 8px 0; }
.fatmd-body ul, .fatmd-body ol { margin: 8px 0; padding-left: 22px; }
.fatmd-body li { margin: 2px 0; }
.fatmd-body blockquote { margin: 8px 0; padding: 4px 12px; border-left: 3px solid rgba(128,128,128,0.5); opacity: 0.85; }
.fatmd-body code { padding: 1px 5px; border-radius: 4px; background: rgba(128,128,128,0.18); font-family: monospace; font-size: 0.9em; }
.fatmd-body pre { margin: 8px 0; padding: 10px; border-radius: 6px; background: rgba(128,128,128,0.14); overflow: auto; }
.fatmd-body pre code { background: none; padding: 0; }
.fatmd-body a { color: #1677ff; }
.fatmd-body hr { border: none; border-top: 1px solid rgba(128,128,128,0.3); margin: 14px 0; }
.fatmd-body img { max-width: 100%; }
.fatmd-body del { opacity: 0.65; }
`;

const MarkdownTool: React.FC<Props> = ({ onBack }) => {
  const [md, setMd] = useState(SAMPLE);
  const html = useMemo(() => renderMarkdown(md), [md]);

  React.useEffect(() => {
    recordUsageDebounced(
      "markdown",
      () =>
        md.trim()
          ? {
              toolId: "markdown",
              toolTitle: "Markdown 预览",
              action: "preview",
              summary: `预览 ${md.split("\n").length} 行 Markdown`,
              detail: { input: md },
            }
          : null,
      2500,
    );
  }, [md]);

  return (
    <ToolShell
      title="Markdown 预览"
      onBack={onBack}
      extra={<CopyButton text={html} label="复制 HTML" />}
    >
      <style>{MD_CSS}</style>
      <div style={{ display: "flex", gap: 10, height: "100%", minHeight: 0, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", minHeight: 260 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            Markdown 源文
          </Text>
          <Input.TextArea
            value={md}
            onChange={(e) => setMd(e.target.value)}
            style={{ flex: 1, fontFamily: "monospace", resize: "none" }}
          />
        </div>

        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", minHeight: 260 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            预览
          </Text>
          <div
            className="fatmd-body"
            style={{
              flex: 1,
              overflow: "auto",
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid rgba(128,128,128,0.3)",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <ToolHistoryPanel
        toolId="markdown"
        toolTitle="Markdown 预览"
        onRestore={(d) => {
          if (typeof d.input === "string") {
            suppressNextRecord("markdown");
            setMd(d.input);
          }
        }}
      />
    </ToolShell>
  );
};

export default MarkdownTool;
