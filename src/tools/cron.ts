/*
 * Cron 表达式解析：字段校验、中文说明、未来执行时间推算
 *
 * 支持：
 *  - 5 段：分 时 日 月 周
 *  - 6 段：秒 分 时 日 月 周（Quartz 风格）
 *  - 7 段：秒 分 时 日 月 周 年
 *  - 宏别名：@yearly @annually @monthly @weekly @daily @midnight @hourly
 *  - 语法：星号 / 问号 / a / a-b / a-b 带步长 / 每 n 单位 / 月份与星期英文缩写 / 日字段 L（当月最后一天）
 */

export type CronFieldKey =
  | "second"
  | "minute"
  | "hour"
  | "dayOfMonth"
  | "month"
  | "dayOfWeek"
  | "year";

export interface CronFieldInfo {
  key: CronFieldKey;
  label: string;
  raw: string;
  /** 解析出的取值集合（升序） */
  values: number[];
  /** 是否为 *（不限制） */
  wildcard: boolean;
  /** 日字段的 L（当月最后一天） */
  lastDay: boolean;
  /** 中文含义 */
  description: string;
}

export interface CronParseResult {
  ok: boolean;
  error?: string;
  /** 宏展开后的表达式 */
  normalized: string;
  /** 命中的宏名（未使用宏则为空） */
  macro?: string;
  hasSeconds: boolean;
  hasYear: boolean;
  fields: CronFieldInfo[];
}

const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const DOW_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};
const DOW_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const CRON_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

interface FieldSpec {
  key: CronFieldKey;
  label: string;
  min: number;
  max: number;
  names?: Record<string, number>;
}

const SPEC_SECOND: FieldSpec = { key: "second", label: "秒", min: 0, max: 59 };
const SPEC_MINUTE: FieldSpec = { key: "minute", label: "分", min: 0, max: 59 };
const SPEC_HOUR: FieldSpec = { key: "hour", label: "时", min: 0, max: 23 };
const SPEC_DOM: FieldSpec = { key: "dayOfMonth", label: "日", min: 1, max: 31 };
const SPEC_MONTH: FieldSpec = {
  key: "month",
  label: "月",
  min: 1,
  max: 12,
  names: MONTH_NAMES,
};
const SPEC_DOW: FieldSpec = {
  key: "dayOfWeek",
  label: "周",
  min: 0,
  max: 7,
  names: DOW_NAMES,
};
const SPEC_YEAR: FieldSpec = { key: "year", label: "年", min: 1970, max: 2099 };

/** 把单个 token 解析为数值（支持月份/星期英文缩写） */
function tokenToValue(token: string, spec: FieldSpec): number | null {
  const t = token.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= spec.min && n <= spec.max ? n : null;
  }
  const name = spec.names?.[t.toUpperCase()];
  return name === undefined ? null : name;
}

/** 解析逗号分隔的单个项，返回取值列表或错误信息 */
function parseItem(item: string, spec: FieldSpec): number[] | string {
  const s = item.trim();
  if (!s) return "存在空白项";
  if (s.includes("#") || /W/i.test(s)) return "暂不支持 # / W 语法";

  const slash = s.split("/");
  if (slash.length > 2) return "步长格式错误";
  const rangePart = slash[0];
  let step = 1;
  if (slash.length === 2) {
    const n = Number(slash[1]);
    if (!Number.isInteger(n) || n <= 0) return `步长「${slash[1]}」无效`;
    step = n;
  }

  let start: number;
  let end: number;
  if (rangePart === "*") {
    start = spec.min;
    end = spec.max;
  } else if (rangePart.includes("-")) {
    const [a, b] = rangePart.split("-");
    const va = tokenToValue(a, spec);
    const vb = tokenToValue(b, spec);
    if (va === null) return `取值「${a}」无效`;
    if (vb === null) return `取值「${b}」无效`;
    start = va;
    end = vb;
  } else {
    const v = tokenToValue(rangePart, spec);
    if (v === null) return `取值「${rangePart}」无效`;
    start = v;
    end = slash.length === 2 ? spec.max : v;
  }
  if (start > end) return `范围「${rangePart}」起始值大于结束值`;

  const out: number[] = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}

/** 压缩取值列表展示：连续段合并为 a-b */
function formatValues(
  values: number[],
  toLabel?: (v: number) => string,
): string {
  const label = toLabel ?? String;
  const parts: string[] = [];
  let i = 0;
  let shown = 0;
  while (i < values.length && shown < 12) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    if (j - i >= 2) parts.push(`${label(values[i])}-${label(values[j])}`);
    else for (let k = i; k <= j; k++) parts.push(label(values[k]));
    shown += j - i + 1;
    i = j + 1;
  }
  const text = parts.join("、");
  return values.length > shown ? `${text} …（共 ${values.length} 项）` : text;
}

function describeField(field: Omit<CronFieldInfo, "description">): string {
  const { key, wildcard, lastDay, values } = field;
  if (lastDay) return "每月最后一天";
  if (wildcard) {
    switch (key) {
      case "second":
        return "每秒";
      case "minute":
        return "每分钟";
      case "hour":
        return "每小时";
      case "dayOfMonth":
        return "每天";
      case "month":
        return "每月";
      case "dayOfWeek":
        return "每周各天";
      case "year":
        return "每年";
    }
  }
  switch (key) {
    case "second":
      return `第 ${formatValues(values)} 秒`;
    case "minute":
      return `第 ${formatValues(values)} 分钟`;
    case "hour":
      return `第 ${formatValues(values)} 点`;
    case "dayOfMonth":
      return `第 ${formatValues(values)} 号`;
    case "month":
      return `第 ${formatValues(values)} 月`;
    case "dayOfWeek":
      return formatValues(values, (v) => DOW_LABEL[v] ?? String(v));
    case "year":
      return `第 ${formatValues(values)} 年`;
  }
}

/** 解析 Cron 表达式 */
export function parseCron(expr: string): CronParseResult {
  const base: CronParseResult = {
    ok: false,
    normalized: "",
    hasSeconds: false,
    hasYear: false,
    fields: [],
  };
  const input = (expr || "").trim();
  if (!input) return { ...base, error: "请输入 Cron 表达式" };

  let macro: string | undefined;
  let body = input;
  if (input.startsWith("@")) {
    const expanded = CRON_MACROS[input.toLowerCase()];
    if (!expanded) {
      return {
        ...base,
        error: `不支持的宏：${input}（支持 @yearly @annually @monthly @weekly @daily @midnight @hourly）`,
      };
    }
    macro = input.toLowerCase();
    body = expanded;
  }

  const parts = body.split(/\s+/);
  if (parts.length < 5 || parts.length > 7) {
    return {
      ...base,
      macro,
      normalized: body,
      error:
        "字段数不正确：需 5 段（分 时 日 月 周）或 6/7 段（秒 分 时 日 月 周 [年]）",
    };
  }
  const hasSeconds = parts.length >= 6;
  const hasYear = parts.length === 7;
  const specs: FieldSpec[] = hasSeconds
    ? [SPEC_SECOND, SPEC_MINUTE, SPEC_HOUR, SPEC_DOM, SPEC_MONTH, SPEC_DOW]
    : [SPEC_MINUTE, SPEC_HOUR, SPEC_DOM, SPEC_MONTH, SPEC_DOW];
  if (hasYear) specs.push(SPEC_YEAR);

  const fields: CronFieldInfo[] = [];
  for (let i = 0; i < parts.length; i++) {
    const spec = specs[i];
    const raw = parts[i];
    const lastDay = spec.key === "dayOfMonth" && raw.toUpperCase() === "L";
    const wildcard = raw === "*" || raw === "?";

    let values: number[] = [];
    if (!lastDay) {
      const collected: number[] = [];
      for (const item of raw.split(",")) {
        const r = parseItem(wildcard ? "*" : item, spec);
        if (typeof r === "string") {
          return {
            ...base,
            macro,
            normalized: body,
            hasSeconds,
            hasYear,
            fields,
            error: `${spec.label}字段「${raw}」无效：${r}`,
          };
        }
        collected.push(...r);
      }
      // 星期 7 与 0 都表示周日，统一为 0
      const normalized = collected.map((v) =>
        spec.key === "dayOfWeek" && v === 7 ? 0 : v,
      );
      values = Array.from(new Set(normalized)).sort((a, b) => a - b);
    }

    const partial = {
      key: spec.key,
      label: spec.label,
      raw,
      values,
      wildcard,
      lastDay,
    };
    fields.push({ ...partial, description: describeField(partial) });
  }

  return { ok: true, macro, normalized: body, hasSeconds, hasYear, fields };
}

/** 组装人类可读的中文说明 */
export function describeCron(result: CronParseResult): string {
  if (!result.ok) return "";
  const get = (k: CronFieldKey) => result.fields.find((f) => f.key === k);
  const year = get("year");
  const month = get("month");
  const dom = get("dayOfMonth");
  const dow = get("dayOfWeek");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  const segments: string[] = [];
  if (year && !year.wildcard) segments.push(year.description);
  if (month && !month.wildcard) segments.push(month.description);
  if (dom && (dom.lastDay || !dom.wildcard)) segments.push(dom.description);
  if (dow && !dow.wildcard) segments.push(dow.description);

  if (hour && minute) {
    if (hour.wildcard && minute.wildcard) {
      segments.push(second && !second.wildcard ? second.description : "每分钟");
    } else if (hour.wildcard) {
      segments.push(`每小时的${minute.description}`);
    } else if (minute.wildcard) {
      segments.push(`${hour.description}的每分钟`);
    } else {
      segments.push(
        `第 ${hour.values.join("、")} 点 ${minute.values.join("、")} 分`,
      );
    }
  }
  if (second && !second.wildcard && !(hour?.wildcard && minute?.wildcard))
    segments.push(second.description);

  return segments.length
    ? `执行时间：${segments.join("，")}`
    : "按默认（每分钟）执行";
}

/** 是否为闰年 */
function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** 当月天数 */
function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    m - 1
  ];
}

function buildSet(field?: CronFieldInfo): Set<number> | null {
  if (!field || field.wildcard) return null;
  return new Set(field.values);
}

/**
 * 推算未来若干次执行时间。
 * 采用逐（秒/分）推进的匹配算法，最多扫描 300 万次，超出则返回已找到的部分。
 */
export function nextCronRuns(
  result: CronParseResult,
  count = 10,
  from: Date = new Date(),
): { ok: boolean; error?: string; dates: Date[]; truncated?: boolean } {
  if (!result.ok)
    return { ok: false, error: result.error || "表达式无效", dates: [] };

  const get = (k: CronFieldKey) => result.fields.find((f) => f.key === k);
  const dom = get("dayOfMonth");
  const dow = get("dayOfWeek");
  const monthField = get("month");
  const hourField = get("hour");
  const minuteField = get("minute");
  const secondField = result.hasSeconds ? get("second") : undefined;
  const yearField = get("year");

  const monthSet = buildSet(monthField);
  const hourSet = buildSet(hourField);
  const minuteSet = buildSet(minuteField);
  const secondSet = buildSet(secondField);
  const yearSet = buildSet(yearField);
  const domStar = !dom || dom.wildcard || dom.lastDay;
  const dowStar = !dow || dow.wildcard;
  const domSet = dom && !domStar ? new Set(dom.values) : null;
  const dowSet = dow && !dowStar ? new Set(dow.values) : null;

  const stepMs = result.hasSeconds ? 1000 : 60000;
  const MAX_ITER = 3_000_000;
  const startTs = Math.floor(from.getTime() / stepMs) * stepMs + stepMs;

  const dates: Date[] = [];
  const cursor = new Date(startTs);
  for (let i = 0; i < MAX_ITER && dates.length < count; i++) {
    const ts = startTs + i * stepMs;
    cursor.setTime(ts);
    const y = cursor.getFullYear();
    if (yearSet && !yearSet.has(y)) continue;
    if (monthSet && !monthSet.has(cursor.getMonth() + 1)) continue;

    const day = cursor.getDate();
    const last = daysInMonth(y, cursor.getMonth() + 1);
    const domHit = dom?.lastDay
      ? day === last
      : domStar || (domSet?.has(day) ?? true);
    const dowHit = dowStar || (dowSet?.has(cursor.getDay()) ?? true);
    const dayHit = !domStar && !dowStar ? domHit || dowHit : domHit && dowHit;
    if (!dayHit) continue;

    if (hourSet && !hourSet.has(cursor.getHours())) continue;
    if (minuteSet && !minuteSet.has(cursor.getMinutes())) continue;
    if (secondSet && !secondSet.has(cursor.getSeconds())) continue;

    dates.push(new Date(ts));
  }

  return {
    ok: true,
    dates,
    truncated: dates.length < count,
  };
}

const WEEK_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

/** 执行时间展示：YYYY-MM-DD HH:mm[:ss] 周X */
export function formatCronDate(date: Date, withSeconds: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const time = withSeconds
    ? `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
    : `${p(date.getHours())}:${p(date.getMinutes())}`;
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${time} 周${WEEK_LABEL[date.getDay()]}`;
}

export interface CronPreset {
  label: string;
  expr: string;
}

/** 常用表达式 */
export const CRON_PRESETS: CronPreset[] = [
  { label: "每分钟", expr: "* * * * *" },
  { label: "每 5 分钟", expr: "*/5 * * * *" },
  { label: "每 30 分钟", expr: "*/30 * * * *" },
  { label: "每小时", expr: "0 * * * *" },
  { label: "每天 0 点", expr: "0 0 * * *" },
  { label: "每天 9 点", expr: "0 9 * * *" },
  { label: "工作日 9 点", expr: "0 9 * * 1-5" },
  { label: "每周一 0 点", expr: "0 0 * * 1" },
  { label: "每月 1 号 0 点", expr: "0 0 1 * *" },
  { label: "每月最后一天", expr: "0 0 L * *" },
  { label: "每季度首日 0 点", expr: "0 0 1 1,4,7,10 *" },
  { label: "每年 1 月 1 日", expr: "0 0 1 1 *" },
  { label: "每 10 秒（含秒）", expr: "*/10 * * * * *" },
];
