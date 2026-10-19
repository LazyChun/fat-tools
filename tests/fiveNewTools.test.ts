/*
 * 新增工具单测：身份证 / IP-CIDR / chmod / HTML 实体 / 贷款计算
 */
import { describe, expect, it } from "vitest";
import {
  calcIdCardCheckDigit,
  parseIdCard,
  upgradeIdCard15,
} from "../src/tools/idCard";
import {
  intToDotted,
  ipInCidr,
  maskToPrefix,
  parseCidr,
  parseIpv4,
  prefixToMask,
} from "../src/tools/ipCidr";
import {
  bitsToSymbolic,
  fromBits,
  modeToOctal,
  parseChmod,
  parseOctal,
  parseSymbolic,
} from "../src/tools/chmod";
import { countEntities, htmlDecode, htmlEncode } from "../src/tools/htmlEntity";
import { calcLoan, formatYuan, monthlyRateFromAnnual } from "../src/tools/loan";

describe("身份证校验", () => {
  it("计算校验位与国标样例", () => {
    expect(calcIdCardCheckDigit("11010519491231002")).toBe("X");
    expect(parseIdCard("11010519491231002X").valid).toBe(true);
    expect(parseIdCard("440524188001010014").valid).toBe(true);
  });

  it("提取省市性别生日", () => {
    const info = parseIdCard("11010519491231002X");
    expect(info.valid).toBe(true);
    expect(info.province).toBe("北京市");
    expect(info.birth).toBe("1949-12-31");
    expect(info.gender).toBe("女"); // 倒数第二位 2 为女
  });

  it("15 位升位", () => {
    const up = upgradeIdCard15("110105491231002");
    expect(up).toBe("11010519491231002X");
    const info = parseIdCard("110105491231002");
    expect(info.valid).toBe(true);
    expect(info.length).toBe(15);
    expect(info.normalized).toBe("11010519491231002X");
  });

  it("校验位错误被拒绝", () => {
    const info = parseIdCard("110105194912310021");
    expect(info.valid).toBe(false);
    expect(info.expectedCheckDigit).toBe("X");
  });
});

describe("IP / CIDR", () => {
  it("解析 IPv4", () => {
    const r = parseIpv4("192.168.1.10");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(intToDotted(r.ip)).toBe("192.168.1.10");
    expect(r.binary.startsWith("11000000.")).toBe(true);
  });

  it("拒绝前导零与越界", () => {
    expect(parseIpv4("192.168.01.1").ok).toBe(false);
    expect(parseIpv4("192.168.1.256").ok).toBe(false);
  });

  it("/24 网段计算", () => {
    const c = parseCidr("192.168.1.100/24");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(intToDotted(c.network)).toBe("192.168.1.0");
    expect(intToDotted(c.broadcast)).toBe("192.168.1.255");
    expect(intToDotted(c.mask)).toBe("255.255.255.0");
    expect(c.hostCount).toBe(254);
    expect(intToDotted(c.usableFirst!)).toBe("192.168.1.1");
    expect(intToDotted(c.usableLast!)).toBe("192.168.1.254");
  });

  it("掩码与前缀互转", () => {
    expect(prefixToMask(24)).toBe(parseIpv4("255.255.255.0").ok ? (parseIpv4("255.255.255.0") as { ip: number }).ip : -1);
    expect(maskToPrefix(prefixToMask(16))).toBe(16);
  });

  it("IP 是否在网段内", () => {
    expect(ipInCidr("10.0.0.5", "10.0.0.0/8")).toEqual({ ok: true, inside: true });
    expect(ipInCidr("11.0.0.5", "10.0.0.0/8")).toEqual({ ok: true, inside: false });
  });
});

describe("Unix 权限", () => {
  it("755 ↔ rwxr-xr-x", () => {
    const n = parseOctal("755");
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.symbolic).toBe("rwxr-xr-x");
    const s = parseSymbolic("rwxr-xr-x");
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.octal).toBe("755");
  });

  it("特殊位 4755 / sticky 1777", () => {
    const suid = parseChmod("4755");
    expect(suid.ok).toBe(true);
    if (!suid.ok) return;
    expect(suid.bits.special.setuid).toBe(true);
    expect(suid.symbolic).toBe("rwsr-xr-x");

    const sticky = parseChmod("1777");
    expect(sticky.ok).toBe(true);
    if (!sticky.ok) return;
    expect(sticky.symbolic).toBe("rwxrwxrwt");
  });

  it("大写 S：setuid 但不可执行", () => {
    const r = parseSymbolic("rwSr-xr-x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bits.special.setuid).toBe(true);
    expect(r.bits.owner.x).toBe(false);
    expect(r.octal).toBe("4655");
  });

  it("从勾选位生成", () => {
    const r = fromBits({
      special: { setuid: false, setgid: false, sticky: false },
      owner: { r: true, w: true, x: false },
      group: { r: true, w: false, x: false },
      other: { r: true, w: false, x: false },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.octal).toBe("644");
    expect(bitsToSymbolic(r.bits)).toBe("rw-r--r--");
    expect(modeToOctal(0o644)).toBe("644");
  });

  it("兼容 ls -l 前导类型字符", () => {
    const r = parseSymbolic("-rwxr-xr-x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.octal).toBe("755");
  });
});

describe("HTML 实体", () => {
  it("最小编码与解码往返", () => {
    const src = `<a href="x">A&B</a>`;
    const enc = htmlEncode(src, { mode: "minimal" });
    expect(enc).toContain("&lt;");
    expect(enc).toContain("&amp;");
    expect(htmlDecode(enc)).toBe(src);
  });

  it("数字实体解码", () => {
    expect(htmlDecode("&#65;&#x41;")).toBe("AA");
    expect(htmlDecode("&nbsp;&copy;")).toBe("\u00A0©");
  });

  it("统计实体数", () => {
    expect(countEntities("&lt;&amp;&#160;")).toBe(3);
  });
});

describe("贷款计算", () => {
  it("月利率换算", () => {
    expect(monthlyRateFromAnnual(3.6)).toBeCloseTo(0.003, 10);
  });

  it("等额本息：零利率均摊", () => {
    const r = calcLoan({
      principal: 12000,
      annualRatePercent: 0,
      months: 12,
      method: "equal-installment",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.firstPayment).toBe(1000);
    expect(r.result.totalInterest).toBe(0);
    expect(r.result.totalPayment).toBe(12000);
  });

  it("等额本息：有利率时总还款 > 本金", () => {
    const r = calcLoan({
      principal: 1_000_000,
      annualRatePercent: 3.45,
      months: 360,
      method: "equal-installment",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.firstPayment).toBeGreaterThan(4000);
    expect(r.result.firstPayment).toBeLessThan(5000);
    expect(r.result.totalInterest).toBeGreaterThan(0);
    expect(r.result.schedule).toHaveLength(360);
    // 最后一期余额归零
    expect(r.result.schedule[359].balance).toBe(0);
  });

  it("等额本金：首月 > 末月", () => {
    const r = calcLoan({
      principal: 120000,
      annualRatePercent: 4.8,
      months: 12,
      method: "equal-principal",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.firstPayment).toBeGreaterThan(r.result.lastPayment);
    expect(r.result.schedule[0].principal).toBeCloseTo(10000, 0);
  });

  it("formatYuan 千分位", () => {
    expect(formatYuan(1234567.8)).toBe("1,234,567.80");
  });
});
