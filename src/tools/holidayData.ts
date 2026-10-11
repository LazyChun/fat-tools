/*
 * 中国法定节假日数据（内置离线兜底 + 在线更新）
 *
 * 数据口径与 fat-stock 交易日历一致：来源 NateScarlet/holiday-cn，
 * 仅取 isOffDay=true 的「放假」日期（周末调休上班日不算节假日）。
 *
 * 为什么内置：节假日为国务院统一发布，发布后不再变化，内置往年数据可
 * 保证离线/内网环境下日历依然完整；在线更新仅用于补齐新发布的年份。
 */

/** 日期 → 节日名（仅放假日期） */
export type HolidayMap = Record<string, string>;

/** 假期区间（连续同名假期合并展示用） */
export interface HolidayRange {
  name: string;
  start: string;
  end: string;
  days: number;
}

/**
 * 内置离线数据（holiday-cn 已发布年份）。
 * 与 fat-stock `_HOLIDAY_OFFLINE` 保持同源，避免两个插件口径不一致。
 */
export const HOLIDAY_OFFLINE: Record<number, HolidayMap> = {
  2021: { "2021-01-01": "元旦", "2021-01-02": "元旦", "2021-01-03": "元旦", "2021-02-11": "春节", "2021-02-12": "春节", "2021-02-13": "春节", "2021-02-14": "春节", "2021-02-15": "春节", "2021-02-16": "春节", "2021-02-17": "春节", "2021-04-03": "清明节", "2021-04-04": "清明节", "2021-04-05": "清明节", "2021-05-01": "劳动节", "2021-05-02": "劳动节", "2021-05-03": "劳动节", "2021-05-04": "劳动节", "2021-05-05": "劳动节", "2021-06-12": "端午节", "2021-06-13": "端午节", "2021-06-14": "端午节", "2021-09-19": "中秋节", "2021-09-20": "中秋节", "2021-09-21": "中秋节", "2021-10-01": "国庆节", "2021-10-02": "国庆节", "2021-10-03": "国庆节", "2021-10-04": "国庆节", "2021-10-05": "国庆节", "2021-10-06": "国庆节", "2021-10-07": "国庆节" },
  2022: { "2022-01-01": "元旦", "2022-01-02": "元旦", "2022-01-03": "元旦", "2022-01-31": "春节", "2022-02-01": "春节", "2022-02-02": "春节", "2022-02-03": "春节", "2022-02-04": "春节", "2022-02-05": "春节", "2022-02-06": "春节", "2022-04-03": "清明节", "2022-04-04": "清明节", "2022-04-05": "清明节", "2022-04-30": "劳动节", "2022-05-01": "劳动节", "2022-05-02": "劳动节", "2022-05-03": "劳动节", "2022-05-04": "劳动节", "2022-06-03": "端午节", "2022-06-04": "端午节", "2022-06-05": "端午节", "2022-09-10": "中秋节", "2022-09-11": "中秋节", "2022-09-12": "中秋节", "2022-10-01": "国庆节", "2022-10-02": "国庆节", "2022-10-03": "国庆节", "2022-10-04": "国庆节", "2022-10-05": "国庆节", "2022-10-06": "国庆节", "2022-10-07": "国庆节" },
  2023: { "2022-12-31": "元旦", "2023-01-01": "元旦", "2023-01-02": "元旦", "2023-01-21": "春节", "2023-01-22": "春节", "2023-01-23": "春节", "2023-01-24": "春节", "2023-01-25": "春节", "2023-01-26": "春节", "2023-01-27": "春节", "2023-04-05": "清明节", "2023-04-29": "劳动节", "2023-04-30": "劳动节", "2023-05-01": "劳动节", "2023-05-02": "劳动节", "2023-05-03": "劳动节", "2023-06-22": "端午节", "2023-06-23": "端午节", "2023-06-24": "端午节", "2023-09-29": "中秋节、国庆节", "2023-09-30": "中秋节、国庆节", "2023-10-01": "中秋节、国庆节", "2023-10-02": "中秋节、国庆节", "2023-10-03": "中秋节、国庆节", "2023-10-04": "中秋节、国庆节", "2023-10-05": "中秋节、国庆节", "2023-10-06": "中秋节、国庆节" },
  2024: { "2024-01-01": "元旦", "2024-02-10": "春节", "2024-02-11": "春节", "2024-02-12": "春节", "2024-02-13": "春节", "2024-02-14": "春节", "2024-02-15": "春节", "2024-02-16": "春节", "2024-02-17": "春节", "2024-04-04": "清明节", "2024-04-05": "清明节", "2024-04-06": "清明节", "2024-05-01": "劳动节", "2024-05-02": "劳动节", "2024-05-03": "劳动节", "2024-05-04": "劳动节", "2024-05-05": "劳动节", "2024-06-10": "端午节", "2024-09-15": "中秋节", "2024-09-16": "中秋节", "2024-09-17": "中秋节", "2024-10-01": "国庆节", "2024-10-02": "国庆节", "2024-10-03": "国庆节", "2024-10-04": "国庆节", "2024-10-05": "国庆节", "2024-10-06": "国庆节", "2024-10-07": "国庆节" },
  2025: { "2025-01-01": "元旦", "2025-01-28": "春节", "2025-01-29": "春节", "2025-01-30": "春节", "2025-01-31": "春节", "2025-02-01": "春节", "2025-02-02": "春节", "2025-02-03": "春节", "2025-02-04": "春节", "2025-04-04": "清明节", "2025-04-05": "清明节", "2025-04-06": "清明节", "2025-05-01": "劳动节", "2025-05-02": "劳动节", "2025-05-03": "劳动节", "2025-05-04": "劳动节", "2025-05-05": "劳动节", "2025-05-31": "端午节", "2025-06-01": "端午节", "2025-06-02": "端午节", "2025-10-01": "国庆节、中秋节", "2025-10-02": "国庆节、中秋节", "2025-10-03": "国庆节、中秋节", "2025-10-04": "国庆节、中秋节", "2025-10-05": "国庆节、中秋节", "2025-10-06": "国庆节、中秋节", "2025-10-07": "国庆节、中秋节", "2025-10-08": "国庆节、中秋节" },
  2026: { "2026-01-01": "元旦", "2026-01-02": "元旦", "2026-01-03": "元旦", "2026-02-15": "春节", "2026-02-16": "春节", "2026-02-17": "春节", "2026-02-18": "春节", "2026-02-19": "春节", "2026-02-20": "春节", "2026-02-21": "春节", "2026-02-22": "春节", "2026-02-23": "春节", "2026-04-04": "清明节", "2026-04-05": "清明节", "2026-04-06": "清明节", "2026-05-01": "劳动节", "2026-05-02": "劳动节", "2026-05-03": "劳动节", "2026-05-04": "劳动节", "2026-05-05": "劳动节", "2026-06-19": "端午节", "2026-06-20": "端午节", "2026-06-21": "端午节", "2026-09-25": "中秋节", "2026-09-26": "中秋节", "2026-09-27": "中秋节", "2026-10-01": "国庆节", "2026-10-02": "国庆节", "2026-10-03": "国庆节", "2026-10-04": "国庆节", "2026-10-05": "国庆节", "2026-10-06": "国庆节", "2026-10-07": "国庆节" },
};

/** 内置数据覆盖的年份范围（用于提示「数据可能不是最新」） */
export const OFFLINE_YEARS: number[] = Object.keys(HOLIDAY_OFFLINE)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * 假期配色板：同一节日名 hash 到同一颜色，
 * 让多天连续假期与跨年重复出现的节日颜色稳定。参考 fat-stock MonthCalendar。
 */
export const HOLIDAY_COLORS = [
  "#f5222d",
  "#fa541c",
  "#eb2f96",
  "#722ed1",
  "#13c2c2",
  "#d48806",
];

/** 节日名 → 稳定配色 */
export function holidayColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return HOLIDAY_COLORS[hash % HOLIDAY_COLORS.length];
}

/** 单个年份的节假日映射（内置数据；无则该年返回空对象） */
export function offlineHolidays(year: number): HolidayMap {
  return HOLIDAY_OFFLINE[year] ?? {};
}

/** 合并内置数据与在线获取结果（在线优先，补齐内置缺失的年份） */
export function mergeHolidays(
  year: number,
  online: HolidayMap | null,
): { map: HolidayMap; source: "online" | "offline" | "none" } {
  const offline = offlineHolidays(year);
  if (online && Object.keys(online).length > 0) {
    return { map: { ...offline, ...online }, source: "online" };
  }
  if (Object.keys(offline).length > 0) {
    return { map: offline, source: "offline" };
  }
  return { map: {}, source: "none" };
}

/* ------------------------------------------------------------------ */
/* 多镜像在线获取（jsdelivr）                                           */
/* ------------------------------------------------------------------ */

/** 与 fat-stock 一致的镜像顺序：testingcf 最快，其余兜底 */
export const HOLIDAY_MIRRORS = [
  "https://testingcf.jsdelivr.net/gh/NateScarlet/holiday-cn@master",
  "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master",
  "https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 解析 holiday-cn 的 JSON 结构（days[].isOffDay=true 为放假） */
export function parseHolidayCnJson(data: unknown): HolidayMap {
  const out: HolidayMap = {};
  const days = (data as { days?: unknown })?.days;
  if (!Array.isArray(days)) return out;
  for (const d of days) {
    const row = d as { date?: unknown; name?: unknown; isOffDay?: unknown };
    if (!row?.isOffDay) continue;
    const date = String(row.date ?? "");
    const name = String(row.name ?? "").trim();
    if (DATE_RE.test(date) && name) out[date] = name;
  }
  return out;
}

/**
 * 从镜像拉取某年节假日（带超时）。
 * - 404 表示该年份尚未发布 → 返回空表（正常态）
 * - 全部镜像失败/超时 → 返回 null（调用方回退内置数据）
 */
export async function fetchHolidaysOnline(
  year: number,
  timeoutMs = 5000,
): Promise<HolidayMap | null> {
  for (const base of HOLIDAY_MIRRORS) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const resp = await fetch(`${base}/${year}.json`, {
        signal: controller?.signal,
        cache: "no-store",
      });
      if (resp.status === 404) return {};
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return parseHolidayCnJson(await resp.json());
    } catch {
      // 继续尝试下一个镜像
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 派生视图                                                            */
/* ------------------------------------------------------------------ */

/** 某年全部节假日日期（升序） */
export function holidayDatesOfYear(map: HolidayMap, year: number): string[] {
  const prefix = `${year}-`;
  return Object.keys(map)
    .filter((d) => d.startsWith(prefix))
    .sort();
}

/** 把连续同名假期合并成区间（跨月展示 / 统计用） */
export function toHolidayRanges(map: HolidayMap, year: number): HolidayRange[] {
  const dates = holidayDatesOfYear(map, year);
  const ranges: HolidayRange[] = [];
  for (const d of dates) {
    const name = map[d];
    const last = ranges[ranges.length - 1];
    const prevDay = last ? dayBefore(d) : null;
    if (last && last.name === name && prevDay === last.end) {
      last.end = d;
      last.days += 1;
    } else {
      ranges.push({ name, start: d, end: d, days: 1 });
    }
  }
  return ranges;
}

/** YYYY-MM-DD → 前一天（同格式） */
export function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** 日期 → 后一天（同格式） */
export function dayAfter(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 是否周末（周六 / 周日） */
export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** 某年「工作日」天数（周一~周五，且非法定节假日） */
export function workdayCountOfYear(map: HolidayMap, year: number): number {
  let count = 0;
  const dt = new Date(year, 0, 1);
  while (dt.getFullYear() === year) {
    const s = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    if (!isWeekend(s) && !map[s]) count++;
    dt.setDate(dt.getDate() + 1);
  }
  return count;
}

/** 月历网格：返回 6×7 的日期格（周一为首列），非本月为 null */
export function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  // getDay(): 0=周日 → 转成周一=0
  let lead = first.getDay() - 1;
  if (lead < 0) lead = 6;
  const total = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push(`${year}-${pad2(month)}-${pad2(d)}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  // 补齐到 6 行，避免月份切换时高度跳动
  while (cells.length < 42) cells.push(null);

  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 今天（本地时区 YYYY-MM-DD；勿用 toISOString，UTC 会把东八区凌晨算成前一天） */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── 自定义纪念日（纯日期，与法定节假日分开管理） ──────────────────

export interface CustomDay {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** 是否每年重复 */
  yearly: boolean;
}

/** 自定义纪念日 → 节假日映射（重复项展开到指定年份） */
export function customDaysToMap(list: CustomDay[], year: number): HolidayMap {
  const out: HolidayMap = {};
  for (const c of list) {
    if (!DATE_RE.test(c.date)) continue;
    const y = Number(c.date.slice(0, 4));
    if (c.yearly) {
      const mmdd = c.date.slice(4);
      // 2-29 在非闰年跳过，避免落到 3-1
      if (mmdd === "-02-29") {
        const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        if (!leap) continue;
      }
      out[`${year}${mmdd}`] = c.name || "纪念日";
    } else if (y === year) {
      out[c.date] = c.name || "纪念日";
    }
  }
  return out;
}
