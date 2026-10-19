/*
 * 开发类新工具：JSON → TypeScript、JSON 扁平化、ULID、IPv6、
 * MAC、User-Agent、语义化版本、路径、dotenv、cURL。
 *
 * IPv4 网段仍走 IP / CIDR；这里只处理 IPv6 的展开、压缩和校验。
 */
import { intToDotted, parseIpv4 } from "../ipCidr";
import { searchHttpStatus, searchMime, type HttpStatus, type MimeEntry } from "./catalog";

export { searchHttpStatus, searchMime };
export type { HttpStatus, MimeEntry };

interface TsField {
  key: string;
  optional: boolean;
  type: string;
}

interface TsIface {
  name: string;
  fields: TsField[];
}

interface TsCtx {
  ifaces: TsIface[];
  used: Set<string>;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pascal(key: string): string {
  const parts = key
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const name = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  if (!name || /^[0-9]/.test(name)) return `T${name}`;
  return name;
}

function fresh(base: string, used: Set<string>): string {
  let name = base || "Item";
  if (!/^[A-Za-z_]/.test(name)) name = `T${name}`;
  let next = name;
  let i = 2;
  while (used.has(next)) {
    next = `${name}${i}`;
    i += 1;
  }
  used.add(next);
  return next;
}

function mergeObjects(objs: Record<string, unknown>[]): { key: string; optional: boolean; samples: unknown[] }[] {
  const keys: string[] = [];
  const map = new Map<string, unknown[]>();
  for (const obj of objs) {
    for (const key of Object.keys(obj)) {
      if (!map.has(key)) {
        map.set(key, []);
        keys.push(key);
      }
    }
  }
  for (const obj of objs) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) map.get(key)!.push(obj[key]);
    }
  }
  return keys.map((key) => ({
    key,
    optional: (map.get(key)?.length ?? 0) < objs.length,
    samples: map.get(key) ?? [],
  }));
}

function wrapArray(type: string): string {
  return type.includes("|") || type.includes(" ") ? `(${type})[]` : `${type}[]`;
}

function inferMany(samples: unknown[], hint: string, ctx: TsCtx): string {
  const present = samples.filter((sample) => sample !== undefined);
  const nonNull = present.filter((sample) => sample !== null);
  const hasNull = nonNull.length !== present.length;
  if (!nonNull.length) return "null";
  let base: string;
  if (nonNull.every((sample) => typeof sample === "string")) base = "string";
  else if (nonNull.every((sample) => typeof sample === "number")) base = "number";
  else if (nonNull.every((sample) => typeof sample === "boolean")) base = "boolean";
  else if (nonNull.every(isPlain)) base = emitInterface(mergeObjects(nonNull as Record<string, unknown>[]), hint, ctx);
  else if (nonNull.every(Array.isArray)) {
    const elems = (nonNull as unknown[][]).flat();
    base = elems.length ? wrapArray(inferMany(elems, `${hint}Item`, ctx)) : "unknown[]";
  } else {
    const types = Array.from(new Set(nonNull.map((sample) => inferMany([sample], hint, ctx))));
    base = types.join(" | ");
  }
  return hasNull ? `${base} | null` : base;
}

function emitInterface(
  fields: { key: string; optional: boolean; samples: unknown[] }[],
  hint: string,
  ctx: TsCtx,
): string {
  const name = fresh(pascal(hint), ctx.used);
  const resolved = fields.map((field) => ({
    key: field.key,
    optional: field.optional,
    type: inferMany(field.samples, pascal(field.key) || "Field", ctx),
  }));
  ctx.ifaces.push({ name, fields: resolved });
  return name;
}

function renderIface(iface: TsIface): string {
  const lines = iface.fields.map((field) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field.key) ? field.key : JSON.stringify(field.key);
    return `  ${key}${field.optional ? "?" : ""}: ${field.type};`;
  });
  return `export interface ${iface.name} {\n${lines.join("\n")}\n}`;
}

/** JSON 文本 → TypeScript interface。数组对象会合并字段，缺失的键标成可选 */
export function jsonToTypescript(input: string, rootName = "Root"): { code: string; error?: string } {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (e) {
    return { code: "", error: e instanceof Error ? e.message : "JSON 无效" };
  }
  const ctx: TsCtx = { ifaces: [], used: new Set() };
  const rootType = inferMany([value], rootName || "Root", ctx);
  const blocks = ctx.ifaces.map(renderIface);
  if (!ctx.ifaces.some((iface) => iface.name === rootType)) {
    const alias = fresh(pascal(rootName || "Root"), ctx.used);
    blocks.push(`export type ${alias} = ${rootType};`);
  }
  return { code: blocks.join("\n\n") };
}

/** 对象 / 数组压成点路径。数组下标用数字 */
export function flattenJson(value: unknown, sep = "."): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (current: unknown, prefix: string) => {
    if (Array.isArray(current)) {
      if (!current.length) {
        if (prefix) out[prefix] = [];
        return;
      }
      current.forEach((item, index) => walk(item, prefix ? `${prefix}${sep}${index}` : String(index)));
      return;
    }
    if (isPlain(current)) {
      const keys = Object.keys(current);
      if (!keys.length) {
        if (prefix) out[prefix] = {};
        return;
      }
      for (const key of keys) walk(current[key], prefix ? `${prefix}${sep}${key}` : key);
      return;
    }
    out[prefix || "$"] = current;
  };
  walk(value, "");
  return out;
}

function foldArrays(node: unknown): unknown {
  if (!isPlain(node)) return node;
  const folded: Record<string, unknown> = {};
  for (const key of Object.keys(node)) folded[key] = foldArrays(node[key]);
  const keys = Object.keys(folded);
  if (keys.length && keys.every((key) => /^\d+$/.test(key))) {
    const indexes = keys.map(Number).sort((a, b) => a - b);
    if (indexes[0] === 0 && indexes.every((n, i) => n === i)) return indexes.map((n) => folded[String(n)]);
  }
  return folded;
}

/** 点路径还原。连续数字键 0..n-1 还原成数组 */
export function unflattenJson(flat: Record<string, unknown>, sep = "."): unknown {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(sep);
    let cursor: Record<string, unknown> = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = value;
        return;
      }
      const next = cursor[part];
      if (!isPlain(next)) cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    });
  }
  return foldArrays(root);
}

export function flattenJsonText(input: string, sep = "."): { output: string; error?: string } {
  try {
    return { output: JSON.stringify(flattenJson(JSON.parse(input), sep || "."), null, 2) };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "JSON 无效" };
  }
}

export function unflattenJsonText(input: string, sep = "."): { output: string; error?: string } {
  try {
    const value = JSON.parse(input);
    if (!isPlain(value)) return { output: "", error: "扁平 JSON 需要是对象" };
    return { output: JSON.stringify(unflattenJson(value, sep || "."), null, 2) };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : "JSON 无效" };
  }
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeUlidTime(time: number): string {
  let rest = time;
  const chars = Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    chars[i] = CROCKFORD[rest % 32];
    rest = Math.floor(rest / 32);
  }
  return chars.join("");
}

function encodeUlidRandom(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(buffer >> bits) & 31];
    }
  }
  return out;
}

function random80(): Uint8Array {
  const bytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** 生成 26 位 ULID。时间占前 10 位，随机数占后 16 位 */
export function generateUlid(time = Date.now(), randomBytes?: Uint8Array): string {
  const ms = Math.max(0, Math.trunc(time));
  if (ms >= 2 ** 48) throw new Error("时间超出 ULID 48 位范围");
  const bytes = randomBytes && randomBytes.length === 10 ? randomBytes : random80();
  return encodeUlidTime(ms) + encodeUlidRandom(bytes);
}

export function parseUlid(input: string): { ok: true; time: number; iso: string; random: string } | { ok: false; error: string } {
  const text = input.trim().toUpperCase();
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(text)) return { ok: false, error: "ULID 必须是 26 位 Crockford Base32" };
  let time = 0;
  for (const ch of text.slice(0, 10)) time = time * 32 + CROCKFORD.indexOf(ch);
  if (time >= 2 ** 48) return { ok: false, error: "时间部分超出 48 位" };
  return { ok: true, time, iso: new Date(time).toISOString(), random: text.slice(10) };
}

export interface Ipv6Info {
  compressed: string;
  expanded: string;
  groups: string[];
  ipv4: string | null;
  zone: string;
}

function compressGroups(groups: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < groups.length) {
    if (groups[i] !== 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < groups.length && groups[j] === 0) j += 1;
    if (j - i > bestLen) {
      bestLen = j - i;
      bestStart = i;
    }
    i = j;
  }
  const hex = (n: number) => n.toString(16);
  if (bestLen < 2) return groups.map(hex).join(":");
  const left = groups.slice(0, bestStart).map(hex);
  const right = groups.slice(bestStart + bestLen).map(hex);
  if (!left.length && !right.length) return "::";
  if (!left.length) return `::${right.join(":")}`;
  if (!right.length) return `${left.join(":")}::`;
  return `${left.join(":")}::${right.join(":")}`;
}

/** 解析 IPv6：支持 :: 压缩、IPv4 尾段和方括号 */
export function parseIpv6(input: string): { ok: true; info: Ipv6Info } | { ok: false; error: string } {
  let text = input.trim();
  if (!text) return { ok: false, error: "请输入 IPv6" };
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  let zone = "";
  const zoneAt = text.indexOf("%");
  if (zoneAt >= 0) {
    zone = text.slice(zoneAt + 1);
    text = text.slice(0, zoneAt);
  }
  text = text.toLowerCase();
  if (text.includes(":::")) return { ok: false, error: "压缩标记过多" };
  const halves = text.split("::");
  if (halves.length > 2) return { ok: false, error: ":: 只能出现一次" };

  const parseSide = (part: string): number[] | null => {
    if (!part) return [];
    const bits = part.split(":");
    const groups: number[] = [];
    for (let i = 0; i < bits.length; i++) {
      const bit = bits[i];
      if (bit.includes(".")) {
        if (i !== bits.length - 1) return null;
        const ip = parseIpv4(bit);
        if (!ip.ok) return null;
        groups.push((ip.ip >>> 16) & 0xffff, ip.ip & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(bit)) return null;
        groups.push(parseInt(bit, 16));
      }
    }
    return groups;
  };

  const left = parseSide(halves[0]);
  const right = halves.length === 2 ? parseSide(halves[1]) : [];
  if (!left || !right) return { ok: false, error: "IPv6 格式不正确" };
  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return { ok: false, error: "地址段数量不对" };
    groups = [...left, ...Array(missing).fill(0), ...right];
  } else {
    if (left.length !== 8) return { ok: false, error: "完整 IPv6 需要 8 段" };
    groups = left;
  }
  if (groups.length !== 8 || groups.some((n) => n > 0xffff)) return { ok: false, error: "地址段超出范围" };
  const v4Mapped = groups.slice(0, 5).every((n) => n === 0) && groups[5] === 0xffff;
  const ipv4 =
    v4Mapped || text.includes(".") ? intToDotted(((groups[6] << 16) | groups[7]) >>> 0) : null;
  return {
    ok: true,
    info: {
      compressed: compressGroups(groups),
      expanded: groups.map((n) => n.toString(16).padStart(4, "0")).join(":"),
      groups: groups.map((n) => n.toString(16)),
      ipv4,
      zone,
    },
  };
}

export interface MacInfo {
  colon: string;
  dash: string;
  dot: string;
  plain: string;
  multicast: boolean;
  local: boolean;
  firstOctetBits: string;
}

function parseMacBytes(input: string): number[] | null {
  const compact = input.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (!/^[0-9a-f]{12}$/.test(compact)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < 12; i += 2) bytes.push(parseInt(compact.slice(i, i + 2), 16));
  return bytes;
}

export function formatMac(bytes: number[]): MacInfo {
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
  return {
    colon: hex.join(":"),
    dash: hex.join("-"),
    dot: `${hex[0]}${hex[1]}.${hex[2]}${hex[3]}.${hex[4]}${hex[5]}`,
    plain: hex.join(""),
    multicast: (bytes[0] & 1) === 1,
    local: (bytes[0] & 2) === 2,
    firstOctetBits: bytes[0].toString(2).padStart(8, "0"),
  };
}

export function parseMac(input: string): { ok: true; info: MacInfo } | { ok: false; error: string } {
  const bytes = parseMacBytes(input);
  if (!bytes) return { ok: false, error: "MAC 需要 6 字节，可用 : - . 或连续十六进制" };
  return { ok: true, info: formatMac(bytes) };
}

/** 随机单播、本地管理的 MAC */
export function randomMac(): MacInfo {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[0] = (bytes[0] & 0xfc) | 0x02;
  return formatMac(Array.from(bytes));
}

export interface UaInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: string;
  engine: string;
}

function pick(ua: string, re: RegExp): string {
  return ua.match(re)?.[1] ?? "";
}

/** 用常见标记粗解析 UA，不访问网络 */
export function parseUserAgent(ua: string): UaInfo {
  const text = ua.trim();
  let browser = "未知";
  let browserVersion = "";
  let engine = "未知";
  if (/edg\//i.test(text)) {
    browser = "Edge";
    browserVersion = pick(text, /Edg\/([\d.]+)/i);
    engine = "Blink";
  } else if (/opr\/|opera/i.test(text)) {
    browser = "Opera";
    browserVersion = pick(text, /OPR\/([\d.]+)/i);
    engine = "Blink";
  } else if (/chrome\//i.test(text) && !/chromium/i.test(text)) {
    browser = "Chrome";
    browserVersion = pick(text, /Chrome\/([\d.]+)/i);
    engine = "Blink";
  } else if (/firefox\//i.test(text)) {
    browser = "Firefox";
    browserVersion = pick(text, /Firefox\/([\d.]+)/i);
    engine = "Gecko";
  } else if (/safari\//i.test(text)) {
    browser = "Safari";
    browserVersion = pick(text, /Version\/([\d.]+)/i);
    engine = "WebKit";
  } else if (/msie |trident/i.test(text)) {
    browser = "Internet Explorer";
    browserVersion = pick(text, /(?:MSIE |rv:)([\d.]+)/i);
    engine = "Trident";
  }

  let os = "未知";
  let osVersion = "";
  const nt = pick(text, /Windows NT ([\d.]+)/i);
  if (nt) {
    os = "Windows";
    const map: Record<string, string> = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7", "6.0": "Vista" };
    osVersion = map[nt] ?? nt;
  } else if (/android/i.test(text)) {
    os = "Android";
    osVersion = pick(text, /Android ([\d.]+)/i);
  } else if (/iPhone|iPad|iPod/i.test(text)) {
    os = "iOS";
    osVersion = pick(text, /OS ([\d_]+)/i).replace(/_/g, ".");
  } else if (/Mac OS X/i.test(text)) {
    os = "macOS";
    osVersion = pick(text, /Mac OS X ([\d_]+)/i).replace(/_/g, ".");
  } else if (/CrOS/i.test(text)) {
    os = "ChromeOS";
  } else if (/Linux/i.test(text)) {
    os = "Linux";
  }

  let device = "桌面";
  if (/iPad|Tablet/i.test(text)) device = "平板";
  else if (/Mobile|iPhone|Android/i.test(text) && !/Tablet/i.test(text)) device = "手机";
  if (!text) device = "未知";
  return { browser, browserVersion, os, osVersion, device, engine };
}

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string;
  raw: string;
}

const SEMVER_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(input: string): SemVer | null {
  const match = input.trim().match(SEMVER_RE);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
    build: match[5] ?? "",
    raw: input.trim(),
  };
}

function cmpId(a: string, b: string): number {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 语义化版本比较。正式版大于预发布版，构建元数据不参与比较 */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) throw new Error("版本号不符合 SemVer");
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (!left.prerelease.length && right.prerelease.length) return 1;
  if (left.prerelease.length && !right.prerelease.length) return -1;
  const len = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < len; i++) {
    if (left.prerelease[i] === undefined) return -1;
    if (right.prerelease[i] === undefined) return 1;
    const c = cmpId(left.prerelease[i], right.prerelease[i]);
    if (c) return c;
  }
  return 0;
}

export function sortSemver(list: string[]): string[] {
  return [...list].sort(compareSemver);
}

export function bumpSemver(input: string, part: "major" | "minor" | "patch"): string {
  const ver = parseSemver(input);
  if (!ver) throw new Error("版本号不符合 SemVer");
  if (part === "major") return `${ver.major + 1}.0.0`;
  if (part === "minor") return `${ver.major}.${ver.minor + 1}.0`;
  return `${ver.major}.${ver.minor}.${ver.patch + 1}`;
}

function satisfiesComparator(version: SemVer, expr: string): boolean {
  const text = expr.trim();
  if (!text || text === "*") return true;
  const caret = text.match(/^\^v?(\d+\.\d+\.\d+.*)$/);
  if (caret) {
    const base = parseSemver(caret[1]);
    if (!base || compareSemver(version.raw, base.raw) < 0) return false;
    if (base.major > 0) return version.major === base.major;
    if (base.minor > 0) return version.major === 0 && version.minor === base.minor;
    return version.major === 0 && version.minor === 0 && version.patch === base.patch;
  }
  const tilde = text.match(/^~v?(\d+\.\d+\.\d+.*)$/);
  if (tilde) {
    const base = parseSemver(tilde[1]);
    if (!base || compareSemver(version.raw, base.raw) < 0) return false;
    return version.major === base.major && version.minor === base.minor;
  }
  const cmp = text.match(/^(>=|<=|>|<|=)?\s*v?(\d+\.\d+\.\d+.*)$/);
  if (!cmp) throw new Error(`无法识别范围 ${text}`);
  const op = cmp[1] || "=";
  const target = cmp[2];
  const n = compareSemver(version.raw, target);
  if (op === "=") return n === 0;
  if (op === ">") return n > 0;
  if (op === ">=") return n >= 0;
  if (op === "<") return n < 0;
  return n <= 0;
}

/** 支持 = > >= < <= ^ ~，空格表示并且，|| 表示或者 */
export function satisfiesSemver(version: string, range: string): boolean {
  const ver = parseSemver(version);
  if (!ver) throw new Error("版本号不符合 SemVer");
  const orParts = range.split("||").map((part) => part.trim()).filter(Boolean);
  if (!orParts.length) return true;
  return orParts.some((part) => part.split(/\s+/).every((cmp) => satisfiesComparator(ver, cmp)));
}

export type PathStyle = "posix" | "win" | "auto";

export interface PathInfo {
  style: "posix" | "win";
  normalized: string;
  dir: string;
  base: string;
  name: string;
  ext: string;
  absolute: boolean;
}

function detectStyle(input: string, style: PathStyle): "posix" | "win" {
  if (style === "posix" || style === "win") return style;
  return /[\\]|^[A-Za-z]:/.test(input) ? "win" : "posix";
}

function splitParts(input: string, style: "posix" | "win"): { absolute: boolean; root: string; parts: string[] } {
  if (style === "win") {
    const match = input.match(/^([A-Za-z]:)?([\\/])?(.*)$/);
    const drive = match?.[1] ?? "";
    const slash = Boolean(match?.[2]);
    const rest = (match?.[3] ?? "").split(/[\\/]+/).filter(Boolean);
    return { absolute: Boolean(drive) || slash, root: drive ? `${drive}\\` : slash ? "\\" : "", parts: rest };
  }
  const absolute = input.startsWith("/");
  return { absolute, root: absolute ? "/" : "", parts: input.split(/\/+/).filter(Boolean) };
}

function normalizeParts(parts: string[], absolute: boolean): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(part);
  }
  return out;
}

export function normalizePath(input: string, style: PathStyle = "auto"): string {
  const kind = detectStyle(input, style);
  const sep = kind === "win" ? "\\" : "/";
  const parsed = splitParts(input, kind);
  const parts = normalizeParts(parsed.parts, parsed.absolute);
  if (!parts.length) return parsed.root || (parsed.absolute ? sep : ".");
  if (kind === "win" && parsed.root.endsWith("\\")) return parsed.root + parts.join("\\");
  return `${parsed.root}${parts.join(sep)}`;
}

export function inspectPath(input: string, style: PathStyle = "auto"): PathInfo {
  const kind = detectStyle(input, style);
  const normalized = normalizePath(input, kind);
  const sep = kind === "win" ? "\\" : "/";
  const absolute = kind === "win" ? /^[A-Za-z]:\\/.test(normalized) || normalized.startsWith("\\") : normalized.startsWith("/");
  let dir = "";
  let base = normalized;
  const cut = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (cut >= 0) {
    dir = normalized.slice(0, cut) || (absolute ? sep : "");
    if (kind === "win" && /^[A-Za-z]:$/.test(dir)) dir += "\\";
    base = normalized.slice(cut + 1);
  }
  let name = base;
  let ext = "";
  const dot = base.lastIndexOf(".");
  if (dot > 0) {
    name = base.slice(0, dot);
    ext = base.slice(dot);
  }
  return { style: kind, normalized, dir: dir || (absolute ? (kind === "win" ? normalized : sep) : "."), base, name, ext, absolute };
}

export function joinPath(parts: string[], style: PathStyle = "posix"): string {
  const kind = style === "auto" ? "posix" : style;
  const meaningful = parts.filter((part) => part !== "");
  if (!meaningful.length) return ".";
  let acc = meaningful[0];
  for (const part of meaningful.slice(1)) {
    if (kind === "win" && (/^[A-Za-z]:[\\/]/.test(part) || part.startsWith("\\") || part.startsWith("/"))) acc = part;
    else if (kind === "posix" && part.startsWith("/")) acc = part;
    else acc = `${acc.replace(/[\\/]+$/, "")}${kind === "win" ? "\\" : "/"}${part.replace(/^[\\/]+/, "")}`;
  }
  return normalizePath(acc, kind);
}

export interface EnvEntry {
  key: string;
  value: string;
}

/** 解析 .env。支持 export、注释、单双引号和双引号转义 */
export function parseDotenv(text: string): { entries: EnvEntry[]; error?: string } {
  const entries: EnvEntry[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    line = line.replace(/^\s*export\s+/, "");
    const eq = line.indexOf("=");
    if (eq <= 0) return { entries, error: `第 ${i + 1} 行不是 KEY=VALUE` };
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { entries, error: `第 ${i + 1} 行变量名无效` };
    let raw = line.slice(eq + 1);
    if (raw.startsWith('"')) {
      let value = "";
      raw = raw.slice(1);
      let closed = false;
      for (let c = 0; c < raw.length; c++) {
        if (raw[c] === "\\") {
          const n = raw[c + 1];
          value += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n === undefined ? "\\" : n;
          if (n !== undefined) c += 1;
          continue;
        }
        if (raw[c] === '"') {
          closed = true;
          break;
        }
        value += raw[c];
      }
      if (!closed) return { entries, error: `第 ${i + 1} 行双引号没有闭合` };
      entries.push({ key, value });
      continue;
    }
    if (raw.startsWith("'")) {
      const end = raw.indexOf("'", 1);
      if (end < 0) return { entries, error: `第 ${i + 1} 行单引号没有闭合` };
      entries.push({ key, value: raw.slice(1, end) });
      continue;
    }
    const comment = raw.search(/\s+#/);
    if (comment >= 0) raw = raw.slice(0, comment);
    entries.push({ key, value: raw.trim() });
  }
  return { entries };
}

export function dotenvToObject(entries: EnvEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) out[entry.key] = entry.value;
  return out;
}

export function stringifyDotenv(entries: EnvEntry[]): string {
  return entries
    .map((entry) => {
      if (/[\s#"'\\]|\n/.test(entry.value)) {
        const escaped = entry.value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r");
        return `${entry.key}="${escaped}"`;
      }
      return `${entry.key}=${entry.value}`;
    })
    .join("\n");
}

export interface CurlRequest {
  method: string;
  url: string;
  headers: { name: string; value: string }[];
  body: string;
  user: string;
  insecure: boolean;
  follow: boolean;
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (quote === '"' && ch === "\\" && i + 1 < command.length) {
        cur += command[i + 1];
        i += 1;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "\\" && command[i + 1] === "\n") {
      i += 1;
      continue;
    }
    if (ch === "\\" && i + 1 < command.length) {
      cur += command[i + 1];
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (quote) throw new Error("引号没有闭合");
  if (cur) tokens.push(cur);
  return tokens;
}

const CURL_BOOL = new Set(["k", "L", "s", "S", "G", "compressed", "location", "silent", "insecure", "get"]);
const CURL_VALUE = new Set([
  "X",
  "request",
  "H",
  "header",
  "d",
  "data",
  "data-raw",
  "data-binary",
  "data-urlencode",
  "u",
  "user",
  "A",
  "user-agent",
  "e",
  "referer",
  "url",
  "b",
  "cookie",
]);

/** 解析常见 curl 命令：方法、URL、头、请求体 */
export function parseCurl(command: string): { ok: true; request: CurlRequest } | { ok: false; error: string } {
  let tokens: string[];
  try {
    tokens = tokenizeShell(command.trim());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "无法分词" };
  }
  if (!tokens.length) return { ok: false, error: "请输入 curl 命令" };
  const request: CurlRequest = { method: "", url: "", headers: [], body: "", user: "", insecure: false, follow: false };
  let forcedGet = false;
  const takeValue = (name: string, value: string | undefined): string | null => {
    if (value === undefined) return `选项 -${name} 缺少参数`;
    if (name === "X" || name === "request") request.method = value.toUpperCase();
    else if (name === "H" || name === "header") {
      const colon = value.indexOf(":");
      if (colon <= 0) return `请求头格式应为 Name: value`;
      request.headers.push({ name: value.slice(0, colon).trim(), value: value.slice(colon + 1).trim() });
    } else if (name === "d" || name.startsWith("data")) request.body = request.body ? `${request.body}&${value}` : value;
    else if (name === "u" || name === "user") request.user = value;
    else if (name === "A" || name === "user-agent") request.headers.push({ name: "User-Agent", value });
    else if (name === "e" || name === "referer") request.headers.push({ name: "Referer", value });
    else if (name === "b" || name === "cookie") request.headers.push({ name: "Cookie", value });
    else if (name === "url") request.url = value;
    return null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^curl(\.exe)?$/i.test(token)) continue;
    if (token.startsWith("--")) {
      let name = token.slice(2);
      let inline: string | undefined;
      const eq = name.indexOf("=");
      if (eq >= 0) {
        inline = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (CURL_BOOL.has(name)) {
        if (name === "k" || name === "insecure") request.insecure = true;
        if (name === "L" || name === "location") request.follow = true;
        if (name === "G" || name === "get") forcedGet = true;
        continue;
      }
      if (!CURL_VALUE.has(name)) continue;
      const value = inline !== undefined ? inline : tokens[++i];
      const error = takeValue(name, value);
      if (error) return { ok: false, error };
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const flags = token.slice(1);
      if ([...flags].every((flag) => CURL_BOOL.has(flag))) {
        if (flags.includes("k")) request.insecure = true;
        if (flags.includes("L")) request.follow = true;
        if (flags.includes("G")) forcedGet = true;
        continue;
      }
      const name = flags[0];
      if (!CURL_VALUE.has(name)) return { ok: false, error: `不认识的选项 -${name}` };
      const value = flags.length > 1 ? flags.slice(1) : tokens[++i];
      const error = takeValue(name, value);
      if (error) return { ok: false, error };
      continue;
    }
    if (!request.url) request.url = token;
  }
  if (!request.url) return { ok: false, error: "没有找到 URL" };
  if (!request.method) request.method = request.body && !forcedGet ? "POST" : "GET";
  if (forcedGet && request.body) {
    const join = request.url.includes("?") ? "&" : "?";
    request.url += join + request.body;
    request.body = "";
    request.method = "GET";
  }
  return { ok: true, request };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildCurl(request: CurlRequest): string {
  const parts = ["curl"];
  const method = (request.method || "GET").toUpperCase();
  if (method !== "GET" || request.body) parts.push("-X", shellQuote(method));
  if (request.url) parts.push(shellQuote(request.url));
  for (const header of request.headers) {
    if (!header.name) continue;
    parts.push("-H", shellQuote(`${header.name}: ${header.value}`));
  }
  if (request.user) parts.push("-u", shellQuote(request.user));
  if (request.body) parts.push("--data-raw", shellQuote(request.body));
  if (request.insecure) parts.push("-k");
  if (request.follow) parts.push("-L");
  return parts.join(" ");
}
