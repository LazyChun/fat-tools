/*
 * fat-tools 共享 UI 组件
 */
import React, { useCallback, useEffect, useState } from "react";
import { Button, Space, Typography } from "antd";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";

const { Text } = Typography;

/** 复制按钮：点击后复制内容并短暂显示成功态 */
export const CopyButton: React.FC<{
  text: string | (() => string);
  size?: "small" | "middle" | "large";
  label?: string;
}> = ({ text, size = "small", label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const value = typeof text === "function" ? text() : text;
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button size={size} icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopy}>
      {copied ? "已复制" : label || "复制"}
    </Button>
  );
};

/** 工具详情页外壳：标题 + 返回按钮 + 附加操作 */
export const ToolShell: React.FC<{
  title: string;
  onBack?: () => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, onBack, extra, children }) => (
  <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingBottom: 12,
        borderBottom: "1px solid rgba(128,128,128,0.25)",
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      {onBack ? (
        <Button size="small" onClick={onBack}>
          返回
        </Button>
      ) : null}
      <Typography.Title level={5} style={{ margin: 0, flex: "0 1 auto" }}>
        {title}
      </Typography.Title>
      <div style={{ flex: 1 }} />
      {extra}
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
  </div>
);

/** 统计结果行 */
export const StatRow: React.FC<{ label: string; value: React.ReactNode; copyable?: boolean }> = ({
  label,
  value,
  copyable,
}) => (
  <div
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
    <Text type="secondary" style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Space size={4} style={{ minWidth: 0 }}>
      <Text strong style={{ wordBreak: "break-all", textAlign: "right" }}>
        {value}
      </Text>
      {copyable && value ? <CopyButton text={String(value)} /> : null}
    </Space>
  </div>
);
