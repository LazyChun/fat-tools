/*
 * 命名风格转换：把任意命名 / 句子转成各种大小写与命名风格
 */
import React, { useMemo, useState } from "react";
import { Input, Typography } from "antd";
import { convertNaming, NAMING_STYLES, splitWords } from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const NamingTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("hello world example");

  const words = useMemo(() => splitWords(input), [input]);

  React.useEffect(() => {
    recordUsageDebounced(
      "case",
      () =>
        input.trim()
          ? {
              toolId: "case",
              toolTitle: "命名转换",
              action: "convert",
              summary: `「${input.trim().slice(0, 40)}」→ ${words.length} 个单词`,
              detail: { input },
            }
          : null,
      2000,
    );
  }, [input, words.length]);

  return (
    <ToolShell title="命名转换" onBack={onBack}>
      <Input.TextArea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder="输入任意命名，如 user_profile_name / userProfileName / 用户资料"
        style={{ fontFamily: "monospace", marginBottom: 8 }}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        识别到 {words.length} 个单词：{words.join(" · ") || "—"}
      </Text>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 6,
          marginTop: 12,
        }}
      >
        {NAMING_STYLES.map(({ style, label }) => {
          const value = convertNaming(input, style);
          return (
            <div
              key={style}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: "rgba(128,128,128,0.08)",
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, flexShrink: 0, width: 110 }}>
                {label}
              </Text>
              <Text
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  fontSize: 13,
                }}
              >
                {value || "—"}
              </Text>
              {value ? <CopyButton text={value} /> : null}
            </div>
          );
        })}
      </div>

      <ToolHistoryPanel
        toolId="case"
        toolTitle="命名转换"
        onRestore={(d) => {
          if (typeof d.input === "string") {
            suppressNextRecord("case");
            setInput(d.input);
          }
        }}
      />
    </ToolShell>
  );
};

export default NamingTool;
