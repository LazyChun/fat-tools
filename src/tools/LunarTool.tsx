/*
 * 农历工具：公历 ↔ 农历互转、干支生肖、二十四节气、节假日信息。
 *
 * 算法全部在 utils.ts（纯函数，1900-2100），本组件只做交互与展示。
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Segmented,
  Space,
  Tag,
  Typography,
} from "antd";
import { CalendarOutlined, SwapOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  LUNAR_MAX_YEAR,
  LUNAR_MIN_YEAR,
  SOLAR_TERMS,
  formatDate,
  solarTermOf,
  solarTermsOfYear,
  toLunar,
  weekdayLabel,
  type LunarDate,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text, Title } = Typography;

interface Props {
  onBack?: () => void;
}

/** 农历节日表（按月-日索引，含春节 / 元宵 / 端午 / 七夕 / 中元 / 中秋 / 重阳 / 腊八 / 小年 / 除夕） */
const LUNAR_FESTIVALS: Record<string, string> = {
  "1-1": "春节",
  "1-15": "元宵节",
  "2-2": "龙抬头",
  "5-5": "端午节",
  "7-7": "七夕节",
  "7-15": "中元节",
  "8-15": "中秋节",
  "9-9": "重阳节",
  "12-8": "腊八节",
  "12-23": "小年",
};

/** 公历固定节日表 */
const SOLAR_FESTIVALS: Record<string, string> = {
  "1-1": "元旦",
  "2-14": "情人节",
  "3-8": "妇女节",
  "3-12": "植树节",
  "4-1": "愚人节",
  "5-1": "劳动节",
  "5-4": "青年节",
  "6-1": "儿童节",
  "7-1": "建党节",
  "8-1": "建军节",
  "9-10": "教师节",
  "10-1": "国庆节",
  "12-25": "圣诞节",
};

function lunarFestival(ld: LunarDate): string | null {
  if (ld.isLeap) return null;
  return LUNAR_FESTIVALS[`${ld.month}-${ld.day}`] ?? null;
}

/** 判断某农历日是否为「除夕」：农历十二月最后一天即次日为正月初一 */
function isLunarNewYearEve(ld: LunarDate): boolean {
  if (ld.isLeap || ld.month !== 12) return false;
  const next = new Date(ld.year, 0, 1); // 占位，避免未使用告警
  void next;
  return ld.day >= 29;
}

const LunarTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<"lunar" | "term">("lunar");
  const [date, setDate] = useState<Dayjs>(() => dayjs());

  const lunar = useMemo<LunarDate | null>(() => toLunar(date.toDate()), [date]);
  const term = useMemo(() => solarTermOf(date.toDate()), [date]);
  const solarFestival = useMemo(
    () => SOLAR_FESTIVALS[`${date.month() + 1}-${date.date()}`] ?? null,
    [date],
  );

  const festival = useMemo(() => {
    if (!lunar) return solarFestival;
    const lf = lunarFestival(lunar);
    if (lunar.isNewYear) return "春节";
    if (isLunarNewYearEve(lunar)) return "除夕";
    return [lf, solarFestival].filter(Boolean).join(" · ") || null;
  }, [lunar, solarFestival]);

  const yearTerms = useMemo(
    () => solarTermsOfYear(date.year()),
    [date],
  );

  // 记录：日期变化后防抖落库
  React.useEffect(() => {
    recordUsageDebounced(
      "lunar",
      () =>
        lunar
          ? {
              toolId: "lunar",
              toolTitle: "农历转换",
              action: "convert",
              summary: `公历 ${formatDate(date.toDate())} → 农历 ${lunar.text}`,
              detail: { date: formatDate(date.toDate()) },
            }
          : null,
      1500,
    );
  }, [date, lunar]);

  const outOfRange =
    date.year() < LUNAR_MIN_YEAR || date.year() > LUNAR_MAX_YEAR;

  return (
    <ToolShell
      title="农历转换"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <DatePicker
            value={date}
            onChange={(v) => v && setDate(v)}
            allowClear={false}
          />
          <Button
            size="small"
            icon={<CalendarOutlined />}
            onClick={() => setDate(dayjs())}
          >
            今天
          </Button>
        </Space>
      }
    >
      {outOfRange ? (
        <Alert
          type="warning"
          showIcon
          message={`农历算法仅支持 ${LUNAR_MIN_YEAR}–${LUNAR_MAX_YEAR} 年`}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {lunar ? (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            background: "linear-gradient(120deg, rgba(229,60,60,0.10), rgba(22,119,255,0.08))",
            border: "1px solid rgba(128,128,128,0.22)",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <Title level={3} style={{ margin: 0 }}>
              {lunar.ganzhi}年 {lunar.monthText}
              {lunar.dayText}
            </Title>
            <Tag color="red" style={{ marginInlineEnd: 0 }}>
              {lunar.zodiac}年
            </Tag>
            {festival ? (
              <Tag color="volcano" style={{ marginInlineEnd: 0 }}>
                {festival}
              </Tag>
            ) : null}
            {term ? (
              <Tag color="green" style={{ marginInlineEnd: 0 }}>
                节气 · {term}
              </Tag>
            ) : null}
            <div style={{ flex: 1 }} />
            <CopyButton text={lunar.text} label="复制农历" />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            公历 {formatDate(date.toDate())} {weekdayLabel(date.toDate())}
          </Text>
        </div>
      ) : null}

      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setMode(v as typeof mode)}
        options={[
          { value: "lunar", label: "农历详情" },
          { value: "term", label: `${date.year()} 年节气` },
        ]}
        style={{ marginBottom: 12 }}
      />

      {mode === "lunar" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          <Card size="small" title="日期信息">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="公历">
                {formatDate(date.toDate())} {weekdayLabel(date.toDate())}
              </Descriptions.Item>
              <Descriptions.Item label="农历">
                {lunar ? lunar.text : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="干支 / 生肖">
                {lunar ? `${lunar.ganzhi}（${lunar.zodiac}）` : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="节气">{term ?? "无"}</Descriptions.Item>
              <Descriptions.Item label="节日">{festival ?? "无"}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="今日对照">
            <div style={{ display: "grid", gap: 6 }}>
              <StatRow
                label="农历年月日"
                value={lunar ? `${lunar.year} 年 ${lunar.month} 月 ${lunar.day} 日` : "—"}
              />
              <StatRow label="是否闰月" value={lunar?.isLeap ? "是" : "否"} />
              <StatRow label="月名" value={lunar?.monthText ?? "—"} />
              <StatRow label="日名" value={lunar?.dayText ?? "—"} />
              <StatRow
                label="距离春节"
                value={lunar && lunar.isNewYear ? "就是今天" : `${daysToSpringFestival(date.toDate())} 天`}
              />
            </div>
          </Card>
        </div>
      ) : (
        <Card size="small" title={`${date.year()} 年二十四节气`}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 6,
            }}
          >
            {SOLAR_TERMS.map((name) => {
              const t = yearTerms.find((x) => x.name === name);
              if (!t) return null;
              const isToday =
                t.month === date.month() + 1 && t.day === date.date();
              return (
                <div
                  key={name}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: isToday ? "rgba(82,196,26,0.16)" : "rgba(128,128,128,0.08)",
                    border: isToday ? "1px solid rgba(82,196,26,0.6)" : "1px solid transparent",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text strong style={{ fontSize: 13 }}>
                    {name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.month}/{t.day}
                  </Text>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
        农历采用 1900–2100 年天文数据表推算，节气使用通用近似公式（日级精度）。
        日期与节气按东八区（北京时间）口径，偏远地区可能有一日误差。
      </Text>

      <ToolHistoryPanel
        toolId="lunar"
        toolTitle="农历转换"
        onRestore={(d) => {
          suppressNextRecord("lunar");
          if (typeof d.date === "string") {
            const m = d.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) setDate(dayjs(d.date));
          }
        }}
      />
    </ToolShell>
  );
};

/** 距离下一个春节的天数（按公历日差估算） */
function daysToSpringFestival(from: Date): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  for (let i = 0; i < 3; i++) {
    const candidate = findSpringFestival(from.getFullYear() + i);
    if (candidate && candidate.getTime() >= today) {
      return Math.round((candidate.getTime() - today) / 86_400_000);
    }
  }
  return 0;
}

/** 找到某公历年的春节（正月初一）对应公历日期 */
function findSpringFestival(gregorianYear: number): Date | null {
  // 春节总在 1/21 ~ 2/21 之间，逐日扫描该窗口
  const start = new Date(gregorianYear, 0, 21);
  for (let i = 0; i < 32; i++) {
    const probe = new Date(start.getTime() + i * 86_400_000);
    const ld = toLunar(probe);
    if (ld && ld.isNewYear) return probe;
  }
  return null;
}

export default LunarTool;
