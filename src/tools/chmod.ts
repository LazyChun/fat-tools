/*
 * Unix 文件权限：数字模式 ↔ 符号模式（含 setuid / setgid / sticky）
 */

export type ChmodTriad = { r: boolean; w: boolean; x: boolean };

export interface ChmodBits {
  special: { setuid: boolean; setgid: boolean; sticky: boolean };
  owner: ChmodTriad;
  group: ChmodTriad;
  other: ChmodTriad;
}

export type ChmodParseResult =
  | { ok: true; mode: number; octal: string; symbolic: string; bits: ChmodBits }
  | { ok: false; error: string };

const TRIAD_CHARS = ["r", "w", "x"] as const;

function triadToBits(t: ChmodTriad): number {
  return (t.r ? 4 : 0) + (t.w ? 2 : 0) + (t.x ? 1 : 0);
}

function bitsToTriad(n: number): ChmodTriad {
  return { r: (n & 4) !== 0, w: (n & 2) !== 0, x: (n & 1) !== 0 };
}

function specialChar(
  exec: boolean,
  special: boolean,
  kind: "s" | "t",
): string {
  if (special && exec) return kind;
  if (special && !exec) return kind.toUpperCase();
  return exec ? "x" : "-";
}

/** 从位结构生成符号串，如 rwxr-xr-x / rwsr-xr-t */
export function bitsToSymbolic(bits: ChmodBits): string {
  const o = bits.owner;
  const g = bits.group;
  const t = bits.other;
  return (
    (o.r ? "r" : "-") +
    (o.w ? "w" : "-") +
    specialChar(o.x, bits.special.setuid, "s") +
    (g.r ? "r" : "-") +
    (g.w ? "w" : "-") +
    specialChar(g.x, bits.special.setgid, "s") +
    (t.r ? "r" : "-") +
    (t.w ? "w" : "-") +
    specialChar(t.x, bits.special.sticky, "t")
  );
}

/** 位结构 → 0~4095 的 mode 整数 */
export function bitsToMode(bits: ChmodBits): number {
  const special =
    (bits.special.setuid ? 4 : 0) +
    (bits.special.setgid ? 2 : 0) +
    (bits.special.sticky ? 1 : 0);
  return (
    (special << 9) +
    (triadToBits(bits.owner) << 6) +
    (triadToBits(bits.group) << 3) +
    triadToBits(bits.other)
  );
}

/** mode 整数 → 位结构 */
export function modeToBits(mode: number): ChmodBits {
  const m = mode & 0xfff;
  return {
    special: {
      setuid: (m & 0o4000) !== 0,
      setgid: (m & 0o2000) !== 0,
      sticky: (m & 0o1000) !== 0,
    },
    owner: bitsToTriad((m >> 6) & 7),
    group: bitsToTriad((m >> 3) & 7),
    other: bitsToTriad(m & 7),
  };
}

/** 格式化为 3 或 4 位八进制字符串（有特殊位时 4 位） */
export function modeToOctal(mode: number): string {
  const m = mode & 0xfff;
  const special = (m >> 9) & 7;
  const rest = (m & 0o777).toString(8).padStart(3, "0");
  return special ? `${special}${rest}` : rest;
}

function parseSymbolicTriad(
  chars: string,
  specialKind: "s" | "t" | null,
): { triad: ChmodTriad; special: boolean } | { error: string } {
  if (chars.length !== 3) return { error: "符号模式每组须 3 位" };
  const [rc0, wc0, xc0] = chars;
  const rc = rc0.toLowerCase();
  const wc = wc0.toLowerCase();
  const xc = xc0; // 保留大小写：s/S、t/T
  if (rc !== "r" && rc !== "-") return { error: `非法读位「${rc0}」` };
  if (wc !== "w" && wc !== "-") return { error: `非法写位「${wc0}」` };

  let x = false;
  let special = false;
  if (xc === "x") {
    x = true;
  } else if (xc === "-") {
    // ok
  } else if (specialKind === "s" && (xc === "s" || xc === "S")) {
    special = true;
    x = xc === "s";
  } else if (specialKind === "t" && (xc === "t" || xc === "T")) {
    special = true;
    x = xc === "t";
  } else {
    return { error: `非法执行/特殊位「${xc}」` };
  }
  return { triad: { r: rc === "r", w: wc === "w", x }, special };
}

/** 解析符号模式（9 或 10 位，可带前导文件类型字母） */
export function parseSymbolic(input: string): ChmodParseResult {
  let s = input.trim().replace(/\s+/g, "");
  // 去掉 ls -l 前导的文件类型字符（保留 s/S/t/T 大小写语义）
  if (/^[dDlLcbpsCBPS\-]/.test(s) && s.length === 10) s = s.slice(1);
  if (s.length !== 9) {
    return { ok: false, error: "符号模式应为 9 位，如 rwxr-xr-x（可带 ls 前导类型）" };
  }
  const o = parseSymbolicTriad(s.slice(0, 3), "s");
  if ("error" in o) return { ok: false, error: o.error };
  const g = parseSymbolicTriad(s.slice(3, 6), "s");
  if ("error" in g) return { ok: false, error: g.error };
  const t = parseSymbolicTriad(s.slice(6, 9), "t");
  if ("error" in t) return { ok: false, error: t.error };

  const bits: ChmodBits = {
    special: { setuid: o.special, setgid: g.special, sticky: t.special },
    owner: o.triad,
    group: g.triad,
    other: t.triad,
  };
  const mode = bitsToMode(bits);
  return {
    ok: true,
    mode,
    octal: modeToOctal(mode),
    symbolic: bitsToSymbolic(bits),
    bits,
  };
}

/** 解析八进制数字模式（如 755、0755、4755） */
export function parseOctal(input: string): ChmodParseResult {
  const s = input.trim();
  if (!s) return { ok: false, error: "请输入权限数字，如 755" };
  if (!/^[0-7]{3,4}$/.test(s)) return { ok: false, error: "须为 3~4 位八进制数字（0-7）" };
  const mode = parseInt(s, 8) & 0xfff;
  const bits = modeToBits(mode);
  return {
    ok: true,
    mode,
    octal: modeToOctal(mode),
    symbolic: bitsToSymbolic(bits),
    bits,
  };
}

/** 自动识别数字或符号 */
export function parseChmod(input: string): ChmodParseResult {
  const s = input.trim();
  if (!s) return { ok: false, error: "请输入权限，如 755 或 rwxr-xr-x" };
  if (/^[0-7]{3,4}$/.test(s)) return parseOctal(s);
  return parseSymbolic(s);
}

/** 从勾选位构建结果 */
export function fromBits(bits: ChmodBits): ChmodParseResult {
  const mode = bitsToMode(bits);
  return {
    ok: true,
    mode,
    octal: modeToOctal(mode),
    symbolic: bitsToSymbolic(bits),
    bits,
  };
}

export const CHMOD_PRESETS: { label: string; octal: string; desc: string }[] = [
  { label: "755", octal: "755", desc: "目录 / 可执行：所有者可写" },
  { label: "644", octal: "644", desc: "普通文件：所有者可写" },
  { label: "600", octal: "600", desc: "私密文件：仅所有者读写" },
  { label: "700", octal: "700", desc: "私密目录：仅所有者" },
  { label: "777", octal: "777", desc: "全开（慎用）" },
  { label: "4755", octal: "4755", desc: "setuid 可执行" },
  { label: "2755", octal: "2755", desc: "setgid 目录/可执行" },
  { label: "1777", octal: "1777", desc: "sticky 公共目录（如 /tmp）" },
];

/** 供 UI 展示的读写执行标签 */
export { TRIAD_CHARS };
