/*
 * 文本类新工具的纯函数：拼音、全半角、查找替换、词频、模板、
 * Markdown 表格、大小写、列提取、脱敏。
 *
 * 与已有工具的边界：
 * - 拼音是整段注音；汉字拆解是单字部件
 * - 大小写是自然语言；命名转换是标识符风格
 * - 列提取按分隔符取列；行处理是行级去重排序
 * - 脱敏是打码；身份证工具是校验与解析
 */
import { pinyin } from "pinyin-pro";
import { parseDelimited } from "../dataConvert";

export type PinyinStyle = "symbol" | "none" | "num" | "initial";

function isSyllable(part: string): boolean {
  return /^[a-z\u00C0-\u024F]+[0-9]?$/i.test(part);
}

/** 音节之间插入分隔符，非汉字片段（含自身空格）原样接上 */
function joinPinyin(parts: string[], separator: string): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    if (!out) {
      out = part;
      continue;
    }
    if (isSyllable(part) && !/\s$/.test(out)) out += separator;
    out += part;
  }
  return out;
}

/** 汉字转拼音。initial 为首字母，其余为带调 / 无调 / 数字调 */
export function toPinyin(text: string, style: PinyinStyle, separator = " "): string {
  if (!text) return "";
  if (style === "initial") {
    const parts = pinyin(text, {
      pattern: "first",
      toneType: "none",
      type: "array",
      nonZh: "consecutive",
    }) as string[];
    return joinPinyin(parts, separator);
  }
  const parts = pinyin(text, {
    toneType: style,
    type: "array",
    nonZh: "consecutive",
  }) as string[];
  return joinPinyin(parts, separator);
}

/** 全角 ASCII（FF01–FF5E）与全角空格 → 半角 */
export function toHalfWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E\u3000]/g, (ch) => {
    if (ch === "\u3000") return " ";
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
}

/** 半角可打印 ASCII 与空格 → 全角 */
export function toFullWidth(text: string): string {
  return text.replace(/[!-~ ]/g, (ch) => {
    if (ch === " ") return "\u3000";
    return String.fromCharCode(ch.charCodeAt(0) + 0xfee0);
  });
}

export interface ReplaceOptions {
  regex?: boolean;
  ignoreCase?: boolean;
  wholeWord?: boolean;
}

export interface ReplaceResult {
  output: string;
  count: number;
  error?: string;
}

function escapeReg(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 查找替换。正则模式下 $1 / $<name> / $$ 按捕获组展开 */
export function findReplace(
  text: string,
  find: string,
  replacement: string,
  opts: ReplaceOptions = {},
): ReplaceResult {
  if (!find) return { output: text, count: 0, error: "查找内容不能为空" };
  try {
    let pattern = opts.regex ? find : escapeReg(find);
    if (opts.wholeWord) {
      pattern = `(?<![A-Za-z0-9_\\u4e00-\\u9fff])(?:${pattern})(?![A-Za-z0-9_\\u4e00-\\u9fff])`;
    }
    const re = new RegExp(pattern, opts.ignoreCase ? "gi" : "g");
    let count = 0;
    const output = text.replace(re, (match, ...rest: unknown[]) => {
      count += 1;
      if (!opts.regex) return replacement;
      let groups: Record<string, string> | undefined;
      if (rest.length && rest[rest.length - 1] && typeof rest[rest.length - 1] === "object") {
        groups = rest.pop() as Record<string, string>;
      }
      const captures = rest.slice(0, Math.max(0, rest.length - 2)) as string[];
      return replacement.replace(/\$(\d+)|\$<([^>]+)>|\$\$/g, (token, index, name) => {
        if (token === "$$") return "$";
        if (name) {
          const table = groups && typeof groups === "object" ? (groups as Record<string, string>) : {};
          return table[name] ?? "";
        }
        const n = Number(index);
        return n === 0 ? match : captures[n - 1] ?? "";
      });
    });
    return { output, count };
  } catch (e) {
    return { output: "", count: 0, error: e instanceof Error ? e.message : "正则无效" };
  }
}

export interface FreqItem {
  token: string;
  count: number;
  percent: number;
}

const STOP_EN = new Set(
  "a an the of to in for on and or is are was were be as at by from with this that it".split(" "),
);
const STOP_ZH = new Set("的了是在不有我这他她它和与或也就都而及被把".split(""));

function isHan(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp >= 0x4e00 && cp <= 0x9fff;
}

function isStop(token: string): boolean {
  if (STOP_EN.has(token.toLowerCase())) return true;
  return [...token].every((ch) => STOP_ZH.has(ch));
}

/**
 * 词频。
 * char：汉字逐字 + 英文单词
 * word：英文单词 + 连续汉字的二字滑动窗口（单字片段保留）
 */
export function wordFrequency(
  text: string,
  mode: "char" | "word",
  ignoreCase: boolean,
  ignoreStop: boolean,
  top = 30,
): FreqItem[] {
  const map = new Map<string, number>();
  const add = (token: string) => {
    const key = ignoreCase ? token.toLowerCase() : token;
    if (!key) return;
    if (ignoreStop && isStop(key)) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const latin = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  for (const word of latin) add(word);

  const runs = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of runs) {
    const chars = [...run];
    if (mode === "char" || chars.length === 1) {
      for (const ch of chars) if (isHan(ch)) add(ch);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i++) add(chars[i] + chars[i + 1]);
  }

  const total = Array.from(map.values()).reduce((s, n) => s + n, 0);
  const limit = Math.max(1, Math.min(200, top || 30));
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([token, count]) => ({
      token,
      count,
      percent: total ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

export type TemplateSyntax = "mustache" | "dollar" | "percent";

/** 解析 key=value 行（# 开头为注释） */
export function parseVarLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1);
  }
  return out;
}

export interface TemplateResult {
  output: string;
  missing: string[];
}

/** {{key|默认}} / ${key} / %key% */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
  syntax: TemplateSyntax,
): TemplateResult {
  const missing: string[] = [];
  const re =
    syntax === "mustache"
      ? /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g
      : syntax === "dollar"
        ? /\$\{\s*([\w.]+)\s*\}/g
        : /%([\w.]+)%/g;
  const output = template.replace(re, (token, key: string, fallback?: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
    if (fallback !== undefined) return fallback;
    missing.push(key);
    return token;
  });
  return { output, missing: Array.from(new Set(missing)) };
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function isAlignRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitLoose(text: string, delimiter: string): string[][] {
  if (delimiter === "space") {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.trim().split(/\s+/));
  }
  if (delimiter === "|") {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        line
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim()),
      )
      .filter((row) => !isAlignRow(row));
  }
  const sep = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  if (sep === "space" || sep === "|") return splitLoose(text, sep);
  return parseDelimited(text, sep);
}

/** 根据首行猜测分隔符 */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  if (first.includes("\t")) return "\t";
  if ((first.match(/\|/g) ?? []).length >= 2) return "|";
  if (first.includes(",")) return ",";
  if (first.includes(";")) return ";";
  if (/\s{2,}/.test(first) || first.trim().includes(" ")) return "space";
  return ",";
}

/** 分隔文本 → Markdown 表格。数字列右对齐 */
export function toMarkdownTable(text: string, delimiter = "auto"): string {
  const rows = splitLoose(text, delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const grid = rows.map((row) => Array.from({ length: width }, (_, i) => escapeMdCell(row[i] ?? "")));
  const align = grid[0].map((_, col) => {
    const body = grid.slice(1).map((row) => row[col].trim()).filter(Boolean);
    const numeric = body.length > 0 && body.every((cell) => /^-?\d+(\.\d+)?$/.test(cell));
    return numeric ? "---:" : "---";
  });
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(grid[0]), line(align), ...grid.slice(1).map(line)].join("\n");
}

/** Markdown 表格 → TSV（丢掉对齐行） */
export function markdownTableToTsv(markdown: string): string {
  const rows = splitLoose(markdown, "|");
  return rows.map((row) => row.join("\t")).join("\n");
}

export type CaseStyle = "upper" | "lower" | "title" | "sentence" | "toggle";

/** 自然语言大小写。只改变拉丁字母 */
export function convertCase(text: string, style: CaseStyle): string {
  if (style === "upper") return text.toUpperCase();
  if (style === "lower") return text.toLowerCase();
  if (style === "toggle") {
    return [...text]
      .map((ch) => {
        if (ch.toLowerCase() === ch.toUpperCase()) return ch;
        return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
      })
      .join("");
  }
  if (style === "title") {
    return text
      .toLowerCase()
      .replace(/(^|[\s\-_/])([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
  }
  return text
    .toLowerCase()
    .replace(/(^|[.!?。！？]\s*)([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}

export interface ColumnResult {
  rows: string[][];
  columnCount: number;
  extracted: string;
  aligned: string;
  error?: string;
}

function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  return width;
}

/** 按分隔符拆列：抽出 1-based 列，或按显示宽度对齐 */
export function processColumns(text: string, delimiter: string, columnIndex: number): ColumnResult {
  const rows = splitLoose(text, delimiter);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!rows.length) return { rows, columnCount: 0, extracted: "", aligned: "" };
  if (!Number.isInteger(columnIndex) || columnIndex < 1 || columnIndex > Math.max(columnCount, 1)) {
    return {
      rows,
      columnCount,
      extracted: "",
      aligned: "",
      error: `列号需在 1 到 ${columnCount || 1} 之间`,
    };
  }
  const extracted = rows.map((row) => row[columnIndex - 1] ?? "").join("\n");
  const widths = Array.from({ length: columnCount }, (_, col) =>
    rows.reduce((max, row) => Math.max(max, displayWidth(row[col] ?? "")), 0),
  );
  const aligned = rows
    .map((row) =>
      widths
        .map((width, col) => {
          const cell = row[col] ?? "";
          return cell + " ".repeat(Math.max(0, width - displayWidth(cell)));
        })
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
  return { rows, columnCount, extracted, aligned };
}

export type MaskKind = "auto" | "phone" | "email" | "id" | "bank" | "name";

function maskMiddle(text: string, keepStart: number, keepEnd: number): string {
  const chars = [...text];
  if (chars.length <= keepStart + keepEnd) return chars[0] ? chars[0] + "*".repeat(Math.max(0, chars.length - 1)) : text;
  return chars.slice(0, keepStart).join("") + "*".repeat(chars.length - keepStart - keepEnd) + chars.slice(-keepEnd).join("");
}

export function maskPhone(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) return maskMiddle(text.trim(), 1, 1);
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function maskEmail(text: string): string {
  const match = text.trim().match(/^([^@]+)@(.+)$/);
  if (!match) return maskMiddle(text.trim(), 1, 1);
  const local = [...match[1]];
  const hidden = local.length <= 1 ? "*" : `${local[0]}${"*".repeat(Math.min(3, local.length - 1))}`;
  return `${hidden}@${match[2]}`;
}

export function maskIdCard(text: string): string {
  const raw = text.trim();
  if (raw.length >= 15) return maskMiddle(raw, 6, 4);
  return maskMiddle(raw, 2, 2);
}

export function maskBankCard(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 8) return maskMiddle(digits || text.trim(), 2, 2);
  return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
}

export function maskName(text: string): string {
  const chars = [...text.trim()];
  if (chars.length <= 1) return chars.join("");
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

function luhnOk(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  let sum = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = Number(rev[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

interface Span {
  start: number;
  end: number;
  value: string;
}

/** 在自由文本里打码手机、邮箱、身份证和通过 Luhn 的银行卡号 */
export function maskAuto(text: string): string {
  const spans: Span[] = [];
  const take = (re: RegExp, map: (raw: string) => string, accept?: (raw: string) => boolean) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (accept && !accept(m[0])) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, value: map(m[0]) });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  };
  take(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, maskEmail);
  take(/(?<!\d)[1-9]\d{16}[\dXx](?!\d)/g, maskIdCard);
  take(/(?<!\d)[1-9]\d{14}(?!\d)/g, maskIdCard);
  take(/(?<!\d)1[3-9]\d{9}(?!\d)/g, maskPhone);
  take(/(?<!\d)\d{16,19}(?!\d)/g, maskBankCard, luhnOk);

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let out = "";
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start) + span.value;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

export function maskText(text: string, kind: MaskKind): string {
  if (!text) return "";
  if (kind === "phone") return maskPhone(text);
  if (kind === "email") return maskEmail(text);
  if (kind === "id") return maskIdCard(text);
  if (kind === "bank") return maskBankCard(text);
  if (kind === "name") return maskName(text);
  return maskAuto(text);
}
