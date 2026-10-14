/*
 * 中华朝代年鉴
 *
 * 设计："青史长河" ——
 *  - 顶部：横向"时间之河"SVG 时间轴，色带宽度 ∝ 国祚，重叠政权分层，
 *    附时代刻度与"治乱"色带（统一 / 分封 / 割据 / 偏安 / 并立）。
 *  - 历代之最三卡：单段国祚最长 / 疆域最辽阔 / 大一统时间占比。
 *  - 主从布局：左侧按时期分组的朝代列表，右侧详情 Tabs：
 *    概览（印章式朝代名 + 关键信息）、疆域（示意图 + 面积对比）、
 *    人物（角色过滤卡片）、大事记（纵向时间线）。
 *  - 双朝对照：两政权疆域叠加 + 关键指标对照表 + 面积对比条。
 *
 * 疆域为示意图形（schematic），界面中已标注"非精确边界"。
 */
import React, { useMemo, useState } from "react";
import {
  Button,
  Empty,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  CrownOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  ReadOutlined,
  SwapOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  DYNASTIES,
  ERAS,
  FIGURE_ROLE_LABEL,
  REGIME_COLOR,
  dynastyById,
  dynastiesByEra,
  type Dynasty,
  type FigureRole,
  type RegimeKind,
} from "./dynastyData";
import {
  CHINA_OUTLINE,
  DYNASTY_TERRITORIES,
  ISLANDS,
} from "./territoryData";
import {
  TIMELINE_MIN_BAND,
  areaRank,
  areaRatio,
  assignLanes,
  durationYears,
  dynastyHighlights,
  formatAreaKm2,
  polygonPath,
  spanLabel,
  timelineX,
} from "../utils";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";
import styles from "./DynastyTool.less";

const { Text } = Typography;

/* ── 时间轴常量 ─────────────────────────────────────────── */
const MIN_YEAR = -2070;
const MAX_YEAR = 2026;
const PX_PER_YEAR = 0.8;
const PAD_X = 10;
const LANE_H = 36;
const TOP_H = 30;
const BOTTOM_H = 34;

/** 时间轴里程碑刻度 */
const TICKS: { year: number; label: string }[] = [
  { year: -2070, label: "前2070" },
  { year: -1600, label: "前1600" },
  { year: -1046, label: "前1046" },
  { year: -770, label: "前770" },
  { year: -221, label: "前221" },
  { year: 220, label: "220" },
  { year: 581, label: "581" },
  { year: 907, label: "907" },
  { year: 1279, label: "1279" },
  { year: 1368, label: "1368" },
  { year: 1912, label: "1912" },
  { year: 1949, label: "1949" },
  { year: 2026, label: "2026" },
];

/** 16 进制色 → 加深 / 变浅（amt 为亮度增量，负值加深） */
function shade(hex: string, amt: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const c = (i: number) =>
    Math.max(0, Math.min(255, parseInt(n.slice(i, i + 2), 16) + amt));
  return `#${[c(0), c(2), c(4)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** 背景色亮度 → 前景文字（浅底深字 / 深底白字） */
function textColorFor(bg: string): string {
  const n = bg.replace("#", "");
  if (n.length !== 6) return "#fff";
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "rgba(30,30,30,0.85)" : "rgba(255,255,255,0.95)";
}

/** 多边形近似质心（图内标注定位） */
function centroid(pts: [number, number][]): [number, number] {
  const n = pts.length;
  if (!n) return [0, 0];
  return [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
  ];
}

/** 多边形包围盒面积（用于判断是否值得显示图内文字） */
function polySize(pts: [number, number][]): number {
  if (!pts.length) return 0;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

interface Props {
  onBack?: () => void;
}

const DynastyTool: React.FC<Props> = ({ onBack }) => {
  const { token } = theme.useToken();
  const isDark = useMemo(
    () => (token.colorBgBase ?? "#ffffff").toLowerCase() !== "#ffffff",
    [token.colorBgBase],
  );

  const [selectedId, setSelectedId] = useState("qin");
  const [tab, setTab] = useState("overview");
  const [compareMode, setCompareMode] = useState(false);
  const [compareB, setCompareB] = useState("qing");
  const [histKey, setHistKey] = useState(0);

  const selected = dynastyById(selectedId);

  /** 选择朝代（记录一条"查看"历史） */
  const selectDynasty = (id: string) => {
    setSelectedId(id);
    const d = dynastyById(id);
    if (d) {
      recordUsage({
        toolId: "dynasty",
        toolTitle: "中华朝代年鉴",
        action: "view",
        summary: `查看朝代：${d.name}（${spanLabel(d.start, d.end, d.endToday)}）`,
        detail: { dynasty: d.id, name: d.name, start: d.start, end: d.end },
      });
      setHistKey((k) => k + 1);
    }
  };

  /** 从历史记录跳转（不重复落库） */
  const jumpTo = (id: string) => {
    if (dynastyById(id)) setSelectedId(id);
  };

  /** 对照视图：切换对照对象（记录一条"对照"历史） */
  const setCompare = (id: string) => {
    setCompareB(id);
    const a = dynastyById(selectedId);
    const b = dynastyById(id);
    if (a && b) {
      recordUsage({
        toolId: "dynasty",
        toolTitle: "中华朝代年鉴",
        action: "compare",
        summary: `双朝对照：${a.name} × ${b.name}`,
        detail: { a: a.id, b: b.id },
      });
      setHistKey((k) => k + 1);
    }
  };

  return (
    <div className={isDark ? styles.rootDark : undefined}>
      <ToolShell
        title="中华朝代年鉴"
        onBack={onBack}
        extra={
          <Space size={8}>
            <Button
              size="small"
              icon={<SwapOutlined />}
              type={compareMode ? "primary" : "default"}
              onClick={() => setCompareMode((v) => !v)}
            >
              {compareMode ? "退出对照" : "双朝对照"}
            </Button>
          </Space>
        }
      >
        <TimelineRiver selectedId={selectedId} onSelect={selectDynasty} />
        <Highlights />
        <div className={styles.mainRow}>
          <EraNav selectedId={selectedId} onSelect={selectDynasty} />
          <div className={styles.detailCard}>
            {compareMode ? (
              <CompareView
                baseId={selectedId}
                otherId={compareB}
                onBaseChange={selectDynasty}
                onOtherChange={setCompare}
                onSwap={() => {
                  setSelectedId(compareB);
                  setCompareB(selectedId);
                }}
              />
            ) : selected ? (
              <Tabs
                size="small"
                activeKey={tab}
                onChange={setTab}
                items={[
                  {
                    key: "overview",
                    label: (
                      <span>
                        <ReadOutlined /> 概览
                      </span>
                    ),
                    children: <OverviewTab d={selected} />,
                  },
                  {
                    key: "map",
                    label: (
                      <span>
                        <EnvironmentOutlined /> 疆域
                      </span>
                    ),
                    children: <MapTab d={selected} />,
                  },
                  {
                    key: "people",
                    label: (
                      <span>
                        <TeamOutlined /> 人物
                      </span>
                    ),
                    children: <PeopleTab d={selected} />,
                  },
                  {
                    key: "events",
                    label: (
                      <span>
                        <CalendarOutlined /> 大事记
                      </span>
                    ),
                    children: <EventsTab d={selected} />,
                  },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到该朝代" />
            )}
          </div>
        </div>

        <ToolHistoryPanel
          toolId="dynasty"
          toolTitle="中华朝代年鉴"
          reloadKey={histKey}
          onRestore={(detail) => {
            const id = String(detail.dynasty ?? "");
            if (dynastyById(id)) jumpTo(id);
          }}
        />
      </ToolShell>
    </div>
  );
};

/* ── 顶部：青史长河时间轴 ────────────────────────────────── */
const TimelineRiver: React.FC<{
  selectedId: string;
  onSelect: (id: string) => void;
}> = ({ selectedId, onSelect }) => {
  const lanes = useMemo(() => assignLanes(DYNASTIES), []);
  const maxLane = Math.max(0, ...lanes);
  const innerW = (MAX_YEAR - MIN_YEAR) * PX_PER_YEAR;
  const width = innerW + PAD_X * 2;
  const height = TOP_H + (maxLane + 1) * LANE_H + BOTTOM_H;
  const x = (year: number) => PAD_X + timelineX(year, MIN_YEAR, MAX_YEAR, innerW);
  const bandW = (d: Dynasty) =>
    Math.max(TIMELINE_MIN_BAND, durationYears(d.start, d.end) * PX_PER_YEAR);

  return (
    <div className={`${styles.paper} ${styles.timelineCard}`}>
      <div className={styles.timelineHead}>
        <span className={styles.timelineTitle}>
          <HistoryOutlined /> 青史长河 · 历代时间轴
        </span>
        <span className={styles.timelineSub}>
          拖动横向滚动 · 点击色带查看朝代 · 前 = 公元前
        </span>
        <span className={styles.timelineLegend}>
          {(Object.keys(REGIME_COLOR) as RegimeKind[]).map((k) => (
            <span key={k} className={styles.legendChip}>
              <span className={styles.legendDot} style={{ background: REGIME_COLOR[k] }} />
              {k}
            </span>
          ))}
        </span>
      </div>
      <div className={styles.timelineScroll}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {/* 时代刻度 */}
          {TICKS.map((t) => {
            const tx = x(t.year);
            return (
              <g key={t.year}>
                <line
                  x1={tx}
                  y1={TOP_H - 2}
                  x2={tx}
                  y2={height - BOTTOM_H + 16}
                  stroke="rgba(128,128,128,0.16)"
                  strokeDasharray="3 5"
                />
                <text
                  x={tx}
                  y={TOP_H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-text-description, rgba(0,0,0,0.4))"
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* 朝代色带（按车道分层，重叠政权不遮叠） */}
          {DYNASTIES.map((d, i) => {
            const lane = lanes[i];
            const bx = x(d.start);
            const bw = bandW(d);
            const by = TOP_H + lane * LANE_H + 5;
            const active = d.id === selectedId;
            const label = bw >= 34 ? d.name : "";
            return (
              <Tooltip
                key={d.id}
                title={`${d.name} · ${spanLabel(d.start, d.end, d.endToday)}`}
              >
                <g
                  onClick={() => onSelect(d.id)}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={LANE_H - 12}
                    rx={6}
                    fill={d.color}
                    fillOpacity={active ? 0.95 : 0.82}
                    stroke={active ? "#1677ff" : "rgba(0,0,0,0.28)"}
                    strokeWidth={active ? 2 : 1}
                    filter={
                      active ? "drop-shadow(0 0 6px rgba(22,119,255,0.65))" : undefined
                    }
                  />
                  {label ? (
                    <text
                      x={bx + bw / 2}
                      y={by + (LANE_H - 12) / 2 + 4}
                      textAnchor="middle"
                      fontSize={11.5}
                      fontWeight={600}
                      fill={textColorFor(d.color)}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              </Tooltip>
            );
          })}

          {/* 治乱色带 */}
          <text
            x={PAD_X}
            y={height - BOTTOM_H + 13}
            fontSize={10}
            fill="var(--color-text-description, rgba(0,0,0,0.4))"
          >
            治乱
          </text>
          {DYNASTIES.map((d) => {
            const bx = x(d.start);
            const bw = bandW(d);
            return (
              <rect
                key={d.id}
                x={bx}
                y={height - BOTTOM_H + 2}
                width={bw}
                height={10}
                rx={3}
                fill={REGIME_COLOR[d.regime]}
                opacity={0.85}
                onClick={() => onSelect(d.id)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

/* ── 历代之最三卡 ────────────────────────────────────────── */
const Highlights: React.FC = () => {
  const hl = useMemo(() => dynastyHighlights(DYNASTIES), []);
  const cards = [
    {
      icon: <CrownOutlined />,
      bg: "#c9a227",
      label: "单段国祚最长",
      value: `${hl.longest.name} · 约 ${hl.longest.years} 年`,
    },
    {
      icon: <EnvironmentOutlined />,
      bg: "#4e342e",
      label: "疆域最辽阔",
      value: `${hl.largest.name} · ${formatAreaKm2(hl.largest.area)}`,
    },
    {
      icon: <HistoryOutlined />,
      bg: "#1677ff",
      label: "大一统时间占比",
      value: `≈ ${Math.round(hl.unifiedRatio * 100)}%`,
    },
  ];
  return (
    <div className={styles.highlightRow}>
      {cards.map((c) => (
        <div key={c.label} className={styles.highlightCard}>
          <span className={styles.highlightIcon} style={{ background: c.bg }}>
            {c.icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className={styles.highlightLabel}>{c.label}</div>
            <div className={styles.highlightValue}>{c.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── 左侧朝代导航 ────────────────────────────────────────── */
const EraNav: React.FC<{
  selectedId: string;
  onSelect: (id: string) => void;
}> = ({ selectedId, onSelect }) => {
  const groups = useMemo(() => dynastiesByEra(), []);
  const maxDur = useMemo(
    () => Math.max(...DYNASTIES.map((d) => durationYears(d.start, d.end))),
    [],
  );
  return (
    <nav className={styles.eraNav}>
      {groups.map(({ era, items }) => (
        <section key={era.id} className={styles.eraGroup}>
          <div className={styles.eraHeader}>
            {era.label}
            <span className={styles.eraCount}>{items.length}</span>
          </div>
          <div className={styles.dynList}>
            {items.map((d) => {
              const active = d.id === selectedId;
              const barW = Math.max(
                6,
                (durationYears(d.start, d.end) / maxDur) * 100,
              );
              return (
                <div
                  key={d.id}
                  className={`${styles.dynItem}${active ? ` ${styles.dynItemActive}` : ""}`}
                  onClick={() => onSelect(d.id)}
                >
                  <span className={styles.dynDot} style={{ background: d.color }} />
                  <span className={styles.dynName}>{d.name}</span>
                  <span className={styles.dynYears}>
                    {spanLabel(d.start, d.end, d.endToday)}
                  </span>
                  <span
                    className={styles.dynBar}
                    style={{ width: `${barW}%`, background: d.color }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
};

/* ── 概览 ────────────────────────────────────────────────── */
const OverviewTab: React.FC<{ d: Dynasty }> = ({ d }) => {
  const years = durationYears(d.start, d.end);
  const areas = DYNASTIES.map((x) => x.areaKm2 ?? 0);
  return (
    <div>
      <div className={styles.hero}>
        <div
          className={styles.heroSeal}
          style={{
            background: `linear-gradient(150deg, ${d.color}, ${shade(d.color, -22)})`,
          }}
        >
          {d.name.slice(0, 1)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className={styles.heroName}>{d.name}</div>
          <div className={styles.heroMeta}>
            <Tag color={d.color} style={{ marginInlineEnd: 0, border: "none" }}>
              {ERAS.find((e) => e.id === d.era)?.label ?? d.era}
            </Tag>
            <Tag
              style={{
                marginInlineEnd: 0,
                color: REGIME_COLOR[d.regime],
                borderColor: REGIME_COLOR[d.regime],
                background: "transparent",
              }}
            >
              {d.regime}
            </Tag>
            <span className={styles.heroSpan}>
              {spanLabel(d.start, d.end, d.endToday)}
              {years > 0 ? ` · 约 ${years} 年` : ""}
            </span>
          </div>
          <div className={styles.heroIntro}>{d.intro}</div>
        </div>
      </div>
      <div className={styles.statGrid}>
        <StatRow label="都城" value={d.capital.join(" → ")} />
        <StatRow label="开国君主" value={d.founder} />
        <StatRow label="末代君主" value={d.lastRuler} />
        <StatRow label="国祚" value={years > 0 ? `约 ${years} 年` : "延续至今"} />
        {d.areaKm2 ? (
          <StatRow
            label="疆域面积"
            value={`${formatAreaKm2(d.areaKm2)}（历代第 ${areaRank(d.areaKm2, areas)}）`}
          />
        ) : null}
        <StatRow label="天下形态" value={d.regime} />
      </div>
    </div>
  );
};

/* ── 疆域 ────────────────────────────────────────────────── */
const MapTab: React.FC<{ d: Dynasty }> = ({ d }) => {
  const shape = DYNASTY_TERRITORIES[d.id];
  const maxArea = Math.max(...DYNASTIES.map((x) => x.areaKm2 ?? 0));
  const areas = DYNASTIES.map((x) => x.areaKm2 ?? 0).filter((v) => v > 0);
  const top = useMemo(
    () =>
      [...DYNASTIES]
        .filter((x) => x.areaKm2)
        .sort((a, b) => (b.areaKm2 ?? 0) - (a.areaKm2 ?? 0))
        .slice(0, 8),
    [],
  );
  return (
    <div className={styles.mapWrap}>
      <div className={styles.mapCanvas}>
        <svg viewBox="0 0 680 770" className={styles.mapSvg}>
          {/* 网格底 */}
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f}>
              <line
                x1={0}
                y1={770 * f}
                x2={680}
                y2={770 * f}
                stroke="rgba(128,128,128,0.1)"
                strokeDasharray="4 5"
              />
              <line
                x1={680 * f}
                y1={0}
                x2={680 * f}
                y2={770}
                stroke="rgba(128,128,128,0.1)"
                strokeDasharray="4 5"
              />
            </g>
          ))}
          {/* 现代中国简化轮廓 */}
          <path
            d={polygonPath(CHINA_OUTLINE)}
            fill="none"
            stroke="var(--color-text, rgba(0,0,0,0.55))"
            strokeWidth={2}
            strokeLinejoin="round"
            opacity={0.75}
          />
          {/* 岛屿 */}
          {ISLANDS.map((isl, i) => (
            <g key={i}>
              <path
                d={polygonPath(isl.pts)}
                fill="rgba(128,128,128,0.22)"
                stroke="var(--color-text, rgba(0,0,0,0.55))"
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
              {isl.label ? (
                <text
                  x={centroid(isl.pts)[0]}
                  y={centroid(isl.pts)[1] + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-text-secondary, rgba(0,0,0,0.55))"
                >
                  {isl.label}
                </text>
              ) : null}
            </g>
          ))}
          {/* 本朝疆域 */}
          {shape ? (
            shape.polys.map((p, i) => {
              const [cx, cy] = centroid(p.pts);
              const fill = p.color || d.color;
              const showLabel = Boolean(p.label) && polySize(p.pts) > 500;
              return (
                <g key={i}>
                  <path
                    d={polygonPath(p.pts)}
                    fill={fill}
                    fillOpacity={0.52}
                    stroke={shade(fill, -42)}
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                  />
                  {showLabel ? (
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={700}
                      fill="#fff"
                      style={{
                        paintOrder: "stroke",
                        stroke: "rgba(0,0,0,0.5)",
                        strokeWidth: 3,
                      }}
                    >
                      {p.label}
                    </text>
                  ) : null}
                </g>
              );
            })
          ) : (
            <text
              x={340}
              y={400}
              textAnchor="middle"
              fontSize={12}
              fill="var(--color-text-description, rgba(0,0,0,0.45))"
            >
              暂未收录示意图形
            </text>
          )}
        </svg>
      </div>
      <div className={styles.mapSide}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name} · 疆域</div>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
          {d.territory}
        </Text>
        <div className={styles.mapNote}>
          ※ 疆域为示意图形（schematic），手工勾勒势力范围，非精确历史边界；
          同代并存政权以多色块表示。
        </div>
        {d.areaKm2 ? (
          <>
            <StatRow label="疆域面积" value={formatAreaKm2(d.areaKm2)} />
            <StatRow
              label="历代排名"
              value={`第 ${areaRank(d.areaKm2, areas)} 位（共 ${areas.length} 个政权）`}
            />
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
              历代疆域面积 Top 8（约数，横向对比）
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {top.map((t) => {
                const w = Math.max(4, areaRatio(t.areaKm2 ?? 0, maxArea) * 100);
                const active = t.id === d.id;
                return (
                  <div key={t.id} className={styles.areaBarRow}>
                    <span
                      style={{
                        width: 66,
                        flexShrink: 0,
                        fontWeight: active ? 700 : 400,
                      }}
                    >
                      {t.name}
                    </span>
                    <span className={styles.areaBar}>
                      <span
                        className={styles.areaBarFill}
                        style={{
                          width: `${w}%`,
                          background: t.color,
                          opacity: active ? 1 : 0.62,
                        }}
                      />
                    </span>
                    <span
                      style={{
                        width: 86,
                        textAlign: "right",
                        flexShrink: 0,
                        opacity: 0.65,
                      }}
                    >
                      {formatAreaKm2(t.areaKm2 ?? 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

/* ── 人物 ────────────────────────────────────────────────── */
const PeopleTab: React.FC<{ d: Dynasty }> = ({ d }) => {
  const roles = useMemo(() => Array.from(new Set(d.figures.map((f) => f.role))), [d]);
  const [roleFilter, setRoleFilter] = useState<FigureRole | "全部">("全部");
  const list =
    roleFilter === "全部" ? d.figures : d.figures.filter((f) => f.role === roleFilter);
  return (
    <div>
      <Space size={6} wrap style={{ marginBottom: 10 }}>
        <Tag
          style={{ cursor: "pointer", marginInlineEnd: 0 }}
          color={roleFilter === "全部" ? "blue" : undefined}
          onClick={() => setRoleFilter("全部")}
        >
          全部 {d.figures.length}
        </Tag>
        {roles.map((r) => (
          <Tag
            key={r}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
            color={roleFilter === r ? "blue" : undefined}
            onClick={() => setRoleFilter(r)}
          >
            {FIGURE_ROLE_LABEL[r]} {d.figures.filter((f) => f.role === r).length}
          </Tag>
        ))}
      </Space>
      {list.length ? (
        <div className={styles.figGrid}>
          {list.map((f) => (
            <div key={f.name} className={styles.figCard}>
              <div
                className={styles.figAvatar}
                style={{
                  background: `linear-gradient(150deg, ${d.color}, ${shade(d.color, -22)})`,
                }}
              >
                {f.name.slice(0, 1)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className={styles.figName}>{f.name}</div>
                <div className={styles.figTitle}>
                  {f.title} · {FIGURE_ROLE_LABEL[f.role]}
                </div>
                {f.years ? <div className={styles.figYears}>{f.years}</div> : null}
                <div className={styles.figAch}>{f.achievement}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该分类下暂无人物" />
      )}
    </div>
  );
};

/* ── 大事记 ──────────────────────────────────────────────── */
const EventsTab: React.FC<{ d: Dynasty }> = ({ d }) => (
  <div className={styles.eventList}>
    {d.events.map((e) => (
      <div key={e.text} className={styles.eventItem}>
        <span className={styles.eventDot} style={{ background: d.color }} />
        <div className={styles.eventYear}>{e.year}</div>
        <div className={styles.eventText}>{e.text}</div>
      </div>
    ))}
  </div>
);

/* ── 双朝对照 ────────────────────────────────────────────── */
const CompareView: React.FC<{
  baseId: string;
  otherId: string;
  onBaseChange: (id: string) => void;
  onOtherChange: (id: string) => void;
  onSwap: () => void;
}> = ({ baseId, otherId, onBaseChange, onOtherChange, onSwap }) => {
  const a = dynastyById(baseId);
  const b = dynastyById(otherId);
  const maxArea = Math.max(...DYNASTIES.map((x) => x.areaKm2 ?? 0));
  if (!a || !b) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  const rows = [
    { k: "起止", va: spanLabel(a.start, a.end, a.endToday), vb: spanLabel(b.start, b.end, b.endToday) },
    { k: "国祚", va: a.endToday ? "延续至今" : `约 ${durationYears(a.start, a.end)} 年`, vb: b.endToday ? "延续至今" : `约 ${durationYears(b.start, b.end)} 年` },
    { k: "都城", va: a.capital.join(" → "), vb: b.capital.join(" → ") },
    { k: "开国君主", va: a.founder, vb: b.founder },
    { k: "末代君主", va: a.lastRuler, vb: b.lastRuler },
    { k: "疆域面积", va: a.areaKm2 ? formatAreaKm2(a.areaKm2) : "—", vb: b.areaKm2 ? formatAreaKm2(b.areaKm2) : "—" },
    { k: "天下形态", va: a.regime, vb: b.regime },
  ];

  const renderShape = (d: Dynasty) => {
    const shape = DYNASTY_TERRITORIES[d.id];
    if (!shape) return null;
    return shape.polys.map((p, i) => (
      <path
        key={i}
        d={polygonPath(p.pts)}
        fill={p.color || d.color}
        fillOpacity={0.38}
        stroke={p.color || d.color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    ));
  };

  return (
    <div>
      <div className={styles.compareBar}>
        <span style={{ fontSize: 12, opacity: 0.65 }}>基准</span>
        <Select
          className={styles.compareSel}
          size="small"
          value={a.id}
          options={DYNASTIES.map((d) => ({
            value: d.id,
            label: `${d.name} · ${spanLabel(d.start, d.end, d.endToday)}`,
          }))}
          onChange={(v) => onBaseChange(v)}
        />
        <Button size="small" icon={<SwapOutlined />} onClick={onSwap} />
        <span style={{ fontSize: 12, opacity: 0.65 }}>对照</span>
        <Select
          className={styles.compareSel}
          size="small"
          value={b.id}
          options={DYNASTIES.map((d) => ({
            value: d.id,
            label: `${d.name} · ${spanLabel(d.start, d.end, d.endToday)}`,
          }))}
          onChange={(v) => onOtherChange(v)}
        />
        {overlap > 0 ? (
          <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
            时间并立约 {overlap} 年
          </Tag>
        ) : (
          <Tag style={{ marginInlineEnd: 0 }}>时间先后相承</Tag>
        )}
      </div>

      <div className={styles.mapWrap}>
        <div className={styles.mapCanvas}>
          <svg viewBox="0 0 680 770" className={styles.mapSvg}>
            <path
              d={polygonPath(CHINA_OUTLINE)}
              fill="none"
              stroke="var(--color-text, rgba(0,0,0,0.55))"
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={0.75}
            />
            {ISLANDS.map((isl, i) => (
              <path
                key={i}
                d={polygonPath(isl.pts)}
                fill="rgba(128,128,128,0.22)"
                stroke="var(--color-text, rgba(0,0,0,0.55))"
                strokeWidth={1.2}
              />
            ))}
            {renderShape(a)}
            {renderShape(b)}
          </svg>
        </div>
        <div className={styles.mapSide}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className={styles.legendName}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: a.color,
                  display: "inline-block",
                }}
              />
              {a.name}
            </span>
            <span className={styles.legendName}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: b.color,
                  display: "inline-block",
                }}
              />
              {b.name}
            </span>
          </div>
          <div className={styles.mapNote}>
            ※ 半透明叠加处即两朝疆域交叠区域；图形为示意图，非精确边界。
          </div>
          {a.areaKm2 && b.areaKm2 ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.65 }}>疆域面积对比（约数）</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className={styles.areaBarRow}>
                  <span style={{ width: 64, flexShrink: 0, fontWeight: 700 }}>{a.name}</span>
                  <span className={styles.areaBar}>
                    <span
                      className={styles.areaBarFill}
                      style={{ width: `${areaRatio(a.areaKm2, maxArea) * 100}%`, background: a.color }}
                    />
                  </span>
                  <span style={{ width: 86, textAlign: "right", flexShrink: 0, opacity: 0.65 }}>
                    {formatAreaKm2(a.areaKm2)}
                  </span>
                </div>
                <div className={styles.areaBarRow}>
                  <span style={{ width: 64, flexShrink: 0, fontWeight: 700 }}>{b.name}</span>
                  <span className={styles.areaBar}>
                    <span
                      className={styles.areaBarFill}
                      style={{ width: `${areaRatio(b.areaKm2, maxArea) * 100}%`, background: b.color }}
                    />
                  </span>
                  <span style={{ width: 86, textAlign: "right", flexShrink: 0, opacity: 0.65 }}>
                    {formatAreaKm2(b.areaKm2)}
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Table
        style={{ marginTop: 12 }}
        size="small"
        pagination={false}
        rowKey="k"
        dataSource={rows.map((r, i) => ({ ...r, key: i }))}
        columns={[
          { title: "指标", dataIndex: "k", width: 96 },
          {
            title: (
              <span className={styles.legendName}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: a.color,
                    display: "inline-block",
                  }}
                />
                {a.name}
              </span>
            ),
            dataIndex: "va",
          },
          {
            title: (
              <span className={styles.legendName}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: b.color,
                    display: "inline-block",
                  }}
                />
                {b.name}
              </span>
            ),
            dataIndex: "vb",
          },
        ]}
      />
    </div>
  );
};

export default DynastyTool;
