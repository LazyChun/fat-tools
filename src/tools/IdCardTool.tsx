/*
 * 身份证号码校验：校验位、省市、生日、性别、年龄；支持 15 位升位
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Input, Space, Tag, Typography } from "antd";
import { parseIdCard } from "./idCard";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

const { Text } = Typography;

/**
 * 全局搜索直达：15 位数字，或 18 位（末位数字/x，宿主已 lowercase）。
 * 纯号码搜索即可命中「身份证校验」并自动填入。
 */
export const ID_CARD_SEARCH_FEED = createToolSearchFeed(
  /^(?:\d{15}|\d{17}[\dx])$/,
);

const EXAMPLES = ["11010519491231002X", "440524188001010014", "110105491231002"];

interface Props {
  onBack?: () => void;
}

const IdCardTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("11010519491231002X");

  // 全局搜索直达：命中身份证号模式后自动填入
  ID_CARD_SEARCH_FEED.useFeedValue(setInput);

  const info = useMemo(() => parseIdCard(input), [input]);

  useEffect(() => {
    recordUsageDebounced("id-card", () => {
      if (!input.trim() || !info.valid) return null;
      return {
        toolId: "id-card",
        toolTitle: "身份证校验",
        action: "parse",
        summary: `${info.normalized} · ${info.province} · ${info.gender} · ${info.birth}`,
        detail: { input: input.trim(), normalized: info.normalized },
      };
    });
  }, [input, info]);

  return (
    <ToolShell
      title="身份证校验"
      onBack={onBack}
      extra={info.valid ? <CopyButton text={() => info.normalized} label="复制号码" /> : null}
    >
      <Space size={8} wrap style={{ marginBottom: 10, width: "100%" }}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入 15/18 位身份证号"
          allowClear
          style={{ width: 280, fontFamily: "monospace" }}
          status={input.trim() && !info.valid ? "error" : undefined}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          本地校验，号码不上传
        </Text>
      </Space>

      <Space size={6} wrap style={{ marginBottom: 14 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          示例：
        </Text>
        {EXAMPLES.map((ex) => (
          <Tag key={ex} style={{ cursor: "pointer", marginInlineEnd: 0 }} onClick={() => setInput(ex)}>
            {ex}
          </Tag>
        ))}
      </Space>

      {!input.trim() ? (
        <Text type="secondary">输入身份证号码后显示校验与解析结果</Text>
      ) : !info.valid ? (
        <Alert type="error" showIcon message={info.error || "校验失败"} />
      ) : (
        <>
          <Alert
            type="success"
            showIcon
            message={
              info.length === 15
                ? `校验通过（15 位已升位为 ${info.normalized}）`
                : "校验通过"
            }
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: "grid", gap: 6, maxWidth: 480 }}>
            <StatRow label="规范化号码" value={info.normalized} copyable />
            <StatRow label="省市" value={info.province} copyable />
            <StatRow label="行政区划码" value={info.regionCode} copyable />
            <StatRow label="出生日期" value={info.birth} copyable />
            <StatRow label="年龄" value={info.age === null ? "—" : `${info.age} 岁`} />
            <StatRow label="性别" value={info.gender} />
            <StatRow label="校验位" value={`${info.checkDigit}（算法期望 ${info.expectedCheckDigit}）`} />
          </div>
        </>
      )}

      <ToolHistoryPanel
        toolId="id-card"
        toolTitle="身份证校验"
        onRestore={(d) => {
          suppressNextRecord("id-card");
          if (typeof d.input === "string") setInput(d.input);
          else if (typeof d.normalized === "string") setInput(d.normalized);
        }}
      />
    </ToolShell>
  );
};

export default IdCardTool;
