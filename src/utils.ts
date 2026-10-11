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
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
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

/** 增量 MD5 计算器（适合大文件流式处理） */
export class Md5Context {
  private a = 0x67452301;
  private b = 0xefcdab89;
  private c = 0x98badcfe;
  private d = 0x10325476;
  private buffer = new Uint8Array(0);
  private totalBytes = 0;

  private static readonly K = Md5Context.buildK();
  private static readonly S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];

  private static buildK(): Uint32Array {
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) {
      K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    }
    return K;
  }

  private static leftRotate(x: number, c: number): number {
    return ((x << c) | (x >>> (32 - c))) >>> 0;
  }

  private processBlock(block: Uint8Array, offset: number): void {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] =
        (block[offset + i * 4] |
          (block[offset + i * 4 + 1] << 8) |
          (block[offset + i * 4 + 2] << 16) |
          (block[offset + i * 4 + 3] << 24)) >>>
        0;
    }
    let A = this.a;
    let B = this.b;
    let C = this.c;
    let D = this.d;
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
      F = (F + A + Md5Context.K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + Md5Context.leftRotate(F, Md5Context.S[i])) >>> 0;
    }
    this.a = (this.a + A) >>> 0;
    this.b = (this.b + B) >>> 0;
    this.c = (this.c + C) >>> 0;
    this.d = (this.d + D) >>> 0;
  }

  update(chunk: Uint8Array): void {
    this.totalBytes += chunk.length;
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    let off = 0;
    while (merged.length - off >= 64) {
      this.processBlock(merged, off);
      off += 64;
    }
    this.buffer = merged.slice(off);
  }

  digest(): string {
    const bitLen = this.totalBytes * 8;
    const rem = this.buffer.length;
    const padLen = rem < 56 ? 56 - rem : 120 - rem;
    const tail = new Uint8Array(rem + padLen + 8);
    tail.set(this.buffer, 0);
    tail[rem] = 0x80;
    const dv = new DataView(tail.buffer);
    dv.setUint32(tail.length - 8, bitLen >>> 0, true);
    dv.setUint32(tail.length - 4, Math.floor(bitLen / 0x100000000), true);
    for (let off = 0; off < tail.length; off += 64)
      this.processBlock(tail, off);
    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, this.a, true);
    odv.setUint32(4, this.b, true);
    odv.setUint32(8, this.c, true);
    odv.setUint32(12, this.d, true);
    return bytesToHex(out);
  }
}

/* ------------------------------------------------------------------ */
/* SHA 系列（WebCrypto，异步）                                          */
/* ------------------------------------------------------------------ */

export type ShaAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export async function shaHash(
  algorithm: ShaAlgorithm,
  input: string,
): Promise<string> {
  const data = toUtf8Bytes(input) as unknown as BufferSource;
  const digest = await crypto.subtle.digest(algorithm, data);
  return bytesToHex(new Uint8Array(digest));
}

/** 对原始字节计算 SHA（用于文件等二进制数据） */
export async function shaHashBytes(
  algorithm: ShaAlgorithm,
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    algorithm,
    data as unknown as BufferSource,
  );
  return bytesToHex(new Uint8Array(digest));
}

export interface FileHashResult {
  name: string;
  md5: string;
  shas: Record<string, string>;
  size: number;
}

const FILE_CHUNK_SIZE = 4 * 1024 * 1024;
const FILE_SHA_ALGOS: ShaAlgorithm[] = [
  "SHA-1",
  "SHA-256",
  "SHA-384",
  "SHA-512",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** 计算本地文件的 MD5 + SHA 系列哈希（纯本地，不上传） */
export async function hashFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FileHashResult> {
  const whole = new Uint8Array(await file.arrayBuffer());
  const md5Ctx = new Md5Context();
  const chunkCount = Math.max(1, Math.ceil(whole.byteLength / FILE_CHUNK_SIZE));
  for (let i = 0; i < chunkCount; i++) {
    const start = i * FILE_CHUNK_SIZE;
    md5Ctx.update(whole.slice(start, start + FILE_CHUNK_SIZE));
    if (onProgress) onProgress(Math.round(((i + 1) / chunkCount) * 100));
    // 让出主线程，避免大文件阻塞 UI
    if (i < chunkCount - 1) await new Promise((r) => setTimeout(r, 0));
  }
  const md5Hex = md5Ctx.digest();
  const shas: Record<string, string> = {};
  for (const a of FILE_SHA_ALGOS) {
    try {
      shas[a] = await shaHashBytes(a, whole);
    } catch {
      shas[a] = "";
    }
  }
  return { name: file.name, md5: md5Hex, shas, size: file.size };
}

export { formatFileSize };

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
