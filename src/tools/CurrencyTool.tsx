/*
 * 汇率计算：多币种换算
 *
 * 1) 双向换算：输入金额 + 源/目标币种，实时换算，一键互换
 * 2) 批量换算表：以「1 源币种」为基准，列出所有内置货币的对应金额
 * 3) 汇率来源：内置离线参考汇率（兜底）+ 在线更新（多接口兜底、带超时）
 *
 * 换算逻辑收敛在 utils.ts（convertCurrency / crossRate / parseOnlineRates 等）。
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { DollarOutlined, ReloadOutlined, SwapOutlined } from "@ant-design/icons";
import {
  CURRENCIES,
  OFFLINE_RATE_TABLE,
  convertCurrency,
  crossRate,
  fetchRatesOnline,
  formatCurrency,
  type CurrencyDef,
  type RateTable,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

/** 数值格式化：避免浮点长尾，极端值转科学计数法 */
function fmtNum(n: number, maxDecimals = 6): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(6);
  return parseFloat(n.toFixed(maxDecimals)).toLocaleString("zh-CN", {
    maximumFractionDigits: maxDecimals,
  });
}

function currencyOption(c: CurrencyDef) {
  return { value: c.code, label: `${c.flag ?? ""} ${c.code} ${c.name}`.trim() };
}

const CurrencyTool: React.FC<Props> = ({ onBack }) => {
  const [table, setTable] = useState<RateTable>(OFFLINE_RATE_TABLE);
  const [amount, setAmount] = useState<number>(100);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const amountValid = Number.isFinite(amount);

  const result = useMemo(() => {
    if (!amountValid) return null;
    try {
      return { ok: true as const, value: convertCurrency(table, from, to, amount) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [table, from, to, amount, amountValid]);

  const rate = useMemo(() => {
    try {
      return crossRate(table, from, to);
    } catch {
      return null;
    }
  }, [table, from, to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const sync = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const online = await fetchRatesOnline();
      if (!online) {
        setMsg("在线获取失败（网络不可达或接口限流），已使用内置参考汇率");
      } else {
        setTable(online);
        setMsg(`已更新在线汇率 · ${online.updatedAt ?? ""}（${online.note ?? ""}）`);
        recordUsage({
          toolId: "currency",
          toolTitle: "汇率计算",
          action: "sync",
          summary: `更新在线汇率（1 USD ≈ ${online.rates.USD?.toFixed(4)} CNY）`,
          detail: { usdCny: online.rates.USD, updatedAt: online.updatedAt },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // 防抖记录换算动作
  useEffect(() => {
    recordUsageDebounced(
      "currency",
      () => {
        if (!result || !result.ok) return null;
        return {
          toolId: "currency",
          toolTitle: "汇率计算",
          action: "convert",
          summary: `${amount} ${from} = ${formatCurrency(result.value, to, table)}（1 ${from} = ${fmtNum(rate ?? 0)} ${to}）`,
          detail: { from, to, amount, source: table.source },
        };
      },
      2000,
    );
  }, [result, amount, from, to, table, rate]);

  return (
    <ToolShell
      title="汇率计算"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { value: "single", label: "换算" },
              { value: "batch", label: "批量表" },
            ]}
          />
          <Tooltip title={`当前数据源：${table.note ?? "-"}`}>
            <Tag color={table.source === "online" ? "success" : "default"} style={{ marginInlineEnd: 0 }}>
              {table.source === "online" ? "在线汇率" : "内置汇率"}
            </Tag>
          </Tooltip>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={sync}>
            在线更新
          </Button>
        </Space>
      }
    >
      {msg ? (
        <Alert
          type={table.source === "online" ? "success" : "info"}
          showIcon
          closable
          onClose={() => setMsg(null)}
          message={msg}
          style={{ marginBottom: 10 }}
        />
      ) : null}

      {/* 换算输入区（两种模式共用） */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: "rgba(128,128,128,0.08)",
          marginBottom: 12,
        }}
      >
        <Space size={10} wrap align="center">
          <InputNumber
            value={amount}
            onChange={(v) => setAmount(typeof v === "number" ? v : 0)}
            style={{ width: 160 }}
            min={0}
            controls
            addonBefore={<DollarOutlined />}
          />
          <Select
            showSearch
            value={from}
            onChange={setFrom}
            style={{ width: 190 }}
            options={CURRENCIES.map(currencyOption)}
            optionFilterProp="label"
          />
          <Button icon={<SwapOutlined />} onClick={swap}>
            互换
          </Button>
          <Select
            showSearch
            value={to}
            onChange={setTo}
            style={{ width: 190 }}
            options={CURRENCIES.map(currencyOption)}
            optionFilterProp="label"
          />
        </Space>

        {result && result.ok ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 6,
              background: "rgba(22,119,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Text strong style={{ fontSize: 18 }}>
              {fmtNum(amount, 4)} {from} = {formatCurrency(result.value, to, table)}
            </Text>
            <div style={{ flex: 1 }} />
            <Text type="secondary" style={{ fontSize: 12, fontFamily: "monospace" }}>
              1 {from} = {rate !== null ? fmtNum(rate) : "—"} {to}
            </Text>
            <CopyButton
              text={`${fmtNum(amount, 4)} ${from} = ${result.value} ${to}（1 ${from} = ${rate} ${to}）`}
              label="复制结果"
            />
          </div>
        ) : result && !result.ok ? (
          <div style={{ marginTop: 10, color: "#cf1322" }}>{result.error}</div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 10 }}>
            输入金额后自动换算
          </Text>
        )}
      </div>

      {mode === "single" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          <div>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              快捷换算（1 {from} =）
            </Text>
            <div style={{ display: "grid", gap: 6 }}>
              {CURRENCIES.filter((c) => c.code !== from)
                .map((c) => ({ c, v: convertCurrency(table, from, c.code, 1) }))
                .sort((a, b) => b.v - a.v)
                .slice(0, 10)
                .map(({ c, v }) => (
                  <StatRow
                    key={c.code}
                    label={`${c.flag ?? ""} ${c.code} ${c.name}`.trim()}
                    value={fmtNum(v, 6)}
                    copyable
                  />
                ))}
            </div>
          </div>
          <div>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              反向汇率（1 {to} =）
            </Text>
            <div style={{ display: "grid", gap: 6 }}>
              {CURRENCIES.filter((c) => c.code !== to)
                .map((c) => ({ c, v: convertCurrency(table, to, c.code, 1) }))
                .sort((a, b) => b.v - a.v)
                .slice(0, 10)
                .map(({ c, v }) => (
                  <StatRow
                    key={c.code}
                    label={`${c.flag ?? ""} ${c.code} ${c.name}`.trim()}
                    value={fmtNum(v, 6)}
                    copyable
                  />
                ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
            批量换算表：{fmtNum(amount, 4)} {from} 折合
          </Text>
          <Table
            size="small"
            pagination={false}
            rowKey="code"
            scroll={{ y: 420 }}
            dataSource={CURRENCIES.map((c) => ({
              key: c.code,
              code: c.code,
              currency: c,
              value: convertCurrency(table, from, c.code, amount),
              unit: convertCurrency(table, from, c.code, 1),
            }))}
            columns={[
              {
                title: "货币",
                dataIndex: "currency",
                render: (c: CurrencyDef) => (
                  <Space size={6}>
                    <span>{c.flag}</span>
                    <Text strong style={{ fontSize: 12 }}>{c.code}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{c.name}</Text>
                  </Space>
                ),
              },
              {
                title: `金额（${fmtNum(amount, 2)} ${from} 折合）`,
                dataIndex: "value",
                align: "right",
                render: (v: number, row: { currency: CurrencyDef }) => (
                  <Text strong style={{ fontFamily: "monospace" }}>
                    {formatCurrency(v, row.currency.code, table)}
                  </Text>
                ),
              },
              {
                title: `1 ${from} =`,
                dataIndex: "unit",
                align: "right",
                render: (v: number) => (
                  <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {fmtNum(v, 6)}
                  </Text>
                ),
              },
            ]}
          />
        </div>
      )}

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>
        汇率以人民币（CNY）为基准中转换算。内置汇率为静态参考值，仅用于离线估算；
        点击「在线更新」可从公开汇率接口拉取最新中间价（网络不可用时自动回退内置值）。
        实际结汇以银行牌价为准。
      </Text>

      <ToolHistoryPanel
        toolId="currency"
        toolTitle="汇率计算"
        reloadKey={msg ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("currency");
          if (typeof d.from === "string") setFrom(d.from);
          if (typeof d.to === "string") setTo(d.to);
          if (typeof d.amount === "number") setAmount(d.amount);
        }}
      />
    </ToolShell>
  );
};

export default CurrencyTool;
