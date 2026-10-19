/*
 * 人民币金额大写：把数字金额转换为财务/发票标准大写写法
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Segmented, Space, Tag, Typography } from "antd";
import { amountToChineseUpper, formatAmountWithCommas, MONEY_MAX_DIGITS } from "./moneyUpper";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text, Paragraph } = Typography;

const EXAMPLES = ["0", "0.05", "1.5", "100", "1000.01", "123456789.99", "100000001", "-1234.56"];

interface Props {
  onBack?: () => void;
}

const MoneyUpperTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("123456.78");
  const [unit, setUnit] = useState<"元" | "圆">("元");

  const result = useMemo(() => {
    const value = input.trim();
    if (!value) return { upper: "", error: "", formatted: "" };
    try {
      return {
        upper: amountToChineseUpper(value, { unit }),
        error: "",
        formatted: formatAmountWithCommas(value),
      };
    } catch (e) {
      return { upper: "", error: (e as Error).message, formatted: "" };
    }
  }, [input, unit]);

  // 输入停顿 1.5s 后落库
  useEffect(() => {
    recordUsageDebounced("money-upper", () => {
      if (!input.trim() || result.error) return null;
      return {
        toolId: "money-upper",
        toolTitle: "金额大写转换",
        action: "convert",
        summary: `${input.trim()} → ${result.upper}`,
        detail: { input: input.trim(), unit },
      };
    });
  }, [input, unit, result.error, result.upper]);

  return (
    <ToolShell
      title="金额大写转换"
      onBack={onBack}
      extra={<CopyButton text={() => result.upper} label="复制大写" />}
    >
      <Space size={10} wrap style={{ marginBottom: 12 }}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          addonBefore="¥"
          placeholder="输入金额，如 123456.78"
          allowClear
          style={{ width: 240 }}
        />
        <Space size={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            货币单位
          </Text>
          <Segmented
            size="small"
            value={unit}
            onChange={(v) => setUnit(v as "元" | "圆")}
            options={[
              { value: "元", label: "元" },
              { value: "圆", label: "圆" },
            ]}
          />
        </Space>
        {unit === "圆" ? <Tag color="blue">传统写法「圆」</Tag> : null}
      </Space>

      <Space size={6} wrap style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          示例：
        </Text>
        {EXAMPLES.map((ex) => (
          <Button key={ex} size="small" onClick={() => setInput(ex)}>
            {ex}
          </Button>
        ))}
      </Space>

      {result.error ? (
        <Alert type="error" showIcon message={result.error} style={{ marginBottom: 12 }} />
      ) : (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 10,
            border: "1px solid rgba(22,119,255,0.35)",
            background: "rgba(22,119,255,0.06)",
            marginBottom: 12,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            人民币大写
          </Text>
          <Paragraph
            copyable={{ text: result.upper }}
            style={{
              marginTop: 6,
              marginBottom: 0,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: 2,
              wordBreak: "break-all",
            }}
          >
            {result.upper || "—"}
          </Paragraph>
        </div>
      )}

      <div style={{ display: "grid", gap: 6, maxWidth: 420 }}>
        <StatRow label="原始金额（千分位）" value={result.formatted || "—"} />
        <StatRow
          label="数字字符"
          value={input.trim().replace(/[¥￥,\s]/g, "") || "—"}
        />
        <StatRow label="支持范围" value={`最多两位小数 / 整数最多 ${MONEY_MAX_DIGITS} 位`} />
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>
        规则：有「分」时末尾不加「整」；有「角」无「分」时在角后加「整」；支持负号、千分位逗号与货币符号。
      </Text>

      <ToolHistoryPanel
        toolId="money-upper"
        toolTitle="金额大写转换"
        onRestore={(d) => {
          suppressNextRecord("money-upper");
          if (typeof d.input === "string") setInput(d.input);
          if (d.unit === "元" || d.unit === "圆") setUnit(d.unit);
        }}
      />
    </ToolShell>
  );
};

export default MoneyUpperTool;
