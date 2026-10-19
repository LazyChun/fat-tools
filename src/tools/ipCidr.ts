/*
 * IPv4 / CIDR 子网计算：地址解析、掩码、网段范围、包含判断
 */

export interface Ipv4Parts {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type IpParseResult =
  | { ok: true; ip: number; dotted: string; parts: Ipv4Parts; binary: string }
  | { ok: false; error: string };

export type CidrParseResult =
  | {
      ok: true;
      input: string;
      ip: number;
      prefix: number;
      mask: number;
      wildcard: number;
      network: number;
      broadcast: number;
      hostCount: number;
      usableFirst: number | null;
      usableLast: number | null;
    }
  | { ok: false; error: string };

/** 把 0..255 的四段合成 32 位无符号整数 */
export function octetsToInt(a: number, b: number, c: number, d: number): number {
  return (((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + (d >>> 0)) >>> 0;
}

/** 32 位整数 → 点分十进制 */
export function intToDotted(n: number): string {
  const v = n >>> 0;
  return `${(v >>> 24) & 255}.${(v >>> 16) & 255}.${(v >>> 8) & 255}.${v & 255}`;
}

/** 32 位整数 → 8 位一组的二进制串 */
export function intToBinary(n: number): string {
  const v = n >>> 0;
  const parts = [
    ((v >>> 24) & 255).toString(2).padStart(8, "0"),
    ((v >>> 16) & 255).toString(2).padStart(8, "0"),
    ((v >>> 8) & 255).toString(2).padStart(8, "0"),
    (v & 255).toString(2).padStart(8, "0"),
  ];
  return parts.join(".");
}

/** 前缀长度 → 子网掩码整数 */
export function prefixToMask(prefix: number): number {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error("前缀长度须为 0~32 的整数");
  }
  if (prefix === 0) return 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/** 子网掩码整数 → 前缀长度（须为连续 1） */
export function maskToPrefix(mask: number): number {
  const m = mask >>> 0;
  const bits = m.toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(bits)) throw new Error("子网掩码不是连续的 1 后跟 0");
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
}

/** 解析 IPv4 点分地址 */
export function parseIpv4(input: string): IpParseResult {
  const s = input.trim();
  if (!s) return { ok: false, error: "请输入 IPv4 地址" };
  const parts = s.split(".");
  if (parts.length !== 4) return { ok: false, error: "IPv4 须为 4 段，如 192.168.1.1" };
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return { ok: false, error: `非法段「${p}」` };
    const n = Number(p);
    if (n < 0 || n > 255) return { ok: false, error: `段 ${p} 超出 0~255` };
    // 禁止前导零（允许单独的 0）
    if (p.length > 1 && p.startsWith("0")) return { ok: false, error: `段 ${p} 含前导零` };
    nums.push(n);
  }
  const [a, b, c, d] = nums;
  const ip = octetsToInt(a, b, c, d);
  return {
    ok: true,
    ip,
    dotted: intToDotted(ip),
    parts: { a, b, c, d },
    binary: intToBinary(ip),
  };
}

/** 解析 CIDR：ip/prefix 或 ip + 掩码 */
export function parseCidr(input: string, maskOrPrefix?: string): CidrParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "请输入 CIDR，如 192.168.1.0/24" };

  let ipStr: string;
  let prefix: number;

  if (raw.includes("/")) {
    const [left, right] = raw.split("/");
    if (!right || raw.split("/").length !== 2) return { ok: false, error: "CIDR 格式应为 a.b.c.d/前缀" };
    ipStr = left.trim();
    if (!/^\d{1,2}$/.test(right.trim())) return { ok: false, error: "前缀须为 0~32 的整数" };
    prefix = Number(right.trim());
    if (prefix < 0 || prefix > 32) return { ok: false, error: "前缀须为 0~32" };
  } else if (maskOrPrefix && maskOrPrefix.trim()) {
    ipStr = raw;
    const mp = maskOrPrefix.trim();
    if (/^\d{1,2}$/.test(mp) && Number(mp) <= 32) {
      prefix = Number(mp);
    } else {
      const maskParsed = parseIpv4(mp);
      if (!maskParsed.ok) return { ok: false, error: `掩码无效：${maskParsed.error}` };
      try {
        prefix = maskToPrefix(maskParsed.ip);
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
  } else {
    return { ok: false, error: "请使用 CIDR（如 /24）或单独给出子网掩码" };
  }

  const ipParsed = parseIpv4(ipStr);
  if (!ipParsed.ok) return { ok: false, error: ipParsed.error };

  const mask = prefixToMask(prefix);
  const wildcard = (~mask) >>> 0;
  const network = (ipParsed.ip & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const hostBits = 32 - prefix;
  const total = hostBits >= 31 ? 2 ** hostBits : 2 ** hostBits;
  // /31、/32 特殊：无传统「可用主机」概念（RFC 3021 /31 可用于点对点）
  let usableFirst: number | null = null;
  let usableLast: number | null = null;
  let hostCount = 0;
  if (prefix === 32) {
    hostCount = 1;
    usableFirst = network;
    usableLast = network;
  } else if (prefix === 31) {
    hostCount = 2;
    usableFirst = network;
    usableLast = broadcast;
  } else {
    hostCount = Math.max(0, total - 2);
    usableFirst = (network + 1) >>> 0;
    usableLast = (broadcast - 1) >>> 0;
  }

  return {
    ok: true,
    input: `${intToDotted(ipParsed.ip)}/${prefix}`,
    ip: ipParsed.ip,
    prefix,
    mask,
    wildcard,
    network,
    broadcast,
    hostCount,
    usableFirst,
    usableLast,
  };
}

/** 判断 IP 是否落在 CIDR 网段内 */
export function ipInCidr(ipInput: string, cidrInput: string): { ok: true; inside: boolean } | { ok: false; error: string } {
  const ip = parseIpv4(ipInput);
  if (!ip.ok) return ip;
  const cidr = parseCidr(cidrInput);
  if (!cidr.ok) return cidr;
  const inside = (ip.ip & cidr.mask) >>> 0 === cidr.network;
  return { ok: true, inside };
}

/** 常用前缀快捷项 */
export const CIDR_PRESETS: { label: string; prefix: number; mask: string }[] = [
  { label: "/8", prefix: 8, mask: "255.0.0.0" },
  { label: "/16", prefix: 16, mask: "255.255.0.0" },
  { label: "/24", prefix: 24, mask: "255.255.255.0" },
  { label: "/25", prefix: 25, mask: "255.255.255.128" },
  { label: "/26", prefix: 26, mask: "255.255.255.192" },
  { label: "/27", prefix: 27, mask: "255.255.255.224" },
  { label: "/28", prefix: 28, mask: "255.255.255.240" },
  { label: "/30", prefix: 30, mask: "255.255.255.252" },
  { label: "/32", prefix: 32, mask: "255.255.255.255" },
];
