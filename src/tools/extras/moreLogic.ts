/*
 * 第二批新增 13 个工具的纯计算逻辑。
 *
 * 约定：不依赖 DOM / React，便于 vitest 直接单测；所有交互交给 MoreExtraTools.tsx。
 */
/* ------------------------------ 通用 ------------------------------ */

/** 可复现的伪随机数生成器（mulberry32）：同一种子得到同一批结果 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) {
    const rest = x % y;
    x = y;
    y = rest;
  }
  return x || 1;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export interface SplitGroups {
  ok: boolean;
  groups: string[][];
  error?: string;
}

/* ================================================================== */
/* 1. SQL 格式化                                                      */
/* ================================================================== */

export type SqlMode = "pretty" | "minify" | "upper" | "lower";

interface SqlToken {
  kind: "word" | "str" | "comment" | "num" | "punct" | "space";
  value: string;
}

const SQL_WORDS = new Set(
  ("SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET UNION ALL INSERT INTO VALUES UPDATE SET " +
    "DELETE CREATE TABLE ALTER DROP VIEW INDEX WITH RETURNING ON JOIN LEFT RIGHT INNER FULL CROSS OUTER " +
    "AND OR NOT NULL IS IN LIKE BETWEEN EXISTS AS DISTINCT CASE WHEN THEN ELSE END " +
    "COUNT SUM AVG MIN MAX ASC DESC PRIMARY KEY FOREIGN REFERENCES DEFAULT IF " +
    "INT INTEGER VARCHAR TEXT BOOLEAN TIMESTAMP DATE TIME TRUE FALSE CAST COALESCE " +
    "HAVING OVER PARTITION ROWS RANGE CURRENT ROW PRECEDING FOLLOWING NULLS FIRST LAST").split(" "),
);

const SQL_CLAUSES = new Set([
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "UNION", "UNION ALL", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
  "CREATE TABLE", "CREATE VIEW", "CREATE INDEX", "ALTER TABLE", "DROP TABLE",
  "WITH", "RETURNING", "ON", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
  "FULL JOIN", "CROSS JOIN", "AND", "OR",
]);

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const re = /('(?:''|[^'])*'|"(?:[^"\\]|\\.)*"|`(?:[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z0-9_$]*|\d+(?:\.\d+)?|\s+|[^\s])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const value = match[0];
    let kind: SqlToken["kind"] = "punct";
    if (/^\s+$/.test(value)) kind = "space";
    else if (value.startsWith("--") || value.startsWith("/*")) kind = "comment";
    else if (/^['"`]/.test(value)) kind = "str";
    else if (/^[A-Za-z_]/.test(value)) kind = "word";
    else if (/^\d/.test(value)) kind = "num";
    tokens.push({ kind, value });
  }
  return tokens;
}

function compactSql(tokens: SqlToken[]): string {
  let out = "";
  let prev: SqlToken | null = null;
  for (const token of tokens) {
    if (token.kind === "space") continue;
    if (prev) {
      const p = prev.value;
      const c = token.value;
      const tightBefore = c === "," || c === ")" || c === "." || c === ";";
      const tightAfter = p === "(" || p === ".";
      const bothWords =
        (prev.kind === "word" || prev.kind === "num" || prev.kind === "str") &&
        (token.kind === "word" || token.kind === "num" || token.kind === "str");
      const needSpace =
        !tightBefore && !tightAfter &&
        (bothWords || prev.kind === "comment" || token.kind === "comment" || p === "," || p === ";");
      if (needSpace) out += " ";
    }
    out += token.value;
    prev = token;
  }
  return out.trim();
}

function sqlWord(token: SqlToken, mode: SqlMode): string {
  if (token.kind !== "word") return token.value;
  const upper = token.value.toUpperCase();
  if (!SQL_WORDS.has(upper)) return token.value;
  return mode === "lower" ? upper.toLowerCase() : upper;
}

/** SQL 美化 / 压缩 / 关键字大小写转换。字符串字面量与注释原样保留。 */
export function formatSql(sql: string, mode: SqlMode = "pretty", indentSize = 2): string {
  const tokens = tokenizeSql(sql);
  if (!sql.trim()) return "";
  if (mode === "minify") return compactSql(tokens);
  if (mode === "upper" || mode === "lower") {
    return tokens.map((t) => (t.kind === "space" ? t.value : sqlWord(t, mode))).join("").trim();
  }
  const list = tokens.filter((t) => t.kind !== "space");
  const lines: string[] = [];
  let cur = "";
  let indent = 0;
  const flush = () => {
    const text = cur.trim();
    if (text) lines.push(" ".repeat(Math.max(0, indent) * indentSize) + text);
    cur = "";
  };
  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];
    const next = list[i + 1];
    const upper = token.kind === "word" ? token.value.toUpperCase() : "";
    const nextUpper = next && next.kind === "word" ? next.value.toUpperCase() : "";
    let clause = upper;
    let skip = 0;
    if (upper === "GROUP" && nextUpper === "BY") { clause = "GROUP BY"; skip = 1; }
    else if (upper === "ORDER" && nextUpper === "BY") { clause = "ORDER BY"; skip = 1; }
    else if (upper === "UNION" && nextUpper === "ALL") { clause = "UNION ALL"; skip = 1; }
    else if (upper === "INSERT" && nextUpper === "INTO") { clause = "INSERT INTO"; skip = 1; }
    else if (upper === "DELETE" && nextUpper === "FROM") { clause = "DELETE FROM"; skip = 1; }
    else if (upper === "CREATE" && ["TABLE", "VIEW", "INDEX"].includes(nextUpper)) { clause = `CREATE ${nextUpper}`; skip = 1; }
    else if (["LEFT", "RIGHT", "INNER", "FULL", "CROSS"].includes(upper) && nextUpper === "JOIN") { clause = `${upper} JOIN`; skip = 1; }

    if (SQL_CLAUSES.has(clause)) {
      flush();
      cur = `${clause} `;
      i += skip;
      continue;
    }
    if (token.kind === "comment") {
      cur += `${token.value} `;
      continue;
    }
    if (token.kind === "punct") {
      const value = token.value;
      if (value === "(") {
        cur += "(";
        indent += 1;
        if (next && next.kind === "word" && next.value.toUpperCase() === "SELECT") flush();
      } else if (value === ")") {
        indent = Math.max(0, indent - 1);
        flush();
        cur = ") ";
      } else if (value === ",") {
        cur = `${cur.trimEnd()},`;
        if (indent === 0) flush();
        else cur += " ";
      } else if (value === ";") {
        cur = `${cur.trimEnd()};`;
        flush();
      } else if (value === ".") {
        cur = `${cur.trimEnd()}.`;
      } else {
        cur += ` ${value} `;
      }
      continue;
    }
    cur += `${sqlWord(token, "pretty")} `;
  }
  flush();
  return lines.join("\n");
}

/* ================================================================== */
/* 2. JWT 生成（签名部分在 UI 里用 WebCrypto，这里只做纯函数）           */
/* ================================================================== */

export type JwtAlg = "HS256" | "HS384" | "HS512";

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 字节 → 标准 Base64（不依赖 btoa / Buffer，浏览器与 Node 均可运行） */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64_CHARS[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64_CHARS[n & 63] : "=";
  }
  return out;
}

/** 字节 → Base64URL（无填充） */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 文本 → Base64URL（UTF-8 安全） */
export function base64UrlEncode(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

export function jwtHeader(alg: JwtAlg): { alg: string; typ: string } {
  return { alg, typ: "JWT" };
}

export type JwtPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

/** 解析 payload JSON，并按有效期（秒）自动注入 iat / exp */
export function buildJwtPayload(json: string, ttlSeconds: number, nowSeconds?: number): JwtPayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Payload 不是合法的 JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Payload 必须是 JSON 对象" };
  }
  const payload = parsed as Record<string, unknown>;
  if (ttlSeconds > 0) {
    const now = Number.isFinite(nowSeconds) ? Math.floor(nowSeconds as number) : Math.floor(Date.now() / 1000);
    payload.iat = now;
    payload.exp = now + Math.floor(ttlSeconds);
  }
  return { ok: true, payload };
}

export function jwtSigningInput(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
}

/* ================================================================== */
/* 3. HTTP 报文解析 / 生成                                            */
/* ================================================================== */

export interface HttpHeader { name: string; value: string }

export interface HttpMessage {
  ok: boolean;
  kind: "request" | "response" | "unknown";
  startLine: string;
  method: string;
  target: string;
  version: string;
  status: number;
  reason: string;
  headers: HttpHeader[];
  body: string;
  error?: string;
}

/** 解析原始 HTTP/1.x 请求或响应报文，支持头字段折叠行 */
export function parseHttpMessage(raw: string): HttpMessage {
  const base: HttpMessage = {
    ok: false, kind: "unknown", startLine: "", method: "", target: "", version: "",
    status: 0, reason: "", headers: [], body: "",
  };
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const blank = lines.findIndex((line) => line.trim() === "");
  const headLines = blank === -1 ? lines : lines.slice(0, blank);
  const body = blank === -1 ? "" : lines.slice(blank + 1).join("\n");
  const startLine = (headLines[0] || "").trim();
  if (!startLine) return { ...base, error: "报文为空" };

  const headers: HttpHeader[] = [];
  for (const line of headLines.slice(1)) {
    if (!line.trim()) continue;
    if (/^[ \t]/.test(line) && headers.length) {
      headers[headers.length - 1].value += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
  }

  const req = /^([A-Z]+)\s+(\S+)\s+(HTTP\/[\d.]+)$/i.exec(startLine);
  if (req) {
    return { ...base, ok: true, kind: "request", startLine, method: req[1].toUpperCase(), target: req[2], version: req[3], headers, body };
  }
  const res = /^(HTTP\/[\d.]+)\s+(\d{3})(?:\s+(.*))?$/i.exec(startLine);
  if (res) {
    return {
      ...base, ok: true, kind: "response", startLine, version: res[1],
      status: Number(res[2]), reason: res[3] || "", headers, body,
    };
  }
  return { ...base, startLine, headers, body, error: "首行既不是请求行也不是状态行" };
}

export interface BuildHttpInput {
  kind: "request" | "response";
  method: string;
  target: string;
  version: string;
  status: number;
  reason: string;
  headers: HttpHeader[];
  body: string;
  autoLength: boolean;
  autoHost: boolean;
}

export function buildHttpMessage(input: BuildHttpInput): string {
  const first = input.kind === "request"
    ? `${input.method || "GET"} ${input.target || "/"} ${input.version || "HTTP/1.1"}`
    : `${input.version || "HTTP/1.1"} ${input.status || 200} ${input.reason || "OK"}`.trimEnd();
  const headers = input.headers
    .filter((h) => h.name.trim() && h.value.trim())
    .map((h) => ({ name: h.name.trim(), value: h.value.trim() }));
  const lower = new Set(headers.map((h) => h.name.toLowerCase()));
  if (input.autoLength && !lower.has("content-length") && input.body) {
    headers.push({ name: "Content-Length", value: String(new TextEncoder().encode(input.body).length) });
  }
  if (input.autoHost && input.kind === "request" && !lower.has("host") && /^https?:\/\//i.test(input.target)) {
    try {
      headers.unshift({ name: "Host", value: new URL(input.target).host });
    } catch {
      // 目标不是合法 URL，忽略 Host 推断
    }
  }
  return `${first}\r\n${headers.map((h) => `${h.name}: ${h.value}`).join("\r\n")}\r\n\r\n${input.body}`;
}

/* ================================================================== */
/* 4. 位运算                                                          */
/* ================================================================== */

export type BitOp = "&" | "|" | "^" | "~" | "<<" | ">>" | ">>>";

export interface BitResult {
  ok: boolean;
  decimal: number;
  unsigned: number;
  hex: string;
  binary: string;
  aBinary: string;
  bBinary: string;
  error?: string;
}

/** 支持 0x / 0b / 0o 前缀与十进制（含负数） */
export function parseNumeric(text: string): number | null {
  const value = text.trim().replace(/_/g, "");
  if (!value) return null;
  if (/^0b[01]+$/i.test(value)) return parseInt(value.slice(2), 2);
  if (/^0o[0-7]+$/i.test(value)) return parseInt(value.slice(2), 8);
  if (/^0x[0-9a-f]+$/i.test(value)) return parseInt(value.slice(2), 16);
  if (/^[+-]?\d+$/.test(value)) return Number(value);
  return null;
}

export function bits32(value: number): string {
  return (value >>> 0).toString(2).padStart(32, "0").replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function calcBitwise(aText: string, op: BitOp, bText: string): BitResult {
  const a = parseNumeric(aText);
  const b = parseNumeric(bText);
  const empty: BitResult = { ok: false, decimal: 0, unsigned: 0, hex: "", binary: "", aBinary: "", bBinary: "" };
  if (a === null || !Number.isFinite(a)) return { ...empty, error: "第一个数格式不对（支持 42 / 0x2A / 0b101010）" };
  if (op !== "~" && (b === null || !Number.isFinite(b))) return { ...empty, error: "第二个数格式不对" };
  const ai = a | 0;
  const bi = (b ?? 0) | 0;
  let result = 0;
  switch (op) {
    case "&": result = ai & bi; break;
    case "|": result = ai | bi; break;
    case "^": result = ai ^ bi; break;
    case "~": result = ~ai; break;
    case "<<": result = ai << (bi & 31); break;
    case ">>": result = ai >> (bi & 31); break;
    case ">>>": result = ai >>> (bi & 31); break;
  }
  return {
    ok: true,
    decimal: result,
    unsigned: result >>> 0,
    hex: `0x${(result >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
    binary: bits32(result),
    aBinary: bits32(ai),
    bBinary: bits32(bi),
  };
}

/* ================================================================== */
/* 5. 配色方案                                                        */
/* ================================================================== */

export type PaletteScheme = "complementary" | "analogous" | "triadic" | "split" | "tetradic" | "monochromatic";

export interface PaletteColor { role: string; hex: string }

export function parseHexColor(input: string): string | null {
  let value = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) value = value.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return `#${value.toLowerCase()}`;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = parseHexColor(hex) || "#000000";
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return `#${rgb
    .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function makePalette(hex: string, scheme: PaletteScheme): PaletteColor[] {
  const { h, s, l } = hexToHsl(hex);
  const wrap = (deg: number) => ((deg % 360) + 360) % 360;
  const at = (deg: number, light = l) => hslToHex(wrap(deg), s, light);
  switch (scheme) {
    case "complementary":
      return [{ role: "主色", hex }, { role: "互补色 +180°", hex: at(h + 180) }];
    case "analogous":
      return [
        { role: "邻近 -40°", hex: at(h - 40) },
        { role: "邻近 -20°", hex: at(h - 20) },
        { role: "主色", hex },
        { role: "邻近 +20°", hex: at(h + 20) },
        { role: "邻近 +40°", hex: at(h + 40) },
      ];
    case "triadic":
      return [{ role: "主色", hex }, { role: "三角 +120°", hex: at(h + 120) }, { role: "三角 +240°", hex: at(h + 240) }];
    case "split":
      return [{ role: "主色", hex }, { role: "分裂互补 +150°", hex: at(h + 150) }, { role: "分裂互补 +210°", hex: at(h + 210) }];
    case "tetradic":
      return [
        { role: "主色", hex }, { role: "四分 +90°", hex: at(h + 90) },
        { role: "四分 +180°", hex: at(h + 180) }, { role: "四分 +270°", hex: at(h + 270) },
      ];
    case "monochromatic":
    default:
      return [0.85, 0.7, 0.55, 0.4, 0.25].map((light, i) => ({
        role: `明度 ${Math.round(light * 100)}%`, hex: hslToHex(h, s, light),
      })).map((item, i) => ({ ...item, role: i === 2 ? "主色明度档" : item.role }));
  }
}

/** 同一色相的明暗阶梯，从浅到深 */
export function shadeScale(hex: string, count = 9): string[] {
  const { h, s } = hexToHsl(hex);
  const size = Math.min(21, Math.max(2, Math.floor(count)));
  return Array.from({ length: size }, (_, i) => hslToHex(h, s, 0.95 - (0.9 * i) / (size - 1)));
}

/** 用 WCAG 相对亮度挑一个可读的文字色 */
export function readableTextColor(hex: string): string {
  const value = parseHexColor(hex) || "#000000";
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const withWhite = 1.05 / (luminance + 0.05);
  const withBlack = (luminance + 0.05) / 0.05;
  return withWhite >= withBlack ? "#ffffff" : "#000000";
}

export function paletteToCss(colors: PaletteColor[], style: "vars" | "gradient" | "array"): string {
  const hexes = colors.map((c) => c.hex);
  if (style === "array") return JSON.stringify(hexes, null, 2);
  if (style === "gradient") {
    const stops = hexes.map((hex, i) => `${hex} ${Math.round((i / Math.max(1, hexes.length - 1)) * 100)}%`);
    return `background: linear-gradient(90deg, ${stops.join(", ")});`;
  }
  return `:root {\n${hexes.map((hex, i) => `  --color-${i + 1}: ${hex};`).join("\n")}\n}`;
}

/* ================================================================== */
/* 6. 图片压缩（尺寸计算；编解码在 UI 里用 canvas）                     */
/* ================================================================== */

export interface FitSize { width: number; height: number; scale: number }

export function fitImageSize(
  width: number, height: number, maxWidth: number, maxHeight: number,
  keepRatio = true, allowEnlarge = false,
): FitSize {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const mw = Math.max(1, Math.round(maxWidth));
  const mh = Math.max(1, Math.round(maxHeight));
  if (!keepRatio) return { width: mw, height: mh, scale: 1 };
  let scale = Math.min(mw / w, mh / h);
  if (!allowEnlarge) scale = Math.min(scale, 1);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/* ================================================================== */
/* 7. 测试数据生成                                                    */
/* ================================================================== */

export type FakeType =
  | "name" | "phone" | "email" | "city" | "company" | "date" | "datetime"
  | "integer" | "decimal" | "boolean" | "uuid" | "url" | "color" | "word" | "id";

export interface FakeField { key: string; type: FakeType }

export const FAKE_TYPES: { value: FakeType; label: string }[] = [
  { value: "id", label: "自增序号" }, { value: "name", label: "中文姓名" },
  { value: "phone", label: "手机号" }, { value: "email", label: "邮箱" },
  { value: "city", label: "城市" }, { value: "company", label: "公司名" },
  { value: "date", label: "日期" }, { value: "datetime", label: "日期时间" },
  { value: "integer", label: "整数" }, { value: "decimal", label: "小数" },
  { value: "boolean", label: "布尔值" }, { value: "uuid", label: "UUID" },
  { value: "url", label: "网址" }, { value: "color", label: "颜色" },
  { value: "word", label: "随机词" },
];

const SURNAMES = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤".split("");
const GIVEN_CHARS = "伟芳娜秀敏静丽强磊军洋勇艳杰娟涛明超霞平刚桂兰文辉俊峰建华晨宇欣怡子涵浩然一诺思远雨桐梓萱嘉宁若曦亦辰沐辰书瑶可馨锦程奕泽安宁星辰清扬知远嘉言懿行景初望舒怀瑾握瑜".split("");
const CITIES = ["北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "西安", "苏州", "重庆", "天津", "长沙", "青岛", "厦门", "宁波", "合肥", "郑州", "济南", "福州", "昆明", "大连", "沈阳", "无锡"];
const BIZ_WORDS = ["科技", "信息", "网络", "数据", "智能", "贸易", "咨询", "文化", "电子", "软件"];
const DOMAINS = ["example.com", "test.cn", "mail.com", "demo.io", "sample.org"];
const WORDS = ["清风", "数据流", "晨光", "星河", "木棉", "山海", "青石", "微澜", "长风", "白露", "归途", "云间", "拾光", "远山", "知秋", "南枝"];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function digits(rng: () => number, length: number): string {
  return Array.from({ length }, () => String(Math.floor(rng() * 10))).join("");
}
function letters(rng: () => number, length: number): string {
  return Array.from({ length }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(rng() * 26)]).join("");
}
function hex(rng: () => number, length: number): string {
  return Array.from({ length }, () => "0123456789abcdef"[Math.floor(rng() * 16)]).join("");
}

function fakeValue(type: FakeType, rng: () => number, index: number): string | number | boolean {
  switch (type) {
    case "id": return index + 1;
    case "name": {
      const given = GIVEN_CHARS[Math.floor(rng() * GIVEN_CHARS.length)] +
        (rng() > 0.45 ? GIVEN_CHARS[Math.floor(rng() * GIVEN_CHARS.length)] : "");
      return pick(rng, SURNAMES) + given;
    }
    case "phone": return `1${"3456789"[Math.floor(rng() * 7)]}${digits(rng, 9)}`;
    case "email": return `${letters(rng, 6)}${Math.floor(rng() * 90 + 10)}@${pick(rng, DOMAINS)}`;
    case "city": return pick(rng, CITIES);
    case "company": return `${pick(rng, CITIES)}${pick(rng, BIZ_WORDS)}有限公司`;
    case "date": {
      const day = Date.UTC(2020, 0, 1) + Math.floor(rng() * 2200) * 86400000;
      return new Date(day).toISOString().slice(0, 10);
    }
    case "datetime": {
      const day = Date.UTC(2020, 0, 1) + Math.floor(rng() * 2200) * 86400000 +
        Math.floor(rng() * 86400) * 1000;
      return new Date(day).toISOString().slice(0, 19).replace("T", " ");
    }
    case "integer": return Math.floor(rng() * 10000);
    case "decimal": return Math.round(rng() * 1000000) / 100;
    case "boolean": return rng() > 0.5;
    case "uuid": return `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-${"89ab"[Math.floor(rng() * 4)]}${hex(rng, 3)}-${hex(rng, 12)}`;
    case "url": return `https://www.${pick(rng, DOMAINS)}/${letters(rng, 5)}`;
    case "color": return `#${hex(rng, 6)}`;
    case "word": return pick(rng, WORDS);
    default: return "";
  }
}

/** 解析字段配置：每行 `字段名=类型`，省略字段名时直接用类型名 */
export function parseFieldSpec(text: string): { fields: FakeField[]; error?: string } {
  const allowed = new Set(FAKE_TYPES.map((t) => t.value));
  const fields: FakeField[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const parts = line.split(/[=:：]/).map((p) => p.trim()).filter(Boolean);
    const type = (parts.length > 1 ? parts[1] : parts[0]) as FakeType;
    const key = parts.length > 1 ? parts[0] : type;
    if (!allowed.has(type)) return { fields: [], error: `未知字段类型「${type}」，可用：${[...allowed].join(", ")}` };
    fields.push({ key, type });
  }
  if (!fields.length) return { fields: [], error: "请至少配置一个字段" };
  return { fields };
}

export type FakeRow = Record<string, string | number | boolean>;

export function generateFakeRows(fields: FakeField[], count: number, seed: number): FakeRow[] {
  const rng = seededRandom(seed);
  const size = Math.min(500, Math.max(1, Math.floor(count)));
  return Array.from({ length: size }, (_, index) => {
    const row: FakeRow = {};
    for (const field of fields) row[field.key] = fakeValue(field.type, rng, index);
    return row;
  });
}

export function rowsToJson(rows: FakeRow[]): string {
  return JSON.stringify(rows, null, 2);
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: FakeRow[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))].join("\n");
}

function sqlCell(value: string | number | boolean): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${value.replace(/'/g, "''")}'`;
}

export function rowsToSql(rows: FakeRow[], table = "test_data"): string {
  if (!rows.length) return "";
  const name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(table) ? table : "test_data";
  const keys = Object.keys(rows[0]);
  const cols = keys.map((k) => `\`${k.replace(/`/g, "")}\``).join(", ");
  return rows.map((row) => `INSERT INTO \`${name}\` (${cols}) VALUES (${keys.map((k) => sqlCell(row[k])).join(", ")});`).join("\n");
}

/* ================================================================== */
/* 8. 占位文本                                                        */
/* ================================================================== */

export type LoremLang = "zh" | "en";
export type LoremUnit = "paragraph" | "sentence" | "word";

const ZH_SENTENCES = [
  "春日的风掠过窗台，把桌上的书页轻轻翻到下一章。",
  "我们把每一个细节都记录下来，以便日后回看时仍有据可循。",
  "远处的山脊在暮色里渐渐柔和，像一笔未干的淡墨。",
  "设计的意义不在于堆砌，而在于让真正重要的内容被看见。",
  "数据整理完成后，团队决定先做一次小范围的验证。",
  "街角的灯亮起来时，行人的脚步也跟着慢了下来。",
  "这段文字只是用来占位，并不承载任何实际含义。",
  "好的工具应当安静地待在旁边，需要的时候随手就能拿到。",
  "雨停之后，空气里带着一点泥土和青草的味道。",
  "把复杂的事情讲清楚，往往比把它做出来更难。",
  "他沿着河岸走了很久，直到第一颗星星出现在天边。",
  "所有结论都应该附带它成立的前提，这是最基本的诚实。",
];
const ZH_WORDS = ["山", "海", "风", "光", "时间", "路径", "数据", "文字", "设计", "清晨", "远方", "回声", "秩序", "留白", "温度", "片段"];
const EN_WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et " +
  "dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo " +
  "consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint " +
  "occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum").split(" ");

export function loremText(lang: LoremLang, unit: LoremUnit, count: number, seed: number): string {
  const size = Math.min(50, Math.max(1, Math.floor(count)));
  const rng = seededRandom(seed);
  const enSentence = () => {
    const length = 8 + Math.floor(rng() * 7);
    const words = Array.from({ length }, () => pick(rng, EN_WORDS));
    return `${words[0].charAt(0).toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(" ")}.`;
  };
  const zhSentence = () =>
    Array.from({ length: 2 + Math.floor(rng() * 2) }, () => pick(rng, ZH_SENTENCES)).join("");
  const sentence = () => (lang === "zh" ? zhSentence() : enSentence());
  const paragraph = () => Array.from({ length: 3 + Math.floor(rng() * 3) }, sentence).join(lang === "zh" ? "" : " ");
  if (unit === "word") {
    return lang === "zh"
      ? Array.from({ length: size }, () => pick(rng, ZH_WORDS)).join("、")
      : Array.from({ length: size }, () => pick(rng, EN_WORDS)).join(" ");
  }
  if (unit === "sentence") return Array.from({ length: size }, sentence).join(lang === "zh" ? "" : " ");
  return Array.from({ length: size }, paragraph).join("\n\n");
}

/* ================================================================== */
/* 9. 随机分组                                                        */
/* ================================================================== */

export type GroupMode = "groups" | "size";

export function splitGroups(names: string[], mode: GroupMode, value: number, seed: number): SplitGroups {
  const list = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return { ok: false, groups: [], error: "请输入大于 0 的组数或每组人数" };
  if (!list.length) return { ok: false, groups: [], error: "名单为空" };
  if (mode === "groups" && n > list.length) return { ok: false, groups: [], error: "组数不能多于人数" };
  if (mode === "size" && n > list.length) return { ok: false, groups: [], error: "每组人数不能多于总人数" };
  const rng = seededRandom(seed);
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  const groupCount = mode === "groups" ? n : Math.ceil(list.length / n);
  const sizes = Array.from({ length: groupCount }, (_, i) =>
    Math.floor(list.length / groupCount) + (i < list.length % groupCount ? 1 : 0));
  const groups: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    groups.push(list.slice(cursor, cursor + size));
    cursor += size;
  }
  return { ok: true, groups };
}

export function groupsToText(groups: string[][]): string {
  return groups
    .map((group, i) => `第 ${i + 1} 组（${group.length} 人）\n${group.map((name) => `  · ${name}`).join("\n")}`)
    .join("\n\n");
}

/* ================================================================== */
/* 10. 世界时区换算                                                    */
/* ================================================================== */

export interface ZoneOption { label: string; zone: string }
export interface ZoneResult { zone: string; label: string; time: string; offsetMinutes: number; offsetLabel: string; diffHours: number; dayNote: string }

export const ZONES: ZoneOption[] = [
  { label: "北京 / 上海", zone: "Asia/Shanghai" },
  { label: "香港（中国）", zone: "Asia/Hong_Kong" },
  { label: "东京", zone: "Asia/Tokyo" },
  { label: "首尔", zone: "Asia/Seoul" },
  { label: "新加坡", zone: "Asia/Singapore" },
  { label: "曼谷", zone: "Asia/Bangkok" },
  { label: "迪拜", zone: "Asia/Dubai" },
  { label: "莫斯科", zone: "Europe/Moscow" },
  { label: "伦敦", zone: "Europe/London" },
  { label: "巴黎 / 柏林", zone: "Europe/Paris" },
  { label: "纽约", zone: "America/New_York" },
  { label: "芝加哥", zone: "America/Chicago" },
  { label: "洛杉矶", zone: "America/Los_Angeles" },
  { label: "悉尼", zone: "Australia/Sydney" },
  { label: "奥克兰", zone: "Pacific/Auckland" },
  { label: "UTC", zone: "UTC" },
];

/** 某时区在某一瞬间的 UTC 偏移（分钟），自动含夏令时 */
export function zoneOffsetMinutes(instant: Date, zone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // en-US + hour12:false 在部分环境会把午夜写成 24，统一取模
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  const wholeSecond = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSecond) / 60000);
}

/** 把「某时区的墙上时间」（以 UTC 毫秒表示的年月日时分秒）换算成真实时间戳 */
export function wallToInstant(wallMs: number, zone: string): number {
  const wall = Math.floor(wallMs / 1000) * 1000;
  let guess = wall;
  for (let i = 0; i < 4; i += 1) {
    guess = wall - zoneOffsetMinutes(new Date(guess), zone) * 60000;
  }
  return guess;
}

export function formatWall(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad2(m)}` : ""}`;
}

/** 把基准时区的墙上时间换算到多个时区 */
export function convertZoneTable(wallMs: number, fromZone: string, zones: ZoneOption[]): ZoneResult[] {
  const instant = wallToInstant(wallMs, fromZone);
  const baseOffset = zoneOffsetMinutes(new Date(instant), fromZone);
  const baseDay = formatWall(wallMs).slice(0, 10);
  return zones.map((item) => {
    const offset = zoneOffsetMinutes(new Date(instant), item.zone);
    const time = formatWall(instant + offset * 60000);
    const day = time.slice(0, 10);
    return {
      zone: item.zone,
      label: item.label,
      time,
      offsetMinutes: offset,
      offsetLabel: offsetLabel(offset),
      diffHours: (offset - baseOffset) / 60,
      dayNote: day === baseDay ? "同一天" : day < baseDay ? "前一天" : "次日",
    };
  });
}

/* ================================================================== */
/* 11. 预产期计算                                                     */
/* ================================================================== */

export type DueBasis = "lmp" | "conception";

export interface DueMilestone { label: string; weeks: number; date: string }

export interface DueDateResult {
  ok: boolean;
  dueDate: string;
  daysPregnant: number;
  weeks: number;
  days: number;
  daysLeft: number;
  progressPct: number;
  stage: string;
  milestones: DueMilestone[];
  error?: string;
}

function parseDay(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

const DAY_MS = 86400000;
const dayText = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function calcDueDate(
  startIso: string, basis: DueBasis, cycleDays: number, todayIso?: string,
): DueDateResult {
  const empty: DueDateResult = {
    ok: false, dueDate: "", daysPregnant: 0, weeks: 0, days: 0,
    daysLeft: 0, progressPct: 0, stage: "", milestones: [],
  };
  const start = parseDay(startIso);
  if (start === null) return { ...empty, error: "请输入 YYYY-MM-DD 格式的日期" };
  const parsedToday = todayIso ? parseDay(todayIso) : null;
  const today = parsedToday ?? parseDay(dayText(Date.now())) ?? Date.now();
  if (start > today) return { ...empty, error: "起始日期不能晚于今天" };
  const cycle = Math.min(60, Math.max(20, Math.floor(cycleDays)));
  const totalDays = basis === "lmp" ? 280 + (cycle - 28) : 266;
  const due = start + totalDays * DAY_MS;
  const daysPregnant = Math.floor((today - start) / DAY_MS);
  if (daysPregnant > totalDays + 60) return { ...empty, error: "起始日期距今过久，请检查是否填错" };
  const milestones = [
    { label: "孕早期结束 · NT 筛查", weeks: 12 },
    { label: "唐氏筛查 / 无创 DNA", weeks: 16 },
    { label: "大排畸超声", weeks: 20 },
    { label: "糖耐量试验", weeks: 24 },
    { label: "孕晚期开始 · 数胎动", weeks: 28 },
    { label: "胎心监护", weeks: 32 },
    { label: "每周产检", weeks: 36 },
    { label: "足月（37 周）", weeks: 37 },
    { label: "预产期（40 周）", weeks: 40 },
  ].map((item) => ({ ...item, date: dayText(start + item.weeks * 7 * DAY_MS) }));
  return {
    ok: true,
    dueDate: dayText(due),
    daysPregnant,
    weeks: Math.floor(daysPregnant / 7),
    days: daysPregnant % 7,
    daysLeft: Math.max(0, Math.ceil((due - today) / DAY_MS)),
    progressPct: Math.min(100, Math.round((daysPregnant / totalDays) * 1000) / 10),
    stage: daysPregnant >= totalDays ? "已到 / 超过预产期" : daysPregnant < 98 ? "孕早期" : daysPregnant < 196 ? "孕中期" : "孕晚期",
    milestones,
  };
}

/* ================================================================== */
/* 12. 分数计算                                                       */
/* ================================================================== */

export interface FractionValue { n: number; d: number }

export function simplifyFraction(n: number, d: number): FractionValue {
  if (d === 0) throw new Error("分母不能为 0");
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

function fAdd(a: FractionValue, b: FractionValue): FractionValue {
  return simplifyFraction(a.n * b.d + b.n * a.d, a.d * b.d);
}
function fSub(a: FractionValue, b: FractionValue): FractionValue {
  return simplifyFraction(a.n * b.d - b.n * a.d, a.d * b.d);
}
function fMul(a: FractionValue, b: FractionValue): FractionValue {
  return simplifyFraction(a.n * b.n, a.d * b.d);
}
function fDiv(a: FractionValue, b: FractionValue): FractionValue {
  return simplifyFraction(a.n * b.d, a.d * b.n);
}

function checkSize(f: FractionValue): FractionValue {
  if (!Number.isFinite(f.n) || !Number.isFinite(f.d) || Math.abs(f.n) > 1e12 || Math.abs(f.d) > 1e12) {
    throw new Error("数值过大，超出精确分数计算范围");
  }
  return f;
}

export function fractionToText(f: FractionValue): string {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;
}

export function fractionToMixed(f: FractionValue): string {
  if (f.d === 1) return String(f.n);
  const whole = Math.trunc(f.n / f.d);
  const rest = Math.abs(f.n % f.d);
  if (whole === 0) return fractionToText(f);
  return rest ? `${whole} ${rest}/${f.d}` : String(whole);
}

function decimalToken(token: string): FractionValue {
  const [int, frac = ""] = token.split(".");
  return simplifyFraction(Number(int + frac), 10 ** frac.length);
}

class FractionParser {
  private index = 0;
  constructor(private tokens: string[]) {}
  private peek(): string | undefined { return this.tokens[this.index]; }
  private take(): string | undefined { const token = this.tokens[this.index]; this.index += 1; return token; }
  parse(): FractionValue {
    const value = this.expression();
    if (this.index !== this.tokens.length) throw new Error(`无法解析「${this.peek()}」`);
    return value;
  }
  private expression(): FractionValue {
    let value = this.term();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.take();
      value = checkSize(op === "+" ? fAdd(value, this.term()) : fSub(value, this.term()));
    }
    return value;
  }
  private term(): FractionValue {
    let value = this.factor();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.take();
      value = checkSize(op === "*" ? fMul(value, this.factor()) : fDiv(value, this.factor()));
    }
    return value;
  }
  private factor(): FractionValue {
    const token = this.take();
    if (token === undefined) throw new Error("表达式不完整");
    if (token === "-") {
      const inner = this.factor();
      return { n: -inner.n, d: inner.d };
    }
    if (token === "+") return this.factor();
    if (token === "(") {
      const inner = this.expression();
      if (this.take() !== ")") throw new Error("缺少右括号 )");
      return inner;
    }
    if (!/^\d+(?:\.\d+)?$/.test(token)) throw new Error(`无法解析「${token}」`);
    return decimalToken(token);
  }
}

export type FractionEval =
  | { ok: true; fraction: FractionValue; text: string; mixed: string; decimal: number }
  | { ok: false; error: string };

/** 分数四则运算：`1/2 + 3/4 * (2 - 0.5)` 全程精确有理数 */
export function evalFraction(expr: string): FractionEval {
  if (!expr.trim()) return { ok: false, error: "请输入表达式" };
  const tokens: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[-+*/()])/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    if (m.index > cursor && expr.slice(cursor, m.index).trim()) {
      return { ok: false, error: `无法解析「${expr.slice(cursor, m.index).trim()}」` };
    }
    tokens.push(m[1]);
    cursor = re.lastIndex;
  }
  if (expr.slice(cursor).trim()) return { ok: false, error: `无法解析「${expr.slice(cursor).trim()}」` };
  try {
    const fraction = new FractionParser(tokens).parse();
    return {
      ok: true, fraction, text: fractionToText(fraction), mixed: fractionToMixed(fraction),
      decimal: fraction.n / fraction.d,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "表达式不合法" };
  }
}

export type DecimalToFraction =
  | { ok: true; fraction: FractionValue; text: string; errorValue: number }
  | { ok: false; error: string };

/** 小数 → 最简分数（连分数逼近，分母不超过 maxDen） */
export function decimalToFraction(value: number, maxDen = 10000): DecimalToFraction {
  if (!Number.isFinite(value)) return { ok: false, error: "请输入有限小数" };
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const integer = Math.floor(x);
  let best = { n: integer, d: 1, err: Math.abs(x - integer) };
  let remainder = x - integer;
  let pPrev = 1;
  let pCurr = integer;
  let qPrev = 0;
  let qCurr = 1;
  for (let i = 0; i < 64 && remainder > 1e-12; i += 1) {
    const inverse = 1 / remainder;
    const a = Math.floor(inverse);
    const p = a * pCurr + pPrev;
    const q = a * qCurr + qPrev;
    if (q > maxDen) break;
    const err = Math.abs(x - p / q);
    if (err < best.err) best = { n: p, d: q, err };
    if (err < 1e-12) break;
    remainder = inverse - a;
    pPrev = pCurr; pCurr = p;
    qPrev = qCurr; qCurr = q;
  }
  const fraction = simplifyFraction(sign * best.n, best.d);
  return { ok: true, fraction, text: fractionToText(fraction), errorValue: best.err };
}

/* ================================================================== */
/* 13. 排列组合与概率                                                  */
/* ================================================================== */

export type CombinationMode =
  | "factorial" | "permutation" | "combination" | "repeat-combination"
  | "binomial" | "binomial-cum" | "at-least-once";

export interface CombinationResult {
  ok: boolean;
  value: number;
  formula: string;
  note: string;
  error?: string;
}

function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const times = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= times; i += 1) result = (result * (n - times + i)) / i;
  return Math.round(result);
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

export function calcCombination(mode: CombinationMode, n: number, k: number, p: number): CombinationResult {
  const bad = (error: string): CombinationResult => ({ ok: false, value: 0, formula: "", note: "", error });
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0) return bad("n 与 k 必须是非负整数");
  if (!Number.isFinite(p) || p < 0 || p > 1) return bad("概率 p 必须在 0 与 1 之间");
  if (n > 170) return bad("n 最大支持 170（再大会超出浮点数范围）");
  if (mode === "factorial") {
    const value = factorial(n);
    return { ok: true, value, formula: `${n}!`, note: `1 × 2 × … × ${n}` };
  }
  if (mode === "at-least-once") {
    const value = 1 - (1 - p) ** n;
    return { ok: true, value, formula: `1 - (1 - p)^n`, note: `${n} 次独立尝试，每次成功率 ${p}，至少成功一次的概率` };
  }
  if (k > n) return bad("k 不能大于 n");
  if (mode === "permutation") {
    let value = 1;
    for (let i = 0; i < k; i += 1) value *= n - i;
    return { ok: true, value, formula: `P(${n}, ${k}) = ${n}! / (${n} - ${k})!`, note: `从 ${n} 个里有序取 ${k} 个` };
  }
  if (mode === "combination") {
    const value = binomialCoefficient(n, k);
    return { ok: true, value, formula: `C(${n}, ${k}) = ${n}! / (${k}! × (${n} - ${k})!)`, note: `从 ${n} 个里无序取 ${k} 个` };
  }
  if (mode === "repeat-combination") {
    if (n < 1) return bad("可重复组合要求 n ≥ 1");
    const value = binomialCoefficient(n + k - 1, k);
    return { ok: true, value, formula: `H(${n}, ${k}) = C(${n + k - 1}, ${k})`, note: `从 ${n} 类里可重复地选 ${k} 个` };
  }
  if (mode === "binomial") {
    const value = binomialCoefficient(n, k) * p ** k * (1 - p) ** (n - k);
    return { ok: true, value, formula: `P(X = ${k}) = C(${n}, ${k}) × p^${k} × (1-p)^${n - k}`, note: `${n} 次独立试验恰好成功 ${k} 次` };
  }
  let sum = 0;
  for (let i = 0; i <= k; i += 1) sum += binomialCoefficient(n, i) * p ** i * (1 - p) ** (n - i);
  return { ok: true, value: Math.min(1, sum), formula: `P(X ≤ ${k}) = Σ(i=0..${k}) C(${n}, i) p^i (1-p)^(${n}-i)`, note: `${n} 次独立试验最多成功 ${k} 次` };
}

