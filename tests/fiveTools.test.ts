/*
 * 新增工具（农历 / DNS / 汉字拆解 / 星座 / 科学计算器）纯函数单测
 */
import { describe, expect, it } from "vitest";
import {
  ascendantSignOf,
  charStrokes,
  charStructure,
  decomposeChar,
  dnsTypeName,
  elementDistribution,
  formatDms,
  formatNumber,
  factorial,
  gcd,
  lcm,
  nCr,
  nPr,
  isValidDomain,
  lunarLeapMonth,
  lunarMonthDays,
  lunarYearDays,
  moonSignOf,
  parseNumberList,
  solarTermOf,
  solarTermsOfYear,
  summarizeNumbers,
  sunSignOf,
  toDegrees,
  toLunar,
  toRadians,
  zodiacCompatibility,
  ZODIAC_SIGNS,
  evaluateExpression,
} from "../src/utils";

/* ── 农历 ─────────────────────────────────────────── */

describe("农历转换 toLunar", () => {
  const cases: [string, number, number, number][] = [
    ["2024-02-10", 2024, 1, 1], // 甲辰年春节
    ["2023-01-22", 2023, 1, 1],
    ["2025-01-29", 2025, 1, 1],
    ["2026-02-17", 2026, 1, 1],
    ["2020-01-25", 2020, 1, 1],
    ["1900-01-31", 1900, 1, 1], // 数据表起点
    ["2024-09-17", 2024, 8, 15], // 中秋
    ["2023-06-22", 2023, 5, 5], // 端午
    ["2024-02-24", 2024, 1, 15], // 元宵
  ];

  it.each(cases)("%s → 农历 %i/%i/%i", (date, y, m, d) => {
    const r = toLunar(new Date(`${date}T12:00:00`));
    expect(r).not.toBeNull();
    expect([r!.year, r!.month, r!.day]).toEqual([y, m, d]);
  });

  it("超出支持范围返回 null", () => {
    expect(toLunar(new Date("1800-01-01T12:00:00"))).toBeNull();
    expect(toLunar(new Date("2200-01-01T12:00:00"))).toBeNull();
  });

  it("干支与生肖正确", () => {
    const r = toLunar(new Date("2024-02-10T12:00:00"))!;
    expect(r.ganzhi).toBe("甲辰");
    expect(r.zodiac).toBe("龙");
    expect(r.isNewYear).toBe(true);
    expect(r.text).toBe("甲辰年正月初一");
  });

  it("闰年闰月信息", () => {
    // 2023 年闰二月
    expect(lunarLeapMonth(2023)).toBe(2);
    expect(lunarLeapMonth(2024)).toBe(0);
    expect(lunarMonthDays(2024, 1)).toBeGreaterThanOrEqual(29);
    expect(lunarYearDays(2023)).toBeGreaterThan(350);
  });
});

describe("二十四节气", () => {
  it("每年返回 24 个节气", () => {
    expect(solarTermsOfYear(2024)).toHaveLength(24);
    expect(solarTermsOfYear(2025)).toHaveLength(24);
    expect(solarTermsOfYear(1999)).toHaveLength(24);
  });

  it("节气落在合理日期范围", () => {
    for (const t of solarTermsOfYear(2024)) {
      expect(t.month).toBeGreaterThanOrEqual(1);
      expect(t.month).toBeLessThanOrEqual(12);
      expect(t.day).toBeGreaterThanOrEqual(3);
      expect(t.day).toBeLessThanOrEqual(24);
    }
  });

  it("立春在 2 月 3-5 日之间", () => {
    const lichun = solarTermsOfYear(2024).find((t) => t.name === "立春")!;
    expect(lichun.month).toBe(2);
    expect(lichun.day).toBeGreaterThanOrEqual(3);
    expect(lichun.day).toBeLessThanOrEqual(5);
  });

  it("冬至在 12 月 21-23 日之间", () => {
    const dz = solarTermsOfYear(2024).find((t) => t.name === "冬至")!;
    expect(dz.month).toBe(12);
    expect(dz.day).toBeGreaterThanOrEqual(21);
    expect(dz.day).toBeLessThanOrEqual(23);
  });

  it("solarTermOf 命中与未命中", () => {
    const lichun = solarTermsOfYear(2024).find((t) => t.name === "立春")!;
    expect(solarTermOf(new Date(2024, lichun.month - 1, lichun.day))).toBe("立春");
    expect(solarTermOf(new Date(2024, 5, 15))).toBeNull();
  });
});

/* ── DNS ──────────────────────────────────────────── */

describe("DNS 工具函数", () => {
  it("域名校验", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("sub.example.co.uk")).toBe(true);
    expect(isValidDomain("example.com.")).toBe(true);
    expect(isValidDomain("xn--fiqs8s.cn")).toBe(true);
    expect(isValidDomain("")).toBe(false);
    expect(isValidDomain("bad domain.com")).toBe(false);
    expect(isValidDomain("-bad.com")).toBe(false);
  });

  it("类型码转换", () => {
    expect(dnsTypeName(1)).toBe("A");
    expect(dnsTypeName(28)).toBe("AAAA");
    expect(dnsTypeName(5)).toBe("CNAME");
    expect(dnsTypeName(15)).toBe("MX");
    expect(dnsTypeName("TXT")).toBe("TXT");
    expect(dnsTypeName(999)).toBe("999");
  });
});

/* ── 汉字拆解 ─────────────────────────────────────── */

describe("汉字拆解", () => {
  it("拆解常用字", () => {
    const r = decomposeChar("好");
    expect(r.isHan).toBe(true);
    expect(r.parts).toEqual(["女", "子"]);
    expect(r.structure).toBe("左右");
    expect(r.pinyin).toContain("h");
  });

  it("三部件品字结构", () => {
    expect(decomposeChar("森").structure).toBe("品字");
    expect(decomposeChar("森").parts).toHaveLength(3);
  });

  it("上下结构识别", () => {
    expect(decomposeChar("花").structure).toBe("上下");
    expect(decomposeChar("室").structure).toBe("上下");
  });

  it("笔画数查询", () => {
    expect(charStrokes("一")).toBe(1);
    expect(charStrokes("好")).toBe(6);
    expect(charStrokes("森")).toBe(12);
    expect(charStrokes("𠀀")).toBe(0); // 未收录
  });

  it("结构推断函数", () => {
    expect(charStructure("独", [])).toBe("独体");
    expect(charStructure("x", ["a", "b"])).toBe("左右");
    expect(charStructure("x", ["宀", "女"])).toBe("上下");
    expect(charStructure("x", ["木", "木", "木"])).toBe("品字");
  });

  it("非汉字输入", () => {
    expect(decomposeChar("A").isHan).toBe(false);
    expect(decomposeChar("1").isHan).toBe(false);
  });
});

/* ── 星座 ─────────────────────────────────────────── */

describe("星座罗盘", () => {
  it("太阳星座边界", () => {
    expect(sunSignOf(3, 21).name).toBe("白羊座");
    expect(sunSignOf(3, 20).name).toBe("双鱼座");
    expect(sunSignOf(1, 19).name).toBe("摩羯座");
    expect(sunSignOf(1, 20).name).toBe("水瓶座");
    expect(sunSignOf(12, 22).name).toBe("摩羯座");
  });

  it("每个日期都能得到星座", () => {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 10, 20, 28]) {
        const s = sunSignOf(m, d);
        expect(ZODIAC_SIGNS).toContain(s);
      }
    }
  });

  it("月亮与上升星座返回合法星座", () => {
    const date = new Date("1995-08-15T08:30:00");
    expect(ZODIAC_SIGNS).toContain(moonSignOf(date));
    expect(ZODIAC_SIGNS).toContain(ascendantSignOf(date));
  });

  it("元素分布统计", () => {
    const dist = elementDistribution([sunSignOf(3, 21), sunSignOf(4, 25), sunSignOf(5, 25)]);
    expect(Object.values(dist).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("配对评分在 60-100 之间", () => {
    for (const a of ZODIAC_SIGNS) {
      for (const b of ZODIAC_SIGNS) {
        const { score } = zodiacCompatibility(a, b);
        expect(score).toBeGreaterThanOrEqual(60);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("同元素配对分数更高", () => {
    const aries = sunSignOf(3, 21); // 白羊（火）
    const leo = sunSignOf(7, 25); // 狮子（火）
    const cancer = sunSignOf(6, 25); // 巨蟹（水）
    expect(zodiacCompatibility(aries, leo).score).toBeGreaterThan(
      zodiacCompatibility(aries, cancer).score,
    );
  });
});

/* ── 科学计算器 ───────────────────────────────────── */

describe("科学计算器函数", () => {
  it("阶乘", () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(() => factorial(-1)).toThrow();
    expect(() => factorial(1.5)).toThrow();
  });

  it("gcd / lcm", () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(-12, 18)).toBe(6);
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(0, 5)).toBe(0);
  });

  it("组合数与排列数", () => {
    expect(nCr(5, 2)).toBe(10);
    expect(nCr(5, 0)).toBe(1);
    expect(nCr(5, 6)).toBe(0);
    expect(nPr(5, 2)).toBe(20);
    expect(nPr(5, 6)).toBe(0);
  });

  it("角度弧度互转", () => {
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 8);
    expect(toRadians(180)).toBeCloseTo(Math.PI, 8);
  });

  it("度分秒格式化", () => {
    expect(formatDms(toRadians(45))).toMatch(/^45°/);
    expect(formatDms(toRadians(-30))).toMatch(/^-30°/);
  });

  it("数值格式化", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1e20)).toContain("e+");
    expect(formatNumber(NaN)).toBe("NaN");
  });

  it("表达式支持科学函数", () => {
    expect(evaluateExpression("fact(5)")).toBe(120);
    expect(evaluateExpression("gcd(12,18)")).toBe(6);
    expect(evaluateExpression("lcm(4,6)")).toBe(12);
    expect(evaluateExpression("nCr(5,2)+nPr(5,2)")).toBe(30);
    expect(evaluateExpression("hypot(3,4)")).toBe(5);
    expect(evaluateExpression("sqrt(16)+log2(8)")).toBe(7);
  });

  it("记忆值 mem", () => {
    expect(evaluateExpression("mem*2", { memory: 21 })).toBe(42);
    expect(() => evaluateExpression("mem+1")).toThrow();
  });

  it("结果格式化覆盖整数与小数", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });
});

/* ── 统计 ─────────────────────────────────────────── */

describe("描述统计", () => {
  it("基本统计量", () => {
    const s = summarizeNumbers([1, 2, 3, 4, 5])!;
    expect(s.count).toBe(5);
    expect(s.sum).toBe(15);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.variance).toBeCloseTo(2.5, 8);
    expect(s.stddev).toBeCloseTo(Math.sqrt(2.5), 8);
  });

  it("偶数个取中位数平均", () => {
    expect(summarizeNumbers([1, 2, 3, 4])!.median).toBe(2.5);
  });

  it("空列表返回 null", () => {
    expect(summarizeNumbers([])).toBeNull();
    expect(summarizeNumbers([NaN, Infinity])).toBeNull();
  });

  it("解析数值列表", () => {
    expect(parseNumberList("1, 2,3\n4 5；6")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseNumberList("abc")).toEqual([]);
  });
});
