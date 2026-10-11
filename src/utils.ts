/*
 * fat-tools 核心纯函数库
 *
 * 所有工具的计算逻辑都收敛在这里（不依赖 DOM / React），
 * 便于用 vitest 做单元测试，UI 组件只负责交互与展示。
 */

import { pinyin } from "pinyin-pro";

/* ------------------------------------------------------------------ */
/* 拼音搜索匹配                                                         */
/* ------------------------------------------------------------------ */

interface PinyinKeys {
  /** 全拼（仅小写字母数字，如 "haxijisuan"） */
  full: string;
  /** 首字母（如 "hxjs"） */
  initials: string;
}

const pinyinKeysCache = new Map<string, PinyinKeys>();

/** 生成文本的拼音检索键（全拼 + 首字母，带缓存；支持中英混排） */
export function getPinyinKeys(text: string): PinyinKeys {
  const cached = pinyinKeysCache.get(text);
  if (cached) return cached;
  const clean = (arr: string[]) =>
    arr
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  let keys: PinyinKeys;
  try {
    const full = clean(
      pinyin(text, { toneType: "none", type: "array", nonZh: "consecutive" }),
    );
    const initials = clean(
      pinyin(text, {
        pattern: "first",
        toneType: "none",
        type: "array",
        nonZh: "consecutive",
      }),
    );
    keys = { full, initials };
  } catch {
    keys = { full: "", initials: "" };
  }
  pinyinKeysCache.set(text, keys);
  return keys;
}

/**
 * 拼音搜索匹配：query 可命中原文、全拼或拼音首字母。
 * 例：文本「哈希计算」可被 "hash"、"哈希"、"haxi"、"hxjs" 命中。
 */
export function matchPinyin(text: string, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return true;
  if (text.toLowerCase().includes(q)) return true;
  const keys = getPinyinKeys(text);
  return keys.full.includes(q) || keys.initials.includes(q);
}

/* ------------------------------------------------------------------ */
/* 通用字节工具                                                        */
/* ------------------------------------------------------------------ */

export function toUtf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function utf8ByteLength(str: string): number {
  return toUtf8Bytes(str).length;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 表达式计算器（递归下降解析，无 eval）                                 */
/* ------------------------------------------------------------------ */

export interface CalcOptions {
  /** 三角函数角度制：rad（默认）或 deg */
  angleMode?: "rad" | "deg";
}

type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

function normalizeAngle(x: number, opt: CalcOptions, toRad: boolean): number {
  return opt.angleMode === "deg"
    ? toRad
      ? (x * Math.PI) / 180
      : (x * 180) / Math.PI
    : x;
}

const FUNCTIONS: Record<string, (args: number[], opt: CalcOptions) => number> =
  {
    sqrt: (a) => Math.sqrt(a[0]),
    cbrt: (a) => Math.cbrt(a[0]),
    abs: (a) => Math.abs(a[0]),
    sin: (a, o) => Math.sin(normalizeAngle(a[0], o, true)),
    cos: (a, o) => Math.cos(normalizeAngle(a[0], o, true)),
    tan: (a, o) => Math.tan(normalizeAngle(a[0], o, true)),
    asin: (a, o) => normalizeAngle(Math.asin(a[0]), o, false),
    acos: (a, o) => normalizeAngle(Math.acos(a[0]), o, false),
    atan: (a, o) => normalizeAngle(Math.atan(a[0]), o, false),
    ln: (a) => Math.log(a[0]),
    log: (a) =>
      a.length > 1 ? Math.log(a[1]) / Math.log(a[0]) : Math.log10(a[0]),
    log2: (a) => Math.log2(a[0]),
    exp: (a) => Math.exp(a[0]),
    round: (a) => Math.round(a[0]),
    floor: (a) => Math.floor(a[0]),
    ceil: (a) => Math.ceil(a[0]),
    min: (a) => Math.min(...a),
    max: (a) => Math.max(...a),
    pow: (a) => Math.pow(a[0], a[1]),
  };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const rest = input.slice(i);
      const m = rest.match(
        /^(\d+(\.\d+)?([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/,
      );
      if (!m) throw new Error(`无法识别的数字（位置 ${i + 1}）`);
      const value = Number(m[0]);
      if (!Number.isFinite(value)) throw new Error(`非法数字「${m[0]}」`);
      tokens.push({ type: "num", value });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const m = input.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)!;
      tokens.push({ type: "ident", value: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ("+-*/%^".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === "," || ch === "，") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new Error(`无法识别的字符「${ch}」（位置 ${i + 1}）`);
  }
  return tokens;
}

export function evaluateExpression(
  input: string,
  options: CalcOptions = {},
): number {
  const cleaned = input
    .replace(/^\s*=\s*/, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-");
  const tokens = tokenize(cleaned);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const t = tokens[pos++];
    if (!t) throw new Error("表达式不完整");
    return t;
  };

  const parseExpression = (): number => {
    let left = parseTerm();
    while (true) {
      const t = peek();
      if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
        next();
        const right = parseTerm();
        left = t.value === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  };

  const startsValue = (t?: Token): boolean =>
    !!t && (t.type === "num" || t.type === "ident" || t.type === "lparen");

  const parseTerm = (): number => {
    let left = parseUnary();
    while (true) {
      const t = peek();
      if (t && t.type === "op" && ["*", "/", "%"].includes(t.value)) {
        next();
        const right = parseUnary();
        if ((t.value === "/" || t.value === "%") && right === 0)
          throw new Error("除数不能为 0");
        left =
          t.value === "*"
            ? left * right
            : t.value === "/"
              ? left / right
              : left % right;
      } else if (startsValue(t)) {
        // 隐式乘法：2pi、2(3+4)、(1+2)(3+4)
        const right = parseUnary();
        left = left * right;
      } else break;
    }
    return left;
  };

  const parseUnary = (): number => {
    const t = peek();
    if (t && t.type === "op" && (t.value === "-" || t.value === "+")) {
      next();
      const v = parseUnary();
      return t.value === "-" ? -v : v;
    }
    return parsePower();
  };

  const parsePower = (): number => {
    const base = parsePrimary();
    const t = peek();
    if (t && t.type === "op" && t.value === "^") {
      next();
      const exp = parseUnary(); // 右结合
      return Math.pow(base, exp);
    }
    return base;
  };

  const parsePrimary = (): number => {
    const t = next();
    if (t.type === "num") return t.value;
    if (t.type === "lparen") {
      const v = parseExpression();
      const close = next();
      if (close.type !== "rparen") throw new Error("括号不匹配");
      return v;
    }
    if (t.type === "ident") {
      const name = t.value;
      const p = peek();
      if (p && p.type === "lparen") {
        next();
        const args: number[] = [];
        if (peek()?.type !== "rparen") {
          args.push(parseExpression());
          while (peek()?.type === "comma") {
            next();
            args.push(parseExpression());
          }
        }
        const close = next();
        if (close.type !== "rparen") throw new Error("括号不匹配");
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`未知函数「${name}」`);
        return fn(args, options);
      }
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new Error(`未知标识符「${name}」`);
    }
    throw new Error("表达式不完整");
  };

  const result = parseExpression();
  if (pos < tokens.length) throw new Error("表达式存在多余内容");
  if (!Number.isFinite(result)) throw new Error("结果不是有限数");
  return result;
}

/* ------------------------------------------------------------------ */
/* 行级文本对比（LCS）                                                  */
/* ------------------------------------------------------------------ */

export interface DiffLine {
  type: "same" | "del" | "add";
  /** 原文行号（del/same 时有值，从 1 开始） */
  aNo?: number;
  /** 目标行号（add/same 时有值，从 1 开始） */
  bNo?: number;
  text: string;
}

export interface DiffRow {
  type: "same" | "change" | "del" | "add";
  left?: { no: number; text: string };
  right?: { no: number; text: string };
}

const DIFF_MAX_LINES = 2000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** LCS 行级 diff，返回统一的操作序列 */
export function lineDiff(aText: string, bText: string): DiffLine[] {
  const a = splitLines(aText);
  const b = splitLines(bText);
  if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) {
    const result: DiffLine[] = [];
    a.forEach((text, idx) => result.push({ type: "del", aNo: idx + 1, text }));
    b.forEach((text, idx) => result.push({ type: "add", bNo: idx + 1, text }));
    return result;
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const ops: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let aNo = 1;
  let bNo = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", aNo, bNo, text: a[i] });
      i++;
      j++;
      aNo++;
      bNo++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: "del", aNo, text: a[i] });
      i++;
      aNo++;
    } else {
      ops.push({ type: "add", bNo, text: b[j] });
      j++;
      bNo++;
    }
  }
  while (i < n) ops.push({ type: "del", aNo: aNo++, text: a[i++] });
  while (j < m) ops.push({ type: "add", bNo: bNo++, text: b[j++] });
  return ops;
}

/** 将统一 diff 序列转换为左右对照行 */
export function diffToRows(ops: DiffLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.type === "same") {
      rows.push({
        type: "same",
        left: { no: op.aNo!, text: op.text },
        right: { no: op.bNo!, text: op.text },
      });
      k++;
      continue;
    }
    if (op.type === "del") {
      const dels: DiffLine[] = [];
      while (k < ops.length && ops[k].type === "del") dels.push(ops[k++]);
      const adds: DiffLine[] = [];
      while (k < ops.length && ops[k].type === "add") adds.push(ops[k++]);
      const max = Math.max(dels.length, adds.length);
      for (let r = 0; r < max; r++) {
        const d = dels[r];
        const a = adds[r];
        if (d && a) {
          rows.push({
            type: "change",
            left: { no: d.aNo!, text: d.text },
            right: { no: a.bNo!, text: a.text },
          });
        } else if (d) {
          rows.push({ type: "del", left: { no: d.aNo!, text: d.text } });
        } else if (a) {
          rows.push({ type: "add", right: { no: a.bNo!, text: a.text } });
        }
      }
      continue;
    }
    // 独立的 add（前面没有 del）
    rows.push({ type: "add", right: { no: op.bNo!, text: op.text } });
    k++;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* 字数统计                                                            */
/* ------------------------------------------------------------------ */

export interface TextStats {
  chars: number;
  charsNoSpaces: number;
  cjkChars: number;
  latinWords: number;
  words: number;
  lines: number;
  nonEmptyLines: number;
  paragraphs: number;
  bytes: number;
}

export function countTextStats(text: string): TextStats {
  const chars = [...text].length; // 按 Unicode 码点统计
  const charsNoSpaces = [...text.replace(/\s/g, "")].length;
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  const cjkChars = cjkMatches ? cjkMatches.length : 0;
  const latinMatches = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
  const latinWords = latinMatches ? latinMatches.length : 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized === "" ? 0 : normalized.split("\n").length;
  const nonEmptyLines = normalized
    .split("\n")
    .filter((l) => l.trim() !== "").length;
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "").length;
  return {
    chars,
    charsNoSpaces,
    cjkChars,
    latinWords,
    words: cjkChars + latinWords,
    lines,
    nonEmptyLines,
    paragraphs,
    bytes: utf8ByteLength(text),
  };
}

/* ------------------------------------------------------------------ */
/* Base64 / URL 编解码（UTF-8 安全）                                    */
/* ------------------------------------------------------------------ */

export function base64Encode(input: string): string {
  const bytes = toUtf8Bytes(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64Decode(input: string): string {
  const bin = atob(input.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ */
/* UUID v4                                                             */
/* ------------------------------------------------------------------ */

export function uuidV4(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = bytesToHex(bytes);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ------------------------------------------------------------------ */
/* 进制转换（整数）                                                     */
/* ------------------------------------------------------------------ */

export function convertRadix(value: string, from: number, to: number): string {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^0[xbo]/, "");
  if (trimmed === "") return "";
  const sign = trimmed.startsWith("-") ? -1 : 1;
  const digits = sign === -1 ? trimmed.slice(1) : trimmed;
  const pattern =
    from <= 10
      ? new RegExp(`^[0-${from - 1}]+$`)
      : new RegExp(`^[0-9a-${String.fromCharCode(97 + from - 11)}]+$`);
  if (!pattern.test(digits)) {
    throw new Error(`「${digits}」不是有效的 ${from} 进制整数`);
  }
  const num = parseInt(digits, from);
  if (!Number.isSafeInteger(num))
    throw new Error("数值超出安全整数范围（2^53-1）");
  return (sign === -1 ? "-" : "") + num.toString(to);
}

/* ------------------------------------------------------------------ */
/* 颜色转换                                                            */
/* ------------------------------------------------------------------ */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function parseHexColor(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h))
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  else if (/^[0-9a-fA-F]{8}$/.test(h)) h = h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(h))
    throw new Error("无效的 HEX 颜色，示例：#1E90FF 或 1e90ff");
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

/* ------------------------------------------------------------------ */
/* 命名风格转换                                                         */
/* ------------------------------------------------------------------ */

export type NamingStyle =
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "title"
  | "sentence"
  | "dot"
  | "path"
  | "upper"
  | "lower";

/** 把任意命名 / 句子拆成单词序列（支持 camelCase / snake_case / kebab-case / 空格） */
export function splitWords(input: string): string[] {
  if (!input) return [];
  const withBoundaries = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return withBoundaries
    .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
    .filter((w) => w.length > 0);
}

function capitalizeWord(w: string): string {
  if (!w) return w;
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

export function convertNaming(input: string, style: NamingStyle): string {
  const words = splitWords(input);
  if (words.length === 0) return "";
  switch (style) {
    case "camel":
      return (
        words[0].toLowerCase() + words.slice(1).map(capitalizeWord).join("")
      );
    case "pascal":
      return words.map(capitalizeWord).join("");
    case "snake":
      return words.map((w) => w.toLowerCase()).join("_");
    case "kebab":
      return words.map((w) => w.toLowerCase()).join("-");
    case "constant":
      return words.map((w) => w.toUpperCase()).join("_");
    case "title":
      return words.map(capitalizeWord).join(" ");
    case "sentence":
      return words
        .map((w) => w.toLowerCase())
        .join(" ")
        .replace(/^[a-z]/, (c) => c.toUpperCase());
    case "dot":
      return words.map((w) => w.toLowerCase()).join(".");
    case "path":
      return words.map((w) => w.toLowerCase()).join("/");
    case "upper":
      return words.map((w) => w.toUpperCase()).join("");
    case "lower":
      return words.map((w) => w.toLowerCase()).join("");
    default:
      return input;
  }
}

export const NAMING_STYLES: { style: NamingStyle; label: string }[] = [
  { style: "camel", label: "camelCase" },
  { style: "pascal", label: "PascalCase" },
  { style: "snake", label: "snake_case" },
  { style: "kebab", label: "kebab-case" },
  { style: "constant", label: "CONSTANT_CASE" },
  { style: "title", label: "Title Case" },
  { style: "sentence", label: "Sentence case" },
  { style: "dot", label: "dot.case" },
  { style: "path", label: "path/case" },
  { style: "upper", label: "UPPERCASE" },
  { style: "lower", label: "lowercase" },
];

/* ------------------------------------------------------------------ */
/* 行处理（排序 / 去重 / 过滤 …）                                       */
/* ------------------------------------------------------------------ */

export type LineSortMode =
  | "none"
  | "asc"
  | "desc"
  | "natural"
  | "length-asc"
  | "length-desc"
  | "shuffle";

export interface LinesOptions {
  trim: boolean;
  removeEmpty: boolean;
  dedupe: boolean;
  caseInsensitive: boolean;
  sort: LineSortMode;
  reverse: boolean;
  number: boolean;
  numberStart: number;
  filter: string;
  filterMode: "contains" | "not-contains";
}

export const DEFAULT_LINES_OPTIONS: LinesOptions = {
  trim: false,
  removeEmpty: false,
  dedupe: false,
  caseInsensitive: false,
  sort: "none",
  reverse: false,
  number: false,
  numberStart: 1,
  filter: "",
  filterMode: "contains",
};

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function processLines(text: string, opt: LinesOptions): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let lines = normalized === "" ? [] : normalized.split("\n");

  if (opt.trim) lines = lines.map((l) => l.trim());

  if (opt.filter !== "") {
    const needle = opt.caseInsensitive ? opt.filter.toLowerCase() : opt.filter;
    lines = lines.filter((l) => {
      const hay = opt.caseInsensitive ? l.toLowerCase() : l;
      const has = hay.includes(needle);
      return opt.filterMode === "contains" ? has : !has;
    });
  }

  if (opt.removeEmpty) lines = lines.filter((l) => l !== "");

  if (opt.dedupe) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const key = opt.caseInsensitive ? l.toLowerCase() : l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const collator = new Intl.Collator(undefined, {
    numeric: opt.sort === "natural",
    sensitivity: opt.caseInsensitive ? "base" : "variant",
  });
  switch (opt.sort) {
    case "asc":
      lines = [...lines].sort((a, b) => collator.compare(a, b));
      break;
    case "desc":
      lines = [...lines].sort((a, b) => collator.compare(b, a));
      break;
    case "natural":
      lines = [...lines].sort((a, b) => collator.compare(a, b));
      break;
    case "length-asc":
      lines = [...lines].sort((a, b) => a.length - b.length);
      break;
    case "length-desc":
      lines = [...lines].sort((a, b) => b.length - a.length);
      break;
    case "shuffle":
      lines = shuffleArray(lines);
      break;
    default:
      break;
  }

  if (opt.reverse) lines = [...lines].reverse();

  if (opt.number) {
    const width = String(
      opt.numberStart + Math.max(0, lines.length - 1),
    ).length;
    lines = lines.map(
      (l, i) => `${String(opt.numberStart + i).padStart(width, "0")}. ${l}`,
    );
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* 单位换算                                                            */
/* ------------------------------------------------------------------ */

export interface UnitDef {
  id: string;
  name: string;
  /** 相对基准单位的倍率 */
  factor: number;
}

export interface UnitCategory {
  id: string;
  name: string;
  temperature?: boolean;
  units: UnitDef[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "length",
    name: "长度",
    units: [
      { id: "mm", name: "毫米 mm", factor: 0.001 },
      { id: "cm", name: "厘米 cm", factor: 0.01 },
      { id: "m", name: "米 m", factor: 1 },
      { id: "km", name: "千米 km", factor: 1000 },
      { id: "in", name: "英寸 in", factor: 0.0254 },
      { id: "ft", name: "英尺 ft", factor: 0.3048 },
      { id: "yd", name: "码 yd", factor: 0.9144 },
      { id: "mi", name: "英里 mi", factor: 1609.344 },
      { id: "nmi", name: "海里 nmi", factor: 1852 },
    ],
  },
  {
    id: "area",
    name: "面积",
    units: [
      { id: "mm2", name: "平方毫米 mm²", factor: 0.000001 },
      { id: "cm2", name: "平方厘米 cm²", factor: 0.0001 },
      { id: "m2", name: "平方米 m²", factor: 1 },
      { id: "km2", name: "平方千米 km²", factor: 1000000 },
      { id: "ha", name: "公顷 ha", factor: 10000 },
      { id: "mu", name: "亩", factor: 2000 / 3 },
      { id: "acre", name: "英亩 acre", factor: 4046.8564224 },
      { id: "ft2", name: "平方英尺 ft²", factor: 0.09290304 },
    ],
  },
  {
    id: "mass",
    name: "质量",
    units: [
      { id: "mg", name: "毫克 mg", factor: 0.000001 },
      { id: "g", name: "克 g", factor: 0.001 },
      { id: "kg", name: "千克 kg", factor: 1 },
      { id: "t", name: "吨 t", factor: 1000 },
      { id: "jin", name: "斤", factor: 0.5 },
      { id: "liang", name: "两", factor: 0.05 },
      { id: "lb", name: "磅 lb", factor: 0.45359237 },
      { id: "oz", name: "盎司 oz", factor: 0.028349523125 },
    ],
  },
  {
    id: "volume",
    name: "体积",
    units: [
      { id: "ml", name: "毫升 mL", factor: 0.001 },
      { id: "l", name: "升 L", factor: 1 },
      { id: "cm3", name: "立方厘米 cm³", factor: 0.001 },
      { id: "m3", name: "立方米 m³", factor: 1000 },
      { id: "gal", name: "加仑 US gal", factor: 3.785411784 },
      { id: "qt", name: "夸脱 US qt", factor: 0.946352946 },
      { id: "floz", name: "液量盎司 US fl oz", factor: 0.0295735295625 },
    ],
  },
  {
    id: "data",
    name: "数据存储",
    units: [
      { id: "bit", name: "比特 bit", factor: 0.125 },
      { id: "b", name: "字节 B", factor: 1 },
      { id: "kb", name: "KB (1024B)", factor: 1024 },
      { id: "mb", name: "MB", factor: 1024 ** 2 },
      { id: "gb", name: "GB", factor: 1024 ** 3 },
      { id: "tb", name: "TB", factor: 1024 ** 4 },
    ],
  },
  {
    id: "time",
    name: "时间",
    units: [
      { id: "ms", name: "毫秒 ms", factor: 0.001 },
      { id: "s", name: "秒 s", factor: 1 },
      { id: "min", name: "分钟 min", factor: 60 },
      { id: "h", name: "小时 h", factor: 3600 },
      { id: "d", name: "天 d", factor: 86400 },
      { id: "wk", name: "周 wk", factor: 604800 },
    ],
  },
  {
    id: "speed",
    name: "速度",
    units: [
      { id: "mps", name: "米/秒 m/s", factor: 1 },
      { id: "kmh", name: "千米/时 km/h", factor: 1000 / 3600 },
      { id: "mph", name: "英里/时 mph", factor: 0.44704 },
      { id: "knot", name: "节 kn", factor: 1852 / 3600 },
    ],
  },
  {
    id: "temperature",
    name: "温度",
    temperature: true,
    units: [
      { id: "c", name: "摄氏度 °C", factor: 1 },
      { id: "f", name: "华氏度 °F", factor: 1 },
      { id: "k", name: "开尔文 K", factor: 1 },
    ],
  },
];

function convertTemperature(
  fromId: string,
  toId: string,
  value: number,
): number {
  let c: number;
  if (fromId === "c") c = value;
  else if (fromId === "f") c = ((value - 32) * 5) / 9;
  else if (fromId === "k") c = value - 273.15;
  else throw new Error(`未知温度单位：${fromId}`);
  if (toId === "c") return c;
  if (toId === "f") return (c * 9) / 5 + 32;
  if (toId === "k") return c + 273.15;
  throw new Error(`未知温度单位：${toId}`);
}

export function convertUnit(
  categoryId: string,
  fromId: string,
  toId: string,
  value: number,
): number {
  const cat = UNIT_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) throw new Error(`未知单位类别：${categoryId}`);
  if (cat.temperature) return convertTemperature(fromId, toId, value);
  const from = cat.units.find((u) => u.id === fromId);
  const to = cat.units.find((u) => u.id === toId);
  if (!from || !to) throw new Error("未知单位");
  return (value * from.factor) / to.factor;
}

/* ------------------------------------------------------------------ */
/* 随机密码生成                                                        */
/* ------------------------------------------------------------------ */

export interface PasswordOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export const PASSWORD_CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};

const AMBIGUOUS_CHARS = "Il1O0oB8S5Z2";

/** 加密安全的 [0, maxExclusive) 随机整数（带拒绝采样避免取模偏置） */
export function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    let v = 0;
    do {
      crypto.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function passwordCharsetSize(opt: PasswordOptions): number {
  let size = 0;
  if (opt.upper) size += PASSWORD_CHARSETS.upper.length;
  if (opt.lower) size += PASSWORD_CHARSETS.lower.length;
  if (opt.digits) size += PASSWORD_CHARSETS.digits.length;
  if (opt.symbols) size += PASSWORD_CHARSETS.symbols.length;
  if (opt.excludeAmbiguous) {
    for (const ch of AMBIGUOUS_CHARS) {
      if (
        (opt.upper && PASSWORD_CHARSETS.upper.includes(ch)) ||
        (opt.lower && PASSWORD_CHARSETS.lower.includes(ch)) ||
        (opt.digits && PASSWORD_CHARSETS.digits.includes(ch)) ||
        (opt.symbols && PASSWORD_CHARSETS.symbols.includes(ch))
      ) {
        size -= 1;
      }
    }
  }
  return Math.max(0, size);
}

export function generatePassword(
  opt: PasswordOptions,
  randomInt: (n: number) => number = secureRandomInt,
): string {
  let pools: string[] = [];
  if (opt.upper) pools.push(PASSWORD_CHARSETS.upper);
  if (opt.lower) pools.push(PASSWORD_CHARSETS.lower);
  if (opt.digits) pools.push(PASSWORD_CHARSETS.digits);
  if (opt.symbols) pools.push(PASSWORD_CHARSETS.symbols);
  if (opt.excludeAmbiguous) {
    pools = pools.map((p) =>
      [...p].filter((c) => !AMBIGUOUS_CHARS.includes(c)).join(""),
    );
  }
  pools = pools.filter((p) => p.length > 0);
  if (pools.length === 0) throw new Error("至少选择一种字符类型");

  const length = Math.max(1, Math.min(256, Math.floor(opt.length)));
  const all = pools.join("");
  const chars: string[] = [];
  // 保证每类至少出现一个字符
  for (const p of pools) {
    if (chars.length >= length) break;
    chars.push(p[randomInt(p.length)]);
  }
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  // Fisher-Yates 洗牌
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** 估算密码熵（比特） */
export function estimatePasswordBits(opt: PasswordOptions): number {
  const size = passwordCharsetSize(opt);
  if (size <= 1) return 0;
  return Math.round(opt.length * Math.log2(size));
}

export function passwordStrengthLabel(bits: number): {
  label: string;
  color: string;
  percent: number;
} {
  const percent = Math.max(4, Math.min(100, Math.round((bits / 128) * 100)));
  if (bits < 40) return { label: "弱", color: "#cf1322", percent };
  if (bits < 60) return { label: "一般", color: "#d48806", percent };
  if (bits < 90) return { label: "强", color: "#389e0d", percent };
  return { label: "极强", color: "#08979c", percent };
}

/* ------------------------------------------------------------------ */
/* JWT 解码                                                            */
/* ------------------------------------------------------------------ */

function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  while (s.length % 4 !== 0) s += "=";
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

/** JWT 中常见的时间戳声明（秒级 Unix 时间） */
export const JWT_TIME_CLAIMS = ["exp", "iat", "nbf", "auth_time", "updated_at"];

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split(".");
  if (parts.length < 2) {
    throw new Error("不是有效的 JWT（应形如 header.payload.signature）");
  }
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>;
  } catch {
    throw new Error("JWT header 解析失败（Base64URL 或 JSON 非法）");
  }
  try {
    payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    throw new Error("JWT payload 解析失败（Base64URL 或 JSON 非法）");
  }
  return { header, payload, signature: parts[2] || "" };
}

/* ------------------------------------------------------------------ */
/* 轻量 Markdown 渲染（自研，输出 HTML 字符串）                          */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(src: string): string {
  const codes: string[] = [];
  let out = src.replace(/`([^`]+)`/g, (_m, p1: string) => {
    codes.push(p1);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_m, alt: string, url: string) => `<img alt="${alt}" src="${url}" />`,
  );
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(
    /\u0000(\d+)\u0000/g,
    (_m, i: string) => `<code>${escapeHtml(codes[Number(i)])}</code>`,
  );
  return out;
}

/** 极简 Markdown → HTML：标题 / 粗斜体 / 行内代码 / 代码块 / 列表 / 引用 / 链接 / 图片 / 分割线 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const html: string[] = [];
  const listStack: ("ul" | "ol")[] = [];
  let i = 0;

  const closeLists = () => {
    while (listStack.length) html.push(`</${listStack.pop()}>`);
  };

  const isBlockStart = (l: string): boolean =>
    /^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      closeLists();
      const lang = fence[1];
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束围栏
      html.push(
        `<pre><code data-lang="${escapeHtml(lang)}">${escapeHtml(buf.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      closeLists();
      html.push("<hr/>");
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeLists();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(
        `<blockquote>${renderInline(buf.join("\n")).replace(/\n/g, "<br/>")}</blockquote>`,
      );
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const type: "ul" | "ol" = ul ? "ul" : "ol";
      const top = listStack[listStack.length - 1];
      if (top !== type) {
        if (top) html.push(`</${listStack.pop()}>`);
        html.push(`<${type}>`);
        listStack.push(type);
      }
      html.push(`<li>${renderInline(ul ? ul[1] : ol![1])}</li>`);
      i++;
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeLists();
      i++;
      continue;
    }

    closeLists();
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isBlockStart(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    html.push(`<p>${renderInline(buf.join("\n")).replace(/\n/g, "<br/>")}</p>`);
  }

  closeLists();
  return html.join("\n");
}

/* ------------------------------------------------------------------ */
/* 摩斯电码（国际摩尔斯电码 ITU-R M.1677-1）                            */
/* ------------------------------------------------------------------ */

export const MORSE_TABLE: Record<string, string> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "'": ".----.",
  "!": "-.-.--",
  "/": "-..-.",
  "(": "-.--.",
  ")": "-.--.-",
  "&": ".-...",
  ":": "---...",
  ";": "-.-.-.",
  "=": "-...-",
  "+": ".-.-.",
  "-": "-....-",
  _: "..--.-",
  '"': ".-..-.",
  $: "...-..-",
  "@": ".--.-.",
};

/** 电码 → 字符的反查表 */
export const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_TABLE).map(([ch, code]) => [code, ch]),
);

/** 无法转换字符的占位符 */
export const MORSE_UNKNOWN = "?";

/**
 * 文本 → 摩斯电码
 * 字母之间以单个空格分隔，单词之间以 " / " 分隔，多行输入按行处理。
 * 无法转换的字符（如中文）输出占位符 "?"，可用 unsupportedMorseChars 提示用户。
 */
export function textToMorse(text: string): string {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) =>
      line
        .trim()
        .split(/\s+/)
        .filter((w) => w !== "")
        .map((word) =>
          [...word]
            .map((ch) => MORSE_TABLE[ch.toUpperCase()] ?? MORSE_UNKNOWN)
            .join(" "),
        )
        .join(" / "),
    )
    .join("\n");
}

/**
 * 摩斯电码 → 文本
 * 单词以 " / "（或 3 个以上空格）分隔，字母以空格分隔。
 * 无法识别的电码片段输出占位符 "?"，便于定位错误。
 */
export function morseToText(morse: string): string {
  return normalizeNewlines(morse)
    .split("\n")
    .map((line) =>
      line
        .trim()
        .split(/\s*\/\s*|\s{3,}/)
        .map((word) =>
          word
            .trim()
            .split(/\s+/)
            .filter((sym) => sym !== "")
            .map((sym) => MORSE_REVERSE[sym] ?? MORSE_UNKNOWN)
            .join(""),
        )
        .join(" "),
    )
    .join("\n");
}

/** 文本中无法转成摩斯电码的字符（去重、忽略空白） */
export function unsupportedMorseChars(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (!(ch.toUpperCase() in MORSE_TABLE)) bad.add(ch);
  }
  return [...bad];
}

/** 是否只由电码符号（. - 空格 / 换行）构成 */
export function isMorseSymbols(input: string): boolean {
  return /^[.\-\s/]*$/.test(input);
}

/* ------------------------------------------------------------------ */
/* 时间计算（纯 Date 运算，不做时区转换）                                */
/* ------------------------------------------------------------------ */

export type DateUnit =
  | "year"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "millisecond";

export const DATE_UNITS: { unit: DateUnit; label: string }[] = [
  { unit: "year", label: "年" },
  { unit: "month", label: "月" },
  { unit: "week", label: "周" },
  { unit: "day", label: "天" },
  { unit: "hour", label: "小时" },
  { unit: "minute", label: "分钟" },
  { unit: "second", label: "秒" },
  { unit: "millisecond", label: "毫秒" },
];

const MS_PER_DAY = 86_400_000;

/** 统一的换行归一化（CRLF → LF） */
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface CalendarDiff {
  years: number;
  months: number;
  days: number;
  /** 方向：1 表示 to 在 from 之后，-1 表示之前，0 表示同一时刻 */
  sign: -1 | 0 | 1;
}

/**
 * 自然年月日差值（日历口径）。
 * 例：2026-01-31 → 2026-03-01 结果为 0 年 1 月 1 天。
 */
export function calendarDiff(from: Date, to: Date): CalendarDiff {
  const diff = to.getTime() - from.getTime();
  const sign: -1 | 0 | 1 = diff === 0 ? 0 : diff > 0 ? 1 : -1;
  const start = sign >= 0 ? from : to;
  const end = sign >= 0 ? to : from;

  // 先按月逼近：取最大的 m，使 start + m 个月 ≤ end（月末夹取，故可能回退一步）
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (months < 0) months = 0;
  let anchor = addToDate(start, months, "month");
  while (months > 0 && anchor.getTime() > end.getTime()) {
    months -= 1;
    anchor = addToDate(start, months, "month");
  }
  // 剩余不足一个月的部分按整天计
  const days = Math.max(
    0,
    Math.floor((end.getTime() - anchor.getTime()) / MS_PER_DAY),
  );
  return { years: Math.floor(months / 12), months: months % 12, days, sign };
}

export interface TimeDiff {
  /** 有符号毫秒差（to - from） */
  milliseconds: number;
  /** 是否过去（to 早于 from） */
  negative: boolean;
  /** 绝对值拆分：天 / 小时 / 分钟 / 秒 */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 总计（可取小数） */
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  /** 总秒数（向下取整） */
  totalSeconds: number;
  /** 自然年月日口径 */
  calendar: CalendarDiff;
  /** 区间内的工作日数（周一至周五，含首尾） */
  businessDays: number;
  /** 周末天数（含首尾） */
  weekendDays: number;
}

/** 两个时刻的差值（绝对值拆分 + 总计 + 自然年月日 + 工作日） */
export function timeDiff(from: Date, to: Date): TimeDiff {
  const milliseconds = to.getTime() - from.getTime();
  const abs = Math.abs(milliseconds);
  return {
    milliseconds,
    negative: milliseconds < 0,
    days: Math.floor(abs / MS_PER_DAY),
    hours: Math.floor((abs % MS_PER_DAY) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
    totalDays: abs / MS_PER_DAY,
    totalHours: abs / 3_600_000,
    totalMinutes: abs / 60_000,
    totalSeconds: Math.floor(abs / 1000),
    calendar: calendarDiff(from, to),
    businessDays: countBusinessDays(from, to),
    weekendDays: countWeekendDays(from, to),
  };
}

/** 把日期归一到当天 00:00（本地时区） */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 区间 [from, to] 内的自然天数（含首尾，至少 1） */
function inclusiveDayCount(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.floor(Math.abs(b - a) / MS_PER_DAY) + 1;
}

/** 区间内工作日天数（周一至周五，按自然日计，含首尾） */
export function countBusinessDays(from: Date, to: Date): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  const total = inclusiveDayCount(from, to);
  const fullWeeks = Math.floor(total / 7);
  let count = fullWeeks * 5;
  const startDow = (b.getTime() >= a.getTime() ? a : b).getDay();
  for (let i = 0; i < total % 7; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** 区间内周末天数（周六 / 周日，按自然日计，含首尾） */
export function countWeekendDays(from: Date, to: Date): number {
  return inclusiveDayCount(from, to) - countBusinessDays(from, to);
}

/**
 * 日期偏移：在基准时刻上加减指定单位的数量。
 * 年 / 月采用「月末夹取」策略（1 月 31 日 + 1 月 = 2 月 28/29 日），
 * 其余单位按固定毫秒 / 日历天推进。
 */
export function addToDate(base: Date, amount: number, unit: DateUnit): Date {
  const d = new Date(base.getTime());
  if (!Number.isFinite(amount)) return d;
  switch (unit) {
    case "year":
      d.setFullYear(d.getFullYear() + amount);
      break;
    case "month": {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + amount);
      // 目标月份的最后一天，避免 JS setMonth 溢出到下个月
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
      break;
    }
    case "week":
      d.setDate(d.getDate() + amount * 7);
      break;
    case "day":
      d.setDate(d.getDate() + amount);
      break;
    case "hour":
      d.setHours(d.getHours() + amount);
      break;
    case "minute":
      d.setMinutes(d.getMinutes() + amount);
      break;
    case "second":
      d.setSeconds(d.getSeconds() + amount);
      break;
    case "millisecond":
      d.setMilliseconds(d.getMilliseconds() + amount);
      break;
    default:
      break;
  }
  return d;
}

/** 毫秒 → 「x 天 y 小时 z 分钟 w 秒」可读文案 */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / MS_PER_DAY);
  const hours = Math.floor((abs % MS_PER_DAY) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const parts: string[] = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes) parts.push(`${minutes} 分钟`);
  if (seconds || parts.length === 0) parts.push(`${seconds} 秒`);
  return parts.join(" ");
}

/** 解析「YYYY-MM-DD」「YYYY-MM-DD HH:mm(:ss)」以及带 T / / 的常见写法，失败返回 null */
export function parseDateTime(input: string): Date | null {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** 日期 → 「YYYY-MM-DD HH:mm:ss」（本地时区） */
export function formatDateTime(d: Date): string {
  const p = (n: number, len = 2): string => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 日期 → 「YYYY-MM-DD」（本地时区） */
export function formatDate(d: Date): string {
  return formatDateTime(d).slice(0, 10);
}

/** 星期文案 */
export function weekdayLabel(d: Date): string {
  return `星期${"日一二三四五六"[d.getDay()]}`;
}

/* ------------------------------------------------------------------ */
/* 条形码（Code 128）                                                  */
/* ------------------------------------------------------------------ */

/**
 * Code 128 编码表（CODE128 code-set B，值 0..106）。
 * 索引 = Code128 值；每一项是 6 位「条空」模块宽度串（以条开头）。
 * 起点符 B = 104，校验位 = (104 + Σ(i * value_i)) % 103，终点符 106。
 */
const CODE128_PATTERNS: string[] = [
  "11011001100",
  "11001101100",
  "11001100110",
  "10010011000",
  "10010001100",
  "10001001100",
  "10011001000",
  "10011000100",
  "10001100100",
  "11001001000",
  "11001000100",
  "11000100100",
  "10110011100",
  "10011011100",
  "10011001110",
  "10111001100",
  "10011101100",
  "10011100110",
  "11001110010",
  "11001011100",
  "11001001110",
  "11011100100",
  "11001110100",
  "11101101110",
  "11101001100",
  "11100101100",
  "11100100110",
  "11101100100",
  "11100110100",
  "11100110010",
  "11011011000",
  "11011000110",
  "11000110110",
  "10100011000",
  "10001011000",
  "10001000110",
  "10110001000",
  "10001101000",
  "10001100010",
  "11010001000",
  "11000101000",
  "11000100010",
  "10110111000",
  "10110001110",
  "10001101110",
  "10111011000",
  "10111000110",
  "10001110110",
  "11101110110",
  "11010001110",
  "11000101110",
  "11011101000",
  "11011100010",
  "11011101110",
  "11101011000",
  "11101000110",
  "11100010110",
  "11101101000",
  "11101100010",
  "11100011010",
  "11101111010",
  "11001000010",
  "11110001010",
  "10100110000",
  "10100001100",
  "10010110000",
  "10010000110",
  "10000101100",
  "10000100110",
  "10110010000",
  "10110000100",
  "10011010000",
  "10011000010",
  "10000110100",
  "10000110010",
  "11000010010",
  "11001010000",
  "11110111010",
  "11000010100",
  "10001111010",
  "10100111100",
  "10010111100",
  "10010011110",
  "10111100100",
  "10011110100",
  "10011110010",
  "11110100100",
  "11110010100",
  "11110010010",
  "11011011110",
  "11011110110",
  "11110110110",
  "10101111000",
  "10100011110",
  "10001011110",
  "10111101000",
  "10111100010",
  "11110101000",
  "11110100010",
  "10111011110",
  "10111101110",
  "11101011110",
  "11110101110",
  "11010000100",
  "11010010000",
  "11010011100",
  "1100011101011",
];

export interface BarcodeResult {
  /** 条空模块宽度序列（以条开始，交替条/空） */
  modules: string;
  /** 二进制位串，可直接绘制 */
  bits: string;
  /** 编码后的值序列（含起止符与校验位） */
  codes: number[];
  /** 是否是可被 Code128 编码的字符 */
  valid: boolean;
}

/** 字符串 → Code128（code-set B）编码结果 */
export function encodeCode128(text: string): BarcodeResult {
  const codes: number[] = [104]; // Start B
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      return { modules: "", bits: "", codes: [], valid: false };
    }
    codes.push(code - 32);
  }
  let checksum = 0;
  for (let i = 0; i < codes.length; i++)
    checksum += codes[i] * (i === 0 ? 1 : i);
  codes.push(checksum % 103);
  codes.push(106); // Stop

  let bits = "";
  for (const c of codes) bits += CODE128_PATTERNS[c];
  return { modules: bits, bits, codes, valid: true };
}

/* ------------------------------------------------------------------ */
/* 随机字符串生成                                                       */
/* ------------------------------------------------------------------ */

/** 随机字符串用常用汉字字符集（CJK 统一表意文字前 1000 个，覆盖大量常用字） */
export const CJK_CHARS = Array.from({ length: 1000 }, (_, i) =>
  String.fromCodePoint(0x4e00 + i),
).join("");

export const RANDOM_CHARSETS = {
  digits: "0123456789",
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
  cjk: CJK_CHARS,
} as const;

export type RandomCharClass = keyof typeof RANDOM_CHARSETS;

export interface RandomStringOptions {
  length: number;
  classes: RandomCharClass[];
  excludeSimilar: boolean;
  custom: string;
  prefix: string;
  suffix: string;
}

const SIMILAR_CHARS = "Il1O0oiB8S5Z2";

/** 从字符集生成随机字符串（加密安全；去重时保证不重复） */
export function generateRandomString(
  opt: RandomStringOptions,
  randomInt: (n: number) => number = secureRandomInt,
): string {
  let pool =
    opt.classes.map((c) => RANDOM_CHARSETS[c] ?? "").join("") + opt.custom;
  pool = [...new Set(pool)].join("");
  if (opt.excludeSimilar)
    pool = [...pool].filter((c) => !SIMILAR_CHARS.includes(c)).join("");
  if (!pool) throw new Error("可用字符集为空，请至少选择一种字符类型");
  const length = Math.max(0, Math.min(4096, Math.floor(opt.length)));
  let body = "";
  for (let i = 0; i < length; i++) body += pool[randomInt(pool.length)];
  return `${opt.prefix}${body}${opt.suffix}`;
}

/** 批量生成随机字符串（unique=true 时确保互不相同，上限为字符集组合数） */
export function generateRandomStrings(
  opt: RandomStringOptions,
  count: number,
  unique = false,
  randomInt: (n: number) => number = secureRandomInt,
): string[] {
  const n = Math.max(1, Math.min(1000, Math.floor(count)));
  if (!unique)
    return Array.from({ length: n }, () =>
      generateRandomString(opt, randomInt),
    );
  const seen = new Set<string>();
  const out: string[] = [];
  let guard = n * 50 + 1000;
  while (out.length < n && guard-- > 0) {
    const s = generateRandomString(opt, randomInt);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (out.length < n)
    throw new Error("去重模式下可用组合不足，已生成 " + out.length + " 条");
  return out;
}

/* ------------------------------------------------------------------ */
/* 亲属关系图谱 / 中文称谓计算                                           */
/* ------------------------------------------------------------------ */

/**
 * 亲属关系用「一步关系」序列表示（从「自己」出发的路径）。
 * 例：父亲的母亲 = ["father", "mother"]；妻子的哥哥 = ["wife", "elderBrother"]。
 * 称谓推导按序列逐级归一化（见 resolveKinship）。
 */
export type KinStep =
  | "father"
  | "mother"
  | "husband"
  | "wife"
  | "son"
  | "daughter"
  | "elderBrother"
  | "youngerBrother"
  | "elderSister"
  | "youngerSister";

export interface KinStepDef {
  step: KinStep;
  label: string;
  /** 反向一步关系（用于图谱双向连边） */
  inverse: KinStep;
  /** 是否同性（用于判断能否作为丈夫/妻子等） */
  gender: "male" | "female";
  /** 该关系在称谓链中的「代际」变化：+1 长辈，-1 晚辈 */
  generation: 1 | -1 | 0;
}

export const KIN_STEPS: KinStepDef[] = [
  {
    step: "father",
    label: "父亲",
    inverse: "son",
    gender: "male",
    generation: 1,
  },
  {
    step: "mother",
    label: "母亲",
    inverse: "daughter",
    gender: "female",
    generation: 1,
  },
  {
    step: "husband",
    label: "丈夫",
    inverse: "wife",
    gender: "male",
    generation: 0,
  },
  {
    step: "wife",
    label: "妻子",
    inverse: "husband",
    gender: "female",
    generation: 0,
  },
  {
    step: "son",
    label: "儿子",
    inverse: "father",
    gender: "male",
    generation: -1,
  },
  {
    step: "daughter",
    label: "女儿",
    inverse: "mother",
    gender: "female",
    generation: -1,
  },
  {
    step: "elderBrother",
    label: "哥哥",
    inverse: "youngerBrother",
    gender: "male",
    generation: 0,
  },
  {
    step: "elderSister",
    label: "姐姐",
    inverse: "youngerSister",
    gender: "female",
    generation: 0,
  },
  {
    step: "youngerBrother",
    label: "弟弟",
    inverse: "elderBrother",
    gender: "male",
    generation: 0,
  },
  {
    step: "youngerSister",
    label: "妹妹",
    inverse: "elderSister",
    gender: "female",
    generation: 0,
  },
];

export const KIN_STEP_MAP: Record<KinStep, KinStepDef> = Object.fromEntries(
  KIN_STEPS.map((s) => [s.step, s]),
) as Record<KinStep, KinStepDef>;

/** 一步关系的展示标签（未知关系原样返回） */
export function kinStepLabel(step: string): string {
  return KIN_STEP_MAP[step as KinStep]?.label ?? step;
}

/**
 * 按「平辈排行 + 性别 + 相对年龄」归一化的一步关系。
 * 称谓只区分：父/母、夫/妻、子/女、兄/弟/姐/妹（年长/年幼 + 性别）。
 */
interface NormStep {
  /** 关系类别 */
  kind:
    | "father"
    | "mother"
    | "husband"
    | "wife"
    | "son"
    | "daughter"
    | "sibling";
  /** sibling 时：是否年长（相对当前主体） */
  older?: boolean;
  /** 当前主体性别（用于把 sibling 落到 兄/弟/姐/妹） */
  subjectGender?: "male" | "female";
}

function normalizeStep(step: KinStep): NormStep {
  switch (step) {
    case "father":
      return { kind: "father" };
    case "mother":
      return { kind: "mother" };
    case "husband":
      return { kind: "husband" };
    case "wife":
      return { kind: "wife" };
    case "son":
      return { kind: "son" };
    case "daughter":
      return { kind: "daughter" };
    case "elderBrother":
      return { kind: "sibling", older: true, subjectGender: "male" };
    case "youngerBrother":
      return { kind: "sibling", older: false, subjectGender: "male" };
    case "elderSister":
      return { kind: "sibling", older: true, subjectGender: "female" };
    case "youngerSister":
      return { kind: "sibling", older: false, subjectGender: "female" };
    default:
      return { kind: "sibling", older: true, subjectGender: "male" };
  }
}

/** 直系 / 姻亲称谓表：key = 标准化后的关系序列（逗号分隔），value = 称谓 */
const KIN_TERMS: Record<string, string> = {
  // 一族 / 祖辈
  "father,father": "爷爷",
  "father,mother": "奶奶",
  "mother,father": "外公",
  "mother,mother": "外婆",
  "father,father,father": "曾祖父",
  "father,father,mother": "曾祖母",
  "father,mother,father": "曾外祖父",
  "father,mother,mother": "曾外祖母",
  "mother,father,father": "外曾祖父",
  "mother,father,mother": "外曾祖母",
  "mother,mother,father": "外曾外祖父",
  "mother,mother,mother": "外曾外祖母",
  // 兄弟姐妹 / 堂表
  sibling: "兄弟姐妹",
  "father,sibling": "伯父/叔父/姑姑",
  "father,sibling,older,male": "伯父",
  "father,sibling,younger,male": "叔叔",
  "father,sibling,female": "姑姑",
  "mother,sibling": "舅舅/姨妈",
  "mother,sibling,male": "舅舅",
  "mother,sibling,female": "姨妈",
  "sibling,son": "侄子/外甥",
  "sibling,daughter": "侄女/外甥女",
  // 姻亲
  "wife,father": "岳父",
  "wife,mother": "岳母",
  "husband,father": "公公",
  "husband,mother": "婆婆",
  "son,wife": "儿媳",
  "daughter,husband": "女婿",
  "sibling,wife": "嫂子/弟媳",
  "sibling,husband": "姐夫/妹夫",
  "wife,sibling": "大舅子/小舅子/大姨子/小姨子",
  "husband,sibling": "大伯子/小叔子/大姑子/小姑子",
  "father,sibling,son": "堂兄弟/表兄弟",
  "father,sibling,daughter": "堂姐妹/表姐妹",
  "mother,sibling,son": "表兄弟",
  "mother,sibling,daughter": "表姐妹",
  "father,sibling,father": "伯祖父/叔祖父/姑祖父",
  "father,sibling,mother": "伯祖母/叔祖母/姑祖母",
  "mother,sibling,father": "舅祖父/姨祖父",
  "mother,sibling,mother": "舅祖母/姨祖母",
  "father,sibling,son,son": "堂侄",
  "father,sibling,daughter,daughter": "堂侄女",
  "mother,sibling,son,son": "表侄",
  "wife,sibling,son": "内侄",
  "husband,sibling,son": "夫侄",
};

/**
 * 关系序列的规范化 key：
 * - 父/母、夫/妻、子/女 保留语义
 * - 兄/弟/姐/妹 归一为 "sibling"（称谓表本身区分不了排行，故不参与 key）
 * 归一化后覆盖 1~3 步的常用称谓。
 */
function normKey(seq: KinStep[]): string {
  const parts: string[] = [];
  for (const s of seq) {
    const n = normalizeStep(s);
    parts.push(n.kind === "sibling" ? "sibling" : n.kind);
  }
  return parts.join(",");
}

/**
 * 中文称谓推导：从「自己」出发的关系序列 → 称谓。
 * 已收录常见 1~3 步称谓；未收录时给出「逐步拼接」的可读描述（如「父亲的表兄弟」）。
 */
export function resolveKinship(seq: KinStep[]): {
  term: string;
  known: boolean;
} {
  if (seq.length === 0) return { term: "自己", known: true };

  // 一步关系：直接返回关系名（父亲 / 哥哥 / 妻子…，作为「称谓」本身成立）
  if (seq.length === 1) return { term: kinStepLabel(seq[0]), known: true };

  // 完整命中
  const exact = KIN_TERMS[normKey(seq)];
  if (exact) return { term: exact, known: true };

  // 未完整命中：尝试「已收录的前缀称谓 + 剩余关系」拼接
  for (let cut = seq.length - 1; cut >= 1; cut--) {
    const prefixTerm = KIN_TERMS[normKey(seq.slice(0, cut))];
    if (prefixTerm && !prefixTerm.includes("/")) {
      const restTerm = seq
        .slice(cut)
        .map((s) => kinStepLabel(s))
        .join("的");
      return { term: `${prefixTerm}的${restTerm}`, known: false };
    }
  }

  const plain = seq.map((s) => kinStepLabel(s)).join("的");
  return { term: plain, known: false };
}

/** 关系链展示文案（如「父亲 → 母亲」） */
export function kinshipChainLabel(seq: KinStep[]): string {
  if (seq.length === 0) return "自己";
  return seq.map((s) => kinStepLabel(s)).join(" → ");
}

/**
 * 反向解析：把一条关系链取反（A 的丈夫的哥哥 ↔ 该哥哥的弟弟的丈夫的方向反转）。
 * 用于「以对方为参照」重新表述同一条关系。
 */
export function invertKinshipChain(seq: KinStep[]): KinStep[] {
  const out: KinStep[] = [];
  for (let i = seq.length - 1; i >= 0; i--) {
    out.push(KIN_STEP_MAP[seq[i]].inverse);
  }
  return out;
}

/**
 * 称谓反查：给定称谓，返回可能的关系链（用于「称谓 → 关系」的逆向查询）。
 * 仅覆盖常用单一称谓（无歧义的优先）。
 */
export function kinshipByTerm(term: string): KinStep[][] {
  const clean = term.trim().replace(/[\s　]/g, "");
  if (!clean) return [];
  const out: KinStep[][] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(KIN_TERMS)) {
    for (const candidate of value.split("/")) {
      if (candidate === clean) {
        const chain = keyToChain(key);
        const sig = chain.join(",");
        if (!seen.has(sig)) {
          seen.add(sig);
          out.push(chain);
        }
      }
    }
  }
  // 也支持直接输入一步关系（父亲 / 哥哥 / 妻子…）
  const oneStep = KIN_STEPS.find((s) => s.label === clean);
  if (oneStep && !seen.has(oneStep.step)) {
    out.push([oneStep.step]);
  }
  return out;
}

/** 规范化 key → 关系链（把合并后的 sibling 还原为具体一步关系） */
function keyToChain(key: string): KinStep[] {
  const tokens = key.split(",");
  const out: KinStep[] = [];
  for (const tk of tokens) {
    switch (tk) {
      case "father":
        out.push("father");
        break;
      case "mother":
        out.push("mother");
        break;
      case "husband":
        out.push("husband");
        break;
      case "wife":
        out.push("wife");
        break;
      case "son":
        out.push("son");
        break;
      case "daughter":
        out.push("daughter");
        break;
      case "sibling":
        out.push("elderBrother");
        break;
      default:
        break;
    }
  }
  return out;
}

/** 全部已收录称谓（含多义项拆分，供搜索提示） */
export function allKinshipTerms(): { term: string; chain: KinStep[] }[] {
  const out: { term: string; chain: KinStep[] }[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(KIN_TERMS)) {
    for (const candidate of KIN_TERMS[key].split("/")) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push({ term: candidate, chain: keyToChain(key) });
    }
  }
  out.push({ term: "自己", chain: [] });
  return out;
}

/* ------------------------------------------------------------------ */
/* 血型遗传图谱（ABO × Rh）                                             */
/* ------------------------------------------------------------------ */

/** ABO 表现型 */
export type AboPhenotype = "A" | "B" | "AB" | "O";
/** Rh 表现型 */
export type RhPhenotype = "+" | "-";
/** ABO 等位基因 */
export type AboAllele = "A" | "B" | "O";
/** Rh 等位基因 */
export type RhAllele = "D" | "d";

/** 一套血型（ABO + Rh） */
export interface BloodType {
  abo: AboPhenotype;
  rh: RhPhenotype;
}

/**
 * 基因型 = 一对等位基因（ABO 两个字母 + Rh 两个字母）。
 * 例：A 型可能的基因型 AA / AO；Rh+ 可能的 DD / Dd。
 */
export interface BloodGenotype {
  abo: [AboAllele, AboAllele];
  rh: [RhAllele, RhAllele];
}

export const ABO_PHENOTYPES: AboPhenotype[] = ["A", "B", "AB", "O"];
export const RH_PHENOTYPES: RhPhenotype[] = ["+", "-"];

/** ABO：等位基因组合 → 表现型（A/B 为共显性，O 为隐性） */
export function aboFromAlleles(a: AboAllele, b: AboAllele): AboPhenotype {
  const has = (x: AboAllele) => a === x || b === x;
  if (has("A") && has("B")) return "AB";
  if (has("A")) return "A";
  if (has("B")) return "B";
  return "O";
}

/** Rh：D 为显性（有 D 即阳性），d 为隐性 */
export function rhFromAlleles(a: RhAllele, b: RhAllele): RhPhenotype {
  return a === "D" || b === "D" ? "+" : "-";
}

/** 表现型 → 所有可能的基因型（ABO 表现型最多 2 种，Rh 最多 2 种） */
export function genotypesOfType(
  abo: AboPhenotype,
  rh: RhPhenotype,
): BloodGenotype[] {
  const aboPairs: [AboAllele, AboAllele][] = [];
  const pools: AboAllele[][] = [
    ["A", "A"],
    ["A", "O"],
    ["B", "B"],
    ["B", "O"],
    ["A", "B"],
    ["O", "O"],
  ];
  const seenAbo = new Set<string>();
  for (const [x, y] of pools) {
    if (aboFromAlleles(x, y) !== abo) continue;
    const key = [x, y].sort().join("");
    if (seenAbo.has(key)) continue;
    seenAbo.add(key);
    aboPairs.push([x, y]);
  }
  const rhPairs: [RhAllele, RhAllele][] =
    rh === "+"
      ? [
          ["D", "D"],
          ["D", "d"],
        ]
      : [["d", "d"]];
  const out: BloodGenotype[] = [];
  for (const aa of aboPairs)
    for (const rr of rhPairs) out.push({ abo: aa, rh: rr });
  return out;
}

/** 基因型 → 表现型 */
export function phenotypeOfGenotype(g: BloodGenotype): BloodType {
  return {
    abo: aboFromAlleles(g.abo[0], g.abo[1]),
    rh: rhFromAlleles(g.rh[0], g.rh[1]),
  };
}

/** 单个基因座的配子（等位基因）概率 */
function gametes<T>(pair: [T, T]): { allele: T; p: number }[] {
  const map = new Map<T, number>();
  map.set(pair[0], 0.5);
  map.set(pair[1], (map.get(pair[1]) ?? 0) + 0.5);
  return Array.from(map.entries()).map(([allele, p]) => ({ allele, p }));
}

export interface ChildTypeProbability {
  type: BloodType;
  /** 概率 0~1 */
  probability: number;
  /** 该表现型对应的基因型（去重后，如 A 型可能是 AA/AO） */
  genotypes: BloodGenotype[];
}

export interface InheritanceResult {
  /** 按概率降序的子女血型分布 */
  children: ChildTypeProbability[];
  /** 父母的可能基因型（表现型未知时存在多种） */
  fatherGenotypes: BloodGenotype[];
  motherGenotypes: BloodGenotype[];
}

const ABO_IDX: Record<AboPhenotype, number> = { A: 0, B: 1, AB: 2, O: 3 };
const RH_IDX: Record<RhPhenotype, number> = { "+": 0, "-": 1 };

function typeKey(t: BloodType): string {
  return `${t.abo}${t.rh}`;
}

/**
 * 双亲血型 → 子女血型概率分布（ABO 与 Rh 独立遗传，概率相乘）。
 * 若父母表现型对应多种基因型，按各基因型等概率加权（人群基因型未知时的标准简化假设）。
 */
export function childBloodTypes(
  father: BloodType,
  mother: BloodType,
): InheritanceResult {
  const fGenos = genotypesOfType(father.abo, father.rh);
  const mGenos = genotypesOfType(mother.abo, mother.rh);

  // acc[aboTarget][rhTarget] = 概率
  const acc: number[][] = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const genoMap = new Map<string, Set<string>>();

  const w = 1 / (fGenos.length * mGenos.length);
  for (const fg of fGenos) {
    for (const mg of mGenos) {
      // ABO
      for (const ga of gametes(fg.abo)) {
        for (const gb of gametes(mg.abo)) {
          const abo = aboFromAlleles(ga.allele, gb.allele);
          // Rh
          for (const ra of gametes(fg.rh)) {
            for (const rb of gametes(mg.rh)) {
              const rh = rhFromAlleles(ra.allele, rb.allele);
              const p = w * ga.p * gb.p * ra.p * rb.p;
              acc[ABO_IDX[abo]][RH_IDX[rh]] += p;
              const key = typeKey({ abo, rh });
              if (!genoMap.has(key)) genoMap.set(key, new Set());
              genoMap
                .get(key)!
                .add(
                  [...fg.abo].sort().join("") +
                    "/" +
                    [...mg.abo].sort().join("") +
                    "·" +
                    [...fg.rh].sort().join("") +
                    [...mg.rh].sort().join(""),
                );
            }
          }
        }
      }
    }
  }

  const children: ChildTypeProbability[] = [];
  ABO_PHENOTYPES.forEach((abo, ai) => {
    RH_PHENOTYPES.forEach((rh, ri) => {
      const p = acc[ai][ri];
      if (p <= 1e-9) return;
      children.push({
        type: { abo, rh },
        probability: p,
        genotypes: genotypesOfType(abo, rh),
      });
    });
  });
  children.sort((a, b) => b.probability - a.probability);

  return { children, fatherGenotypes: fGenos, motherGenotypes: mGenos };
}

/**
 * 亲子反推：已知孩子血型与一方家长血型，求另一方家长可能的血型。
 * 返回每一项为该血型 + 其作为家长时生育该孩子的概率（在所有可行基因型下的加权）。
 */
export function possibleParentTypes(
  child: BloodType,
  knownParent: BloodType,
): { type: BloodType; probability: number }[] {
  const out: { type: BloodType; probability: number }[] = [];
  for (const abo of ABO_PHENOTYPES) {
    for (const rh of RH_PHENOTYPES) {
      const candidate: BloodType = { abo, rh };
      const r = childBloodTypes(candidate, knownParent);
      const hit = r.children.find(
        (c) => c.type.abo === child.abo && c.type.rh === child.rh,
      );
      if (hit && hit.probability > 1e-9) {
        out.push({ type: candidate, probability: hit.probability });
      }
    }
  }
  out.sort((a, b) => b.probability - a.probability);
  return out;
}

/** 两个血型能否构成亲子关系（孩子血型是否可能出生于这对家长） */
export function canBeParents(
  father: BloodType,
  mother: BloodType,
  child: BloodType,
): boolean {
  const r = childBloodTypes(father, mother);
  return r.children.some(
    (c) =>
      c.type.abo === child.abo &&
      c.type.rh === child.rh &&
      c.probability > 1e-9,
  );
}

/** 血型展示文案（如 "A+" / "AB-"） */
export function bloodTypeLabel(t: BloodType): string {
  return `${t.abo}${t.rh}`;
}

/** 血型兼容性（受血者 ← 供血者，ABO + Rh 简化口径） */
export interface BloodCompatibility {
  donateTo: BloodType[];
  receiveFrom: BloodType[];
}

export function bloodCompatibility(t: BloodType): BloodCompatibility {
  const aboDonate: Record<AboPhenotype, AboPhenotype[]> = {
    O: ["A", "B", "AB", "O"],
    A: ["A", "AB"],
    B: ["B", "AB"],
    AB: ["AB"],
  };
  // 受者只能接受：自身 ABO 抗原不冲突的血型
  const aboReceive: Record<AboPhenotype, AboPhenotype[]> = {
    O: ["O"],
    A: ["A", "O"],
    B: ["B", "O"],
    AB: ["A", "B", "AB", "O"],
  };
  // 供血者：Rh- 的红细胞不含 D 抗原，可给 Rh+ / Rh-；Rh+ 只能给 Rh+
  const rhDonate: RhPhenotype[] = t.rh === "-" ? ["+", "-"] : ["+"];
  // 受血者：Rh+ 体内无抗 D，可接受 Rh+ / Rh-；Rh- 只能接受 Rh-
  const rhReceive: RhPhenotype[] = t.rh === "+" ? ["+", "-"] : ["-"];

  const donateTo: BloodType[] = [];
  for (const abo of aboDonate[t.abo])
    for (const rh of rhDonate) donateTo.push({ abo, rh });

  const receiveFrom: BloodType[] = [];
  for (const abo of aboReceive[t.abo])
    for (const rh of rhReceive) receiveFrom.push({ abo, rh });

  return { donateTo, receiveFrom };
}

/* ------------------------------------------------------------------ */
/* 汇率换算                                                            */
/* ------------------------------------------------------------------ */

export interface CurrencyDef {
  /** ISO 4217 代码（如 CNY / USD / EUR） */
  code: string;
  /** 中文名称 */
  name: string;
  /** 符号 */
  symbol: string;
  /** 国旗 emoji（可选，便于视觉识别） */
  flag?: string;
  /** 常见小数位（展示用） */
  decimals: number;
}

/**
 * 内置常用货币（离线参考汇率以 CNY 为基准，1 外币 = rate 人民币）。
 * 汇率会波动，内置值仅作离线兜底；可在工具内「在线更新」或手动校准。
 */
export const CURRENCIES: CurrencyDef[] = [
  { code: "CNY", name: "人民币", symbol: "¥", flag: "🇨🇳", decimals: 2 },
  { code: "USD", name: "美元", symbol: "$", flag: "🇺🇸", decimals: 2 },
  { code: "EUR", name: "欧元", symbol: "€", flag: "🇪🇺", decimals: 2 },
  { code: "GBP", name: "英镑", symbol: "£", flag: "🇬🇧", decimals: 2 },
  { code: "JPY", name: "日元", symbol: "¥", flag: "🇯🇵", decimals: 2 },
  { code: "HKD", name: "港币", symbol: "HK$", flag: "🇭🇰", decimals: 2 },
  { code: "MOP", name: "澳门元", symbol: "MOP$", flag: "🇲🇴", decimals: 2 },
  { code: "TWD", name: "新台币", symbol: "NT$", flag: "🇨🇳", decimals: 2 },
  { code: "KRW", name: "韩元", symbol: "₩", flag: "🇰🇷", decimals: 0 },
  { code: "SGD", name: "新加坡元", symbol: "S$", flag: "🇸🇬", decimals: 2 },
  { code: "AUD", name: "澳元", symbol: "A$", flag: "🇦🇺", decimals: 2 },
  { code: "CAD", name: "加元", symbol: "C$", flag: "🇨🇦", decimals: 2 },
  { code: "CHF", name: "瑞士法郎", symbol: "CHF", flag: "🇨🇭", decimals: 2 },
  { code: "NZD", name: "新西兰元", symbol: "NZ$", flag: "🇳🇿", decimals: 2 },
  { code: "THB", name: "泰铢", symbol: "฿", flag: "🇹🇭", decimals: 2 },
  {
    code: "MYR",
    name: "马来西亚林吉特",
    symbol: "RM",
    flag: "🇲🇾",
    decimals: 2,
  },
  { code: "RUB", name: "卢布", symbol: "₽", flag: "🇷🇺", decimals: 2 },
  { code: "INR", name: "印度卢比", symbol: "₹", flag: "🇮🇳", decimals: 2 },
  { code: "AED", name: "迪拉姆", symbol: "AED", flag: "🇦🇪", decimals: 2 },
  { code: "VND", name: "越南盾", symbol: "₫", flag: "🇻🇳", decimals: 0 },
];

/**
 * 内置离线参考汇率：1 单位外币 折合多少人民币（CNY）。
 * 数据为静态参考值，仅用于离线兜底展示，请以银行/交易所实时牌价为准。
 */
export const OFFLINE_RATES_CNY: Record<string, number> = {
  CNY: 1,
  USD: 7.12,
  EUR: 7.78,
  GBP: 9.05,
  JPY: 0.0475,
  HKD: 0.912,
  MOP: 0.885,
  TWD: 0.221,
  KRW: 0.00518,
  SGD: 5.32,
  AUD: 4.68,
  CAD: 5.24,
  CHF: 8.06,
  NZD: 4.32,
  THB: 0.205,
  MYR: 1.6,
  RUB: 0.079,
  INR: 0.0845,
  AED: 1.94,
  VND: 0.00028,
};

/** 汇率表元信息 */
export interface RateTable {
  /** 1 单位货币 = rates[code] 人民币 */
  rates: Record<string, number>;
  /** 数据来源：内置 / 在线 */
  source: "offline" | "online";
  /** 更新时间（online 时有值） */
  updatedAt?: string;
  /** 备注 */
  note?: string;
}

export const OFFLINE_RATE_TABLE: RateTable = {
  rates: OFFLINE_RATES_CNY,
  source: "offline",
  note: "内置静态参考汇率（仅离线兜底）",
};

/** 取汇率（未知货币返回 undefined） */
export function rateOf(table: RateTable, code: string): number | undefined {
  const r = table.rates[code.toUpperCase()];
  return typeof r === "number" && r > 0 ? r : undefined;
}

/**
 * 汇率换算：amount 个 from 币种 = ? 个 to 币种。
 * 通过 CNY 作为中转（rate 定义为「1 外币 = rate 人民币」）。
 */
export function convertCurrency(
  table: RateTable,
  from: string,
  to: string,
  amount: number,
): number {
  const f = rateOf(table, from);
  const t = rateOf(table, to);
  if (f === undefined) throw new Error(`未知货币：${from}`);
  if (t === undefined) throw new Error(`未知货币：${to}`);
  if (!Number.isFinite(amount)) throw new Error("金额无效");
  return (amount * f) / t;
}

/** 换算并格式化（按目标货币小数位） */
export function formatCurrency(
  amount: number,
  code: string,
  table: RateTable,
): string {
  const def = CURRENCIES.find((c) => c.code === code.toUpperCase());
  const decimals = def?.decimals ?? 2;
  const symbol = def?.symbol ?? "";
  const v = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(v);
  // 极大 / 极小值避免科学计数法之外的长尾
  const text =
    abs >= 1e15 || (abs > 0 && abs < 1e-6)
      ? v.toExponential(4)
      : v.toLocaleString("zh-CN", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
  return `${symbol}${text}`;
}

/**
 * 交叉汇率：从一串「1 外币 = rate 人民币」反推两币种间的直接汇率。
 * 用于展示 1 from = ? to。
 */
export function crossRate(table: RateTable, from: string, to: string): number {
  return convertCurrency(table, from, to, 1);
}

/**
 * 解析在线汇率 API 返回（er-api 风格：{ rates: { CNY: 7.12, ... }, time_last_update_utc }）。
 * API 的 rates 通常以某基准币（如 USD）为 1，需换算成「1 外币 = ? CNY」。
 */
export function parseOnlineRates(
  data: unknown,
  base = "USD",
): Record<string, number> | null {
  const rates = (data as { rates?: unknown })?.rates as
    | Record<string, number>
    | undefined;
  if (!rates || typeof rates !== "object") return null;
  const baseRate = Number(rates[base.toUpperCase()]);
  if (!Number.isFinite(baseRate) || baseRate <= 0) return null;
  // API: 1 base = rates[X] 个 X  →  1 X = (1 / rates[X]) 个 base
  // 再用内置的 base→CNY 汇率换到 CNY
  const baseToCny = OFFLINE_RATES_CNY[base.toUpperCase()];
  if (!Number.isFinite(baseToCny)) return null;
  const out: Record<string, number> = {};
  for (const [code, raw] of Object.entries(rates)) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) continue;
    // 1 code = (baseToCny / v) 人民币
    out[code.toUpperCase()] = baseToCny / v;
  }
  out[base.toUpperCase()] = baseToCny;
  return Object.keys(out).length > 1 ? out : null;
}

/** 常见汇率 API（无需 key；多镜像兜底） */
export const RATE_API_ENDPOINTS = [
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD",
];

/** 在线拉取汇率（转成「1 外币 = rate 人民币」，含超时；全部失败返回 null） */
export async function fetchRatesOnline(
  timeoutMs = 6000,
): Promise<RateTable | null> {
  for (const url of RATE_API_ENDPOINTS) {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const resp = await fetch(url, {
        signal: controller?.signal,
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const parsed = parseOnlineRates(data, "USD");
      if (parsed) {
        return {
          rates: parsed,
          source: "online",
          updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          note: `在线汇率（${new URL(url).host}）`,
        };
      }
    } catch {
      // 尝试下一个接口
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }
  return null;
}
