/*
 * 假期日历：参考 fat-stock 交易日历的月历视图，展示中国法定节假日、
 * 周末与工作日，并支持自定义纪念日与节日倒计时。
 *
 * 数据来源：内置 holiday-cn 离线数据（2021-2026）+ 可选的在线更新（多镜像兜底）。
 * 纯前端实现，不依赖宿主后端。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  List,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  buildMonthGrid,
  customDaysToMap,
  fetchHolidaysOnline,
  holidayColor,
  holidayDatesOfYear,
  isWeekend,
  mergeHolidays,
  OFFLINE_YEARS,
  toHolidayRanges,
  todayStr,
  workdayCountOfYear,
  type CustomDay,
  type HolidayMap,
} from "./holidayData";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { parseDateTime } from "../utils";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const CUSTOM_LS_KEY = "fat-tools.holiday.custom";

function loadCustomDays(): CustomDay[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_LS_KEY);
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c) => c && typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date),
    );
  } catch {
    return [];
  }
}

type DayKind = "holiday" | "workday" | "weekend";

const HolidayTool: React.FC<Props> = ({ onBack }) => {
  const today = useMemo(() => todayStr(), []);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [collapsed, setCollapsed] = useState<"none" | "year" | "month">("none");
  const [onlineMap, setOnlineMap] = useState<HolidayMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const [custom, setCustom] = useState<CustomDay[]>(() => loadCustomDays());
  const [newDate, setNewDate] = useState<Dayjs | null>(null);
  const [newName, setNewName] = useState("");
  const [newYearly, setNewYearly] = useState(true);

  // 自定义纪念日持久化
  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_LS_KEY, JSON.stringify(custom));
    } catch {
      /* ignore */
    }
  }, [custom]);

  const { map, source } = useMemo(
    () => mergeHolidays(year, onlineMap),
    [year, onlineMap],
  );

  const customMap = useMemo(() => customDaysToMap(custom, year), [custom, year]);
  // 合并视图（法定 + 自定义）：自定义不覆盖法定同名日期
  const viewMap = useMemo<HolidayMap>(
    () => ({ ...customMap, ...map }),
    [customMap, map],
  );

  const isCustom = useCallback(
    (d: string) => Boolean(customMap[d]) && !map[d],
    [customMap, map],
  );

  const ranges = useMemo(() => toHolidayRanges(map, year), [map, year]);
  const customRanges = useMemo(() => toHolidayRanges(customMap, year), [customMap, year]);

  // 年度统计
  const stats = useMemo(() => {
    const holidayDays = holidayDatesOfYear(map, year).length;
    const customDays = holidayDatesOfYear(customMap, year).length;
    const workdays = workdayCountOfYear(map, year);
    const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
    return {
      holidayDays,
      customDays,
      workdays,
      restDays: daysInYear - workdays,
      daysInYear,
    };
  }, [map, customMap, year]);

  // 下一个假期倒计时
  const nextHoliday = useMemo(() => {
    const all = [...holidayDatesOfYear(map, year), ...holidayDatesOfYear(customMap, year)];
    const future = all.filter((d) => d >= today).sort();
    const next = future[0] ?? all.sort()[all.length - 1];
    if (!next) return null;
    const name = viewMap[next];
    const isNextYear = Number(next.slice(0, 4)) !== year;
    const from = parseDateTime(today);
    const to = parseDateTime(next);
    const days = from && to ? Math.round((to.getTime() - from.getTime()) / 86_400_000) : 0;
    return { date: next, name, days, isNextYear, isToday: next === today };
  }, [map, customMap, viewMap, year, today]);

  // 年份下拉：内置数据年份 + 今年前后各 2 年（可查询未发布的未来年份）
  const years = useMemo(() => {
    const now = Number(today.slice(0, 4));
    const set = new Set<number>(OFFLINE_YEARS);
    for (let y = now - 2; y <= now + 2; y++) set.add(y);
    return Array.from(set)
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => b - a);
  }, [today]);

  const handleSync = async () => {
    setLoading(true);
    setSyncMsg(null);
    try {
      const online = await fetchHolidaysOnline(year);
      if (online === null) {
        setSyncMsg("在线获取失败（网络不可达），已使用内置数据");
      } else if (Object.keys(online).length === 0) {
        setSyncMsg(`${year} 年节假日尚未发布，已使用内置数据`);
      } else {
        setOnlineMap(online);
        setSyncMsg(`已从在线数据源更新 ${year} 年节假日（${Object.keys(online).length} 天）`);
        recordUsage({
          toolId: "holiday",
          toolTitle: "假期日历",
          action: "sync",
          summary: `同步 ${year} 年节假日（${Object.keys(online).length} 天）`,
          detail: { year, count: Object.keys(online).length },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const addCustom = () => {
    if (!newDate) return;
    const date = newDate.format("YYYY-MM-DD");
    const name = newName.trim() || "纪念日";
    setCustom((prev) => {
      const rest = prev.filter((c) => !(c.date === date && c.name === name));
      return [...rest, { date, name, yearly: newYearly }];
    });
    setNewName("");
    recordUsage({
      toolId: "holiday",
      toolTitle: "假期日历",
      action: "add",
      summary: `新增纪念日：${name}（${date}${newYearly ? " · 每年" : ""}）`,
      detail: { date, name, yearly: newYearly },
    });
  };

  // 「输入即算」防抖记录：年份 / 折叠维度变化
  useEffect(() => {
    recordUsageDebounced(
      "holiday",
      () => ({
        toolId: "holiday",
        toolTitle: "假期日历",
        action: "view",
        summary: `查看 ${year} 年假期日历（法定 ${stats.holidayDays} 天）`,
        detail: { year, collapsed },
      }),
      2000,
    );
  }, [year, collapsed, stats.holidayDays]);

  const goToday = () => {
    setYear(Number(today.slice(0, 4)));
    setCollapsed("month");
  };

  const months = collapsed === "none" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : null;
  const collapseToMonth = Number(today.slice(5, 7));

  return (
    <ToolShell
      title="假期日历"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Select
            size="small"
            value={year}
            onChange={setYear}
            style={{ width: 100 }}
            options={years.map((y) => ({ value: y, label: `${y} 年` }))}
          />
          <Segmented
            size="small"
            value={collapsed}
            onChange={(v) => setCollapsed(v as typeof collapsed)}
            options={[
              { value: "none", label: "全年" },
              { value: "month", label: "当月" },
            ]}
          />
          <Button size="small" icon={<CalendarOutlined />} onClick={goToday}>
            回到今天
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={handleSync}
          >
            在线更新
          </Button>
        </Space>
      }
    >
      {syncMsg ? (
        <Alert
          type={source === "online" ? "success" : "info"}
          showIcon
          closable
          onClose={() => setSyncMsg(null)}
          message={syncMsg}
          style={{ marginBottom: 10 }}
        />
      ) : null}

      {/* 倒计时 + 年度统计 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: nextHoliday
              ? `linear-gradient(90deg, ${holidayColor(nextHoliday.name)}22, transparent)`
              : "rgba(128,128,128,0.08)",
            border: `1px solid ${nextHoliday ? holidayColor(nextHoliday.name) + "66" : "rgba(128,128,128,0.25)"}`,
          }}
        >
          {nextHoliday ? (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {nextHoliday.isToday ? "今天就是" : "距离下一个"}
              </Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                <Text strong style={{ fontSize: 18 }}>
                  {nextHoliday.name}
                </Text>
                {!nextHoliday.isToday ? (
                  <Text strong style={{ fontSize: 18, color: holidayColor(nextHoliday.name) }}>
                    {nextHoliday.days} 天
                  </Text>
                ) : (
                  <Tag color="success" style={{ marginInlineEnd: 0 }}>
                    放假中
                  </Tag>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {nextHoliday.date}（{weekdayCn(nextHoliday.date)}）
              </Text>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              暂无假期数据
            </Text>
          )}
        </div>

        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(128,128,128,0.08)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          <StatRow label="法定节假日" value={`${stats.holidayDays} 天`} />
          <StatRow label="工作日" value={`${stats.workdays} 天`} />
          <StatRow label="休息日" value={`${stats.restDays} 天`} />
          <StatRow label="全年天数" value={`${stats.daysInYear} 天`} />
        </div>
      </div>

      {/* 图例 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={legendDot("#f5222d")}>法定节假日</span>
        <span style={legendDot("#faad14")}>周末</span>
        <span style={legendDot("transparent", "rgba(128,128,128,0.5)")}>工作日</span>
        <span style={legendDot("#722ed1")}>自定义纪念日</span>
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          今天
        </Tag>
      </div>

      {/* 月历 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: months ? "repeat(auto-fill, minmax(260px, 1fr))" : "1fr",
          gap: 10,
        }}
      >
        {(months ?? [collapseToMonth]).map((m) => (
          <Month
            key={m}
            year={year}
            month={m}
            map={viewMap}
            customMap={customMap}
            today={today}
          />
        ))}
      </div>

      {/* 假期清单 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        <div>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
            {year} 年法定假期（{ranges.length} 段 / {stats.holidayDays} 天）
          </Text>
          {ranges.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该年暂无数据，可点「在线更新」" />
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {ranges.map((r) => (
                <div
                  key={`${r.name}-${r.start}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "rgba(128,128,128,0.08)",
                    borderLeft: `3px solid ${holidayColor(r.name)}`,
                  }}
                >
                  <Text strong style={{ fontSize: 13, minWidth: 96 }}>
                    {r.name}
                  </Text>
                  <Text style={{ fontSize: 12 }}>
                    {r.start === r.end ? r.start : `${r.start} ~ ${r.end}`}
                  </Text>
                  <div style={{ flex: 1 }} />
                  <Tag style={{ marginInlineEnd: 0 }}>{r.days} 天</Tag>
                  {r.start >= today ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      还有 {diffDays(today, r.start)} 天
                    </Text>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 自定义纪念日 */}
        <div>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
            自定义纪念日
          </Text>
          <Space.Compact style={{ width: "100%", marginBottom: 6 }}>
            <DatePicker
              value={newDate}
              onChange={(v) => setNewDate(v)}
              placeholder="选择日期"
              style={{ width: 140 }}
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={addCustom}
              placeholder="名称（生日 / 纪念日…）"
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={addCustom} disabled={!newDate}>
              添加
            </Button>
          </Space.Compact>
          <Space size={6} style={{ marginBottom: 8 }}>
            <Switch size="small" checked={newYearly} onChange={setNewYearly} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              每年重复
            </Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              共 {custom.length} 条
            </Text>
            {custom.length > 0 ? (
              <Popconfirm
                title="清空全部自定义纪念日？"
                okText="清空"
                cancelText="取消"
                onConfirm={() => {
                  setCustom([]);
                  recordUsage({
                    toolId: "holiday",
                    toolTitle: "假期日历",
                    action: "clear",
                    summary: "清空自定义纪念日",
                  });
                }}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                  清空
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
          {customRanges.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              添加生日、结婚纪念日等，会自动出现在月历中（紫色标记）。
            </Text>
          ) : (
            <List
              size="small"
              dataSource={customRanges}
              renderItem={(r) => (
                <List.Item
                  style={{ padding: "4px 0" }}
                  actions={[
                    <Button
                      key="del"
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setCustom((prev) =>
                          prev.filter((c) => !(c.date === r.start && c.name === r.name)),
                        )
                      }
                    />,
                  ]}
                >
                  <Space size={6}>
                    <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                      {r.name}
                    </Tag>
                    <Text style={{ fontSize: 12 }}>{r.start}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {weekdayCn(r.start)}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <CopyButton
          text={() => buildTextReport(year, ranges, stats, customRanges, nextHoliday)}
          label="复制年度假期摘要"
        />
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
        数据来源：NateScarlet/holiday-cn（与 fat-stock 交易日历同源）。
        内置 {OFFLINE_YEARS[0]}–{OFFLINE_YEARS[OFFLINE_YEARS.length - 1]} 年数据，
        其余年份可点「在线更新」按需获取；离线环境自动回退内置数据。
        工作日统计仅按「周一~周五且非节假日」估算，不含调休上班日与实际年假。
      </Text>

      <ToolHistoryPanel
        toolId="holiday"
        toolTitle="假期日历"
        reloadKey={syncMsg ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("holiday");
          const y = typeof d.year === "number" ? d.year : Number(d.year);
          if (Number.isFinite(y)) setYear(y);
          if (d.collapsed === "none" || d.collapsed === "month") setCollapsed(d.collapsed);
        }}
      />
    </ToolShell>
  );
};

/* ── 单月日历 ─────────────────────────────────────────────── */

const Month: React.FC<{
  year: number;
  month: number;
  map: HolidayMap;
  customMap: HolidayMap;
  today: string;
}> = ({ year, month, map, customMap, today }) => {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <div
      style={{
        border: "1px solid rgba(128,128,128,0.25)",
        borderRadius: 8,
        padding: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <Text strong style={{ fontSize: 13 }}>
          {year} 年 {month} 月
        </Text>
        <div style={{ flex: 1 }} />
        <Text type="secondary" style={{ fontSize: 11 }}>
          {monthHolidayBrief(map, year, month)}
        </Text>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            style={{
              textAlign: "center",
              fontSize: 11,
              opacity: 0.6,
              color: i >= 5 ? "#fa541c" : undefined,
            }}
          >
            {w}
          </div>
        ))}
        {grid.flat().map((date, idx) => {
          if (!date) return <div key={`e-${idx}`} />;
          const holidayName = map[date];
          const isCustomDay = isCustomDate(customMap, map, date);
          const weekend = isWeekend(date);
          const isToday = date === today;
          const kind: DayKind = holidayName ? "holiday" : weekend ? "weekend" : "workday";

          let bg = "transparent";
          let color: string | undefined;
          if (holidayName) {
            bg = holidayColor(holidayName) + (isCustomDay ? "33" : "55");
          } else if (weekend) {
            bg = "rgba(250,173,20,0.16)";
          }

          const tip = (
            <div>
              <div>{date}</div>
              <div>{weekdayCn(date)}</div>
              {holidayName ? (
                <div>
                  {holidayName}
                  {isCustomDay ? "（自定义）" : "（法定节假日）"}
                </div>
              ) : weekend ? (
                <div>周末</div>
              ) : (
                <div>工作日</div>
              )}
            </div>
          );

          return (
            <Tooltip key={date} title={tip}>
              <div
                style={{
                  position: "relative",
                  height: 34,
                  borderRadius: 5,
                  background: bg,
                  color,
                  border: isToday
                    ? "2px solid #1677ff"
                    : isCustomDay
                      ? "1px dashed #722ed1"
                      : "1px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: isToday ? 700 : undefined,
                  cursor: "default",
                  userSelect: "none",
                }}
              >
                {Number(date.slice(8, 10))}
                {isToday ? (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 2,
                      width: 12,
                      height: 2,
                      borderRadius: 1,
                      background: "#1677ff",
                    }}
                  />
                ) : null}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

/* ── 辅助 ─────────────────────────────────────────────────── */

function isCustomDate(customMap: HolidayMap, map: HolidayMap, date: string): boolean {
  return Boolean(customMap[date]) && !map[date];
}

const WEEKDAY_CN = ["日", "一", "二", "三", "四", "五", "六"];

function weekdayCn(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `星期${WEEKDAY_CN[new Date(y, m - 1, d).getDay()]}`;
}

function diffDays(from: string, to: string): number {
  const a = parseDateTime(from);
  const b = parseDateTime(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function monthHolidayBrief(map: HolidayMap, year: number, month: number): string {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const names = Array.from(
    new Set(Object.keys(map).filter((d) => d.startsWith(prefix)).map((d) => map[d])),
  );
  return names.join(" / ");
}

function legendDot(color: string, border?: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 6,
    background: "rgba(128,128,128,0.08)",
  };
}

function buildTextReport(
  year: number,
  ranges: { name: string; start: string; end: string; days: number }[],
  stats: { holidayDays: number; workdays: number; restDays: number; daysInYear: number },
  customRanges: { name: string; start: string; end: string; days: number }[],
  next: { name: string; date: string; days: number } | null,
): string {
  const lines: string[] = [`${year} 年假期日历`, ""];
  lines.push(
    `法定节假日 ${stats.holidayDays} 天 · 工作日 ${stats.workdays} 天 · 休息日 ${stats.restDays} 天`,
  );
  if (next) lines.push(`下一个假期：${next.name}（${next.date}，还有 ${next.days} 天）`);
  lines.push("");
  lines.push("【法定假期】");
  if (ranges.length === 0) lines.push("（暂无数据）");
  for (const r of ranges) {
    lines.push(
      `· ${r.name}：${r.start === r.end ? r.start : `${r.start} ~ ${r.end}`}（${r.days} 天）`,
    );
  }
  if (customRanges.length) {
    lines.push("");
    lines.push("【自定义纪念日】");
    for (const r of customRanges) lines.push(`· ${r.name}：${r.start}`);
  }
  return lines.join("\n");
}

export default HolidayTool;
