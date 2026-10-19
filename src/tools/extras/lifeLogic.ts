/*
 * 数值与生活类新工具：百分比、比例、复利、罗马数字、几何、
 * 骰子、随机数、工作日、BMI、工资个税、坐标系、Luhn。
 *
 * 贷款月供、汇率、金额大写、日期差值、假期月历已有独立工具。
 */
import { offlineHolidays } from "../holidayData";

export interface PercentSet {
  ratio: number;
  ofTotal: number;
  change: number;
  zhePay: number;
  offPay: number;
}

/** 占比、增减幅、打几折、减百分之几。zhe 用「8.5 折 = 支付 85%」 */
export function calcPercent(part: number, total: number, from: number, to: number, price: number, zhe: number, off: number): PercentSet {
  return {
    ratio: total ? (part / total) * 100 : 0,
    ofTotal: (total * part) / 100,
    change: from ? ((to - from) / from) * 100 : 0,
    zhePay: (price * zhe) / 10,
    offPay: price * (1 - off / 100),
  };
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function toIntPair(a: number, b: number): [number, number] {
  const scale = 10 ** Math.min(6, Math.max(decimals(a), decimals(b)));
  return [Math.round(a * scale), Math.round(b * scale)];
}

function decimals(n: number): number {
  const text = String(n);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

export interface RatioResult {
  a: number;
  b: number;
  text: string;
  decimal: number;
  nearest: string;
  scaledWidth: number | null;
  scaledHeight: number | null;
}

const ASPECTS: [number, number, string][] = [
  [1, 1, "1:1"],
  [4, 3, "4:3"],
  [3, 2, "3:2"],
  [16, 9, "16:9"],
  [18, 9, "18:9"],
  [21, 9, "21:9"],
  [2, 1, "2:1"],
];

/** 约分宽高比，并按目标边长等比缩放 */
export function calcRatio(width: number, height: number, target?: number, by: "width" | "height" = "width"): RatioResult | { error: string } {
  if (!(width > 0) || !(height > 0)) return { error: "宽和高都要大于 0" };
  const [ia, ib] = toIntPair(width, height);
  const g = gcdInt(ia, ib);
  const a = ia / g;
  const b = ib / g;
  const decimal = width / height;
  let nearest = ASPECTS[0][2];
  let best = Infinity;
  for (const [aw, ah, label] of ASPECTS) {
    const diff = Math.abs(decimal - aw / ah) / (aw / ah);
    const flipped = Math.abs(decimal - ah / aw) / (ah / aw);
    if (diff < best) {
      best = diff;
      nearest = label;
    }
    if (flipped < best) {
      best = flipped;
      nearest = ah > aw ? `${ah}:${aw}` : label.includes(":") ? label.split(":").reverse().join(":") : label;
    }
  }
  let scaledWidth: number | null = null;
  let scaledHeight: number | null = null;
  if (target && target > 0) {
    if (by === "width") {
      scaledWidth = target;
      scaledHeight = (target * height) / width;
    } else {
      scaledHeight = target;
      scaledWidth = (target * width) / height;
    }
  }
  return { a, b, text: `${a}:${b}`, decimal, nearest, scaledWidth, scaledHeight };
}

export interface CompoundRow {
  year: number;
  balance: number;
  contributed: number;
  interest: number;
}

export interface CompoundResult {
  future: number;
  contributed: number;
  interest: number;
  rows: CompoundRow[];
}

/**
 * 复利 + 每期追加。
 * compoundsPerYear=12 且追加按月时，contribution 是每月金额。
 */
export function calcCompound(
  principal: number,
  annualRatePercent: number,
  years: number,
  compoundsPerYear: number,
  contribution: number,
  timing: "end" | "begin" = "end",
): CompoundResult | { error: string } {
  if (!(principal >= 0) || !(contribution >= 0)) return { error: "本金和追加金额不能为负" };
  if (!(years > 0) || years > 100) return { error: "年数需在 0 到 100 之间" };
  if (!(compoundsPerYear >= 1) || compoundsPerYear > 365) return { error: "每年计息次数需在 1 到 365" };
  const periods = Math.round(years * compoundsPerYear);
  const rate = annualRatePercent / 100 / compoundsPerYear;
  let balance = principal;
  const rows: CompoundRow[] = [];
  let contrib = principal;
  for (let i = 1; i <= periods; i++) {
    if (timing === "begin" && contribution) {
      balance += contribution;
      contrib += contribution;
    }
    balance *= 1 + rate;
    if (timing === "end" && contribution) {
      balance += contribution;
      contrib += contribution;
    }
    if (i % compoundsPerYear === 0) {
      rows.push({
        year: i / compoundsPerYear,
        balance: round2(balance),
        contributed: round2(contrib),
        interest: round2(balance - contrib),
      });
    }
  }
  return { future: round2(balance), contributed: round2(contrib), interest: round2(balance - contrib), rows };
}

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) throw new Error("罗马数字只表示 1 到 3999 的整数");
  let n = value;
  let out = "";
  for (const [num, glyph] of ROMAN) {
    while (n >= num) {
      out += glyph;
      n -= num;
    }
  }
  return out;
}

export function fromRoman(input: string): number {
  const text = input.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(text)) throw new Error("含有罗马数字以外的字符");
  let i = 0;
  let total = 0;
  while (i < text.length) {
    const pair = ROMAN.find(([, glyph]) => text.startsWith(glyph, i));
    if (!pair) throw new Error("不是规范的罗马数字");
    total += pair[0];
    i += pair[1].length;
  }
  if (toRoman(total) !== text) throw new Error("不是规范写法，例如 4 应写 IV");
  return total;
}

export interface GeometryItem {
  label: string;
  value: string;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n * 1e6) / 1e6);
}

export function calcGeometry(
  shape: "rect" | "circle" | "triangle" | "trapezoid",
  values: number[],
): { items: GeometryItem[] } | { error: string } {
  const [a, b, c] = values;
  if (values.some((n) => !Number.isFinite(n))) return { error: "请填写数字" };
  if (shape === "rect") {
    if (!(a > 0) || !(b > 0)) return { error: "长和宽要大于 0" };
    return {
      items: [
        { label: "面积", value: fmt(a * b) },
        { label: "周长", value: fmt(2 * (a + b)) },
        { label: "对角线", value: fmt(Math.sqrt(a * a + b * b)) },
      ],
    };
  }
  if (shape === "circle") {
    if (!(a > 0)) return { error: "半径要大于 0" };
    return {
      items: [
        { label: "面积", value: fmt(Math.PI * a * a) },
        { label: "周长", value: fmt(2 * Math.PI * a) },
        { label: "直径", value: fmt(a * 2) },
      ],
    };
  }
  if (shape === "trapezoid") {
    if (!(a > 0) || !(b > 0) || !(c > 0)) return { error: "上底、下底和高都要大于 0" };
    return {
      items: [
        { label: "面积", value: fmt(((a + b) * c) / 2) },
        { label: "中位线", value: fmt((a + b) / 2) },
      ],
    };
  }
  if (!(a > 0) || !(b > 0) || !(c > 0)) return { error: "三边都要大于 0" };
  if (a + b <= c || a + c <= b || b + c <= a) return { error: "三边不能组成三角形" };
  const s = (a + b + c) / 2;
  const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
  const angle = (x: number, y: number, z: number) => (Math.acos((y * y + z * z - x * x) / (2 * y * z)) * 180) / Math.PI;
  return {
    items: [
      { label: "面积", value: fmt(area) },
      { label: "周长", value: fmt(a + b + c) },
      { label: "角 A", value: `${fmt(angle(a, b, c))}°` },
      { label: "角 B", value: `${fmt(angle(b, a, c))}°` },
      { label: "角 C", value: `${fmt(angle(c, a, b))}°` },
    ],
  };
}

export interface DicePart {
  label: string;
  value: number;
  faces?: number[];
}

export interface DiceRoll {
  total: number;
  parts: DicePart[];
}

/** 掷骰表达式，例如 2d6+1d4-1。rng 返回 [0, 1) */
export function rollDice(expr: string, rng: () => number = Math.random): DiceRoll | { error: string } {
  const text = expr.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return { error: "请输入骰子表达式" };
  if (!/^(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(text)) return { error: "格式如 2d6+3 或 1d20-1" };
  const bits = text.match(/[+-]?(\d*d\d+|\d+)/g) ?? [];
  if (bits.length > 20) return { error: "最多 20 项" };
  const parts: DicePart[] = [];
  let total = 0;
  for (const bit of bits) {
    const sign = bit.startsWith("-") ? -1 : 1;
    const body = bit.replace(/^[+-]/, "");
    if (body.includes("d")) {
      const [nRaw, sRaw] = body.split("d");
      const count = nRaw ? Number(nRaw) : 1;
      const sides = Number(sRaw);
      if (count < 1 || count > 200) return { error: "骰子数量需在 1 到 200" };
      if (sides < 2 || sides > 10000) return { error: "面数需在 2 到 10000" };
      const faces: number[] = [];
      for (let i = 0; i < count; i++) faces.push(Math.floor(rng() * sides) + 1);
      const value = sign * faces.reduce((s, n) => s + n, 0);
      parts.push({ label: `${sign < 0 ? "-" : ""}${count}d${sides}`, value, faces });
      total += value;
    } else {
      const value = sign * Number(body);
      parts.push({ label: bit, value });
      total += value;
    }
  }
  return { total, parts };
}

export function randomNumbers(
  min: number,
  max: number,
  count: number,
  unique: boolean,
  decimals: number,
  rng: () => number = Math.random,
): number[] | { error: string } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return { error: "最小值不能大于最大值" };
  if (!Number.isInteger(count) || count < 1 || count > 500) return { error: "个数需在 1 到 500" };
  const places = Math.max(0, Math.min(8, Math.trunc(decimals)));
  const factor = 10 ** places;
  const lo = Math.round(min * factor);
  const hi = Math.round(max * factor);
  const span = hi - lo + 1;
  if (unique && places === 0 && count > span) return { error: "不重复个数超过了区间长度" };
  const picked = new Set<number>();
  const out: number[] = [];
  let guard = 0;
  while (out.length < count) {
    guard += 1;
    if (guard > count * 50) return { error: "不重复抽样失败，请放宽区间" };
    const n = lo + Math.floor(rng() * span);
    if (unique && picked.has(n)) continue;
    picked.add(n);
    out.push(n / factor);
  }
  return out;
}

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export function parseYmd(input: string): Ymd | null {
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function formatYmd(date: Ymd): string {
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

function addDays(date: Ymd, days: number): Ymd {
  const utc = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
}

function cmpYmd(a: Ymd, b: Ymd): number {
  return formatYmd(a) < formatYmd(b) ? -1 : formatYmd(a) > formatYmd(b) ? 1 : 0;
}

function isWeekend(date: Ymd): boolean {
  const day = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  return day === 0 || day === 6;
}

function isHoliday(date: Ymd): boolean {
  return Boolean(offlineHolidays(date.y)[formatYmd(date)]);
}

export function isWorkday(date: Ymd, skipHolidays: boolean): boolean {
  if (isWeekend(date)) return false;
  if (skipHolidays && isHoliday(date)) return false;
  return true;
}

export interface WorkdaySpan {
  count: number;
  first: string;
  last: string;
  sample: string[];
  truncated: boolean;
}

/** 含首尾的工作日。跳过周末；可选跳过内置法定放假日（不含调休上班） */
export function workdaysBetween(start: string, end: string, skipHolidays: boolean): WorkdaySpan | { error: string } {
  const from = parseYmd(start);
  const to = parseYmd(end);
  if (!from || !to) return { error: "日期格式应为 YYYY-MM-DD" };
  if (cmpYmd(from, to) > 0) return { error: "结束日期早于开始日期" };
  let cursor = from;
  let count = 0;
  let first = "";
  let last = "";
  const sample: string[] = [];
  let guard = 0;
  while (cmpYmd(cursor, to) <= 0) {
    guard += 1;
    if (guard > 3660) return { error: "日期间隔请控制在 10 年以内" };
    if (isWorkday(cursor, skipHolidays)) {
      const text = formatYmd(cursor);
      count += 1;
      if (!first) first = text;
      last = text;
      if (sample.length < 12) sample.push(text);
    }
    cursor = addDays(cursor, 1);
  }
  return { count, first, last, sample, truncated: count > sample.length };
}

export function addWorkdays(start: string, days: number, skipHolidays: boolean): string | { error: string } {
  const from = parseYmd(start);
  if (!from) return { error: "日期格式应为 YYYY-MM-DD" };
  if (!Number.isInteger(days) || Math.abs(days) > 3660) return { error: "工作日数量需为 ±3660 以内的整数" };
  if (days === 0) return formatYmd(from);
  const step = days > 0 ? 1 : -1;
  let left = Math.abs(days);
  let cursor = from;
  let guard = 0;
  while (left > 0) {
    guard += 1;
    if (guard > 8000) return { error: "推算超出范围" };
    cursor = addDays(cursor, step);
    if (isWorkday(cursor, skipHolidays)) left -= 1;
  }
  return formatYmd(cursor);
}

export interface BmiResult {
  bmi: number;
  category: string;
  healthyMin: number;
  healthyMax: number;
}

/** 中国成人 BMI（WS/T 428）：18.5 / 24 / 28 */
export function calcBmi(weightKg: number, heightCm: number): BmiResult | { error: string } {
  if (!(weightKg > 0) || weightKg > 500) return { error: "体重需在 0 到 500 kg" };
  if (!(heightCm > 40) || heightCm > 300) return { error: "身高需在 40 到 300 cm" };
  const meter = heightCm / 100;
  const bmi = weightKg / (meter * meter);
  let category = "肥胖";
  if (bmi < 18.5) category = "体重过低";
  else if (bmi < 24) category = "正常";
  else if (bmi < 28) category = "超重";
  return {
    bmi: Math.round(bmi * 10) / 10,
    category,
    healthyMin: round2(18.5 * meter * meter),
    healthyMax: round2(23.9 * meter * meter),
  };
}

export interface SalaryInput {
  gross: number;
  monthIndex: number;
  pensionRate: number;
  medicalRate: number;
  unemploymentRate: number;
  fundRate: number;
  baseMin: number | null;
  baseMax: number | null;
  specialDeduction: number;
  threshold: number;
}

export interface SalaryResult {
  base: number;
  pension: number;
  medical: number;
  unemployment: number;
  fund: number;
  social: number;
  taxable: number;
  tax: number;
  cumulativeTaxable: number;
  cumulativeTax: number;
  net: number;
  bracket: string;
  yearTax: number;
  yearNet: number;
}

const TAX_BRACKETS: [number, number, number, string][] = [
  [36000, 0.03, 0, "3%"],
  [144000, 0.1, 2520, "10%"],
  [300000, 0.2, 16920, "20%"],
  [420000, 0.25, 31920, "25%"],
  [660000, 0.3, 52920, "30%"],
  [960000, 0.35, 85920, "35%"],
  [Infinity, 0.45, 181920, "45%"],
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function annualWageTax(taxable: number): { tax: number; bracket: string } {
  if (taxable <= 0) return { tax: 0, bracket: "0%" };
  for (const [limit, rate, deduct, label] of TAX_BRACKETS) {
    if (taxable <= limit) return { tax: round2(taxable * rate - deduct), bracket: label };
  }
  return { tax: 0, bracket: "0%" };
}

function insurance(base: number, rate: number): number {
  return round2((base * rate) / 100);
}

/** 工资薪金累计预扣。社保比例是示例，各地基数和费率不同 */
export function calcSalary(input: SalaryInput): SalaryResult | { error: string } {
  const month = Math.trunc(input.monthIndex);
  if (!(input.gross >= 0)) return { error: "月工资不能为负" };
  if (month < 1 || month > 12) return { error: "计税月份需在 1 到 12" };
  const rates = [input.pensionRate, input.medicalRate, input.unemploymentRate, input.fundRate];
  if (rates.some((rate) => rate < 0 || rate > 100)) return { error: "费率需在 0 到 100%" };
  let base = input.gross;
  if (input.baseMin != null && input.baseMin > 0) base = Math.max(base, input.baseMin);
  if (input.baseMax != null && input.baseMax > 0) base = Math.min(base, input.baseMax);
  const pension = insurance(base, input.pensionRate);
  const medical = insurance(base, input.medicalRate);
  const unemployment = insurance(base, input.unemploymentRate);
  const fund = insurance(base, input.fundRate);
  const social = round2(pension + medical + unemployment + fund);
  const threshold = input.threshold > 0 ? input.threshold : 5000;
  const monthlyTaxable = Math.max(0, round2(input.gross - threshold - social - Math.max(0, input.specialDeduction)));
  const cumulativeTaxable = round2(monthlyTaxable * month);
  const current = annualWageTax(cumulativeTaxable);
  const previous = annualWageTax(round2(monthlyTaxable * (month - 1)));
  const tax = round2(Math.max(0, current.tax - previous.tax));
  let yearTax = 0;
  let yearNet = 0;
  for (let i = 1; i <= 12; i++) {
    const cum = annualWageTax(round2(monthlyTaxable * i)).tax;
    const prev = annualWageTax(round2(monthlyTaxable * (i - 1))).tax;
    const monthTax = round2(Math.max(0, cum - prev));
    yearTax = round2(yearTax + monthTax);
    yearNet = round2(yearNet + input.gross - social - monthTax);
  }
  return {
    base: round2(base),
    pension,
    medical,
    unemployment,
    fund,
    social,
    taxable: monthlyTaxable,
    tax,
    cumulativeTaxable,
    cumulativeTax: current.tax,
    net: round2(input.gross - social - tax),
    bracket: current.bracket,
    yearTax,
    yearNet,
  };
}

export type CoordSystem = "wgs84" | "gcj02" | "bd09";

const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng: number, lat: number): number {
  let ret = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(lat * Math.PI) + 40 * Math.sin((lat / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((lat / 12) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30)) * 2) / 3;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(lng * Math.PI) + 40 * Math.sin((lng / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((lng / 12) * Math.PI) + 300 * Math.sin((lng / 30) * Math.PI)) * 2) / 3;
  return ret;
}

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lng + dLng, lat + dLat];
}

export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [mgLng, mgLat] = wgs84ToGcj02(lng, lat);
  return [lng * 2 - mgLng, lat * 2 - mgLat];
}

export function gcj02ToBd09(lng: number, lat: number): [number, number] {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin((lat * Math.PI * 3000) / 180);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos((lng * Math.PI * 3000) / 180);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function bd09ToGcj02(lng: number, lat: number): [number, number] {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin((y * Math.PI * 3000) / 180);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos((x * Math.PI * 3000) / 180);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

export function convertCoord(lng: number, lat: number, from: CoordSystem): Record<CoordSystem, [number, number]> | { error: string } {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: "经纬度超出范围" };
  let gcj: [number, number];
  let wgs: [number, number];
  let bd: [number, number];
  if (from === "wgs84") {
    wgs = [lng, lat];
    gcj = wgs84ToGcj02(lng, lat);
    bd = gcj02ToBd09(gcj[0], gcj[1]);
  } else if (from === "gcj02") {
    gcj = [lng, lat];
    wgs = gcj02ToWgs84(lng, lat);
    bd = gcj02ToBd09(lng, lat);
  } else {
    bd = [lng, lat];
    gcj = bd09ToGcj02(lng, lat);
    wgs = gcj02ToWgs84(gcj[0], gcj[1]);
  }
  return { wgs84: wgs, gcj02: gcj, bd09: bd };
}

/** 球面距离，单位米 */
export function haversine(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const r = 6371008.8;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LuhnInfo {
  digits: string;
  valid: boolean;
  expected: string;
  brand: string;
  length: number;
}

export function luhnCheckDigit(body: string): string {
  let sum = 0;
  const rev = body.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = Number(rev[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function luhnValid(digits: string): boolean {
  if (digits.length < 2) return false;
  return luhnCheckDigit(digits.slice(0, -1)) === digits[digits.length - 1];
}

function cardBrand(digits: string): string {
  if (/^4\d{12,18}$/.test(digits)) return "Visa";
  if (/^62\d{14,17}$/.test(digits)) return "银联";
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7[01]\d{12}|720\d{12}))$/.test(digits)) return "Mastercard";
  if (/^3[47]\d{13}$/.test(digits)) return "American Express";
  if (/^35\d{14}$/.test(digits)) return "JCB";
  if (/^(6011|65|64[4-9])\d{12,15}$/.test(digits)) return "Discover";
  if (digits.length === 15) return "15 位号码（可能是 IMEI）";
  return "未知卡组织";
}

/** Luhn 校验位。用于银行卡和 IMEI，不验证卡是否真实存在 */
export function inspectLuhn(input: string): LuhnInfo | { error: string } {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d{2,24}$/.test(digits)) return { error: "请输入 2 到 24 位数字" };
  return {
    digits,
    valid: luhnValid(digits),
    expected: luhnCheckDigit(digits.slice(0, -1)),
    brand: cardBrand(digits),
    length: digits.length,
  };
}
