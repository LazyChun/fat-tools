/*
 * fat-tools 核心纯函数库
 *
 * 所有工具的计算逻辑都收敛在这里（不依赖 DOM / React），
 * 便于用 vitest 做单元测试，UI 组件只负责交互与展示。
 */

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
/* MD5（纯 JS 实现，支持 UTF-8）                                        */
/* ------------------------------------------------------------------ */

function leftRotate(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

export function md5(input: string | Uint8Array): string {
  const msg = typeof input === "string" ? toUtf8Bytes(input) : input;
  const len = msg.length;
  const bitLen = len * 8;
  const paddedLen = (((len + 8) >> 6) + 1) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(msg);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLen >>> 0, true);
  dv.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  }
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let off = 0; off < paddedLen; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + leftRotate(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return bytesToHex(out);
}

/* ------------------------------------------------------------------ */
/* SHA 系列（WebCrypto，异步）                                          */
/* ------------------------------------------------------------------ */

export type ShaAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export async function shaHash(algorithm: ShaAlgorithm, input: string): Promise<string> {
  const data = toUtf8Bytes(input) as unknown as BufferSource;
  const digest = await crypto.subtle.digest(algorithm, data);
  return bytesToHex(new Uint8Array(digest));
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
  return opt.angleMode === "deg" ? (toRad ? (x * Math.PI) / 180 : (x * 180) / Math.PI) : x;
}

const FUNCTIONS: Record<string, (args: number[], opt: CalcOptions) => number> = {
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
  log: (a) => (a.length > 1 ? Math.log(a[1]) / Math.log(a[0]) : Math.log10(a[0])),
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
      const m = rest.match(/^(\d+(\.\d+)?([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/);
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

export function evaluateExpression(input: string, options: CalcOptions = {}): number {
  const cleaned = input.replace(/^\s*=\s*/, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
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
        if ((t.value === "/" || t.value === "%") && right === 0) throw new Error("除数不能为 0");
        left = t.value === "*" ? left * right : t.value === "/" ? left / right : left % right;
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
      rows.push({ type: "same", left: { no: op.aNo!, text: op.text }, right: { no: op.bNo!, text: op.text } });
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
          rows.push({ type: "change", left: { no: d.aNo!, text: d.text }, right: { no: a.bNo!, text: a.text } });
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
  const nonEmptyLines = normalized.split("\n").filter((l) => l.trim() !== "").length;
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
  const trimmed = value.trim().toLowerCase().replace(/^0[xbo]/, "");
  if (trimmed === "") return "";
  const sign = trimmed.startsWith("-") ? -1 : 1;
  const digits = sign === -1 ? trimmed.slice(1) : trimmed;
  const pattern = from <= 10
    ? new RegExp(`^[0-${from - 1}]+$`)
    : new RegExp(`^[0-9a-${String.fromCharCode(97 + from - 11)}]+$`);
  if (!pattern.test(digits)) {
    throw new Error(`「${digits}」不是有效的 ${from} 进制整数`);
  }
  const num = parseInt(digits, from);
  if (!Number.isSafeInteger(num)) throw new Error("数值超出安全整数范围（2^53-1）");
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
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  else if (/^[0-9a-fA-F]{8}$/.test(h)) h = h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error("无效的 HEX 颜色，示例：#1E90FF 或 1e90ff");
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
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
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
  return withBoundaries.split(/[^A-Za-z0-9\u4e00-\u9fff]+/).filter((w) => w.length > 0);
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
      return words[0].toLowerCase() + words.slice(1).map(capitalizeWord).join("");
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
    const width = String(opt.numberStart + Math.max(0, lines.length - 1)).length;
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

function convertTemperature(fromId: string, toId: string, value: number): number {
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
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
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
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
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
      html.push(`<blockquote>${renderInline(buf.join("\n")).replace(/\n/g, "<br/>")}</blockquote>`);
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
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    html.push(`<p>${renderInline(buf.join("\n")).replace(/\n/g, "<br/>")}</p>`);
  }

  closeLists();
  return html.join("\n");
}
