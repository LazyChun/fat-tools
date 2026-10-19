/*
 * 新增工具共用的页面壳：标题、复制、操作记录和错误行。
 */
import React, { useEffect } from "react";
import { Input, Typography } from "antd";
import { CopyButton, StatRow, ToolShell } from "../../components/Common";
import ToolHistoryPanel from "../../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../../historyClient";

const { TextArea } = Input;

export { CopyButton, StatRow };

interface ExtraPageProps {
  title: string;
  toolId: string;
  onBack?: () => void;
  action: string;
  summary: string;
  detail: Record<string, unknown>;
  active: boolean;
  extra?: React.ReactNode;
  onRestore: (detail: Record<string, unknown>) => void;
  children: React.ReactNode;
}

export const ExtraPage: React.FC<ExtraPageProps> = ({
  title,
  toolId,
  onBack,
  action,
  summary,
  detail,
  active,
  extra,
  onRestore,
  children,
}) => {
  const detailKey = JSON.stringify(detail);
  useEffect(() => {
    recordUsageDebounced(toolId, () => {
      if (!active) return null;
      return { toolId, toolTitle: title, action, summary, detail };
    });
    // detailKey 已覆盖 detail 的变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, title, action, summary, detailKey, active]);

  return (
    <ToolShell title={title} onBack={onBack} extra={extra}>
      {children}
      <ToolHistoryPanel
        toolId={toolId}
        toolTitle={title}
        onRestore={(saved) => {
          suppressNextRecord(toolId);
          onRestore(saved);
        }}
      />
    </ToolShell>
  );
};

export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
    {children}
  </Typography.Paragraph>
);

export const Err: React.FC<{ text?: string }> = ({ text }) =>
  text ? <div style={{ color: "#cf1322", marginTop: 8 }}>{text}</div> : null;

export const Rows: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "grid", gap: 6 }}>{children}</div>
);

export const Out: React.FC<{ value: string; placeholder?: string }> = ({ value, placeholder }) => (
  <TextArea
    value={value}
    placeholder={placeholder}
    readOnly
    autoSize={{ minRows: 4, maxRows: 16 }}
    style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}
  />
);

export function numText(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}

export function yuan(value: number): string {
  const sign = value < 0 ? "-" : "";
  const [whole, frac] = Math.abs(value).toFixed(2).split(".");
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}
