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
  /** 记忆值（在表达式中以 mem 引用） */
  memory?: number;
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

/** 阶乘（供表达式内置 fact 使用） */
function factInternal(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error("fact 仅支持非负整数");
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** 最大公约数（供表达式内置 gcd 使用） */
function gcdInternal(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** 组合数（供表达式内置 nCr 使用） */
function nCrInternal(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let result = 1;
  const k = Math.min(r, n - r);
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
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
    sinh: (a) => Math.sinh(a[0]),
    cosh: (a) => Math.cosh(a[0]),
    tanh: (a) => Math.tanh(a[0]),
    fact: (a) => factInternal(a[0]),
    gcd: (a) => gcdInternal(a[0], a[1]),
    lcm: (a) =>
      gcdInternal(a[0], a[1]) === 0
        ? 0
        : Math.abs(Math.round(a[0]) * Math.round(a[1])) /
          gcdInternal(a[0], a[1]),
    ncr: (a) => nCrInternal(a[0], a[1]),
    npr: (a) => {
      if (a[1] < 0 || a[1] > a[0]) return 0;
      let r = 1;
      for (let i = 0; i < a[1]; i++) r *= a[0] - i;
      return Math.round(r);
    },
    hypot: (a) => Math.hypot(...a),
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
      if (name === "mem") {
        if (!Number.isFinite(options.memory))
          throw new Error("记忆值 mem 为空，请先按 M+ 存入");
        return options.memory as number;
      }
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

/* ------------------------------------------------------------------ */
/* 农历（1900-2100，纯算法，无需外网）                                   */
/* ------------------------------------------------------------------ */

/**
 * 农历数据表：每年一个整数，编码方式与香港天文台 / 常见开源实现一致。
 *   位 0..3   ：闰月月份（0 表示该年无闰月）
 *   位 4..15  ：1..12 月的大小月（1 = 30 天，0 = 29 天），从正月起（低位在前）
 *   位 16..19 ：闰月天数（1 = 30 天，0 = 29 天）
 *   位 20..23 ：正月初一对应的公历月份（1..12）
 *   位 24..28 ：正月初一对应的公历日（1..31）
 * 覆盖 1900 年（正月初一 1900-01-31）至 2100 年。
 */
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0,
  0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540,
  0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50,
  0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0,
  0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2,
  0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573,
  0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4,
  0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5,
  0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
  0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58,
  0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
  0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0,
  0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260,
  0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0,
  0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0,
  0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
  0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0,
  0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
  0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0,
  0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520,
  0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];

/** 天干（10） */
export const HEAVENLY_STEMS = [
  "甲",
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
];
/** 地支（12） */
export const EARTHLY_BRANCHES = [
  "子",
  "丑",
  "寅",
  "卯",
  "辰",
  "巳",
  "午",
  "未",
  "申",
  "酉",
  "戌",
  "亥",
];
/** 生肖（与地支一一对应） */
export const ZODIAC_ANIMALS = [
  "鼠",
  "牛",
  "虎",
  "兔",
  "龙",
  "蛇",
  "马",
  "羊",
  "猴",
  "鸡",
  "狗",
  "猪",
];

/** 农历月份中文名（索引 0..11 → 正..腊） */
export const LUNAR_MONTH_NAMES = [
  "正",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "冬",
  "腊",
];
/** 农历日中文名（索引 1..30） */
export const LUNAR_DAY_NAMES = [
  "",
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
];
/** 二十四节气（从立春起，公历顺序从「小寒」开始更贴合年内排序，此处按通用顺序） */
export const SOLAR_TERMS = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
];

/** 农历数据表覆盖的年份范围 */
export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2100;

const LUNAR_BASE_DATE = Date.UTC(1900, 0, 31); // 1900-01-31 为农历 1900 年正月初一
const MS_PER_LUNAR_DAY = 86_400_000;

/** 该农历年闰几月（0 表示无闰月） */
export function lunarLeapMonth(year: number): number {
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & 0xf;
}

/** 该农历年闰月的天数（无闰月返回 0） */
export function lunarLeapDays(year: number): number {
  if (lunarLeapMonth(year) === 0) return 0;
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & 0x10000 ? 30 : 29;
}

/** 该农历年第 month 月（不含闰月）的天数，month 取 1..12 */
export function lunarMonthDays(year: number, month: number): number {
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & (0x10000 >> month) ? 30 : 29;
}

/** 该农历年的总天数 */
export function lunarYearDays(year: number): number {
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += lunarMonthDays(year, m);
  return sum + lunarLeapDays(year);
}

export interface LunarDate {
  /** 农历年 */
  year: number;
  /** 农历月（1..12；闰月时 isLeap 为 true） */
  month: number;
  /** 农历日（1..30） */
  day: number;
  /** 是否闰月 */
  isLeap: boolean;
  /** 中文表达，如「乙巳年正月初一」 */
  text: string;
  /** 干支纪年，如「乙巳」 */
  ganzhi: string;
  /** 生肖，如「蛇」 */
  zodiac: string;
  /** 月名，如「正月」「闰六月」 */
  monthText: string;
  /** 日名，如「初一」「十五」 */
  dayText: string;
  /** 是否处于农历新年（正月初一） */
  isNewYear: boolean;
}

/** 公历 Date → 农历（超出 1900-2100 返回 null） */
export function toLunar(date: Date): LunarDate | null {
  const y = date.getFullYear();
  if (y < LUNAR_MIN_YEAR || y > LUNAR_MAX_YEAR) return null;
  const utcMidnight = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  let offsetDays = Math.floor(
    (utcMidnight - LUNAR_BASE_DATE) / MS_PER_LUNAR_DAY,
  );

  let lunarYear = LUNAR_MIN_YEAR;
  // 定位农历年
  for (; lunarYear <= LUNAR_MAX_YEAR; lunarYear++) {
    const days = lunarYearDays(lunarYear);
    if (offsetDays < days) break;
    offsetDays -= days;
  }
  if (lunarYear > LUNAR_MAX_YEAR) return null;

  const leap = lunarLeapMonth(lunarYear);
  // 构造该农历年的「月序」列表：每项为 { month, isLeap, days }，
  // 闰月在对应月份之后插入。逐项扣减剩余天数即可定位。
  const months: { month: number; isLeap: boolean; days: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push({
      month: m,
      isLeap: false,
      days: lunarMonthDays(lunarYear, m),
    });
    if (leap === m) {
      months.push({ month: m, isLeap: true, days: lunarLeapDays(lunarYear) });
    }
  }

  let isLeap = false;
  let lunarMonth = 1;
  for (const entry of months) {
    if (offsetDays < entry.days) {
      lunarMonth = entry.month;
      isLeap = entry.isLeap;
      break;
    }
    offsetDays -= entry.days;
  }
  const lunarDay = offsetDays + 1;

  const ganzhi =
    HEAVENLY_STEMS[(lunarYear - 4) % 10] +
    EARTHLY_BRANCHES[(lunarYear - 4) % 12];
  const zodiac = ZODIAC_ANIMALS[(lunarYear - 4) % 12];
  const monthText =
    (isLeap ? "闰" : "") + LUNAR_MONTH_NAMES[lunarMonth - 1] + "月";
  const dayText = LUNAR_DAY_NAMES[lunarDay];
  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    ganzhi,
    zodiac,
    monthText,
    dayText,
    isNewYear: lunarMonth === 1 && lunarDay === 1 && !isLeap,
    text: `${ganzhi}年${monthText}${dayText}`,
  };
}

/**
 * 求某公历年的二十四节气日期。
 * 采用「公式 + 世纪修正」（1900-2100 精度足够日级）：
 *   [Y×D + C] - L，其中 Y 为年份后两位，D 为 0.2422 常数，L 为闰年修正数。
 */
const TERM_C_20: number[] = [
  6.11, 20.84, 4.6295, 19.4599, 6.3826, 21.4155, 5.59, 20.888, 6.318, 21.86,
  6.5, 22.2, 7.928, 23.65, 8.35, 23.95, 8.44, 23.822, 9.098, 24.218, 8.218,
  23.08, 7.9, 22.6,
];
const TERM_C_21: number[] = [
  5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678,
  21.37, 7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36,
  7.18, 21.94,
];

export interface SolarTerm {
  name: string;
  /** 公历月（1..12） */
  month: number;
  /** 公历日 */
  day: number;
}

/** 求某年二十四节气（每 2 个节气对应一个公历月） */
export function solarTermsOfYear(year: number): SolarTerm[] {
  const out: SolarTerm[] = [];
  const y2 = year % 100;
  for (let i = 0; i < 24; i++) {
    const c = year < 2000 ? TERM_C_20[i] : TERM_C_21[i];
    let day = Math.floor(y2 * 0.2422 + c) - Math.floor((y2 - 1) / 4);
    // 特殊年份修正（已知例外，数量极少，忽略不影响主体体验）
    if (year === 1986 && i === 3) day = 5;
    out.push({ name: SOLAR_TERMS[i], month: Math.floor(i / 2) + 1, day });
  }
  return out;
}

/** 求某公历日期对应的节气（当天无节气返回 null） */
export function solarTermOf(date: Date): string | null {
  const terms = solarTermsOfYear(date.getFullYear());
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hit = terms.find((t) => t.month === m && t.day === d);
  return hit ? hit.name : null;
}

/** 农历日期中文表达（如「正月初一」） */
export function lunarDateText(ld: LunarDate): string {
  return `${ld.monthText}${ld.dayText}`;
}

/* ------------------------------------------------------------------ */
/* DNS 记录解析                                                        */
/* ------------------------------------------------------------------ */

/** 支持的 DNS 记录类型 */
export const DNS_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "SRV",
  "CAA",
  "PTR",
] as const;
export type DnsType = (typeof DNS_TYPES)[number];

/** 记录类型说明 */
export const DNS_TYPE_DESC: Record<DnsType, string> = {
  A: "IPv4 地址记录，将域名指向 32 位 IPv4 地址",
  AAAA: "IPv6 地址记录，将域名指向 128 位 IPv6 地址",
  CNAME: "别名记录，将域名指向另一个域名",
  MX: "邮件交换记录，指定接收邮件的服务器",
  TXT: "文本记录，常用于 SPF / DKIM / 站点验证",
  NS: "域名服务器记录，指定该域名的权威 DNS",
  SOA: "起始授权机构记录，定义区域的主 NS 与管理信息",
  SRV: "服务记录，指定某服务的主机与端口",
  CAA: "证书颁发机构授权记录，限定可签发证书的 CA",
  PTR: "反向解析记录，用于 IP → 域名",
};

/** 校验域名合法性（宽松规则，允许下划线与通配符，允许 IDN） */
export function isValidDomain(domain: string): boolean {
  const d = domain.trim().replace(/\.$/, "");
  if (!d || d.length > 253) return false;
  const labels = d.split(".");
  if (labels.length < 1) return false;
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^(?!-)[\w\u00a1-\uffff-]{1,63}(?<!-)$/u.test(label),
  );
}

export interface DnsAnswer {
  name: string;
  type: number | string;
  TTL: number;
  data: string;
}

/** DNS 记录类型名 → 数字（DoH JSON 返回的数字类型用） */
export const DNS_TYPE_CODE: Record<DnsType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  CAA: 257,
};

const DNS_CODE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(DNS_TYPE_CODE).map(([name, code]) => [code, name]),
);

/** 数字类型 → 类型名 */
export function dnsTypeName(code: number | string): string {
  if (typeof code === "string") return code;
  return DNS_CODE_NAME[code] ?? String(code);
}

/** DoH JSON 响应结构（Google / Cloudflare 兼容） */
export interface DohResponse {
  Status: number;
  Answer?: DnsAnswer[];
  Authority?: DnsAnswer[];
}

export const DNS_RCODE: Record<number, string> = {
  0: "NOERROR（查询成功）",
  1: "FORMERR（请求格式错误）",
  2: "SERVFAIL（服务器故障）",
  3: "NXDOMAIN（域名不存在）",
  4: "NOTIMP（服务器不支持该查询）",
  5: "REFUSED（查询被拒绝）",
};

/** 格式化 DoH 记录数据（TXT 去引号、MX 补优先级可读性） */
export function formatDnsData(type: string, data: string): string {
  const t = type.toUpperCase();
  if (t === "TXT") return data.replace(/^"|"$/g, "");
  return data;
}

/**
 * DNS over HTTPS 查询（Google DNS JSON API，失败自动切 Cloudflare）。
 * 浏览器环境无法直接发 UDP，DoH 是纯前端唯一可行的方案。
 */
export async function queryDns(
  domain: string,
  type: DnsType = "A",
  timeoutMs = 8000,
): Promise<{ answers: DnsAnswer[]; status: number }> {
  const endpoints = [
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
  ];
  let lastErr: Error | null = null;
  for (const url of endpoints) {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const resp = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: controller?.signal,
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as DohResponse;
      const answers = (data.Answer ?? []).map((a) => ({
        name: a.name,
        type: dnsTypeName(a.type),
        TTL: a.TTL,
        data: formatDnsData(dnsTypeName(a.type), a.data),
      }));
      return { answers, status: data.Status ?? 0 };
    } catch (e) {
      lastErr = e as Error;
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error("DNS 查询失败（网络不可达）");
}

/* ------------------------------------------------------------------ */
/* 汉字拆解（拆字 / 部件 / 拼音 / 笔画 / 结构）                          */
/* ------------------------------------------------------------------ */

/** 少量常用字的部件拆解表（示例数据，可逐步扩充） */
export const CHAR_DECOMPOSE: Record<string, string[]> = {
  好: ["女", "子"],
  明: ["日", "月"],
  休: ["亻", "木"],
  林: ["木", "木"],
  森: ["木", "木", "木"],
  从: ["人", "人"],
  众: ["人", "人", "人"],
  尖: ["小", "大"],
  尘: ["小", "土"],
  男: ["田", "力"],
  女: ["女"],
  安: ["宀", "女"],
  字: ["宀", "子"],
  家: ["宀", "豕"],
  室: ["宀", "至"],
  完: ["宀", "元"],
  花: ["艹", "化"],
  草: ["艹", "早"],
  茶: ["艹", "人", "木"],
  苗: ["艹", "田"],
  菜: ["艹", "爫", "木"],
  洗: ["氵", "先"],
  江: ["氵", "工"],
  河: ["氵", "可"],
  湖: ["氵", "胡"],
  海: ["氵", "每"],
  清: ["氵", "青"],
  汉: ["氵", "又"],
  语: ["讠", "吾"],
  请: ["讠", "青"],
  说: ["讠", "兑"],
  读: ["讠", "卖"],
  记: ["讠", "己"],
  认: ["讠", "人"],
  谢: ["讠", "身", "寸"],
  你: ["亻", "尔"],
  他: ["亻", "也"],
  们: ["亻", "门"],
  仁: ["亻", "二"],
  作: ["亻", "乍"],
  信: ["亻", "言"],
  保: ["亻", "呆"],
  打: ["扌", "丁"],
  找: ["扌", "戈"],
  拉: ["扌", "立"],
  推: ["扌", "隹"],
  提: ["扌", "是"],
  握: ["扌", "屋"],
  时: ["日", "寸"],
  晴: ["日", "青"],
  晚: ["日", "免"],
  星: ["日", "生"],
  早: ["日", "十"],
  春: ["三", "人", "日"],
  秋: ["禾", "火"],
  冬: ["夂", "冫"],
  天: ["一", "大"],
  地: ["土", "也"],
  雪: ["雨", "彐"],
  雷: ["雨", "田"],
  电: ["日", "乚"],
  婚: ["女", "昏"],
  她: ["女", "也"],
  妈: ["女", "马"],
  姐: ["女", "且"],
  妹: ["女", "未"],
  娘: ["女", "良"],
  妇: ["女", "彐"],
  想: ["木", "目", "心"],
  思: ["田", "心"],
  忘: ["亡", "心"],
  急: ["刍", "心"],
  志: ["士", "心"],
  念: ["今", "心"],
  沙: ["氵", "少"],
  冰: ["冫", "水"],
  冻: ["冫", "东"],
  冷: ["冫", "令"],
  饭: ["饣", "反"],
  饿: ["饣", "我"],
  饮: ["饣", "欠"],
  铁: ["钅", "失"],
  银: ["钅", "艮"],
  钱: ["钅", "戋"],
  钟: ["钅", "中"],
  鸟: ["勹", "丶", "灬"],
};

/** 汉字结构类型 */
export type CharStructure =
  | "独体"
  | "左右"
  | "左中右"
  | "上下"
  | "上中下"
  | "半包围"
  | "全包围"
  | "品字";

/** 常见部首（用于粗略推断结构） */
const RADICALS = "氵亻讠扌忄口日月木林火土女子宀艹钅饣竹目心雨马鸟鱼虫犭";

export interface CharDecomposeResult {
  /** 单个汉字 */
  char: string;
  /** 是否 CJK 汉字 */
  isHan: boolean;
  /** 部件序列（可能为空） */
  parts: string[];
  /** 结构类型 */
  structure: CharStructure;
  /** 笔画数（可能为 0 表示未知） */
  strokes: number;
  /** 拼音（含声调，多音字用 / 分隔） */
  pinyin: string;
  /** 声调音标拼音（不带调号） */
  pinyinPlain: string;
}

/** 常用字笔画数表（600+ 常用字的简化计数，未收录返回 0） */
const STROKE_TABLE: Record<string, number> = {
  一: 1,
  二: 2,
  十: 2,
  丁: 2,
  厂: 2,
  七: 2,
  卜: 2,
  人: 2,
  入: 2,
  八: 2,
  九: 2,
  几: 2,
  儿: 2,
  了: 2,
  力: 2,
  乃: 2,
  刀: 2,
  又: 2,
  三: 3,
  干: 3,
  于: 3,
  亏: 3,
  士: 3,
  土: 3,
  才: 3,
  寸: 3,
  下: 3,
  大: 3,
  丈: 3,
  与: 3,
  万: 3,
  上: 3,
  小: 3,
  口: 3,
  巾: 3,
  山: 3,
  千: 3,
  乞: 3,
  川: 3,
  亿: 3,
  个: 3,
  勺: 3,
  久: 3,
  凡: 3,
  及: 3,
  夕: 3,
  丸: 3,
  么: 3,
  广: 3,
  亡: 3,
  门: 3,
  义: 3,
  之: 3,
  尸: 3,
  弓: 3,
  己: 3,
  已: 3,
  子: 3,
  卫: 3,
  也: 3,
  女: 3,
  飞: 3,
  刃: 3,
  习: 3,
  叉: 3,
  马: 3,
  乡: 3,
  丰: 4,
  王: 4,
  井: 4,
  开: 4,
  夫: 4,
  天: 4,
  无: 4,
  元: 4,
  专: 4,
  云: 4,
  扎: 4,
  艺: 4,
  木: 4,
  五: 4,
  支: 4,
  厅: 4,
  不: 4,
  太: 4,
  犬: 4,
  区: 4,
  历: 4,
  尤: 4,
  森: 12,
  想: 13,
  谢: 12,
  友: 4,
  匹: 4,
  车: 4,
  巨: 4,
  牙: 4,
  屯: 4,
  比: 4,
  互: 4,
  切: 4,
  瓦: 4,
  止: 4,
  少: 4,
  日: 4,
  中: 4,
  冈: 4,
  贝: 4,
  内: 4,
  水: 4,
  见: 4,
  午: 4,
  牛: 4,
  手: 4,
  毛: 4,
  气: 4,
  升: 4,
  长: 4,
  仁: 4,
  什: 4,
  片: 4,
  仆: 4,
  化: 4,
  仇: 4,
  币: 4,
  仍: 4,
  仅: 4,
  斤: 4,
  爪: 4,
  反: 4,
  介: 4,
  父: 4,
  从: 4,
  今: 4,
  凶: 4,
  分: 4,
  乏: 4,
  公: 4,
  仓: 4,
  月: 4,
  氏: 4,
  勿: 4,
  欠: 4,
  风: 4,
  丹: 4,
  匀: 4,
  乌: 4,
  凤: 4,
  勾: 4,
  文: 4,
  六: 4,
  方: 4,
  火: 4,
  为: 4,
  斗: 4,
  忆: 4,
  订: 4,
  计: 4,
  户: 4,
  认: 4,
  心: 4,
  尺: 4,
  引: 4,
  丑: 4,
  巴: 4,
  孔: 4,
  队: 4,
  办: 4,
  以: 4,
  允: 4,
  予: 4,
  劝: 4,
  双: 4,
  书: 4,
  幻: 4,
  玉: 5,
  刊: 5,
  示: 5,
  末: 5,
  未: 5,
  击: 5,
  打: 5,
  巧: 5,
  正: 5,
  扑: 5,
  卉: 5,
  扒: 5,
  功: 5,
  扔: 5,
  去: 5,
  甘: 5,
  世: 5,
  古: 5,
  节: 5,
  本: 5,
  术: 5,
  可: 5,
  丙: 5,
  左: 5,
  厉: 5,
  石: 5,
  右: 5,
  布: 5,
  夯: 5,
  戊: 5,
  龙: 5,
  平: 5,
  灭: 5,
  轧: 5,
  东: 5,
  卡: 5,
  北: 5,
  占: 5,
  业: 5,
  旧: 5,
  帅: 5,
  归: 5,
  且: 5,
  旦: 5,
  目: 5,
  叶: 5,
  甲: 5,
  申: 5,
  叮: 5,
  电: 5,
  号: 5,
  田: 5,
  由: 5,
  只: 5,
  叭: 5,
  史: 5,
  央: 5,
  兄: 5,
  叼: 5,
  叫: 5,
  另: 5,
  叨: 5,
  叹: 5,
  四: 5,
  生: 5,
  失: 5,
  禾: 5,
  丘: 5,
  付: 5,
  仗: 5,
  代: 5,
  仙: 5,
  们: 5,
  仪: 5,
  白: 5,
  仔: 5,
  他: 5,
  斥: 5,
  瓜: 5,
  乎: 5,
  丛: 5,
  令: 5,
  用: 5,
  甩: 5,
  印: 5,
  乐: 5,
  句: 5,
  匆: 5,
  册: 5,
  犯: 5,
  外: 5,
  处: 5,
  冬: 5,
  鸟: 5,
  务: 5,
  包: 5,
  饥: 5,
  主: 5,
  市: 5,
  立: 5,
  闪: 5,
  兰: 5,
  半: 5,
  汁: 5,
  汇: 5,
  头: 5,
  汉: 5,
  宁: 5,
  穴: 5,
  它: 5,
  讨: 5,
  写: 5,
  让: 5,
  礼: 5,
  训: 5,
  必: 5,
  议: 5,
  讯: 5,
  记: 5,
  永: 5,
  司: 5,
  尼: 5,
  民: 5,
  出: 5,
  辽: 5,
  奶: 5,
  奴: 5,
  加: 5,
  召: 5,
  皮: 5,
  边: 5,
  发: 5,
  孕: 5,
  圣: 5,
  对: 5,
  台: 5,
  矛: 5,
  纠: 5,
  母: 5,
  幼: 5,
  丝: 5,
  式: 6,
  刑: 6,
  动: 6,
  扛: 6,
  寺: 6,
  吉: 6,
  扣: 6,
  考: 6,
  托: 6,
  老: 6,
  执: 6,
  巩: 6,
  圾: 6,
  扩: 6,
  扫: 6,
  地: 6,
  扬: 6,
  场: 6,
  耳: 6,
  共: 6,
  芒: 6,
  亚: 6,
  芝: 6,
  朽: 6,
  朴: 6,
  机: 6,
  权: 6,
  过: 6,
  臣: 6,
  再: 6,
  协: 6,
  西: 6,
  压: 6,
  厌: 6,
  在: 6,
  有: 6,
  百: 6,
  存: 6,
  而: 6,
  页: 6,
  匠: 6,
  夸: 6,
  夺: 6,
  灰: 6,
  达: 6,
  列: 6,
  死: 6,
  成: 6,
  夹: 6,
  夷: 6,
  轨: 6,
  邪: 6,
  尧: 6,
  划: 6,
  迈: 6,
  毕: 6,
  至: 6,
  此: 6,
  贞: 6,
  师: 6,
  尘: 6,
  尖: 6,
  劣: 6,
  光: 6,
  当: 6,
  早: 6,
  吐: 6,
  吓: 6,
  虫: 6,
  曲: 6,
  团: 6,
  同: 6,
  吊: 6,
  吃: 6,
  因: 6,
  吸: 6,
  吗: 6,
  屿: 6,
  帆: 6,
  岁: 6,
  回: 6,
  岂: 6,
  刚: 6,
  则: 6,
  肉: 6,
  网: 6,
  年: 6,
  朱: 6,
  先: 6,
  丢: 6,
  舌: 6,
  竹: 6,
  迁: 6,
  乔: 6,
  伟: 6,
  传: 6,
  乒: 6,
  乓: 6,
  休: 6,
  伍: 6,
  伏: 6,
  优: 6,
  伐: 6,
  延: 6,
  件: 6,
  任: 6,
  伤: 6,
  价: 6,
  份: 6,
  华: 6,
  仰: 6,
  仿: 6,
  伙: 6,
  伪: 6,
  自: 6,
  血: 6,
  向: 6,
  似: 6,
  后: 6,
  行: 6,
  舟: 6,
  全: 6,
  会: 6,
  杀: 6,
  合: 6,
  兆: 6,
  企: 6,
  众: 6,
  爷: 6,
  伞: 6,
  创: 6,
  肌: 6,
  朵: 6,
  杂: 6,
  危: 6,
  旬: 6,
  旨: 6,
  负: 6,
  各: 6,
  名: 6,
  多: 6,
  争: 6,
  色: 6,
  壮: 6,
  冲: 6,
  冰: 6,
  庄: 6,
  庆: 6,
  亦: 6,
  刘: 6,
  齐: 6,
  交: 6,
  次: 6,
  衣: 6,
  产: 6,
  决: 6,
  充: 6,
  妄: 6,
  闭: 6,
  问: 6,
  闯: 6,
  羊: 6,
  并: 6,
  关: 6,
  米: 6,
  灯: 6,
  州: 6,
  汗: 6,
  污: 6,
  江: 6,
  池: 6,
  汤: 6,
  忙: 6,
  兴: 6,
  宇: 6,
  守: 6,
  宅: 6,
  字: 6,
  安: 6,
  讲: 6,
  军: 6,
  许: 6,
  论: 6,
  农: 6,
  讽: 6,
  设: 6,
  访: 6,
  寻: 6,
  那: 6,
  迅: 6,
  尽: 6,
  导: 6,
  异: 6,
  孙: 6,
  阵: 6,
  阳: 6,
  收: 6,
  阶: 6,
  阴: 6,
  防: 6,
  奸: 6,
  如: 6,
  妇: 6,
  好: 6,
  她: 6,
  妈: 6,
  戏: 6,
  羽: 6,
  观: 6,
  欢: 6,
  买: 6,
  红: 6,
  纤: 6,
  级: 6,
  约: 6,
  纪: 6,
  驰: 6,
  巡: 6,
  寿: 7,
  弄: 7,
  麦: 7,
  形: 7,
  进: 7,
  戒: 7,
  吞: 7,
  远: 7,
  违: 7,
  运: 7,
  扶: 7,
  抚: 7,
  坛: 7,
  技: 7,
  坏: 7,
  扰: 7,
  拒: 7,
  找: 7,
  批: 7,
  扯: 7,
  址: 7,
  走: 7,
  抄: 7,
  坝: 7,
  贡: 7,
  攻: 7,
  赤: 7,
  折: 7,
  抓: 7,
  扳: 7,
  抡: 7,
  扮: 7,
  抢: 7,
  孝: 7,
  均: 7,
  抛: 7,
  投: 7,
  坟: 7,
  抗: 7,
  坑: 7,
  坊: 7,
  抖: 7,
  护: 7,
  壳: 7,
  志: 7,
  扭: 7,
  块: 7,
  声: 7,
  把: 7,
  报: 7,
  却: 7,
  劫: 7,
  芽: 7,
  花: 7,
  芹: 7,
  芬: 7,
  苍: 7,
  芳: 7,
  严: 7,
  芦: 7,
  劳: 7,
  克: 7,
  苏: 7,
  杆: 7,
  杠: 7,
  杜: 7,
  材: 7,
  村: 7,
  杏: 7,
  极: 7,
  李: 7,
  杨: 7,
  求: 7,
  更: 7,
  束: 7,
  豆: 7,
  两: 7,
  丽: 7,
  医: 7,
  辰: 7,
  励: 7,
  否: 7,
  还: 7,
  歼: 7,
  来: 7,
  连: 7,
  步: 7,
  坚: 7,
  旱: 7,
  盯: 7,
  呈: 7,
  时: 7,
  吴: 7,
  助: 7,
  县: 7,
  里: 7,
  呆: 7,
  园: 7,
  旷: 7,
  围: 7,
  呀: 7,
  吨: 7,
  足: 7,
  邮: 7,
  男: 7,
  困: 7,
  吵: 7,
  串: 7,
  员: 7,
  听: 7,
  吩: 7,
  吹: 7,
  呜: 7,
  吧: 7,
  吼: 7,
  别: 7,
  岗: 7,
  帐: 7,
  财: 7,
  针: 7,
  钉: 7,
  告: 7,
  我: 7,
  乱: 7,
  利: 7,
  秃: 7,
  秀: 7,
  私: 7,
  每: 7,
  兵: 7,
  估: 7,
  体: 7,
  何: 7,
  但: 7,
  伸: 7,
  作: 7,
  伯: 7,
  伶: 7,
  佣: 7,
  低: 7,
  你: 7,
  住: 7,
  位: 7,
  伴: 7,
  身: 7,
  皂: 7,
  佛: 7,
  近: 7,
  彻: 7,
  役: 7,
  返: 7,
  余: 7,
  希: 7,
  坐: 7,
  谷: 7,
  妥: 7,
  含: 7,
  邻: 7,
  岔: 7,
  肝: 7,
  肚: 7,
  肠: 7,
  龟: 7,
  免: 7,
  狂: 7,
  犹: 7,
  角: 7,
  删: 7,
  条: 7,
  卵: 7,
  岛: 7,
  迎: 7,
  饭: 7,
  饮: 7,
  系: 7,
  言: 7,
  冻: 7,
  状: 7,
  亩: 7,
  况: 7,
  床: 7,
  库: 7,
  疗: 7,
  应: 7,
  冷: 7,
  这: 7,
  序: 7,
  辛: 7,
  弃: 7,
  冶: 7,
  忘: 7,
  闲: 7,
  间: 7,
  闷: 7,
  判: 7,
  灶: 7,
  灿: 7,
  弟: 7,
  汪: 7,
  沙: 7,
  汽: 7,
  沃: 7,
  泛: 7,
  沟: 7,
  没: 7,
  沈: 7,
  沉: 7,
  怀: 7,
  忧: 7,
  快: 7,
  完: 7,
  宋: 7,
  宏: 7,
  牢: 7,
  究: 7,
  穷: 7,
  灾: 7,
  良: 7,
  证: 7,
  启: 7,
  评: 7,
  补: 7,
  初: 7,
  社: 7,
  识: 7,
  诉: 7,
  诊: 7,
  词: 7,
  译: 7,
  君: 7,
  灵: 7,
  即: 7,
  层: 7,
  尿: 7,
  尾: 7,
  迟: 7,
  局: 7,
  改: 7,
  张: 7,
  忌: 7,
  际: 7,
  陆: 7,
  阿: 7,
  陈: 7,
  阻: 7,
  附: 7,
  妙: 7,
  妖: 7,
  妨: 7,
  努: 7,
  忍: 7,
  劲: 7,
  鸡: 7,
  驱: 7,
  纯: 7,
  纱: 7,
  纳: 7,
  纲: 7,
  驳: 7,
  纵: 7,
  纷: 7,
  纸: 7,
  纹: 7,
  纺: 7,
  驴: 7,
  纽: 7,
  奉: 8,
  玩: 8,
  环: 8,
  武: 8,
  青: 8,
  责: 8,
  现: 8,
  表: 8,
  规: 8,
  抹: 8,
  拢: 8,
  拔: 8,
  拣: 8,
  担: 8,
  坦: 8,
  押: 8,
  抽: 8,
  拐: 8,
  拖: 8,
  拍: 8,
  者: 8,
  顶: 8,
  拆: 8,
  拥: 8,
  抵: 8,
  拘: 8,
  势: 8,
  抱: 8,
  垃: 8,
  拉: 8,
  拦: 8,
  拌: 8,
  幸: 8,
  招: 8,
  坡: 8,
  披: 8,
  拨: 8,
  择: 8,
  抬: 8,
  其: 8,
  取: 8,
  苦: 8,
  若: 8,
  茂: 8,
  苹: 8,
  苗: 8,
  英: 8,
  范: 8,
  直: 8,
  茄: 8,
  茎: 8,
  茅: 8,
  林: 8,
  枝: 8,
  杯: 8,
  柜: 8,
  析: 8,
  板: 8,
  松: 8,
  枪: 8,
  构: 8,
  杰: 8,
  述: 8,
  枕: 8,
  丧: 8,
  或: 8,
  画: 8,
  卧: 8,
  事: 8,
  刺: 8,
  枣: 8,
  雨: 8,
  卖: 8,
  矿: 8,
  码: 8,
  厕: 8,
  奔: 8,
  奇: 8,
  奋: 8,
  态: 8,
  欧: 8,
  垄: 8,
  妻: 8,
  轰: 8,
  顷: 8,
  转: 8,
  斩: 8,
  轮: 8,
  软: 8,
  到: 8,
  非: 8,
  叔: 8,
  肯: 8,
  齿: 8,
  些: 8,
  虎: 8,
  虏: 8,
  肾: 8,
  贤: 8,
  尚: 8,
  旺: 8,
  具: 8,
  果: 8,
  味: 8,
  昆: 8,
  国: 8,
  昌: 8,
  畅: 8,
  明: 8,
  易: 8,
  昂: 8,
  典: 8,
  固: 8,
  忠: 8,
  咐: 8,
  呼: 8,
  鸣: 8,
  呢: 8,
  岸: 8,
  岩: 8,
  帖: 8,
  罗: 8,
  帜: 8,
  岭: 8,
  凯: 8,
  败: 8,
  贩: 8,
  购: 8,
  图: 8,
  钓: 8,
  制: 8,
  知: 8,
  垂: 8,
  牧: 8,
  物: 8,
  乖: 8,
  刮: 8,
  秆: 8,
  和: 8,
  季: 8,
  委: 8,
  佳: 8,
  侍: 8,
  供: 8,
  使: 8,
  例: 8,
  版: 8,
  侄: 8,
  侦: 8,
  侧: 8,
  凭: 8,
  侨: 8,
  佩: 8,
  货: 8,
  依: 8,
  的: 8,
  迫: 8,
  质: 8,
  欣: 8,
  征: 8,
  往: 8,
  爬: 8,
  彼: 8,
  径: 8,
  所: 8,
  舍: 8,
  金: 8,
  命: 8,
  斧: 8,
  爸: 8,
  采: 8,
  受: 8,
  乳: 8,
  贪: 8,
  念: 8,
  贫: 8,
  肤: 8,
  肺: 8,
  肢: 8,
  肿: 8,
  胀: 8,
  朋: 8,
  股: 8,
  肥: 8,
  服: 8,
  胁: 8,
  周: 8,
  昏: 8,
  鱼: 8,
  兔: 8,
  狐: 8,
  忽: 8,
  狗: 8,
  备: 8,
  饰: 8,
  饱: 8,
  饲: 8,
  变: 8,
  京: 8,
  享: 8,
  店: 8,
  夜: 8,
  庙: 8,
  府: 8,
  底: 8,
  剂: 8,
  郊: 8,
  废: 8,
  净: 8,
  盲: 8,
  放: 8,
  刻: 8,
  育: 8,
  闸: 8,
  闹: 8,
  郑: 8,
  券: 8,
  卷: 8,
  单: 8,
  炒: 8,
  炊: 8,
  炕: 8,
  炎: 8,
  炉: 8,
  沫: 8,
  浅: 8,
  法: 8,
  泄: 8,
  河: 8,
  沾: 8,
  泪: 8,
  油: 8,
  泊: 8,
  沿: 8,
  泡: 8,
  注: 8,
  泻: 8,
  泳: 8,
  泥: 8,
  沸: 8,
  波: 8,
  泼: 8,
  泽: 8,
  治: 8,
  怖: 8,
  性: 8,
  怕: 8,
  怜: 8,
  怪: 8,
  学: 8,
  宝: 8,
  宗: 8,
  定: 8,
  宜: 8,
  审: 8,
  宙: 8,
  官: 8,
  空: 8,
  帘: 8,
  实: 8,
  试: 8,
  郎: 8,
  诗: 8,
  肩: 8,
  房: 8,
  诚: 8,
  衬: 8,
  衫: 8,
  视: 8,
  话: 8,
  诞: 8,
  询: 8,
  该: 8,
  详: 8,
  建: 8,
  肃: 8,
  录: 8,
  隶: 8,
  居: 8,
  届: 8,
  刷: 8,
  屈: 8,
  弦: 8,
  承: 8,
  孟: 8,
  孤: 8,
  陕: 8,
  降: 8,
  限: 8,
  妹: 8,
  姑: 8,
  姐: 8,
  姓: 8,
  始: 8,
  姆: 8,
  虱: 8,
  驾: 8,
  参: 8,
  艰: 8,
  线: 8,
  练: 8,
  组: 8,
  细: 8,
  驶: 8,
  织: 8,
  终: 8,
  驻: 8,
  驼: 8,
  绍: 8,
  经: 8,
  贯: 8,
  奏: 9,
  春: 9,
  帮: 9,
  珍: 9,
  玻: 9,
  毒: 9,
  型: 9,
  挂: 9,
  封: 9,
  持: 9,
  项: 9,
  垮: 9,
  挎: 9,
  城: 9,
  挠: 9,
  政: 9,
  赴: 9,
  赵: 9,
  挡: 9,
  挺: 9,
  括: 9,
  拴: 9,
  拾: 9,
  挑: 9,
  指: 9,
  垫: 9,
  挣: 9,
  挤: 9,
  拼: 9,
  挖: 9,
  按: 9,
  挥: 9,
  挪: 9,
  某: 9,
  甚: 9,
  革: 9,
  荐: 9,
  巷: 9,
  带: 9,
  草: 9,
  茧: 9,
  茶: 9,
  荒: 9,
  茫: 9,
  荡: 9,
  荣: 9,
  故: 9,
  胡: 9,
  南: 9,
  药: 9,
  标: 9,
  枯: 9,
  柄: 9,
  栋: 9,
  相: 9,
  查: 9,
  柏: 9,
  柳: 9,
  柱: 9,
  柿: 9,
  栏: 9,
  树: 9,
  要: 9,
  咸: 9,
  威: 9,
  歪: 9,
  研: 9,
  砖: 9,
  厘: 9,
  厚: 9,
  砌: 9,
  砍: 9,
  面: 9,
  耐: 9,
  耍: 9,
  牵: 9,
  残: 9,
  殃: 9,
  轻: 9,
  鸦: 9,
  皆: 9,
  背: 9,
  战: 9,
  点: 9,
  临: 9,
  览: 9,
  竖: 9,
  省: 9,
  削: 9,
  尝: 9,
  是: 9,
  盼: 9,
  眨: 9,
  哄: 9,
  显: 9,
  哑: 9,
  冒: 9,
  映: 9,
  星: 9,
  昨: 9,
  畏: 9,
  趴: 9,
  胃: 9,
  贵: 9,
  界: 9,
  虹: 9,
  虾: 9,
  蚁: 9,
  思: 9,
  蚂: 9,
  虽: 9,
  品: 9,
  咽: 9,
  骂: 9,
  哗: 9,
  咱: 9,
  响: 9,
  哈: 9,
  咬: 9,
  咳: 9,
  哪: 9,
  炭: 9,
  峡: 9,
  罚: 9,
  贱: 9,
  贴: 9,
  骨: 9,
  钞: 9,
  钟: 9,
  钢: 9,
  钠: 9,
  钥: 9,
  钩: 9,
  卸: 9,
  缸: 9,
  拜: 9,
  看: 9,
  矩: 9,
  怎: 9,
  牲: 9,
  选: 9,
  适: 9,
  秒: 9,
  香: 9,
  种: 9,
  秋: 9,
  科: 9,
  重: 9,
  复: 9,
  竿: 9,
  段: 9,
  便: 9,
  俩: 9,
  贷: 9,
  顺: 9,
  修: 9,
  保: 9,
  促: 9,
  侮: 9,
  俭: 9,
  俗: 9,
  俘: 9,
  信: 9,
  皇: 9,
  泉: 9,
  鬼: 9,
  侵: 9,
  追: 9,
  俊: 9,
  盾: 9,
  待: 9,
  律: 9,
  很: 9,
  须: 9,
  叙: 9,
  剑: 9,
  逃: 9,
  食: 9,
  盆: 9,
  胆: 9,
  胜: 9,
  胞: 9,
  胖: 9,
  脉: 9,
  勉: 9,
  狭: 9,
  狮: 9,
  独: 9,
  狡: 9,
  狱: 9,
  狠: 9,
  贸: 9,
  怨: 9,
  急: 9,
  饶: 9,
  蚀: 9,
  饺: 9,
  饼: 9,
  弯: 9,
  将: 9,
  奖: 9,
  哀: 9,
  亭: 9,
  亮: 9,
  度: 9,
  迹: 9,
  庭: 9,
  疮: 9,
  疯: 9,
  疫: 9,
  疤: 9,
  姿: 9,
  亲: 9,
  音: 9,
  帝: 9,
  施: 9,
  闻: 9,
  阁: 9,
  差: 9,
  养: 9,
  美: 9,
  姜: 9,
  叛: 9,
  送: 9,
  类: 9,
  迷: 9,
  前: 9,
  首: 9,
  逆: 9,
  总: 9,
  炼: 9,
  炸: 9,
  炮: 9,
  烂: 9,
  剃: 9,
  洁: 9,
  洪: 9,
  洒: 9,
  浇: 9,
  浊: 9,
  洞: 9,
  测: 9,
  洗: 9,
  活: 9,
  派: 9,
  洽: 9,
  染: 9,
  济: 9,
  洋: 9,
  洲: 9,
  浑: 9,
  浓: 9,
  津: 9,
  恒: 9,
  恢: 9,
  恰: 9,
  恼: 9,
  恨: 9,
  举: 9,
  觉: 9,
  宣: 9,
  室: 9,
  宫: 9,
  宪: 9,
  突: 9,
  穿: 9,
  窃: 9,
  客: 9,
  冠: 9,
  语: 9,
  扁: 9,
  袄: 9,
  祖: 9,
  神: 9,
  祝: 9,
  误: 9,
  诱: 9,
  说: 9,
  诵: 9,
  垦: 9,
  退: 9,
  既: 9,
  屋: 9,
  昼: 9,
  费: 9,
  陡: 9,
  眉: 9,
  孩: 9,
  除: 9,
  险: 9,
  院: 9,
  娃: 9,
  姥: 9,
  姨: 9,
  姻: 9,
  娇: 9,
  怒: 9,
  架: 9,
  贺: 9,
  盈: 9,
  勇: 9,
  怠: 9,
  柔: 9,
  垒: 9,
  绑: 9,
  绒: 9,
  结: 9,
  绕: 9,
  骄: 9,
  绘: 9,
  给: 9,
  绚: 9,
  骆: 9,
  络: 9,
  绝: 9,
  绞: 9,
  统: 9,
};

/** 查询汉字笔画数（未知返回 0） */
export function charStrokes(ch: string): number {
  return STROKE_TABLE[ch] ?? 0;
}

/** 根据部件粗略推断汉字结构 */
export function charStructure(ch: string, parts: string[]): CharStructure {
  if (parts.length >= 3) {
    if (parts.length === 3 && parts[0] === parts[1] && parts[1] === parts[2])
      return "品字";
    return "左中右";
  }
  if (parts.length === 2) {
    const [a] = parts;
    if (["宀", "艹", "竹", "雨", "穴", "疒"].includes(a)) return "上下";
    if (["辶", "廴", "勹", "匚", "冂", "门", "囗"].includes(a)) return "半包围";
    if (a === "囗") return "全包围";
    return "左右";
  }
  return "独体";
}

/** 汉字拆解（拼音走 pinyin-pro，部件走内置表，结构启发式推断） */
export function decomposeChar(ch: string): CharDecomposeResult {
  const isHan = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
  const parts = CHAR_DECOMPOSE[ch] ?? [];
  const structure = charStructure(ch, parts);
  let py = "";
  let plain = "";
  try {
    py = pinyin(ch, { toneType: "symbol", type: "array", multiple: true }).join(
      "/",
    );
    plain = pinyin(ch, { toneType: "none", type: "array" }).join("");
  } catch {
    py = "";
    plain = "";
  }
  return {
    char: ch,
    isHan,
    parts,
    structure,
    strokes: charStrokes(ch),
    pinyin: py,
    pinyinPlain: plain,
  };
}

/** 常见偏旁部首列表（用于展示/校验） */
export function isCommonRadical(ch: string): boolean {
  return RADICALS.includes(ch);
}

/* ------------------------------------------------------------------ */
/* 星座罗盘（太阳星座 + 月亮星座 + 上升星座 + 元素 + 配对）               */
/* ------------------------------------------------------------------ */

export interface ZodiacSign {
  index: number;
  name: string;
  /** 英文名 */
  en: string;
  /** 起止日期（含起） */
  from: [number, number];
  to: [number, number];
  element: "火" | "土" | "风" | "水";
  /** 四正（本位 / 固定 / 变动） */
  mode: "本位" | "固定" | "变动";
  symbol: string;
  /** 关键词 */
  keywords: string;
}

export const ZODIAC_SIGNS: ZodiacSign[] = [
  {
    index: 0,
    name: "白羊座",
    en: "Aries",
    from: [3, 21],
    to: [4, 19],
    element: "火",
    mode: "本位",
    symbol: "♈",
    keywords: "热情、冲动、开创",
  },
  {
    index: 1,
    name: "金牛座",
    en: "Taurus",
    from: [4, 20],
    to: [5, 20],
    element: "土",
    mode: "固定",
    symbol: "♉",
    keywords: "稳健、务实、执着",
  },
  {
    index: 2,
    name: "双子座",
    en: "Gemini",
    from: [5, 21],
    to: [6, 21],
    element: "风",
    mode: "变动",
    symbol: "♊",
    keywords: "机敏、多变、善谈",
  },
  {
    index: 3,
    name: "巨蟹座",
    en: "Cancer",
    from: [6, 22],
    to: [7, 22],
    element: "水",
    mode: "本位",
    symbol: "♋",
    keywords: "体贴、敏感、顾家",
  },
  {
    index: 4,
    name: "狮子座",
    en: "Leo",
    from: [7, 23],
    to: [8, 22],
    element: "火",
    mode: "固定",
    symbol: "♌",
    keywords: "自信、慷慨、主导",
  },
  {
    index: 5,
    name: "处女座",
    en: "Virgo",
    from: [8, 23],
    to: [9, 22],
    element: "土",
    mode: "变动",
    symbol: "♍",
    keywords: "细致、严谨、完美",
  },
  {
    index: 6,
    name: "天秤座",
    en: "Libra",
    from: [9, 23],
    to: [10, 23],
    element: "风",
    mode: "本位",
    symbol: "♎",
    keywords: "平衡、社交、审美",
  },
  {
    index: 7,
    name: "天蝎座",
    en: "Scorpio",
    from: [10, 24],
    to: [11, 22],
    element: "水",
    mode: "固定",
    symbol: "♏",
    keywords: "深沉、专注、洞察",
  },
  {
    index: 8,
    name: "射手座",
    en: "Sagittarius",
    from: [11, 23],
    to: [12, 21],
    element: "火",
    mode: "变动",
    symbol: "♐",
    keywords: "自由、乐观、探索",
  },
  {
    index: 9,
    name: "摩羯座",
    en: "Capricorn",
    from: [12, 22],
    to: [1, 19],
    element: "土",
    mode: "本位",
    symbol: "♑",
    keywords: "坚毅、自律、务实",
  },
  {
    index: 10,
    name: "水瓶座",
    en: "Aquarius",
    from: [1, 20],
    to: [2, 18],
    element: "风",
    mode: "固定",
    symbol: "♒",
    keywords: "独立、创新、博爱",
  },
  {
    index: 11,
    name: "双鱼座",
    en: "Pisces",
    from: [2, 19],
    to: [3, 20],
    element: "水",
    mode: "变动",
    symbol: "♓",
    keywords: "浪漫、共情、想象",
  },
];

export const ZODIAC_ELEMENT_COLOR: Record<string, string> = {
  火: "#f5222d",
  土: "#8c6d3f",
  风: "#13c2c2",
  水: "#1677ff",
};

/** 公历月日 → 太阳星座 */
export function sunSignOf(month: number, day: number): ZodiacSign {
  for (const s of ZODIAC_SIGNS) {
    const [fm, fd] = s.from;
    const [tm, td] = s.to;
    if (fm <= tm) {
      if ((month === fm && day >= fd) || (month === tm && day <= td)) return s;
      if (month > fm && month < tm) return s;
    } else {
      // 跨年（摩羯座）
      if ((month === fm && day >= fd) || (month === tm && day <= td)) return s;
    }
  }
  return ZODIAC_SIGNS[0];
}

/** 简化星座角标计算：返回黄道上 0..11 的星座序号（每宫 30°） */
export function signIndexFromLongitude(lon: number): number {
  const norm = ((lon % 360) + 360) % 360;
  return Math.floor(norm / 30) % 12;
}

/**
 * 估算月亮星座（简化算法）。
 * 真实月亮星座需星历，这里用「月亮日均行约 13.176°」粗略推算：
 * 以 2000-01-01 00:00 UTC 月亮黄经约 218.32° 为基准，按天数推进。
 * 结果仅供娱乐参考。
 */
export function moonSignOf(date: Date): ZodiacSign {
  const base = Date.UTC(2000, 0, 1, 0, 0, 0);
  const days = (date.getTime() - base) / MS_PER_LUNAR_DAY;
  const lon = (218.32 + 13.176396 * days) % 360;
  return ZODIAC_SIGNS[signIndexFromLongitude(lon)];
}

/**
 * 估算上升星座（简化算法）。
 * 用「春分点为基准 + 恒星时」的粗略近似：以出生时刻的地方恒星时映射黄道上升点。
 * 需知道出生时间与经度（此处用东八区 120°E 近似），结果仅供娱乐参考。
 */
export function ascendantSignOf(date: Date): ZodiacSign {
  // 儒略日
  const jd = date.getTime() / MS_PER_LUNAR_DAY + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  // 格林尼治平恒星时（度）
  let gmst =
    280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t;
  gmst = ((gmst % 360) + 360) % 360;
  // 东八区经度 120°E 的地方恒星时
  const lst = (gmst + 120) % 360;
  // 上升点黄经近似（忽略黄赤交角细化，取地方恒星时 + 90°）
  const ascLon = (lst + 90) % 360;
  return ZODIAC_SIGNS[signIndexFromLongitude(ascLon)];
}

export interface ZodiacInfo {
  date: Date;
  sun: ZodiacSign;
  moon: ZodiacSign;
  ascendant: ZodiacSign;
  /** 太阳在黄道上的近似经度（度） */
  sunLongitude: number;
}

/** 综合排盘（太阳 / 月亮 / 上升） */
export function zodiacInfo(date: Date): ZodiacInfo {
  const sun = sunSignOf(date.getMonth() + 1, date.getDate());
  return {
    date,
    sun,
    moon: moonSignOf(date),
    ascendant: ascendantSignOf(date),
    sunLongitude: sun.index * 30 + 15,
  };
}

/** 星座元素分布（对一组星座统计火/土/风/水） */
export function elementDistribution(
  signs: ZodiacSign[],
): Record<string, number> {
  const out: Record<string, number> = { 火: 0, 土: 0, 风: 0, 水: 0 };
  for (const s of signs) out[s.element] = (out[s.element] ?? 0) + 1;
  return out;
}

/** 星座配对评分（同元素 +2，同四正 +1，对宫 +3，其余 0，映射到 60-100） */
export function zodiacCompatibility(
  a: ZodiacSign,
  b: ZodiacSign,
): {
  score: number;
  desc: string;
} {
  let raw = 0;
  const pairs: string[] = [];
  if (a.element === b.element) {
    raw += 2;
    pairs.push("同元素，相处自然");
  }
  if (a.mode === b.mode) {
    raw += 1;
    pairs.push("同四正，节奏一致");
  }
  if (Math.abs(a.index - b.index) === 6) {
    raw += 3;
    pairs.push("对宫星座，互补吸引");
  }
  const score = Math.min(100, 60 + raw * 10);
  const desc = pairs.length
    ? pairs.join("；")
    : "元素与四正皆不同，需要更多理解与磨合";
  return { score, desc };
}

/* ------------------------------------------------------------------ */
/* 科学计算器（在基础表达式之上扩展数学函数 / 常量 / 统计）               */
/* ------------------------------------------------------------------ */

/** 科学计算器支持的额外数学函数（供 UI 提示展示） */
export const SCI_FUNCTIONS: { name: string; desc: string }[] = [
  { name: "sqrt(x)", desc: "平方根" },
  { name: "cbrt(x)", desc: "立方根" },
  { name: "pow(x,y)", desc: "x 的 y 次方" },
  { name: "exp(x)", desc: "e 的 x 次方" },
  { name: "ln(x) / log(x)", desc: "自然对数 / 常用对数" },
  { name: "log2(x)", desc: "以 2 为底的对数" },
  { name: "log(b,x)", desc: "以 b 为底 x 的对数" },
  { name: "sin/cos/tan(x)", desc: "三角函数（随角度制）" },
  { name: "asin/acos/atan(x)", desc: "反三角函数" },
  { name: "sinh/cosh/tanh(x)", desc: "双曲函数" },
  { name: "abs(x)", desc: "绝对值" },
  { name: "round/floor/ceil(x)", desc: "取整" },
  { name: "min/max(a,b,…)", desc: "极值" },
  { name: "fact(n)", desc: "阶乘" },
  { name: "gcd(a,b) / lcm(a,b)", desc: "最大公约数 / 最小公倍数" },
  { name: "hypot(a,b)", desc: "直角三角形斜边" },
  { name: "nCr(n,r) / nPr(n,r)", desc: "组合数 / 排列数" },
];

/** 科学计算器常量 */
export const SCI_CONSTANTS: { name: string; value: number; desc: string }[] = [
  { name: "pi", value: Math.PI, desc: "圆周率 π" },
  { name: "e", value: Math.E, desc: "自然常数 e" },
];

/** 角度制 / 弧度制互转 */
export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}
export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** 阶乘（非负整数） */
export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error("阶乘仅支持非负整数");
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** 最大公约数（欧几里得算法，支持负数） */
export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

/** 最小公倍数 */
export function lcm(a: number, b: number): number {
  const g = gcd(a, b);
  return g === 0 ? 0 : Math.abs(Math.round(a) * Math.round(b)) / g;
}

/** 组合数 nCr */
export function nCr(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let result = 1;
  const k = Math.min(r, n - r);
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** 排列数 nPr */
export function nPr(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let result = 1;
  for (let i = 0; i < r; i++) result *= n - i;
  return Math.round(result);
}

const DEG_DEGREE_SYMBOL = "°";

/** 角度格式化：把弧度转成「度°分′秒″」 */
export function formatDms(radians: number): string {
  const deg = toDegrees(radians);
  const sign = deg < 0 ? "-" : "";
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let mFull = (abs - d) * 60;
  let m = Math.floor(mFull);
  let s = (mFull - m) * 60;
  // 四舍五入到 0.01″，并处理进位（59.995″ → 60″ → 进 1′）
  s = Math.round(s * 100) / 100;
  if (s >= 60) {
    s -= 60;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  return `${sign}${d}${DEG_DEGREE_SYMBOL}${m}′${s.toFixed(2)}″`;
}

/** 结果格式化：极大/极小转科学计数法，常规数按有效位裁剪 */
export function formatNumber(value: number, precision = 12): string {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return "NaN";
    return value > 0 ? "∞" : "-∞";
  }
  if (value === 0) return "0";
  const abs = Math.abs(value);
  // 先判量级，避免大整数（如 1e20）被当作普通整数输出
  if (abs >= 1e15 || abs < 1e-6) return value.toExponential(6);
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toPrecision(precision));
  return String(rounded);
}

/* ------------------------------------------------------------------ */
/* 统计计算（科学计算器辅助）                                           */
/* ------------------------------------------------------------------ */

export interface StatsSummary {
  count: number;
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  /** 样本标准差 */
  stddev: number;
  /** 总体标准差 */
  stddevP: number;
  variance: number;
}

/** 一组数值的描述统计 */
export function summarizeNumbers(nums: number[]): StatsSummary | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  const n = valid.length;
  const sum = valid.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...valid].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance =
    n > 1 ? valid.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const varianceP = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    count: n,
    sum,
    mean,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    stddev: Math.sqrt(variance),
    stddevP: Math.sqrt(varianceP),
    variance,
  };
}

/** 解析以逗号 / 空格 / 换行分隔的数值列表 */
export function parseNumberList(input: string): number[] {
  return input
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/* ------------------------------------------------------------------ */
/* 易经六十四卦                                                        */
/* ------------------------------------------------------------------ */

/** 六爻（自下而上，索引 0 = 初爻） */
export type YaoLine = 0 | 1;

/** 八卦三爻表与名称（与 tools/hexagramData 对应，此处独立以免循环依赖） */
const BA_GUA_YAO: YaoLine[][] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];
const BA_GUA_NAME = ["坤", "艮", "坎", "巽", "震", "离", "兑", "乾"];

/** 动爻的三种技法 */
export type DivinationMethod = "coin" | "time" | "yarrow" | "number";

export interface DivinationLine {
  /** 本卦该爻阴阳（自下而上） */
  yao: YaoLine;
  /** 是否动爻 */
  moving: boolean;
}

export interface DivinationResult {
  method: DivinationMethod;
  /** 自下而上的六爻（含动爻标记） */
  lines: DivinationLine[];
  /** 本卦二进制值（bit0 = 初爻） */
  originalBits: number;
  /** 变卦二进制值（无动爻时与本体相同） */
  changedBits: number;
  /** 动爻位置（1..6，自下而上；可多个） */
  movingLines: number[];
  /** 下卦 / 上卦八卦序号 0..7 */
  originalLower: number;
  originalUpper: number;
  changedLower: number;
  changedUpper: number;
  /** 起卦依据（可读文本，用于历史记录与展示） */
  basis: string;
  /** 本卦数字（1..64） */
  originalNo: number;
  changedNo: number;
}

/** 八卦索引（0..7）→ 三爻 */
export function trigramLines(index: number): YaoLine[] {
  return [...BA_GUA_YAO[((index % 8) + 8) % 8]] as YaoLine[];
}

/** 三爻 → 八卦索引 */
export function trigramIndex(lines: YaoLine[]): number {
  let v = 0;
  if (lines[0]) v |= 1;
  if (lines[1]) v |= 2;
  if (lines[2]) v |= 4;
  return v;
}

/** 六爻（自下而上）→ 二进制值（bit0 = 初爻） */
export function bitsFromLines(lines: YaoLine[]): number {
  let bits = 0;
  for (let i = 0; i < 6; i++) if (lines[i]) bits |= 1 << i;
  return bits;
}

/** 二进制值 → 六爻（自下而上） */
export function linesFromBits(bits: number): YaoLine[] {
  return Array.from({ length: 6 }, (_, i) =>
    (bits >> i) & 1 ? 1 : 0,
  ) as YaoLine[];
}

/** 六爻 → 上下卦八卦索引 */
export function trigramsFromBits(bits: number): {
  lower: number;
  upper: number;
} {
  return { lower: bits & 7, upper: (bits >> 3) & 7 };
}

/** 由自下而上的六爻与动爻标记构造完整起卦结果 */
export function buildDivination(
  method: DivinationMethod,
  lines: YaoLine[],
  movingIdx: number[],
  basis: string,
): DivinationResult {
  const originals = lines.slice(0, 6) as YaoLine[];
  const moving = new Set(movingIdx);
  const changed = originals.map((y, i) =>
    moving.has(i + 1) ? ((1 - y) as YaoLine) : y,
  );
  const originalBits = bitsFromLines(originals);
  const changedBits = bitsFromLines(changed);
  const o = trigramsFromBits(originalBits);
  const c = trigramsFromBits(changedBits);
  return {
    method,
    lines: originals.map((y, i) => ({ yao: y, moving: moving.has(i + 1) })),
    originalBits,
    changedBits,
    movingLines: [...movingIdx].sort((a, b) => a - b),
    originalLower: o.lower,
    originalUpper: o.upper,
    changedLower: c.lower,
    changedUpper: c.upper,
    basis,
    originalNo: 0,
    changedNo: 0,
  };
}

/** 八卦数（先天数）：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8 */
const XIANTIAN_ORDER = [7, 6, 5, 4, 3, 2, 1, 0]; // 索引为八卦序号 → 先天数-1

/** 数字 → 先天八卦序号（1..8 → 0..7），0/8 视为坤 */
export function xiantianTrigramIndex(n: number): number {
  const k = (((Math.trunc(n) - 1) % 8) + 8) % 8;
  return XIANTIAN_ORDER[k];
}

/** 先天八卦序 → 数字（1..8） */
export function xiantianNumberOf(index: number): number {
  return XIANTIAN_ORDER.indexOf(((index % 8) + 8) % 8) + 1;
}

/** 金钱卦（三枚铜钱）：返回 (正面上数, 是否动爻) */
function coinToss(rng: () => number): { faces: number; moving: boolean } {
  let faces = 0;
  for (let i = 0; i < 3; i++) if (rng() < 0.5) faces++;
  return { faces, moving: faces === 0 || faces === 3 };
}

/** 摇卦：自下而上六次抛掷三枚铜钱 */
export function divinateByCoin(
  rng: () => number = Math.random,
): DivinationResult {
  const lines: YaoLine[] = [];
  const movingIdx: number[] = [];
  const detail: string[] = [];
  for (let i = 0; i < 6; i++) {
    const { faces, moving } = coinToss(rng);
    // 正面上数 ≥1 记阳，否则阴（三反为老阳，三正为老阴）
    lines.push(faces >= 1 ? 1 : 0);
    if (moving) movingIdx.push(i + 1);
    detail.push(`${faces}正${3 - faces}反${moving ? "（动）" : ""}`);
  }
  return buildDivination(
    "coin",
    lines,
    movingIdx,
    `金钱卦 · ${detail.join(" / ")}`,
  );
}

/** 时间起卦：以（年支数 + 月 + 日）定上卦，加时支数定下卦，合数取动爻 */
export function divinateByTime(date: Date): DivinationResult {
  const lunar = toLunar(date);
  const branchOf = (yy: number): number => (((yy % 12) + 12) % 12) + 1;
  // 年支序（子=1）：以农历年地支计
  const lunarYear = lunar ? lunar.year : date.getFullYear();
  const yearBranch = branchOf(lunarYear - 4);
  const monthNo = lunar ? lunar.month : date.getMonth() + 1;
  const dayNo = lunar ? lunar.day : date.getDate();
  const hourBranch = branchOf(Math.floor((date.getHours() + 1) / 2));

  const upNum = yearBranch + monthNo + dayNo;
  const downNum = upNum + hourBranch;
  const upper = xiantianTrigramIndex(upNum);
  const lower = xiantianTrigramIndex(downNum);

  const upperLines = trigramLines(upper);
  const lowerLines = trigramLines(lower);
  const lines = [...lowerLines, ...upperLines] as YaoLine[]; // 自下而上：下卦在初

  // 动爻 = 总数 ÷ 6 之余（余 0 取 6）
  const total = upNum + downNum;
  const moving = ((total % 6) + 6) % 6 || 6;

  const basis =
    `时间起卦 · ${lunar ? `${lunar.ganzhi}年${lunar.monthText}${lunar.dayText}` : formatDate(date)} ` +
    `${String(date.getHours()).padStart(2, "0")}时｜` +
    `上卦(${yearBranch}+${monthNo}+${dayNo}=${upNum}) 下卦(+${hourBranch}=${downNum}) 动${moving}爻`;

  return buildDivination("time", lines, [moving], basis);
}

/** 报数起卦：两个（或三个）数字定上下卦与动爻 */
export function divinateByNumber(
  a: number,
  b: number,
  c?: number,
): DivinationResult {
  const upper = xiantianTrigramIndex(a);
  const lower = xiantianTrigramIndex(b);
  const lines = [...trigramLines(lower), ...trigramLines(upper)] as YaoLine[];
  const total =
    Math.trunc(a) + Math.trunc(b) + (c === undefined ? 0 : Math.trunc(c));
  const moving = ((total % 6) + 6) % 6 || 6;
  const basis = `报数起卦 · 上卦数 ${Math.trunc(a)}、下卦数 ${Math.trunc(b)}${c === undefined ? "" : `、动爻数 ${Math.trunc(c)}`}，动 ${moving} 爻`;
  return buildDivination("number", lines, [moving], basis);
}

/** 大衍筮法（简化为随机），同金钱卦但记录为蓍草法 */
export function divinateByYarrow(
  rng: () => number = Math.random,
): DivinationResult {
  const res = divinateByCoin(rng);
  return {
    ...res,
    method: "yarrow",
    basis: `大衍筮法（模拟） · ${res.basis.replace("金钱卦 · ", "")}`,
  };
}

/** 由任意结果重建（用于历史恢复） */
export function divinationFromBits(
  method: DivinationMethod,
  originalBits: number,
  movingLines: number[],
  basis: string,
): DivinationResult {
  return buildDivination(
    method,
    linesFromBits(originalBits),
    movingLines,
    basis,
  );
}

/** 动爻数量 → 断卦主爻（无动爻看卦辞，1 爻看该爻，多爻看变卦或综观） */
export function judgingRuleText(movingCount: number): string {
  switch (movingCount) {
    case 0:
      return "六爻安静：以本卦卦辞断之，守本卦之义。";
    case 1:
      return "一爻独动：以本卦动爻爻辞为主断，变卦为辅。";
    case 2:
      return "两爻齐动：以本卦上动爻爻辞为主，下动爻为辅。";
    case 3:
      return "三爻发动：本卦与变卦卦辞参看，以本卦为体、变卦为用。";
    case 4:
      return "四爻发动：以变卦下静爻爻辞为主，本卦为体。";
    case 5:
      return "五爻发动：以变卦唯一静爻爻辞为主，观其变。";
    default:
      return "六爻皆动：乾坤用九用六之义，以变卦卦辞为断。";
  }
}

/* ------------------------------------------------------------------ */
/* XML 工具（纯函数：转义 / 解析 / 校验 / 格式化 / 压缩）               */
/* ------------------------------------------------------------------ */

/** XML 语法错误：携带出错偏移，可换算行号/列号 */
export class XmlSyntaxError extends Error {
  readonly offset: number;
  readonly line: number;
  readonly col: number;
  constructor(message: string, offset: number, source: string) {
    super(message);
    this.name = "XmlSyntaxError";
    this.offset = offset;
    const before = source.slice(0, offset);
    const lines = before.split("\n");
    this.line = lines.length;
    this.col = (lines[lines.length - 1]?.length ?? 0) + 1;
  }
}

export interface XmlAttrNode {
  name: string;
  value: string;
  quote: '"' | "'";
}

export type XmlAstNode =
  | {
      kind: "element";
      name: string;
      attrs: XmlAttrNode[];
      selfClosing: boolean;
      children: XmlAstNode[];
    }
  | { kind: "text"; content: string }
  | { kind: "comment"; content: string }
  | { kind: "cdata"; content: string }
  | { kind: "pi"; content: string }
  | { kind: "doctype"; content: string };

const XML_NAME_START = /[A-Za-z_:]/;
const XML_NAME_CHAR = /[A-Za-z0-9_.:-]/;

function posError(msg: string, offset: number, source: string): XmlSyntaxError {
  return new XmlSyntaxError(msg, offset, source);
}

/**
 * 轻量 XML 解析器（无 DOM 依赖）：
 * 支持元素 / 属性 / 文本 / 注释 / CDATA / 处理指令(含声明) / DOCTYPE(含内部子集)。
 * 解析成功即代表 well-formed（标签配对、引号闭合、单一根元素、结尾无杂散内容）。
 * 抛出 XmlSyntaxError 时携带行列信息。
 */
export function parseXmlNodes(source: string): XmlAstNode[] {
  const s = source;
  const n = s.length;
  let i = 0;
  const root: XmlAstNode[] = [];
  // stack 中的元素节点（root 之下的层级）
  const stack: Extract<XmlAstNode, { kind: "element" }>[] = [];
  let rootClosed = false; // 根元素闭合后再出现元素 / 非空白文本 → 报错

  const curChildren = (): XmlAstNode[] =>
    stack.length ? stack[stack.length - 1].children : root;

  const parseName = (): string => {
    if (i >= n || !XML_NAME_START.test(s[i])) {
      throw posError(`此处应为合法的名称（以字母 / 下划线 / 冒号开头）`, i, s);
    }
    const start = i;
    i++;
    while (i < n && XML_NAME_CHAR.test(s[i])) i++;
    return s.slice(start, i);
  };

  const skipWs = (): void => {
    while (i < n && /\s/.test(s[i])) i++;
  };

  while (i < n) {
    if (s[i] !== "<") {
      // 文本节点：直到下一个 '<'
      const start = i;
      while (i < n && s[i] !== "<") i++;
      const content = s.slice(start, i);
      if (stack.length === 0) {
        if (content.trim()) {
          throw posError(`根元素之外不允许出现非空白文本`, start, s);
        }
        curChildren().push({ kind: "text", content });
      } else {
        curChildren().push({ kind: "text", content });
      }
      continue;
    }

    // 各种 '<' 开头的结构
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end < 0) throw posError(`注释未闭合（缺少 "-->"）`, i, s);
      if (rootClosed) throw posError(`根元素闭合后不允许再出现注释`, i, s);
      curChildren().push({ kind: "comment", content: s.slice(i + 4, end) });
      i = end + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i + 9);
      if (end < 0) throw posError(`CDATA 未闭合（缺少 "]]>"）`, i, s);
      if (rootClosed) throw posError(`根元素闭合后不允许再出现 CDATA`, i, s);
      if (stack.length === 0) {
        throw posError(`CDATA 不允许出现在根元素之外`, i, s);
      }
      curChildren().push({ kind: "cdata", content: s.slice(i + 9, end) });
      i = end + 3;
      continue;
    }
    if (s.startsWith("<?", i)) {
      const end = s.indexOf("?>", i + 2);
      if (end < 0) throw posError(`处理指令未闭合（缺少 "?>"）`, i, s);
      if (rootClosed) throw posError(`根元素闭合后不允许再出现处理指令`, i, s);
      if (stack.length > 0) {
        throw posError(`处理指令 / 声明不允许出现在元素内部`, i, s);
      }
      curChildren().push({ kind: "pi", content: s.slice(i + 2, end) });
      i = end + 2;
      continue;
    }
    if (s.startsWith("<!", i)) {
      // DOCTYPE 等声明：需兼容内部子集 [...] 中的 '>'
      let depth = 0;
      let j = i + 2;
      while (j < n) {
        const c = s[j];
        if (c === "[") depth++;
        else if (c === "]") depth = Math.max(0, depth - 1);
        else if (c === ">" && depth === 0) break;
        j++;
      }
      if (j >= n) throw posError(`DOCTYPE 声明未闭合（缺少 ">"）`, i, s);
      if (rootClosed || stack.length > 0) {
        throw posError(`DOCTYPE 只能出现在根元素之前`, i, s);
      }
      curChildren().push({ kind: "doctype", content: s.slice(i + 2, j) });
      i = j + 1;
      continue;
    }
    if (s.startsWith("</", i)) {
      i += 2;
      const name = parseName();
      skipWs();
      if (s[i] !== ">") throw posError(`闭合标签应以 ">" 结束`, i, s);
      i++;
      const top = stack[stack.length - 1];
      if (!top)
        throw posError(
          `闭合标签 </${name}> 没有对应的开始标签`,
          i - name.length - 2,
          s,
        );
      if (top.name !== name) {
        throw posError(
          `标签不匹配：期望 </${top.name}>，实际 </${name}>`,
          i - name.length - 2,
          s,
        );
      }
      stack.pop();
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    // 开始标签
    i++; // 跳过 '<'
    const name = parseName();
    const attrs: XmlAttrNode[] = [];
    let selfClosing = false;
    for (;;) {
      skipWs();
      if (i >= n) throw posError(`标签 <${name} 意外结束（缺少 ">"）`, i, s);
      if (s[i] === ">") {
        i++;
        break;
      }
      if (s.startsWith("/>", i)) {
        selfClosing = true;
        i += 2;
        break;
      }
      // 属性
      const attrName = parseName();
      skipWs();
      if (s[i] !== "=") throw posError(`属性 ${attrName} 缺少 "="`, i, s);
      i++;
      skipWs();
      const quote = s[i];
      if (quote !== '"' && quote !== "'") {
        throw posError(`属性 ${attrName} 的值必须用引号包裹`, i, s);
      }
      i++;
      const vStart = i;
      while (i < n && s[i] !== quote) i++;
      if (i >= n)
        throw posError(
          `属性 ${attrName} 的值未闭合（缺少 ${quote}）`,
          vStart - 1,
          s,
        );
      const value = s.slice(vStart, i);
      i++;
      if (attrs.some((a) => a.name === attrName)) {
        throw posError(`属性重复：${attrName}`, i, s);
      }
      attrs.push({ name: attrName, value, quote: quote as '"' | "'" });
    }
    if (rootClosed) {
      throw posError(
        `根元素已闭合，不允许再出现元素 <${name}>`,
        i - name.length - 1,
        s,
      );
    }
    const el: Extract<XmlAstNode, { kind: "element" }> = {
      kind: "element",
      name,
      attrs,
      selfClosing,
      children: [],
    };
    curChildren().push(el);
    if (!selfClosing) stack.push(el);
    continue;
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    throw posError(`元素 <${top.name}> 未闭合（缺少 </${top.name}>）`, n, s);
  }
  const rootEls = root.filter((c) => c.kind === "element");
  if (rootEls.length === 0) {
    throw posError(`未找到根元素`, 0, s);
  }
  if (rootEls.length > 1) {
    throw posError(`存在多个根元素（XML 只允许一个根）`, n, s);
  }
  return root;
}

/** XML 文本转义（& < > " '） */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** XML 实体反转义（命名实体 + 十进制 / 十六进制数字实体） */
export function unescapeXml(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g,
    (m, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const code = parseInt(body.slice(2), 16);
        return Number.isFinite(code) && code > 0
          ? String.fromCodePoint(code)
          : m;
      }
      if (body.startsWith("#")) {
        const code = parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0
          ? String.fromCodePoint(code)
          : m;
      }
      const named = XML_ENTITIES[body];
      return named ?? m;
    },
  );
}

/** 校验 XML 是否 well-formed，返回错误信息（含行列）或 null */
export function checkXmlWellFormed(source: string): string | null {
  try {
    parseXmlNodes(source);
    return null;
  } catch (e) {
    if (e instanceof XmlSyntaxError)
      return `第 ${e.line} 行第 ${e.col} 列：${e.message}`;
    return (e as Error).message;
  }
}

/** XML 统计信息（元素 / 属性 / 最大深度 / 根元素名；解析失败返回 null） */
export function collectXmlStats(
  source: string,
): { elements: number; attrs: number; depth: number; root: string } | null {
  let nodes: XmlAstNode[];
  try {
    nodes = parseXmlNodes(source);
  } catch {
    return null;
  }
  let elements = 0;
  let attrs = 0;
  let depth = 0;
  let root = "";
  const walk = (children: XmlAstNode[], d: number): void => {
    for (const node of children) {
      if (node.kind !== "element") continue;
      elements++;
      attrs += node.attrs.length;
      depth = Math.max(depth, d);
      if (d === 1 && !root) root = node.name;
      walk(node.children, d + 1);
    }
  };
  walk(nodes, 1);
  return { elements, attrs, depth, root };
}

function renderAttrs(attrs: XmlAttrNode[], spaced: boolean): string {
  return attrs
    .map((a) => ` ${a.name}=${a.quote}${a.value}${a.quote}`)
    .join(spaced ? "" : "");
}

/** XML 美化格式化（indent 为缩进空格数；文本节点做空白折叠） */
export function formatXml(source: string, indent = 2): string {
  const nodes = parseXmlNodes(source);
  const pad = (depth: number): string => " ".repeat(depth * indent);
  const out: string[] = [];

  const renderText = (raw: string): string => raw.replace(/\s+/g, " ").trim();

  const walk = (children: XmlAstNode[], depth: number): void => {
    for (const node of children) {
      switch (node.kind) {
        case "pi":
          out.push(`${pad(depth)}<?${node.content}?>`);
          break;
        case "doctype":
          out.push(`${pad(depth)}<!${node.content}>`);
          break;
        case "comment":
          out.push(`${pad(depth)}<!--${node.content}-->`);
          break;
        case "cdata":
          out.push(`${pad(depth)}<![CDATA[${node.content}]]>`);
          break;
        case "text": {
          const text = renderText(node.content);
          if (text) out.push(`${pad(depth)}${escapeXml(text)}`);
          break;
        }
        case "element": {
          const attrs = renderAttrs(node.attrs, true);
          if (node.selfClosing) {
            out.push(`${pad(depth)}<${node.name}${attrs}/>`);
            break;
          }
          const meaningful = node.children.filter(
            (c) => !(c.kind === "text" && !c.content.trim()),
          );
          if (meaningful.length === 0) {
            out.push(`${pad(depth)}<${node.name}${attrs}></${node.name}>`);
          } else if (
            meaningful.length === 1 &&
            meaningful[0].kind === "text" &&
            meaningful[0].content.trim().length <= 60
          ) {
            // 短文本元素保持单行
            out.push(
              `${pad(depth)}<${node.name}${attrs}>${escapeXml(renderText(meaningful[0].content))}</${node.name}>`,
            );
          } else {
            out.push(`${pad(depth)}<${node.name}${attrs}>`);
            walk(node.children, depth + 1);
            out.push(`${pad(depth)}</${node.name}>`);
          }
          break;
        }
      }
    }
  };

  walk(nodes, 0);
  return out.join("\n");
}

/** XML 压缩：去掉标签间无意义空白、折叠文本空白 */
export function minifyXml(source: string): string {
  const nodes = parseXmlNodes(source);
  const out: string[] = [];

  const walk = (children: XmlAstNode[]): void => {
    for (const node of children) {
      switch (node.kind) {
        case "pi":
          out.push(`<?${node.content.replace(/\s+/g, " ").trim()}?>`);
          break;
        case "doctype":
          out.push(`<!${node.content.replace(/\s+/g, " ").trim()}>`);
          break;
        case "comment":
          // 压缩模式默认丢弃注释（恢复文本用格式化 + 保留注释）
          break;
        case "cdata":
          out.push(`<![CDATA[${node.content}]]>`);
          break;
        case "text": {
          const text = node.content.replace(/\s+/g, " ").trim();
          if (text) out.push(escapeXml(text));
          break;
        }
        case "element": {
          const attrs = node.attrs
            .map((a) => `${a.name}=${a.quote}${a.value}${a.quote}`)
            .join(" ");
          const tag = attrs ? `<${node.name} ${attrs}` : `<${node.name}`;
          if (node.selfClosing) {
            out.push(`${tag}/>`);
          } else {
            out.push(`${tag}>`);
            walk(node.children);
            out.push(`</${node.name}>`);
          }
          break;
        }
      }
    }
  };

  walk(nodes);
  return out.join("");
}

/* ------------------------------------------------------------------ */
/* 智能取名（算法模式：纯函数，可脱离 UI 单测）                          */
/* ------------------------------------------------------------------ */

export type NameScene = "person" | "variable" | "project" | "nickname";
export type NameStyle = "camel" | "snake" | "kebab" | "pascal" | "constant";

export interface SmartNameItem {
  name: string;
  note: string;
}

export interface SmartNameInput {
  /** 关键词（中英文 / 空格 / 逗号分隔，可多项） */
  keywords: string;
  scene: NameScene;
  /** 命名风格（variable 场景使用） */
  style?: NameStyle;
  /** 期望产出数量 */
  count?: number;
  /** 随机种子（同一 seed 结果可复现） */
  seed?: number;
}

/** mulberry32 确定性随机数发生器 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 拆分关键词（支持空格 / 中英文逗号 / 顿号 / 分号 / 斜杠） */
export function splitNameKeywords(text: string): string[] {
  return text
    .split(/[\s,，、;；/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 单个关键词 → ASCII 词元数组（中文转拼音音节，英文按驼峰 / 分隔符拆词） */
export function keywordToTokens(keyword: string): string[] {
  if (!keyword) return [];
  const hasZh = /[\u4e00-\u9fff]/.test(keyword);
  if (!hasZh) {
    return keyword
      .replace(/[_\-./]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);
  }
  // 中文 → 拼音频节词元
  const syllables = pinyin(keyword, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  }) as unknown as string[];
  return syllables
    .join(" ")
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

/** 按命名风格拼接词元 */
export function joinNameStyle(tokens: string[], style: NameStyle): string {
  if (!tokens.length) return "";
  switch (style) {
    case "snake":
      return tokens.join("_");
    case "kebab":
      return tokens.join("-");
    case "constant":
      return tokens.map((t) => t.toUpperCase()).join("_");
    case "pascal":
      return tokens.map((t) => t[0].toUpperCase() + t.slice(1)).join("");
    case "camel":
    default:
      return tokens
        .map((t, idx) => (idx === 0 ? t : t[0].toUpperCase() + t.slice(1)))
        .join("");
  }
}

/** 变量命名的常用语义后缀（搭配任何词元组合） */
const VAR_SUFFIXES: Array<[string, string]> = [
  ["", "朴素直译"],
  ["List", "集合 / 列表"],
  ["Count", "数量"],
  ["Map", "键值映射"],
  ["Data", "数据载体"],
  ["Info", "描述信息"],
  ["Item", "单项"],
  ["Type", "类型判别"],
  ["Value", "取值"],
  ["Cache", "缓存"],
  ["Handler", "事件处理"],
  ["Service", "业务服务"],
  ["Manager", "生命周期管理"],
  ["Factory", "工厂创建"],
  ["Builder", "分步构建"],
  ["Parser", "解析器"],
  ["Utils", "静态工具集"],
];

const VAR_BOOL_PREFIXES = ["is", "has", "can", "should"];

/* ── 人名场景：姓氏与寓意字库 ── */

/** 常见姓氏（常用单姓 + 复姓） */
const PERSON_SURNAMES = new Set([
  "王",
  "李",
  "张",
  "刘",
  "陈",
  "杨",
  "黄",
  "赵",
  "吴",
  "周",
  "徐",
  "孙",
  "马",
  "朱",
  "胡",
  "郭",
  "何",
  "林",
  "罗",
  "高",
  "郑",
  "梁",
  "谢",
  "宋",
  "唐",
  "许",
  "韩",
  "冯",
  "邓",
  "曹",
  "彭",
  "曾",
  "肖",
  "田",
  "董",
  "袁",
  "潘",
  "于",
  "蒋",
  "蔡",
  "余",
  "杜",
  "叶",
  "程",
  "苏",
  "魏",
  "吕",
  "丁",
  "任",
  "沈",
  "姚",
  "卢",
  "姜",
  "崔",
  "钟",
  "谭",
  "陆",
  "汪",
  "范",
  "金",
  "石",
  "廖",
  "贾",
  "夏",
  "韦",
  "付",
  "方",
  "白",
  "邹",
  "孟",
  "熊",
  "秦",
  "邱",
  "江",
  "尹",
  "薛",
  "闫",
  "段",
  "雷",
  "侯",
  "龙",
  "史",
  "陶",
  "黎",
  "贺",
  "顾",
  "毛",
  "郝",
  "龚",
  "邵",
  "万",
  "钱",
  "严",
  "覃",
  "武",
  "戴",
  "莫",
  "孔",
  "向",
  "汤",
  "欧阳",
  "司马",
  "上官",
  "诸葛",
  "东方",
  "公孙",
  "慕容",
  "宇文",
  "令狐",
]);

/** 人名寓意字库（g：m 男孩 / f 女孩 / n 中性通用） */
const PERSON_NAME_CHARS: Array<{
  ch: string;
  note: string;
  g: "m" | "f" | "n";
}> = [
  { ch: "睿", note: "聪慧明达", g: "m" },
  { ch: "哲", note: "智慧深邃", g: "m" },
  { ch: "轩", note: "气宇轩昂", g: "m" },
  { ch: "宇", note: "胸怀宽广", g: "m" },
  { ch: "泽", note: "恩泽深厚", g: "m" },
  { ch: "毅", note: "坚毅果敢", g: "m" },
  { ch: "恒", note: "持之以恒", g: "m" },
  { ch: "诚", note: "诚实守信", g: "m" },
  { ch: "博", note: "博学多识", g: "m" },
  { ch: "瀚", note: "学识浩瀚", g: "m" },
  { ch: "骏", note: "才智超群", g: "m" },
  { ch: "铭", note: "铭记于心", g: "m" },
  { ch: "远", note: "志向高远", g: "m" },
  { ch: "航", note: "扬帆远航", g: "m" },
  { ch: "骁", note: "勇毅出众", g: "m" },
  { ch: "川", note: "山川气象", g: "m" },
  { ch: "峰", note: "登峰造极", g: "m" },
  { ch: "朗", note: "爽朗明快", g: "m" },
  { ch: "婉", note: "温婉可人", g: "f" },
  { ch: "静", note: "娴静文雅", g: "f" },
  { ch: "瑶", note: "美玉无瑕", g: "f" },
  { ch: "芸", note: "书香雅致", g: "f" },
  { ch: "婷", note: "娉婷袅娜", g: "f" },
  { ch: "雅", note: "高雅脱俗", g: "f" },
  { ch: "慧", note: "慧心巧思", g: "f" },
  { ch: "欣", note: "欣欣向荣", g: "f" },
  { ch: "悦", note: "喜悦安然", g: "f" },
  { ch: "诗", note: "诗意灵秀", g: "f" },
  { ch: "若", note: "蕙质兰心", g: "f" },
  { ch: "菡", note: "荷花清丽", g: "f" },
  { ch: "岚", note: "山间灵气", g: "f" },
  { ch: "月", note: "皎洁温柔", g: "f" },
  { ch: "琳", note: "美玉琳琅", g: "f" },
  { ch: "怡", note: "心旷神怡", g: "f" },
  { ch: "颖", note: "聪颖出众", g: "f" },
  { ch: "瑾", note: "怀瑾握瑜", g: "f" },
  { ch: "安", note: "平安顺遂", g: "n" },
  { ch: "乐", note: "乐观豁达", g: "n" },
  { ch: "明", note: "光明磊落", g: "n" },
  { ch: "知", note: "知行合一", g: "n" },
  { ch: "清", note: "清澈纯粹", g: "n" },
  { ch: "和", note: "温和敦厚", g: "n" },
  { ch: "嘉", note: "嘉言懿行", g: "n" },
  { ch: "瑞", note: "祥瑞之兆", g: "n" },
  { ch: "晨", note: "晨光熹微", g: "n" },
  { ch: "辰", note: "星辰大海", g: "n" },
  { ch: "宁", note: "宁静致远", g: "n" },
  { ch: "一", note: "专一纯粹", g: "n" },
  { ch: "南", note: "温暖向阳", g: "n" },
  { ch: "禾", note: "茁壮成长", g: "n" },
  { ch: "言", note: "信守诺言", g: "n" },
  { ch: "予", note: "慷慨给予", g: "n" },
  { ch: "书", note: "诗书传家", g: "n" },
  { ch: "可", note: "可心可意", g: "n" },
  { ch: "亦", note: "亦真亦雅", g: "n" },
];

const GENDER_MALE_WORDS = new Set(["男", "男孩", "男宝", "儿子"]);
const GENDER_FEMALE_WORDS = new Set(["女", "女孩", "女宝", "女儿"]);

/** 从关键词提取姓氏（支持「王」「姓李」形式；未识别返回 null） */
export function extractPersonSurname(kws: string[]): string | null {
  for (const k of kws) {
    const s = k.replace(/^姓[:：]?/, "");
    if (PERSON_SURNAMES.has(s)) return s;
  }
  return null;
}

/** 从关键词判断性别倾向（精确匹配词表；未出现或矛盾返回 n 中性） */
export function detectNameGender(kws: string[]): "m" | "f" | "n" {
  let m = false;
  let f = false;
  for (const k of kws) {
    if (GENDER_MALE_WORDS.has(k)) m = true;
    if (GENDER_FEMALE_WORDS.has(k)) f = true;
  }
  if (m && !f) return "m";
  if (f && !m) return "f";
  return "n";
}

/** 项目 / 品牌名的通用词根后缀 */
const PROJECT_SUFFIXES = [
  "hub",
  "kit",
  "lab",
  "flow",
  "forge",
  "deck",
  "mind",
  "wave",
  "nova",
  "spark",
  "sync",
  "wise",
  "works",
  "box",
  "link",
  "note",
  "dock",
  "beam",
  "core",
  "base",
  "cloud",
  "stack",
  "shell",
  "grid",
  "path",
  "port",
  "node",
  "edge",
  "peak",
  "loop",
];

/** 中文网名意象词库（前缀） */
const NICK_PREFIX = [
  "清风",
  "晚风",
  "山野",
  "深巷",
  "半糖",
  "星野",
  "云间",
  "枕月",
  "拾光",
  "竹里",
  "疏影",
  "南屿",
  "北渡",
  "青柠",
  "桃汽",
  "雾岛",
  "空山",
  "新茶",
  "迟夏",
  "早春",
  "九霄",
  "折柳",
  "听澜",
  "踏雪",
  "衔烛",
  "眠鸥",
  "移山",
  "酿雾",
];

/** 中文网名身份词库（后缀） */
const NICK_SUFFIX = [
  "少年",
  "行者",
  "旅客",
  "邮差",
  "观星者",
  "手艺人",
  "守夜人",
  "拾荒者",
  "骑士",
  "诗人",
  "渔夫",
  "船长",
  "园丁",
  "修灯人",
  "赶路人",
  "收信人",
  "织梦者",
  "白日梦想家",
  "无名氏",
  "落单的猫",
];

const NICK_JOINT = ["·", "的", "与", "_"];

/**
 * 算法智能取名：
 *  - person  ：姓氏 × 寓意字库组合（单字名 / 双字名，可按性别与寓意关键词过滤）
 *  - variable：关键词词元 + 命名风格 + 语义前后缀组合
 *  - project ：关键词词根 + 品牌/项目后缀词库（多拼写风格）
 *  - nickname：中文网名意象词库组合（可掺入中文关键词）
 */
export function generateSmartNames(input: SmartNameInput): SmartNameItem[] {
  const { keywords, scene, style = "camel", count = 12, seed = 42 } = input;
  const kws = splitNameKeywords(keywords);
  if (!kws.length) return [];

  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const tokenSets = kws
    .map((k) => keywordToTokens(k))
    .filter((t) => t.length > 0);
  if (!tokenSets.length) return [];
  const flatTokens = tokenSets.flat();

  const result: SmartNameItem[] = [];
  const seen = new Set<string>();
  const push = (name: string, note: string): void => {
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push({ name, note });
    }
  };

  if (scene === "person") {
    const surname = extractPersonSurname(kws);
    const gender = detectNameGender(kws);
    // 寓意关键词：去掉姓氏 / 性别词 / 「寓意/期望」等前缀
    const meaningKws = kws
      .map((k) => k.replace(/^(寓意|期望|希望|想要)[:：]?/, ""))
      .filter(
        (k) =>
          k &&
          !PERSON_SURNAMES.has(k.replace(/^姓[:：]?/, "")) &&
          !GENDER_MALE_WORDS.has(k) &&
          !GENDER_FEMALE_WORDS.has(k) &&
          !/^(寓意|期望|希望|想要)$/.test(k),
      );
    // 性别过滤：指定性别时保留专属字 + 中性字
    let pool = PERSON_NAME_CHARS.filter(
      (c) => gender === "n" || c.g === gender || c.g === "n",
    );
    // 寓意关键词优先：字库寓意含关键词，或关键词直接给出用字
    if (meaningKws.length) {
      const matched = pool.filter((c) =>
        meaningKws.some((kw) => c.note.includes(kw) || kw.includes(c.ch)),
      );
      if (matched.length >= 2) pool = matched;
    }
    const prefix = surname ?? "";
    const surnameNote = surname ? `姓${surname} · ` : "未识别姓氏（仅名） · ";
    let guard = 0;
    while (result.length < count && guard < count * 10) {
      guard++;
      const c1 = pick(pool);
      if (rng() < 0.35) {
        push(`${prefix}${c1.ch}`, `${surnameNote}单字名 · ${c1.note}`);
        continue;
      }
      const c2 = pick(pool);
      if (c1.ch === c2.ch) continue;
      push(
        `${prefix}${c1.ch}${c2.ch}`,
        `${surnameNote}双字名 · ${c1.note} × ${c2.note}`,
      );
    }
    return result.slice(0, count);
  }

  if (scene === "variable") {
    const styled = joinNameStyle(flatTokens, style);
    const styleLabel: Record<NameStyle, string> = {
      camel: "小驼峰",
      snake: "下划线",
      kebab: "短横线",
      pascal: "大驼峰",
      constant: "全大写常量",
    };
    for (const [suffix, meaning] of VAR_SUFFIXES) {
      if (result.length >= count) break;
      if (!suffix) {
        push(styled, `${styleLabel[style]} · ${meaning}`);
      } else if (style === "constant") {
        push(`${styled}_${suffix.toUpperCase()}`, `全大写常量 · ${meaning}`);
      } else {
        push(
          joinNameStyle([...flatTokens, suffix.toLowerCase()], style),
          `${styleLabel[style]} · ${meaning}`,
        );
      }
    }
    // 布尔前缀族（camel / pascal 才自然）
    if (style === "camel" || style === "pascal") {
      for (const p of VAR_BOOL_PREFIXES) {
        if (result.length >= count) break;
        push(
          joinNameStyle([p, ...flatTokens], style),
          `布尔前缀 ${p} · 表示「是 / 有 / 能」`,
        );
      }
    }
    return result.slice(0, count);
  }

  if (scene === "project") {
    const rootWord = flatTokens.join("");
    const pascalRoot = flatTokens
      .map((t) => t[0].toUpperCase() + t.slice(1))
      .join("");
    const used = new Set<string>();
    let guard = 0;
    while (result.length < count && guard < count * 8) {
      guard++;
      const suffix = pick(PROJECT_SUFFIXES);
      if (used.has(suffix)) continue;
      used.add(suffix);
      const cap = suffix[0].toUpperCase() + suffix.slice(1);
      push(`${pascalRoot}${cap}`, `大驼峰拼词 · 词根 + ${suffix}`);
      push(`${rootWord}-${suffix}`, `kebab-case · 适合包名 / 仓库`);
      push(`${rootWord}_${suffix}`, `snake_case · 适合 Python / CLI`);
      push(`${rootWord}.${suffix}`, `域名风格 · 适合官网`);
    }
    if (result.length < count) {
      const acronym = flatTokens
        .map((t) => t[0])
        .join("")
        .toUpperCase();
      if (acronym.length >= 2) push(acronym, `首字母缩写 · 极简标识`);
    }
    return result.slice(0, count);
  }

  // nickname：中文网名
  const zhKws = kws.filter((k) => /[\u4e00-\u9fff]/.test(k));
  let guard = 0;
  while (result.length < count && guard < count * 8) {
    guard++;
    const prefix = pick(NICK_PREFIX);
    const suffix = pick(NICK_SUFFIX);
    const joint = pick(NICK_JOINT);
    push(`${prefix}${joint}${suffix}`, `意象组合 · ${prefix} × ${suffix}`);
    if (zhKws.length) {
      const kw = pick(zhKws);
      push(`${kw}${pick(NICK_SUFFIX)}`, `关键词 × 身份`);
      push(`${pick(NICK_PREFIX)}${kw}`, `意象 × 关键词`);
    }
  }
  return result.slice(0, count);
}

/* ------------------------------------------------------------------ */
/* PDF 页码范围解析（纯函数）                                            */
/* ------------------------------------------------------------------ */

export interface PageRangeSeg {
  /** 起始页（1-based，含） */
  from: number;
  /** 结束页（1-based，含） */
  to: number;
}

export type PageRangesResult =
  | { ok: true; segs: PageRangeSeg[]; pages: number }
  | { ok: false; error: string };

/**
 * 解析页码范围表达式（1-based）：
 *   "1-3,5,8-10" / "3-"（3 到末尾）/ "-4"（1 到 4）/ "每 N 页" 由 chunkPages 处理
 */
export function parsePageRanges(spec: string, total: number): PageRangesResult {
  const text = spec.trim();
  if (!text) return { ok: false, error: "请输入页码范围，例如 1-3,5,8-10" };
  if (!Number.isInteger(total) || total < 1)
    return { ok: false, error: "PDF 无有效页面" };
  const tokens = text.split(/[,，、\s]+/).filter(Boolean);
  const segs: PageRangeSeg[] = [];
  let pages = 0;
  for (const token of tokens) {
    const m = token.match(/^(\d*)(-)(\d*)$/);
    let from: number;
    let to: number;
    if (m) {
      // "a-b" / "a-" / "-b"
      if (!m[1] && !m[3])
        return { ok: false, error: `范围 "${token}" 两侧都为空` };
      from = m[1] ? Number(m[1]) : 1;
      to = m[3] ? Number(m[3]) : total;
    } else if (/^\d+$/.test(token)) {
      from = Number(token);
      to = from;
    } else {
      return { ok: false, error: `无法识别的页码片段："${token}"` };
    }
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return { ok: false, error: `页码必须是整数："${token}"` };
    }
    if (from < 1 || to < 1)
      return { ok: false, error: `页码从 1 开始："${token}"` };
    if (from > total || to > total) {
      return { ok: false, error: `页码超出范围（共 ${total} 页）："${token}"` };
    }
    if (from > to) return { ok: false, error: `范围起大于止："${token}"` };
    segs.push({ from, to });
    pages += to - from + 1;
  }
  if (!segs.length) return { ok: false, error: "未解析到任何页码" };
  return { ok: true, segs, pages };
}

/** 每 size 页一份分块（size <= 0 视为非法） */
export function chunkPageRanges(total: number, size: number): PageRangesResult {
  if (!Number.isInteger(size) || size < 1) {
    return { ok: false, error: "每份页数必须是 ≥1 的整数" };
  }
  if (!Number.isInteger(total) || total < 1)
    return { ok: false, error: "PDF 无有效页面" };
  const segs: PageRangeSeg[] = [];
  let pages = 0;
  for (let from = 1; from <= total; from += size) {
    const to = Math.min(from + size - 1, total);
    segs.push({ from, to });
    pages += to - from + 1;
  }
  return { ok: true, segs, pages };
}

/* ------------------------------------------------------------------ */
/* 格子拆图 / 格子合图（sprite grid）纯函数                              */
/* ------------------------------------------------------------------ */

export interface GridCellBounds {
  /** 行索引（0-based） */
  row: number;
  /** 列索引（0-based） */
  col: number;
  /** 在源图中的 x 起点（px） */
  x: number;
  /** 在源图中的 y 起点（px） */
  y: number;
  /** 格子宽度（px） */
  w: number;
  /** 格子高度（px） */
  h: number;
}

/**
 * 计算 rows×cols 网格中每个格子在 width×height 画布上的边界。
 * 整除余数全部追加到最后一列 / 最后一行，保证所有格子无缝拼回原图。
 * 图片尺寸小于格子数（如 2px 宽拆 3 列）时返回空数组。
 */
export function gridCellBounds(
  rows: number,
  cols: number,
  width: number,
  height: number,
): GridCellBounds[] {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < c || h < r) return [];
  const cellW = Math.floor(w / c);
  const cellH = Math.floor(h / r);
  const out: GridCellBounds[] = [];
  for (let row = 0; row < r; row++) {
    const y = row * cellH;
    const ch = row === r - 1 ? h - y : cellH;
    for (let col = 0; col < c; col++) {
      const x = col * cellW;
      const cw = col === c - 1 ? w - x : cellW;
      out.push({ row, col, x, y, w: cw, h: ch });
    }
  }
  return out;
}

/** 拆分产物文件名：base_r01_c01.png（行列 1-based，按总行列数补零对齐字典序） */
export function gridCellFileName(
  base: string,
  rows: number,
  cols: number,
  row: number,
  col: number,
): string {
  const pad = Math.max(String(Math.floor(rows)).length, String(Math.floor(cols)).length);
  const rr = String(row + 1).padStart(pad, "0");
  const cc = String(col + 1).padStart(pad, "0");
  return `${base}_r${rr}_c${cc}.png`;
}

/** 去掉扩展名并清洗为安全的文件名基底（保留中文与 . - _，空则回退 "sprite"） */
export function safeFileBase(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "sprite";
}

/** 文件大小人性化（B / KB / MB / GB） */
export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/* ------------------------------------------------------------------ */
/* 表情包制作（meme）纯函数                                              */
/* ------------------------------------------------------------------ */

/** 内置底图模板（程序化绘制，无版权依赖） */
export type MemeTemplateKey = "plain" | "yellow" | "green" | "dark" | "rainbow" | "grid";

export interface MemeTemplate {
  key: MemeTemplateKey;
  name: string;
  desc: string;
  width: number;
  height: number;
}

/** 内置表情包底图模板定义 */
export const MEME_TEMPLATES: MemeTemplate[] = [
  { key: "plain", name: "纯白", desc: "白底浅框，适合任意配图", width: 800, height: 600 },
  { key: "yellow", name: "黄豆脸", desc: "经典黄豆震惊脸", width: 800, height: 600 },
  { key: "green", name: "绿蛙脸", desc: "绿蛙无语脸", width: 600, height: 600 },
  { key: "dark", name: "深空", desc: "深色星空底", width: 800, height: 600 },
  { key: "rainbow", name: "彩虹", desc: "蓝紫渐变底", width: 800, height: 600 },
  { key: "grid", name: "网格纸", desc: "浅色网格底", width: 800, height: 600 },
];

/** 按 key 取模板（未知 key 回退纯白） */
export function memeTemplateOf(key: MemeTemplateKey): MemeTemplate {
  return MEME_TEMPLATES.find((t) => t.key === key) || MEME_TEMPLATES[0];
}

/**
 * 表情包文字换行：按空白切词，超长词按字符硬切；
 * 最多 maxLines 行，超出的内容丢弃（meme 顶/底一般各 2 行）。
 */
export function wrapMemeText(text: string, maxLenPerLine: number, maxLines: number): string[] {
  const src = String(text ?? "").trim();
  if (!src || maxLenPerLine < 1 || maxLines < 1) return [];
  const lines: string[] = [];
  let cur = "";
  const pushLine = (s: string) => {
    if (lines.length < maxLines) lines.push(s);
  };
  for (const w of src.split(/\s+/).filter(Boolean)) {
    if ([...w].length > maxLenPerLine) {
      // 超长词：先把当前行落定，再按字符硬切
      if (cur) {
        pushLine(cur);
        cur = "";
      }
      let chunk = "";
      for (const ch of [...w]) {
        chunk += ch;
        if ([...chunk].length >= maxLenPerLine) {
          pushLine(chunk);
          chunk = "";
        }
      }
      cur = chunk;
      continue;
    }
    const candidate = cur ? `${cur} ${w}` : w;
    if ([...candidate].length <= maxLenPerLine) {
      cur = candidate;
    } else {
      pushLine(cur);
      cur = w;
    }
  }
  if (cur) pushLine(cur);
  return lines;
}

/** 字号适配参数 */
export interface MemeFitOptions {
  lines: string[];
  maxWidth: number;
  maxHeight: number;
  baseFontSize: number;
  minFontSize: number;
  /** 单行文本在某字号下的像素宽度（调用方注入 ctx.measureText） */
  measure: (line: string, fontSize: number) => number;
  /** 行高系数（行高 = fontSize × lineHeight） */
  lineHeight?: number;
}

/** 在 [minFontSize, baseFontSize] 内二分找能放下全部行且不超宽的最大字号 */
export function memeFitFontSize(opts: MemeFitOptions): number {
  const { lines, maxWidth, maxHeight, baseFontSize, minFontSize, measure, lineHeight = 1.15 } = opts;
  if (!lines.length || maxWidth <= 0 || maxHeight <= 0) return minFontSize;
  const fits = (fs: number): boolean =>
    lines.every((l) => measure(l, fs) <= maxWidth) && lines.length * fs * lineHeight <= maxHeight;
  if (fits(baseFontSize)) return baseFontSize;
  if (!fits(minFontSize)) return minFontSize;
  let lo = minFontSize;
  let hi = baseFontSize;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 顶部 / 底部文字区布局结果 */
export interface MemeZone {
  lines: string[];
  /** 文本锚点 x（水平居中） */
  x: number;
  /** 每行文字基线 y */
  ys: number[];
  fontSize: number;
  lineHeight: number;
}

export interface MemeLayoutSpec {
  width: number;
  height: number;
  topText: string;
  bottomText: string;
  baseFontSize: number;
  minFontSize: number;
  /** 顶部区留白（px） */
  topPadding: number;
  /** 底部区留白（px） */
  bottomPadding: number;
  measure: (line: string, fontSize: number) => number;
  lineHeight?: number;
}

export interface MemeLayout {
  top: MemeZone | null;
  bottom: MemeZone | null;
}

/**
 * 计算顶 / 底文字区的换行、字号与基线位置：
 * 区域高 = max(2 × 留白, 画布高 × 0.3)，文字在区内垂直居中、水平居中。
 */
export function memeTextLayout(spec: MemeLayoutSpec): MemeLayout {
  const {
    width,
    height,
    topText,
    bottomText,
    baseFontSize,
    minFontSize,
    topPadding,
    bottomPadding,
    measure,
    lineHeight = 1.15,
  } = spec;
  const maxWidth = width * 0.94;
  // 按当前基准字号估算每行最大字符数（拉丁约 0.55em、中文 1em，取保守值）
  const avgW = Math.max(measure("汉", baseFontSize), baseFontSize * 0.55);
  const maxChars = Math.max(4, Math.floor(maxWidth / avgW));

  const buildZone = (text: string, zoneHeight: number, pad: number): MemeZone | null => {
    const lines = wrapMemeText(text, maxChars, 2);
    if (!lines.length) return null;
    const fontSize = memeFitFontSize({
      lines,
      maxWidth,
      maxHeight: zoneHeight,
      baseFontSize,
      minFontSize,
      measure,
      lineHeight,
    });
    const blockH = lines.length * fontSize * lineHeight;
    const x = width / 2;
    const ys = lines.map(
      (_, i) => pad + (zoneHeight - blockH) / 2 + fontSize + i * fontSize * lineHeight,
    );
    return { lines, x, ys, fontSize, lineHeight };
  };

  const topH = Math.max(topPadding * 2, height * 0.3);
  const bottomH = Math.max(bottomPadding * 2, height * 0.3);
  const top = buildZone(topText, topH, topPadding);
  const bottom = buildZone(bottomText, bottomH, bottomPadding);
  if (bottom) {
    // 底部区：从画布底部向上排布
    const blockH = bottom.lines.length * bottom.fontSize * bottom.lineHeight;
    const startY = height - bottomPadding - (bottomH - blockH) / 2 - blockH;
    bottom.ys = bottom.lines.map(
      (_, i) => startY + bottom.fontSize + i * bottom.fontSize * bottom.lineHeight,
    );
  }
  return { top, bottom };
}

/** 表情包导出文件名（基于时间戳） */
export function memeFileName(ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `meme-${ts}.${ext}`;
}
