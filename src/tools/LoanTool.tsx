/*
 * 贷款计算器：等额本息 / 等额本金，月供与利息汇总，可查看还款明细
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, InputNumber, Segmented, Space, Table, Tag, Typography } from "antd";
import {
  LOAN_METHOD_LABEL,
  LOAN_TERM_PRESETS,
  calcLoan,
  formatYuan,
  type LoanMethod,
  type LoanMonthRow,
} from "./loan";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const LoanTool: React.FC<Props> = ({ onBack }) => {
  const [principal, setPrincipal] = useState(1_000_000);
  const [rate, setRate] = useState(3.45);
  const [months, setMonths] = useState(360);
  const [method, setMethod] = useState<LoanMethod>("equal-installment");
  const [showAll, setShowAll] = useState(false);

  const calc = useMemo(
    () =>
      calcLoan({
        principal: principal || 0,
        annualRatePercent: rate ?? 0,
        months: months || 0,
        method,
      }),
    [principal, rate, months, method],
  );

  useEffect(() => {
    recordUsageDebounced("loan", () => {
      if (!calc.ok) return null;
      const r = calc.result;
      return {
        toolId: "loan",
        toolTitle: "贷款计算器",
        action: "calc",
        summary: `${LOAN_METHOD_LABEL[method]} · ${formatYuan(r.principal)} · ${r.months} 期 · 总利息 ${formatYuan(r.totalInterest)}`,
        detail: { principal: r.principal, rate: r.annualRatePercent, months: r.months, method },
      };
    });
  }, [calc, method]);

  const summaryText = calc.ok
    ? [
        `方式: ${LOAN_METHOD_LABEL[calc.result.method]}`,
        `本金: ${formatYuan(calc.result.principal)} 元`,
        `年利率: ${calc.result.annualRatePercent}%`,
        `期数: ${calc.result.months} 月`,
        `首月月供: ${formatYuan(calc.result.firstPayment)} 元`,
        `末月月供: ${formatYuan(calc.result.lastPayment)} 元`,
        `还款总额: ${formatYuan(calc.result.totalPayment)} 元`,
        `利息总额: ${formatYuan(calc.result.totalInterest)} 元`,
      ].join("\n")
    : "";

  const schedulePreview = calc.ok
    ? showAll
      ? calc.result.schedule
      : calc.result.schedule.slice(0, 12)
    : [];

  const columns = [
    { title: "期", dataIndex: "month", width: 56 },
    {
      title: "月供",
      dataIndex: "payment",
      render: (v: number) => formatYuan(v),
    },
    {
      title: "本金",
      dataIndex: "principal",
      render: (v: number) => formatYuan(v),
    },
    {
      title: "利息",
      dataIndex: "interest",
      render: (v: number) => formatYuan(v),
    },
    {
      title: "剩余本金",
      dataIndex: "balance",
      render: (v: number) => formatYuan(v),
    },
  ];

  return (
    <ToolShell
      title="贷款计算器"
      onBack={onBack}
      extra={calc.ok ? <CopyButton text={() => summaryText} label="复制摘要" /> : null}
    >
      <Space size={10} wrap style={{ marginBottom: 12 }}>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            本金
          </Text>
          <InputNumber
            min={1}
            max={1e9}
            step={10000}
            value={principal}
            onChange={(v) => setPrincipal(v || 0)}
            addonAfter="元"
            style={{ width: 160 }}
          />
        </Space>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            年利率
          </Text>
          <InputNumber
            min={0}
            max={100}
            step={0.05}
            precision={2}
            value={rate}
            onChange={(v) => setRate(v ?? 0)}
            addonAfter="%"
            style={{ width: 120 }}
          />
        </Space>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            期数
          </Text>
          <InputNumber
            min={1}
            max={600}
            value={months}
            onChange={(v) => setMonths(v || 1)}
            addonAfter="月"
            style={{ width: 120 }}
          />
        </Space>
        <Segmented
          size="small"
          value={method}
          onChange={(v) => setMethod(v as LoanMethod)}
          options={[
            { value: "equal-installment", label: "等额本息" },
            { value: "equal-principal", label: "等额本金" },
          ]}
        />
      </Space>

      <Space size={6} wrap style={{ marginBottom: 14 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          年限：
        </Text>
        {LOAN_TERM_PRESETS.map((p) => (
          <Tag
            key={p.months}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
            color={months === p.months ? "blue" : undefined}
            onClick={() => setMonths(p.months)}
          >
            {p.label}
          </Tag>
        ))}
      </Space>

      {!calc.ok ? (
        <Alert type="error" showIcon message={calc.error} />
      ) : (
        <>
          <div style={{ display: "grid", gap: 6, maxWidth: 480, marginBottom: 16 }}>
            <StatRow label="首月月供" value={`${formatYuan(calc.result.firstPayment)} 元`} copyable />
            {method === "equal-principal" ? (
              <StatRow label="末月月供" value={`${formatYuan(calc.result.lastPayment)} 元`} copyable />
            ) : null}
            <StatRow label="还款总额" value={`${formatYuan(calc.result.totalPayment)} 元`} copyable />
            <StatRow label="利息总额" value={`${formatYuan(calc.result.totalInterest)} 元`} copyable />
            <StatRow
              label="月利率"
              value={`${(calc.result.monthlyRate * 100).toFixed(4)}%`}
            />
          </div>

          <Space size={8} style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              还款明细{showAll ? "" : "（前 12 期）"}
            </Text>
            <Tag
              style={{ cursor: "pointer" }}
              color={showAll ? "blue" : undefined}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "只看前 12 期" : `展开全部 ${calc.result.months} 期`}
            </Tag>
          </Space>
          <Table<LoanMonthRow>
            size="small"
            rowKey="month"
            pagination={showAll ? { pageSize: 24, showSizeChanger: false } : false}
            columns={columns}
            dataSource={schedulePreview}
            scroll={{ x: true }}
          />
        </>
      )}

      <ToolHistoryPanel
        toolId="loan"
        toolTitle="贷款计算器"
        onRestore={(d) => {
          suppressNextRecord("loan");
          if (typeof d.principal === "number") setPrincipal(d.principal);
          if (typeof d.rate === "number") setRate(d.rate);
          if (typeof d.months === "number") setMonths(d.months);
          if (d.method === "equal-installment" || d.method === "equal-principal") {
            setMethod(d.method);
          }
        }}
      />
    </ToolShell>
  );
};

export default LoanTool;
