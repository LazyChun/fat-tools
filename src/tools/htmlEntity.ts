/*
 * HTML 实体编解码：常用命名实体 + 十进制/十六进制数字实体
 */

/** 常用命名实体（编码优先使用这些，解码覆盖更广） */
export const NAMED_ENCODE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 解码用命名表（含常见空格与符号） */
export const NAMED_DECODE: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  times: "×",
  divide: "÷",
  minus: "−",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  middot: "·",
  bull: "•",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  approx: "≈",
  ne: "≠",
  le: "≤",
  ge: "≥",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  pi: "π",
  sigma: "σ",
  omega: "ω",
};

export type HtmlEncodeMode = "minimal" | "named" | "numeric" | "hex";

export interface HtmlEncodeOptions {
  /** minimal=仅 &<>"'；named=尽量用命名；numeric/hex=全部非 ASCII 与特殊字符 */
  mode?: HtmlEncodeMode;
}

function codePointEntities(ch: string, hex: boolean): string {
  const cp = ch.codePointAt(0)!;
  return hex ? `&#x${cp.toString(16).toUpperCase()};` : `&#${cp};`;
}

/** HTML 实体编码 */
export function htmlEncode(input: string, opt: HtmlEncodeOptions = {}): string {
  const mode = opt.mode ?? "minimal";
  if (!input) return "";

  if (mode === "minimal") {
    return input.replace(/[&<>"']/g, (ch) => NAMED_ENCODE[ch] || ch);
  }

  if (mode === "named") {
    return Array.from(input)
      .map((ch) => {
        if (NAMED_ENCODE[ch]) return NAMED_ENCODE[ch];
        // 反查命名表
        for (const [name, val] of Object.entries(NAMED_DECODE)) {
          if (val === ch) return `&${name};`;
        }
        const cp = ch.codePointAt(0)!;
        if (cp < 32 || cp > 126) return `&#${cp};`;
        return ch;
      })
      .join("");
  }

  const hex = mode === "hex";
  return Array.from(input)
    .map((ch) => {
      if (ch === "&" || ch === "<" || ch === ">" || ch === '"' || ch === "'") {
        return codePointEntities(ch, hex);
      }
      const cp = ch.codePointAt(0)!;
      if (cp < 32 || cp > 126) return codePointEntities(ch, hex);
      return ch;
    })
    .join("");
}

/** HTML 实体解码（命名 + 十进制 + 十六进制） */
export function htmlDecode(input: string): string {
  if (!input) return "";
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (full, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const num = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(num) || num < 0 || num > 0x10ffff) return full;
      try {
        return String.fromCodePoint(num);
      } catch {
        return full;
      }
    }
    if (Object.prototype.hasOwnProperty.call(NAMED_DECODE, body)) {
      return NAMED_DECODE[body];
    }
    // 大小写不敏感再试一次常见实体
    const lower = body.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_DECODE, lower)) {
      return NAMED_DECODE[lower];
    }
    return full;
  });
}

/** 统计文本中的实体数量（粗略） */
export function countEntities(input: string): number {
  const m = input.match(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g);
  return m ? m.length : 0;
}
