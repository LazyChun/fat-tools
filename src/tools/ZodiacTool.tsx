/*
 * 星座罗盘：太阳 / 月亮 / 上升星座计算 + 黄道罗盘可视化 + 星座配对。
 *
 * 太阳星座为精确算法；月亮 / 上升为简化近似（仅娱乐参考），算法见 utils.ts。
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  DatePicker,
  Descriptions,
  Radio,
  Space,
  Tag,
  Typography,
} from "antd";
import { CompassOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  ZODIAC_ELEMENT_COLOR,
  ZODIAC_SIGNS,
  ascendantSignOf,
  elementDistribution,
  formatDate,
  moonSignOf,
  sunSignOf,
  zodiacCompatibility,
  type ZodiacSign,
} from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text, Title } = Typography;

interface Props {
  onBack?: () => void;
}

/** 罗盘绘制参数 */
const COMPASS_SIZE = 320;
const R_OUTER = 140;
const R_INNER = 100;

const ZodiacTool: React.FC<Props> = ({ onBack }) => {
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [timeMode, setTimeMode] = useState<"birth" | "today">("today");

  // 太阳/月亮/上升
  const info = useMemo(() => {
    const d = date.toDate();
    return {
      sun: sunSignOf(date.month() + 1, date.date()),
      moon: moonSignOf(d),
      ascendant: ascendantSignOf(d),
    };
  }, [date]);

  const elements = useMemo(
    () => elementDistribution([info.sun, info.moon, info.ascendant]),
    [info],
  );

  // 星座配对（以太阳星座为基准，展示与其他 12 星座的评分）
  const compatibility = useMemo(
    () =>
      ZODIAC_SIGNS.map((s) => ({
        sign: s,
        ...zodiacCompatibility(info.sun, s),
      })).sort((a, b) => b.score - a.score),
    [info.sun],
  );

  useEffect(() => {
    recordUsageDebounced(
      "zodiac",
      () => ({
        toolId: "zodiac",
        toolTitle: "星座罗盘",
        action: "calc",
        summary: `${formatDate(date.toDate())} → 太阳${info.sun.name} / 月亮${info.moon.name} / 上升${info.ascendant.name}`,
        detail: { date: formatDate(date.toDate()) },
      }),
      1500,
    );
  }, [date, info]);

  return (
    <ToolShell
      title="星座罗盘"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <DatePicker
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
            value={date}
            onChange={(v) => v && setDate(v)}
            allowClear={false}
          />
          <Radio.Group
            size="small"
            value={timeMode}
            onChange={(e) => setTimeMode(e.target.value)}
            optionType="button"
            options={[
              { label: "此刻", value: "today" },
              { label: "指定时刻", value: "birth" },
            ]}
          />
        </Space>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, auto) 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <Card size="small" title={<Space><CompassOutlined /> 黄道罗盘</Space>}>
          <Compass
            sun={info.sun}
            moon={info.moon}
            asc={info.ascendant}
            dateStr={formatDate(date.toDate())}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
            {(["火", "土", "风", "水"] as const).map((el) => (
              <Tag
                key={el}
                color={ZODIAC_ELEMENT_COLOR[el]}
                style={{ marginInlineEnd: 0 }}
              >
                {el}象 {elements[el] ?? 0}
              </Tag>
            ))}
          </div>
        </Card>

        <div style={{ display: "grid", gap: 10 }}>
          <Card size="small" title="三星座">
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="太阳星座">
                <SignTag sign={info.sun} /> <Text type="secondary">{info.sun.keywords}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="月亮星座">
                <SignTag sign={info.moon} /> <Text type="secondary">{info.moon.keywords}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="上升星座">
                <SignTag sign={info.ascendant} />{" "}
                <Text type="secondary">{info.ascendant.keywords}</Text>
              </Descriptions.Item>
            </Descriptions>
            <CopyButton
              text={`太阳${info.sun.name} / 月亮${info.moon.name} / 上升${info.ascendant.name}`}
              label="复制结果"
            />
          </Card>

          <Card size="small" title={`与${info.sun.name}最合拍的星座`}>
            <div style={{ display: "grid", gap: 6 }}>
              {compatibility.slice(0, 5).map((c, i) => (
                <div
                  key={c.sign.index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 6,
                    background: i % 2 === 0 ? "rgba(128,128,128,0.06)" : "transparent",
                  }}
                >
                  <Text strong style={{ width: 78 }}>
                    {c.sign.symbol} {c.sign.name}
                  </Text>
                  <div
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 4,
                      background: "rgba(128,128,128,0.15)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${c.score}%`,
                        height: "100%",
                        background: ZODIAC_ELEMENT_COLOR[c.sign.element] ?? "#1677ff",
                      }}
                    />
                  </div>
                  <Text style={{ width: 34, textAlign: "right" }}>{c.score}</Text>
                  <Text type="secondary" style={{ fontSize: 11, width: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.desc}>
                    {c.desc}
                  </Text>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {timeMode === "birth" ? (
        <Text type="secondary" style={{ display: "block", marginTop: 10, fontSize: 12 }}>
          提示：上升星座需要出生地与准确出生时刻，本工具按东八区近似估算，结果仅供娱乐。
        </Text>
      ) : null}

      <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
        太阳星座为精确算法；月亮、上升星座为简化近似（未接入星历表），仅供娱乐参考，不作占星依据。
      </Text>

      <ToolHistoryPanel
        toolId="zodiac"
        toolTitle="星座罗盘"
        onRestore={(d) => {
          suppressNextRecord("zodiac");
          if (typeof d.date === "string") {
            const m = d.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) setDate(dayjs(d.date));
          }
        }}
      />
    </ToolShell>
  );
};

/** 星座标签 */
const SignTag: React.FC<{ sign: ZodiacSign }> = ({ sign }) => (
  <Tag color={ZODIAC_ELEMENT_COLOR[sign.element]} style={{ marginInlineEnd: 6 }}>
    {sign.symbol} {sign.name}
  </Tag>
);

/** 黄道罗盘（12 星座分布 + 太阳/月亮/上升指针） */
const Compass: React.FC<{
  sun: ZodiacSign;
  moon: ZodiacSign;
  asc: ZodiacSign;
  dateStr: string;
}> = ({ sun, moon, asc, dateStr }) => {
  const cx = COMPASS_SIZE / 2;
  const cy = COMPASS_SIZE / 2;

  const angleOf = (index: number): number => {
    // 白 score 0 在顶部（白羊座起），顺时针排列
    return (index / 12) * 360 - 90;
  };

  const pointAt = (index: number, r: number): { x: number; y: number } => {
    const a = (angleOf(index) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  return (
    <svg width={COMPASS_SIZE} height={COMPASS_SIZE} viewBox={`0 0 ${COMPASS_SIZE} ${COMPASS_SIZE}`}>
      {/* 外圈 */}
      <circle cx={cx} cy={cy} r={R_OUTER} fill="none" stroke="rgba(128,128,128,0.35)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={R_INNER} fill="none" stroke="rgba(128,128,128,0.25)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={R_INNER - 26} fill="rgba(128,128,128,0.06)" />

      {/* 12 宫扇形与分割线 */}
      {ZODIAC_SIGNS.map((s) => {
        const start = angleOf(s.index);
        const end = angleOf(s.index + 1);
        const mid = (start + end) / 2;
        const p1 = pointAt(s.index, R_INNER);
        const p2 = pointAt(s.index + 1, R_INNER);
        const p3 = pointAt(s.index + 1, R_OUTER);
        const p4 = pointAt(s.index, R_OUTER);
        // 用中位角度定位标签，避免文字偏转
        const a = (mid * Math.PI) / 180;
        const lx = cx + ((R_INNER + R_OUTER) / 2) * Math.cos(a);
        const ly = cy + ((R_INNER + R_OUTER) / 2) * Math.sin(a);
        const fill = `${ZODIAC_ELEMENT_COLOR[s.element]}22`;
        return (
          <g key={s.index}>
            <polygon
              points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
              fill={fill}
              stroke="rgba(128,128,128,0.25)"
              strokeWidth={0.8}
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fill={ZODIAC_ELEMENT_COLOR[s.element]}
            >
              {s.symbol}
            </text>
          </g>
        );
      })}

      {/* 指针：太阳 / 月亮 / 上升 */}
      <Pointer index={sun.index} length={R_INNER - 6} color="#fa541c" label="☉" cx={cx} cy={cy} />
      <Pointer index={moon.index} length={R_INNER - 34} color="#1677ff" label="☽" cx={cx} cy={cy} />
      <Pointer index={asc.index} length={R_INNER - 58} color="#52c41a" label="ASC" cx={cx} cy={cy} />

      <text x={cx} y={cy + 78} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.55}>
        {dateStr}
      </text>
    </svg>
  );
};

/** 罗盘指针（从圆心指向某星座宫位） */
const Pointer: React.FC<{
  index: number;
  length: number;
  color: string;
  label: string;
  cx: number;
  cy: number;
}> = ({ index, length, color, label, cx, cy }) => {
  const a = ((index / 12) * 360 - 90) * (Math.PI / 180);
  const x = cx + length * Math.cos(a);
  const y = cy + length * Math.sin(a);
  const tipA = a + Math.PI / 2;
  const tx = cx + 7 * Math.cos(tipA);
  const ty = cy + 7 * Math.sin(tipA);
  const bx = cx - 7 * Math.cos(tipA);
  const by = cy - 7 * Math.sin(tipA);
  return (
    <g>
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth={2} />
      <polygon points={`${x},${y} ${tx},${ty} ${bx},${by}`} fill={color} />
      <circle cx={cx} cy={cy} r={3} fill={color} />
      <text x={x + 6 * Math.cos(a)} y={y + 6 * Math.sin(a)} fontSize={10} fill={color} textAnchor="middle">
        {label}
      </text>
    </g>
  );
};

export default ZodiacTool;
