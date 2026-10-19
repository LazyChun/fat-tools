/*
 * 编码类新工具：古典密码、Punycode、Unicode 码点、字符串转义、
 * Base32、十六进制转储、WCAG 对比度。
 *
 * 不重复已有的 Base64、URL、HTML 实体、摩斯电码和颜色格式互转。
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type CipherKind = "caesar" | "rot13" | "rot47" | "atbash" | "vigenere";

function shiftLetter(ch: string, shift: number): string {
  const code = ch.charCodeAt(0);
  const base = code >= 97 && code <= 122 ? 97 : code >= 65 && code <= 90 ? 65 : 0;
  if (!base) return ch;
  const n = (code - base + (shift % 26) + 26) % 26;
  return String.fromCharCode(base + n);
}

/** 凯撒密码，只移动拉丁字母，保留大小写 */
export function caesar(text: string, shift: number): string {
  const n = ((Math.trunc(shift) % 26) + 26) % 26;
  return [...text].map((ch) => shiftLetter(ch, n)).join("");
}

/** ROT47：可打印 ASCII（33–126）循环移动 47 */
export function rot47(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 33 || code > 126) return ch;
      return String.fromCharCode(33 + ((code - 33 + 47) % 94));
    })
    .join("");
}

/** Atbash：A↔Z，只处理拉丁字母 */
export function atbash(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(90 - (code - 65));
      if (code >= 97 && code <= 122) return String.fromCharCode(122 - (code - 97));
      return ch;
    })
    .join("");
}

/** 维吉尼亚。非字母原样保留，且不消耗密钥 */
export function vigenere(text: string, key: string, decode = false): string {
  const letters = [...key].filter((ch) => /[A-Za-z]/.test(ch));
  if (!letters.length) return text;
  let i = 0;
  return [...text]
    .map((ch) => {
      if (!/[A-Za-z]/.test(ch)) return ch;
      const k = letters[i % letters.length];
      const shift = k.toUpperCase().charCodeAt(0) - 65;
      i += 1;
      return shiftLetter(ch, decode ? -shift : shift);
    })
    .join("");
}

export function applyCipher(
  text: string,
  kind: CipherKind,
  shift: number,
  key: string,
  decode: boolean,
): { output: string; error?: string } {
  if (kind === "rot13") return { output: caesar(text, 13) };
  if (kind === "rot47") return { output: rot47(text) };
  if (kind === "atbash") return { output: atbash(text) };
  if (kind === "vigenere") {
    if (!/[A-Za-z]/.test(key)) return { output: "", error: "维吉尼亚密钥至少要有一个拉丁字母" };
    return { output: vigenere(text, key, decode) };
  }
  return { output: caesar(text, decode ? -shift : shift) };
}

const PUNY_BASE = 36;
const PUNY_TMIN = 1;
const PUNY_TMAX = 26;
const PUNY_SKEW = 38;
const PUNY_DAMP = 700;
const PUNY_BIAS = 72;
const PUNY_N = 128;

function punyAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / PUNY_DAMP) : Math.floor(delta / 2);
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > Math.floor(((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) / 2)) {
    d = Math.floor(d / (PUNY_BASE - PUNY_TMIN));
    k += PUNY_BASE;
  }
  return k + Math.floor(((PUNY_BASE - PUNY_TMIN + 1) * d) / (d + PUNY_SKEW));
}

function punyEncodeDigit(d: number): string {
  return String.fromCharCode(d + 22 + 75 * (d < 26 ? 1 : 0));
}

function punyDecodeDigit(cp: number): number {
  if (cp >= 48 && cp <= 57) return cp - 22;
  if (cp >= 65 && cp <= 90) return cp - 65;
  if (cp >= 97 && cp <= 122) return cp - 97;
  return PUNY_BASE;
}

/** RFC 3492 Punycode，不含 xn-- 前缀 */
export function punycodeEncode(input: string): string {
  const cps = Array.from(input);
  const output: string[] = [];
  let n = PUNY_N;
  let delta = 0;
  let bias = PUNY_BIAS;
  for (const ch of cps) {
    if ((ch.codePointAt(0) ?? 0) < 0x80) output.push(ch);
  }
  const b = output.length;
  let h = b;
  if (b > 0 && b < cps.length) output.push("-");
  while (h < cps.length) {
    let m = Infinity;
    for (const ch of cps) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp >= n && cp < m) m = cp;
    }
    delta += (m - n) * (h + 1);
    n = m;
    for (const ch of cps) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp < n) delta += 1;
      if (cp !== n) continue;
      let q = delta;
      for (let k = PUNY_BASE; ; k += PUNY_BASE) {
        const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias;
        if (q < t) break;
        output.push(punyEncodeDigit(t + ((q - t) % (PUNY_BASE - t))));
        q = Math.floor((q - t) / (PUNY_BASE - t));
      }
      output.push(punyEncodeDigit(q));
      bias = punyAdapt(delta, h + 1, h === b);
      delta = 0;
      h += 1;
    }
    delta += 1;
    n += 1;
  }
  return output.join("");
}

export function punycodeDecode(input: string): string {
  const output: string[] = [];
  let n = PUNY_N;
  let i = 0;
  let bias = PUNY_BIAS;
  let basic = input.lastIndexOf("-");
  if (basic < 0) basic = 0;
  for (let j = 0; j < basic; j++) {
    if (input.charCodeAt(j) >= 0x80) throw new Error("基本码点非法");
    output.push(input[j]);
  }
  let index = basic > 0 ? basic + 1 : 0;
  while (index < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = PUNY_BASE; ; k += PUNY_BASE) {
      if (index >= input.length) throw new Error("Punycode 不完整");
      const digit = punyDecodeDigit(input.charCodeAt(index));
      index += 1;
      if (digit >= PUNY_BASE) throw new Error("Punycode 含非法字符");
      i += digit * w;
      const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias;
      if (digit < t) break;
      w *= PUNY_BASE - t;
    }
    const outLen = output.length + 1;
    bias = punyAdapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    if (n > 0x10ffff) throw new Error("码点超出 Unicode");
    output.splice(i, 0, String.fromCodePoint(n));
    i += 1;
  }
  return output.join("");
}

function splitDomain(domain: string): string[] {
  return domain
    .trim()
    .replace(/[。．｡]/g, ".")
    .split(".")
    .map((part) => part.trim())
    .filter((part, idx, arr) => part.length > 0 || idx === 0 || idx === arr.length - 1);
}

/** 域名标签转 ASCII（IDNA）。纯 ASCII 标签保持不变 */
export function domainToAscii(domain: string): { output: string; error?: string } {
  try {
    const labels = splitDomain(domain).map((label) => {
      if (!label) return "";
      if ([...label].every((ch) => (ch.codePointAt(0) ?? 0) < 0x80)) return label;
      return `xn--${punycodeEncode(label)}`;
    });
    return { output: labels.join(".") };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "编码失败" };
  }
}

/** xn-- 标签转回 Unicode */
export function domainToUnicode(domain: string): { output: string; error?: string } {
  try {
    const labels = splitDomain(domain).map((label) => {
      if (!/^xn--/i.test(label)) return label;
      return punycodeDecode(label.slice(4));
    });
    return { output: labels.join(".") };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "解码失败" };
  }
}

export interface GlyphInfo {
  char: string;
  cp: number;
  hex: string;
  dec: number;
  utf8: string;
  utf16: string;
  js: string;
  block: string;
}

function blockName(cp: number): string {
  if (cp <= 0x7f) return "ASCII";
  if (cp <= 0x24f) return "拉丁";
  if (cp >= 0x4e00 && cp <= 0x9fff) return "CJK 统一汉字";
  if (cp >= 0x3000 && cp <= 0x303f) return "CJK 标点";
  if (cp >= 0xff00 && cp <= 0xffef) return "全角 / 半角";
  if (cp >= 0x1f300) return "表情符号";
  return "其他";
}

function utf16Hex(cp: number): string {
  if (cp <= 0xffff) return cp.toString(16).toUpperCase().padStart(4, "0");
  const v = cp - 0x10000;
  const hi = 0xd800 + (v >> 10);
  const lo = 0xdc00 + (v & 0x3ff);
  return `${hi.toString(16).toUpperCase()} ${lo.toString(16).toUpperCase()}`;
}

/** 逐个码点列出 UTF-8 / UTF-16 / JS 转义 */
export function inspectText(text: string): GlyphInfo[] {
  const bytesOf = new TextEncoder();
  return Array.from(text).map((char) => {
    const cp = char.codePointAt(0) ?? 0;
    const utf8 = Array.from(bytesOf.encode(char))
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
    const js = cp <= 0xffff ? `\\u${cp.toString(16).toUpperCase().padStart(4, "0")}` : `\\u{${cp.toString(16).toUpperCase()}}`;
    return {
      char,
      cp,
      hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      dec: cp,
      utf8,
      utf16: utf16Hex(cp),
      js,
      block: blockName(cp),
    };
  });
}

/** 从 U+ / \\u / \\u{} / 0x / &#x / &# 还原文本 */
export function codePointsToText(input: string): { text: string; error?: string } {
  const re = /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|U\+([0-9a-fA-F]{4,6})|&#x([0-9a-fA-F]+);|&#(\d+);|0x([0-9a-fA-F]{2,6})/gi;
  const chars: string[] = [];
  let hit = false;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    hit = true;
    const hex = match[1] || match[2] || match[3] || match[4] || match[6];
    const cp = hex ? parseInt(hex, 16) : parseInt(match[5], 10);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      return { text: "", error: `无效码点 ${match[0]}` };
    }
    chars.push(String.fromCodePoint(cp));
  }
  if (!hit) return { text: "", error: "没有识别到码点，请使用 U+4F60、\\u4F60 或 0x4F60" };
  return { text: chars.join("") };
}

export type EscapeLang = "json" | "python";

function escapeJsonInner(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

function escapePythonInner(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function escapeString(text: string, lang: EscapeLang): { inner: string; quoted: string } {
  if (lang === "python") {
    const inner = escapePythonInner(text);
    return { inner, quoted: `'${inner}'` };
  }
  const inner = escapeJsonInner(text);
  return { inner, quoted: `"${inner}"` };
}

export function unescapeString(text: string, lang: EscapeLang): { output: string; error?: string } {
  try {
    if (lang === "json") {
      const trimmed = text.trim();
      const wrapped = trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
      const value = JSON.parse(wrapped);
      if (typeof value !== "string") return { output: "", error: "JSON 字面量不是字符串" };
      return { output: value };
    }
    let src = text.trim();
    if ((src.startsWith("'") && src.endsWith("'")) || (src.startsWith('"') && src.endsWith('"'))) {
      src = src.slice(1, -1);
    }
    let out = "";
    for (let i = 0; i < src.length; i++) {
      if (src[i] !== "\\") {
        out += src[i];
        continue;
      }
      const n = src[i + 1];
      if (n === undefined) return { output: "", error: "结尾的反斜杠没有转义目标" };
      const simple: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        "\\": "\\",
        "'": "'",
        '"': '"',
        a: "\u0007",
      };
      if (simple[n] !== undefined) {
        out += simple[n];
        i += 1;
        continue;
      }
      if (n === "x" && /^[0-9a-fA-F]{2}/.test(src.slice(i + 2, i + 4))) {
        out += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16));
        i += 3;
        continue;
      }
      if (n === "u" && /^[0-9a-fA-F]{4}/.test(src.slice(i + 2, i + 6))) {
        out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
        i += 5;
        continue;
      }
      if (n === "U" && /^[0-9a-fA-F]{8}/.test(src.slice(i + 2, i + 10))) {
        out += String.fromCodePoint(parseInt(src.slice(i + 2, i + 10), 16));
        i += 9;
        continue;
      }
      return { output: "", error: `无法识别的转义 \\${n}` };
    }
    return { output: out };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "反转义失败" };
  }
}

export function base32Encode(data: Uint8Array, pad = true): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  if (pad) while (out.length % 8 !== 0) out += "=";
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.trim().replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return new Uint8Array();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`非法 Base32 字符「${ch}」`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

export function base32EncodeText(text: string, pad = true): { output: string; error?: string } {
  try {
    return { output: base32Encode(new TextEncoder().encode(text), pad) };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "编码失败" };
  }
}

export function base32DecodeText(input: string): { output: string; error?: string } {
  try {
    return { output: new TextDecoder("utf-8", { fatal: true }).decode(base32Decode(input)) };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "解码失败" };
  }
}

export function textToHex(text: string, uppercase = false): string {
  const hex = Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return uppercase ? hex.toUpperCase() : hex;
}

export function hexToText(hex: string): { output: string; error?: string } {
  const clean = hex.trim().replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return { output: "" };
  if (clean.length % 2 !== 0) return { output: "", error: "十六进制位数必须是偶数" };
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  try {
    return { output: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { output: "", error: "字节序列不是合法 UTF-8" };
  }
}

/** 经典 hexdump：偏移、分组十六进制、ASCII */
export function hexDump(text: string, width = 16): string {
  const bytes = new TextEncoder().encode(text);
  const cols = Math.max(4, Math.min(32, width || 16));
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += cols) {
    const slice = bytes.slice(i, i + cols);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(cols * 3 - 1, " ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
      .join("")
      .padEnd(cols, " ");
    lines.push(`${i.toString(16).padStart(8, "0")}  ${hex}  |${ascii}|`);
  }
  return lines.join("\n");
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED_COLORS: Record<string, string> = {
  black: "000000",
  white: "ffffff",
  red: "ff0000",
  green: "008000",
  blue: "0000ff",
  gray: "808080",
  grey: "808080",
  yellow: "ffff00",
  orange: "ffa500",
  purple: "800080",
};

/** 解析 #RGB / #RRGGBB / rgb() / 少量颜色名 */
export function parseCssColor(input: string): { ok: true; rgb: Rgb } | { ok: false; error: string } {
  const text = input.trim().toLowerCase();
  if (!text) return { ok: false, error: "请输入颜色" };
  const named = NAMED_COLORS[text];
  const hex = named || (text.startsWith("#") ? text.slice(1) : /^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(text) ? text : "");
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    if (!/^[0-9a-f]{6}$/.test(full)) return { ok: false, error: "HEX 需为 #RGB 或 #RRGGBB" };
    return {
      ok: true,
      rgb: {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
      },
    };
  }
  const rgb = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (!rgb) return { ok: false, error: "无法解析颜色，支持 #RRGGBB 或 rgb(r, g, b)" };
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((n) => n > 255)) return { ok: false, error: "RGB 通道需在 0–255" };
  return { ok: true, rgb: { r: channels[0], g: channels[1], b: channels[2] } };
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export interface ContrastResult {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

/** WCAG 2 对比度。(L1+0.05)/(L2+0.05)，大号字指约 18pt 或 14pt 粗体 */
export function contrastRatio(foreground: string, background: string): { ok: true; result: ContrastResult } | { ok: false; error: string } {
  const fg = parseCssColor(foreground);
  if (!fg.ok) return fg;
  const bg = parseCssColor(background);
  if (!bg.ok) return bg;
  const l1 = relativeLuminance(fg.rgb);
  const l2 = relativeLuminance(bg.rgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return {
    ok: true,
    result: {
      ratio: Math.round(ratio * 100) / 100,
      aaLarge: ratio >= 3,
      aaNormal: ratio >= 4.5,
      aaaLarge: ratio >= 4.5,
      aaaNormal: ratio >= 7,
    },
  };
}
