/*
 * 字数统计工具
 */
import React, { useMemo } from "react";
import { Input } from "antd";
import { countTextStats } from "../utils";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

const WordCountTool: React.FC<Props> = ({ onBack }) => {
  const [text, setText] = React.useState("");
  const stats = useMemo(() => countTextStats(text), [text]);

  // 输入停顿 3s 后把本次统计落库
  React.useEffect(() => {
    recordUsageDebounced(
      "wordcount",
      () =>
        text
          ? {
              toolId: "wordcount",
              toolTitle: "字数统计",
              action: "count",
              summary: `统计 ${stats.chars} 字符 / ${stats.words} 词 / ${stats.cjkChars} 中文`,
              detail: {
                text,
                chars: stats.chars,
                words: stats.words,
                cjkChars: stats.cjkChars,
                latinWords: stats.latinWords,
                lines: stats.lines,
                bytes: stats.bytes,
              },
            }
          : null,
      3000,
    );
  }, [text, stats]);

  return (
    <ToolShell title="字数统计" onBack={onBack}>
      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在此粘贴要统计的文本，实时显示统计结果…"
        autoSize={{ minRows: 6, maxRows: 12 }}
        style={{ marginBottom: 12 }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 6,
        }}
      >
        <StatRow label="字符数（含空格）" value={stats.chars} />
        <StatRow label="字符数（不含空格）" value={stats.charsNoSpaces} />
        <StatRow label="总词数" value={stats.words} />
        <StatRow label="中文字符" value={stats.cjkChars} />
        <StatRow label="英文单词" value={stats.latinWords} />
        <StatRow label="总行数" value={stats.lines} />
        <StatRow label="非空行数" value={stats.nonEmptyLines} />
        <StatRow label="段落数" value={stats.paragraphs} />
        <StatRow label="UTF-8 字节数" value={stats.bytes} />
      </div>

      <ToolHistoryPanel
        toolId="wordcount"
        toolTitle="字数统计"
        reloadKey={text ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("wordcount");
          setText(String(d.text ?? ""));
        }}
      />
    </ToolShell>
  );
};

export default WordCountTool;
