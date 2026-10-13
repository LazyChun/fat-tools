/*
 * 时间计算器：日期差值与日期推算
 *
 * 1) 时间差：两个时刻之间相差多少（绝对值拆分 / 总计 / 自然年月日 / 工作日）
 * 2) 推算：在某个时刻上加减 N 个指定单位，得到目标时刻
 *
 * 时间输入统一用 antd 的 DatePicker（showTime），日历面板 + 时刻选择；
 * 计算仍走 utils 的纯函数（timeDiff / addToDate / parseDateTime），便于单测，
 * 显示格式也统一由 utils 的 formatDateTime / weekdayLabel 输出。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DatePicker,
  InputNumber,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { SwapOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  DATE_UNITS,
  addToDate,
  formatDate,
  formatDateTime,
  formatDuration,
  parseDateTime,
  timeDiff,
  weekdayLabel,
  type DateUnit,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

// 时间计算器的全局搜索直达：匹配 2026-10-13、2026/10/13 15:30:00 等
// 日期/日期时间文本（与时间戳转换同形态，命中后填入起始时刻）
export const TIMECALC_SEARCH_FEED = createToolSearchFeed(
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?$/,
);

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

/** 历史记录中的字符串 → Dayjs（用纯函数解析，避免宿主 Date 解析差异） */
const strToDayjs = (v: unknown): Dayjs | null => {
  if (typeof v !== "string") return null;
  const d = parseDateTime(v);
  return d ? dayjs(d) : null;
};

const TimeCalcTool: React.FC<Props> = ({ onBack }) => {
  const [from, setFrom] = useState<Dayjs | null>(() => dayjs());
  const [to, setTo] = useState<Dayjs | null>(() => dayjs().add(1, "day"));

  // 全局搜索直达：日期文本用纯函数解析后填入起始时刻（from）
  const feedTimeCalc = useCallback((value: string) => {
    const d = parseDateTime(value);
    if (d) setFrom(dayjs(d));
  }, []);
  TIMECALC_SEARCH_FEED.useFeedValue(feedTimeCalc);

  const [base, setBase] = useState<Dayjs | null>(() => dayjs());
  const [amount, setAmount] = useState(30);
  const [unit, setUnit] = useState<DateUnit>("day");
  const [direction, setDirection] = useState<"add" | "sub">("add");

  const fromDate = useMemo(() => from?.toDate() ?? null, [from]);
  const toDate = useMemo(() => to?.toDate() ?? null, [to]);
  const baseDate = useMemo(() => base?.toDate() ?? null, [base]);

  const diff = useMemo(
    () => (fromDate && toDate ? timeDiff(fromDate, toDate) : null),
    [fromDate, toDate],
  );

  const shifted = useMemo(
    () =>
      baseDate
        ? addToDate(baseDate, direction === "add" ? amount : -amount, unit)
        : null,
    [baseDate, amount, unit, direction],
  );

  // 操作记录（防抖落库）
  useEffect(() => {
    recordUsageDebounced(
      "timecalc",
      () => {
        if (diff && fromDate && toDate) {
          return {
            toolId: "timecalc",
            toolTitle: "时间计算器",
            action: "diff",
            summary: `${formatDateTime(fromDate)} ⇢ ${formatDateTime(toDate)} ＝ ${formatDuration(diff.milliseconds)}`,
            detail: {
              kind: "diff",
              from: formatDateTime(fromDate),
              to: formatDateTime(toDate),
            },
          };
        }
        if (shifted && baseDate) {
          return {
            toolId: "timecalc",
            toolTitle: "时间计算器",
            action: "shift",
            summary: `${formatDateTime(baseDate)} ${direction === "add" ? "+" : "-"}${amount}${DATE_UNITS.find((u) => u.unit === unit)?.label ?? unit} → ${formatDateTime(shifted)}`,
            detail: {
              kind: "shift",
              base: formatDateTime(baseDate),
              amount,
              unit,
              direction,
            },
          };
        }
        return null;
      },
      2500,
    );
  }, [diff, fromDate, toDate, shifted, baseDate, amount, unit, direction]);

  const swapEnds = useCallback(() => {
    setFrom(to);
    setTo(from);
  }, [from, to]);

  const cal = diff?.calendar;

  return (
    <ToolShell title="时间计算器" onBack={onBack}>
      <div style={{ display: "grid", gap: 16 }}>
        {/* ── 时间差 ────────────────────────────────────────── */}
        <section
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(128,128,128,0.08)",
            display: "grid",
            gap: 10,
          }}
        >
          <Space size={8} wrap>
            <Tag color="blue">时间差</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              两个时刻之间的间隔
            </Text>
          </Space>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Text type="secondary" style={{ flexShrink: 0, fontSize: 12 }}>
                起始
              </Text>
              <DatePicker
                showTime={{ format: "HH:mm:ss" }}
                format={DATE_TIME_FORMAT}
                value={from}
                onChange={(v) => setFrom(v)}
                allowClear={false}
                placeholder="选择起始时间"
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button onClick={() => setFrom(dayjs())}>现在</Button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Text type="secondary" style={{ flexShrink: 0, fontSize: 12 }}>
                结束
              </Text>
              <DatePicker
                showTime={{ format: "HH:mm:ss" }}
                format={DATE_TIME_FORMAT}
                value={to}
                onChange={(v) => setTo(v)}
                allowClear={false}
                placeholder="选择结束时间"
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button onClick={() => setTo(dayjs())}>现在</Button>
            </div>
          </div>

          <Space size={6} wrap>
            <Button size="small" icon={<SwapOutlined />} onClick={swapEnds}>
              交换
            </Button>
            <Button size="small" onClick={() => setTo(dayjs().add(1, "day"))}>
              结束 = 明天此刻
            </Button>
            <Button
              size="small"
              onClick={() => setFrom(dayjs().startOf("day"))}
            >
              起始 = 今天 0 点
            </Button>
          </Space>

          {diff && fromDate && toDate ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "rgba(22,119,255,0.08)",
                }}
              >
                <Text strong style={{ fontSize: 15 }}>
                  {diff.negative ? "结束早于起始 " : "相差 "}
                  {formatDuration(diff.milliseconds)}
                </Text>
                <Tag color={diff.negative ? "orange" : "success"}>
                  {diff.negative
                    ? "过去"
                    : diff.milliseconds === 0
                      ? "同一时刻"
                      : "未来"}
                </Tag>
                <div style={{ flex: 1 }} />
                <CopyButton
                  text={formatDuration(diff.milliseconds)}
                  label="复制结论"
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
                  gap: 6,
                }}
              >
                <StatRow
                  label="总计天数"
                  value={Number(diff.totalDays.toFixed(4))}
                  copyable
                />
                <StatRow
                  label="总计小时"
                  value={Number(diff.totalHours.toFixed(2))}
                  copyable
                />
                <StatRow
                  label="总计分钟"
                  value={Math.floor(diff.totalMinutes)}
                  copyable
                />
                <StatRow label="总计秒数" value={diff.totalSeconds} copyable />
                <StatRow
                  label="自然年月日"
                  value={
                    cal
                      ? `${cal.sign < 0 ? "-" : ""}${cal.years} 年 ${cal.months} 月 ${cal.days} 天`
                      : "—"
                  }
                />
                <StatRow
                  label="工作日（含首尾）"
                  value={`${diff.businessDays} 天`}
                />
                <StatRow
                  label="周末（含首尾）"
                  value={`${diff.weekendDays} 天`}
                />
                <StatRow
                  label="星期"
                  value={`${weekdayLabel(fromDate)} ${diff.negative ? "←" : "→"} ${weekdayLabel(toDate)}`}
                />
              </div>
            </>
          ) : (
            <Text type="danger" style={{ fontSize: 12 }}>
              请选择起始与结束时间。
            </Text>
          )}
        </section>

        {/* ── 日期推算 ──────────────────────────────────────── */}
        <section
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(128,128,128,0.08)",
            display: "grid",
            gap: 10,
          }}
        >
          <Space size={8} wrap>
            <Tag color="purple">日期推算</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              在某个时刻上加减若干时间单位
            </Text>
          </Space>

          <Space size={8} wrap>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <DatePicker
                showTime={{ format: "HH:mm:ss" }}
                format={DATE_TIME_FORMAT}
                value={base}
                onChange={(v) => setBase(v)}
                allowClear={false}
                placeholder="基准时间"
                style={{ width: 240 }}
              />
              <Button onClick={() => setBase(dayjs())}>现在</Button>
            </div>

            <Radio.Group
              size="small"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              optionType="button"
              options={[
                { label: "之后 +", value: "add" },
                { label: "之前 −", value: "sub" },
              ]}
            />

            <InputNumber
              value={amount}
              onChange={(v) => setAmount(typeof v === "number" ? v : 0)}
              style={{ width: 110 }}
            />

            <Select
              value={unit}
              onChange={(v) => setUnit(v)}
              style={{ width: 100 }}
              options={DATE_UNITS.map((u) => ({
                label: u.label,
                value: u.unit,
              }))}
            />
          </Space>

          {shifted && baseDate ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
                gap: 6,
              }}
            >
              <StatRow
                label="结果时刻"
                value={formatDateTime(shifted)}
                copyable
              />
              <StatRow label="星期" value={weekdayLabel(shifted)} />
              <StatRow label="日期" value={formatDate(shifted)} copyable />
              <StatRow
                label="时间戳（毫秒）"
                value={shifted.getTime()}
                copyable
              />
            </div>
          ) : (
            <Text type="danger" style={{ fontSize: 12 }}>
              请选择基准时间。
            </Text>
          )}
        </section>

        <ToolHistoryPanel
          toolId="timecalc"
          toolTitle="时间计算器"
          reloadKey={diff || shifted ? 1 : 0}
          onRestore={(d) => {
            const kind = d.kind === "shift" ? "shift" : "diff";
            if (kind === "diff") {
              const nextFrom = strToDayjs(d.from);
              if (nextFrom) {
                suppressNextRecord("timecalc");
                setFrom(nextFrom);
                setTo(strToDayjs(d.to) ?? dayjs());
              }
            } else {
              const nextBase = strToDayjs(d.base);
              if (nextBase) {
                suppressNextRecord("timecalc");
                setBase(nextBase);
                if (typeof d.amount === "number") setAmount(d.amount);
                if (typeof d.unit === "string") setUnit(d.unit as DateUnit);
                setDirection(d.direction === "sub" ? "sub" : "add");
              }
            }
          }}
        />
      </div>
    </ToolShell>
  );
};

export default TimeCalcTool;
