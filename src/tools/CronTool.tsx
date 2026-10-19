/*
 * Cron 表达式解析：字段校验 + 中文含义 + 下次执行时间推算
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Space, Table, Tag, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import {
  CRON_PRESETS,
  describeCron,
  formatCronDate,
  nextCronRuns,
  parseCron,
  type CronFieldInfo,
} from "./cron";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const CronTool: React.FC<Props> = ({ onBack }) => {
  const [expr, setExpr] = useState("0 9 * * 1-5");

  const parsed = useMemo(() => parseCron(expr), [expr]);
  const description = useMemo(() => describeCron(parsed), [parsed]);

  const [runs, setRuns] = useState<{ dates: Date[]; truncated?: boolean } | null>(null);

  // 表达式变化后（防抖）自动推算未来执行时间
  useEffect(() => {
    if (!parsed.ok) {
      setRuns(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const r = nextCronRuns(parsed, 8);
      setRuns(r.ok ? { dates: r.dates, truncated: r.truncated } : null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [parsed]);

  // 输入停顿 2s 后落库
  useEffect(() => {
    recordUsageDebounced("cron", () => {
      if (!parsed.ok) return null;
      return {
        toolId: "cron",
        toolTitle: "Cron 表达式解析",
        action: "parse",
        summary: `解析 ${parsed.normalized}`,
        detail: { expr, normalized: parsed.normalized, macro: parsed.macro },
      };
    }, 2000);
  }, [expr, parsed]);

  const columns = [
    {
      title: "字段",
      dataIndex: "label",
      width: 70,
      render: (label: string, row: CronFieldInfo) => (
        <Text strong>
          {label}
          {row.wildcard ? null : " "}
        </Text>
      ),
    },
    {
      title: "表达式",
      dataIndex: "raw",
      width: 110,
      render: (raw: string) => <Text code>{raw}</Text>,
    },
    {
      title: "含义",
      dataIndex: "description",
      render: (desc: string, row: CronFieldInfo) =>
        row.wildcard ? <Tag>{desc}</Tag> : <span>{desc}</span>,
    },
  ];

  return (
    <ToolShell
      title="Cron 表达式解析"
      onBack={onBack}
      extra={<CopyButton text={() => expr} label="复制表达式" />}
    >
      <Space size={8} wrap style={{ marginBottom: 10, width: "100%" }}>
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="如 0 9 * * 1-5，或 @daily"
          allowClear
          style={{ width: 320, fontFamily: "monospace" }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          支持 5 段（分 时 日 月 周）、6/7 段（秒 分 时 日 月 周 [年]）与 @ 宏
        </Text>
      </Space>

      <Space size={6} wrap style={{ marginBottom: 14 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          常用：
        </Text>
        {CRON_PRESETS.map((p) => (
          <Tag
            key={p.expr}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
            color={p.expr === expr ? "blue" : undefined}
            onClick={() => setExpr(p.expr)}
          >
            {p.label}
          </Tag>
        ))}
      </Space>

      {!parsed.ok ? (
        <Alert type="error" showIcon message={parsed.error} />
      ) : (
        <>
          <Alert
            type="success"
            showIcon
            icon={<ClockCircleOutlined />}
            message={description}
            style={{ marginBottom: 12 }}
          />
          {parsed.macro ? (
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
              宏 <Text code>{parsed.macro}</Text> 展开为 <Text code>{parsed.normalized}</Text>
            </Text>
          ) : null}

          <Table
            size="small"
            rowKey="key"
            pagination={false}
            columns={columns}
            dataSource={parsed.fields}
            style={{ marginBottom: 16 }}
          />

          <Text type="secondary" style={{ fontSize: 12 }}>
            未来 8 次执行时间
          </Text>
          <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
            {runs && runs.dates.length > 0 ? (
              runs.dates.map((d, i) => (
                <div
                  key={`${d.getTime()}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "rgba(128,128,128,0.08)",
                  }}
                >
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    {i + 1}
                  </Tag>
                  <Text style={{ fontFamily: "monospace" }}>{formatCronDate(d, parsed.hasSeconds)}</Text>
                </div>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                未能在合理范围内推算出执行时间（表达式过于苛刻，或超出了扫描范围）。
              </Text>
            )}
          </div>
          {runs?.truncated ? (
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
              仅推算出上述时间，后续超出扫描范围。
            </Text>
          ) : null}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          速查：<Text code>*</Text> 任意值 · <Text code>?</Text> 不指定 · <Text code>a-b</Text> 区间 ·{" "}
          <Text code>*/n</Text> 每 n 单位 · <Text code>a,b</Text> 枚举 · <Text code>L</Text> 当月最后一天 ·{" "}
          <Text code>JAN-DEC</Text> / <Text code>SUN-SAT</Text> 名称缩写
        </Text>
        <Button
          size="small"
          type="link"
          style={{ paddingLeft: 0 }}
          onClick={() => setExpr("* * * * *")}
        >
          重置为每分钟
        </Button>
      </div>

      <ToolHistoryPanel
        toolId="cron"
        toolTitle="Cron 表达式解析"
        onRestore={(d) => {
          suppressNextRecord("cron");
          if (typeof d.expr === "string") setExpr(d.expr);
        }}
      />
    </ToolShell>
  );
};

export default CronTool;
