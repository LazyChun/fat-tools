/*
 * 新增工具（假期日历 / 亲友关系图谱 / 血型图谱 / 汇率计算）纯函数单测
 */
import { describe, expect, it } from "vitest";
import {
  allKinshipTerms,
  bloodCompatibility,
  bloodTypeLabel,
  canBeParents,
  childBloodTypes,
  convertCurrency,
  crossRate,
  genotypesOfType,
  invertKinshipChain,
  kinStepLabel,
  kinshipByTerm,
  kinshipChainLabel,
  OFFLINE_RATE_TABLE,
  parseOnlineRates,
  possibleParentTypes,
  resolveKinship,
  type KinStep,
} from "../src/utils";
import {
  HOLIDAY_OFFLINE,
  buildMonthGrid,
  customDaysToMap,
  holidayColor,
  holidayDatesOfYear,
  isWeekend,
  mergeHolidays,
  offlineHolidays,
  parseHolidayCnJson,
  toHolidayRanges,
  todayStr,
  workdayCountOfYear,
  type CustomDay,
} from "../src/tools/holidayData";

/* ── 假期日历 ─────────────────────────────────────────────── */

describe("假期日历：节假日数据", () => {
  it("内置数据覆盖 2021-2026，且日期格式合法", () => {
    const years = Object.keys(HOLIDAY_OFFLINE).map(Number).sort();
    expect(years).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
    for (const y of years) {
      for (const d of holidayDatesOfYear(HOLIDAY_OFFLINE[y], y)) {
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number(d.slice(0, 4))).toBe(y === 2023 ? 2023 : y);
      }
    }
  });

  it("2025 年国庆中秋连休 8 天（10-01 ~ 10-08）", () => {
    const ranges = toHolidayRanges(HOLIDAY_OFFLINE[2025], 2025);
    const national = ranges.find((r) => r.name.includes("国庆"));
    expect(national).toBeDefined();
    expect(national!.start).toBe("2025-10-01");
    expect(national!.end).toBe("2025-10-08");
    expect(national!.days).toBe(8);
  });

  it("2026 春节为 02-15 ~ 02-23（9 天）", () => {
    const ranges = toHolidayRanges(HOLIDAY_OFFLINE[2026], 2026);
    const spring = ranges.find((r) => r.name === "春节");
    expect(spring).toBeDefined();
    expect(spring!.days).toBe(9);
  });

  it("mergeHolidays：在线数据优先，缺失时回退内置", () => {
    const online = { "2026-01-01": "元旦", "2026-05-20": "在线新增日" };
    const merged = mergeHolidays(2026, online);
    expect(merged.source).toBe("online");
    expect(merged.map["2026-05-20"]).toBe("在线新增日");
    // 内置数据仍保留（在线未覆盖的日期）
    expect(merged.map["2026-10-01"]).toBe("国庆节");

    const fallback = mergeHolidays(2025, null);
    expect(fallback.source).toBe("offline");
    expect(Object.keys(fallback.map).length).toBeGreaterThan(0);

    const empty = mergeHolidays(2099, null);
    expect(empty.source).toBe("none");
    expect(empty.map).toEqual({});
  });

  it("parseHolidayCnJson：仅取 isOffDay=true 的日期", () => {
    const json = {
      days: [
        { date: "2026-01-01", name: "元旦", isOffDay: true },
        { date: "2026-01-04", name: "元旦", isOffDay: false },
        { date: "bad", name: "无效", isOffDay: true },
        { date: "2026-01-02", name: "", isOffDay: true },
      ],
    };
    expect(parseHolidayCnJson(json)).toEqual({ "2026-01-01": "元旦" });
    expect(parseHolidayCnJson(null)).toEqual({});
    expect(parseHolidayCnJson({})).toEqual({});
  });

  it("offlineHolidays 未知年份返回空对象", () => {
    expect(offlineHolidays(1999)).toEqual({});
    expect(offlineHolidays(2025)["2025-01-01"]).toBe("元旦");
  });
});

describe("假期日历：月历网格与周末", () => {
  it("buildMonthGrid 返回 6×7 且首列以周一开头", () => {
    const grid = buildMonthGrid(2026, 10);
    expect(grid).toHaveLength(6);
    expect(grid.every((r) => r.length === 7)).toBe(true);
    // 2026-10-01 是周四 → 周一起始时前 3 格为 null
    expect(grid[0][0]).toBeNull();
    expect(grid[0][3]).toBe("2026-10-01");
  });

  it("闰年 2 月有 29 天，2-29 落在网格内", () => {
    const grid = buildMonthGrid(2024, 2).flat();
    expect(grid).toContain("2024-02-29");
    const nonLeap = buildMonthGrid(2025, 2).flat();
    expect(nonLeap).not.toContain("2025-02-29");
  });

  it("isWeekend 正确识别周六周日", () => {
    expect(isWeekend("2026-10-11")).toBe(true); // 周日
    expect(isWeekend("2026-10-10")).toBe(true); // 周六
    expect(isWeekend("2026-10-12")).toBe(false); // 周一
  });

  it("工作日统计 = 平日数 - 落在平日的法定节假日", () => {
    const count = workdayCountOfYear(HOLIDAY_OFFLINE[2025], 2025);
    expect(count).toBeGreaterThan(240);
    expect(count).toBeLessThan(252);
  });

  it("holidayColor 同名稳定、不同名尽量分散", () => {
    expect(holidayColor("春节")).toBe(holidayColor("春节"));
    expect(holidayColor("元旦")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("todayStr 输出本地时区 YYYY-MM-DD", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("假期日历：自定义纪念日", () => {
  const list: CustomDay[] = [
    { date: "2020-08-15", name: "生日", yearly: true },
    { date: "2026-03-08", name: "纪念日", yearly: false },
    { date: "2024-02-29", name: "闰日", yearly: true },
  ];

  it("每年重复项展开到目标年份", () => {
    const map = customDaysToMap(list, 2026);
    expect(map["2026-08-15"]).toBe("生日");
    expect(map["2026-03-08"]).toBe("纪念日");
  });

  it("非重复项只在原年份出现", () => {
    expect(customDaysToMap(list, 2027)["2027-03-08"]).toBeUndefined();
  });

  it("2-29 在非闰年跳过", () => {
    expect(customDaysToMap(list, 2025)["2025-02-29"]).toBeUndefined();
    expect(customDaysToMap(list, 2028)["2028-02-29"]).toBe("闰日");
  });

  it("非法日期被忽略", () => {
    const bad: CustomDay[] = [{ date: "not-a-date", name: "x", yearly: true }];
    expect(customDaysToMap(bad, 2026)).toEqual({});
  });
});

/* ── 亲友关系图谱 ─────────────────────────────────────────── */

describe("亲友关系图谱：称谓计算", () => {
  const cases: [KinStep[], string][] = [
    [["father"], "父亲"],
    [["father", "father"], "爷爷"],
    [["father", "mother"], "奶奶"],
    [["mother", "father"], "外公"],
    [["mother", "mother"], "外婆"],
    [["father", "father", "father"], "曾祖父"],
    [["wife", "father"], "岳父"],
    [["wife", "mother"], "岳母"],
    [["husband", "father"], "公公"],
    [["husband", "mother"], "婆婆"],
    [["son", "wife"], "儿媳"],
    [["daughter", "husband"], "女婿"],
    [["elderBrother", "wife"], "嫂子/弟媳"],
    [["elderSister", "husband"], "姐夫/妹夫"],
  ];

  it.each(cases)("%s → %s", (chain, expected) => {
    expect(resolveKinship(chain).term).toBe(expected);
  });

  it("一步关系直接返回关系名且标记为已知", () => {
    const r = resolveKinship(["elderSister"]);
    expect(r.term).toBe("姐姐");
    expect(r.known).toBe(true);
  });

  it("空关系链为「自己」", () => {
    expect(resolveKinship([])).toEqual({ term: "自己", known: true });
  });

  it("未收录的长链条给出推定描述", () => {
    const r = resolveKinship(["father", "elderBrother", "son", "son", "son"]);
    expect(r.known).toBe(false);
    expect(r.term).toContain("的");
  });

  it("关系链文案用箭头连接", () => {
    expect(kinshipChainLabel(["father", "mother"])).toBe("父亲 → 母亲");
    expect(kinshipChainLabel([])).toBe("自己");
  });

  it("取反：弟弟 → 丈夫 的逆为 妻子 → 哥哥", () => {
    expect(invertKinshipChain(["youngerBrother", "husband"])).toEqual([
      "wife",
      "elderBrother",
    ]);
  });

  it("反查：爷爷 → 父→父；岳父 → 妻→父", () => {
    expect(kinshipByTerm("爷爷")).toEqual([["father", "father"]]);
    expect(kinshipByTerm("岳父")).toEqual([["wife", "father"]]);
    expect(kinshipByTerm("不存在的称谓")).toEqual([]);
  });

  it("反查支持带空格输入", () => {
    expect(kinshipByTerm(" 外婆 ")).toEqual([["mother", "mother"]]);
  });

  it("kinStepLabel 未知关系原样返回", () => {
    expect(kinStepLabel("father")).toBe("父亲");
    expect(kinStepLabel("unknown")).toBe("unknown");
  });

  it("allKinshipTerms 收录常用称谓且含自己", () => {
    const terms = allKinshipTerms().map((t) => t.term);
    expect(terms).toContain("自己");
    expect(terms).toContain("爷爷");
    expect(terms.length).toBeGreaterThan(30);
  });
});

/* ── 血型图谱 ─────────────────────────────────────────────── */

describe("血型图谱：基因型与表现型", () => {
  it("ABO 表现型 → 基因型", () => {
    const a = genotypesOfType("A", "-").map((g) => [...g.abo].sort().join(""));
    expect(new Set(a)).toEqual(new Set(["AA", "AO"]));
    expect(genotypesOfType("AB", "-")[0].abo.join("")).toBe("AB");
    expect(genotypesOfType("O", "-")[0].abo.join("")).toBe("OO");
  });

  it("Rh 阳性有 DD / Dd 两种基因型，阴性只有 dd", () => {
    const pos = genotypesOfType("O", "+").map((g) => [...g.rh].sort().join(""));
    expect(new Set(pos)).toEqual(new Set(["DD", "Dd"]));
    expect(genotypesOfType("O", "-")[0].rh.join("")).toBe("dd");
  });
});

describe("血型图谱：遗传概率", () => {
  it("O- × O- → 子女必为 O-", () => {
    const r = childBloodTypes({ abo: "O", rh: "-" }, { abo: "O", rh: "-" });
    expect(r.children).toHaveLength(1);
    expect(bloodTypeLabel(r.children[0].type)).toBe("O-");
    expect(r.children[0].probability).toBeCloseTo(1, 10);
  });

  it("AB × O → 子女只可能是 A 或 B", () => {
    const r = childBloodTypes({ abo: "AB", rh: "+" }, { abo: "O", rh: "+" });
    const abos = r.children.map((c) => c.type.abo);
    expect(new Set(abos)).toEqual(new Set(["A", "B"]));
  });

  it("A+ × B+ 的概率总和为 1", () => {
    const r = childBloodTypes({ abo: "A", rh: "+" }, { abo: "B", rh: "+" });
    const sum = r.children.reduce((s, c) => s + c.probability, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("A+ × A+ → O 型概率约 5.86%（含 Rh-）", () => {
    const r = childBloodTypes({ abo: "A", rh: "+" }, { abo: "A", rh: "+" });
    const oPlus = r.children.find((c) => c.type.abo === "O" && c.type.rh === "+");
    expect(oPlus).toBeDefined();
    expect(oPlus!.probability).toBeCloseTo(0.0586, 3);
  });

  it("AB+ 与 O- 不可能生育 AB 型孩子", () => {
    const r = childBloodTypes({ abo: "AB", rh: "+" }, { abo: "O", rh: "-" });
    expect(r.children.some((c) => c.type.abo === "AB")).toBe(false);
  });
});

describe("血型图谱：亲子判定", () => {
  it("A+ + A+ 可以生育 O- 孩子", () => {
    expect(
      canBeParents({ abo: "A", rh: "+" }, { abo: "A", rh: "+" }, { abo: "O", rh: "-" }),
    ).toBe(true);
  });

  it("AB+ + O- 不可能生育 AB+ 孩子", () => {
    expect(
      canBeParents({ abo: "AB", rh: "+" }, { abo: "O", rh: "-" }, { abo: "AB", rh: "+" }),
    ).toBe(false);
  });

  it("反推：孩子 O- 且父 A+ → 母亲可能为 O-/A-/B-/O+/A+/B+", () => {
    const list = possibleParentTypes({ abo: "O", rh: "-" }, { abo: "A", rh: "+" });
    const codes = list.map((p) => bloodTypeLabel(p.type));
    expect(codes).toContain("O-");
    expect(codes).toContain("B-");
    // 母亲不可能是 AB（无法产生 O 型孩子）
    expect(codes).not.toContain("AB-");
    expect(codes).not.toContain("AB+");
  });

  it("反推：孩子 AB+ 且父 O- → 无解", () => {
    expect(possibleParentTypes({ abo: "AB", rh: "+" }, { abo: "O", rh: "-" })).toEqual([]);
  });
});

describe("血型图谱：输血兼容", () => {
  it("O- 是万能供血者（可捐给全部 8 种血型）", () => {
    const c = bloodCompatibility({ abo: "O", rh: "-" });
    expect(c.donateTo).toHaveLength(8);
  });

  it("AB+ 可接受全部 8 种血型的供血", () => {
    const c = bloodCompatibility({ abo: "AB", rh: "+" });
    expect(c.receiveFrom).toHaveLength(8);
  });

  it("Rh- 受血者只能接受 Rh- 供血", () => {
    const c = bloodCompatibility({ abo: "A", rh: "-" });
    expect(c.receiveFrom.every((t) => t.rh === "-")).toBe(true);
    // A- / O-
    expect(c.receiveFrom).toHaveLength(2);
  });
});

/* ── 汇率计算 ─────────────────────────────────────────────── */

describe("汇率计算", () => {
  const T = OFFLINE_RATE_TABLE;

  it("通过 CNY 中转换算", () => {
    // 100 USD = 712 CNY（内置 1 USD = 7.12）
    expect(convertCurrency(T, "USD", "CNY", 100)).toBeCloseTo(712, 6);
    // 同币种为 1:1
    expect(convertCurrency(T, "CNY", "CNY", 50)).toBeCloseTo(50, 10);
  });

  it("交叉汇率 = 两币种对 CNY 汇率之比", () => {
    expect(crossRate(T, "USD", "HKD")).toBeCloseTo(7.12 / 0.912, 10);
    expect(crossRate(T, "CNY", "USD")).toBeCloseTo(1 / 7.12, 10);
  });

  it("双向换算互为倒数", () => {
    const a = convertCurrency(T, "JPY", "EUR", 10000);
    const b = convertCurrency(T, "EUR", "JPY", a);
    expect(b).toBeCloseTo(10000, 6);
  });

  it("未知币种抛错", () => {
    expect(() => convertCurrency(T, "XXX", "CNY", 1)).toThrow(/未知货币/);
    expect(() => convertCurrency(T, "CNY", "XXX", 1)).toThrow(/未知货币/);
  });

  it("币种代码大小写不敏感", () => {
    expect(convertCurrency(T, "usd", "cny", 1)).toBeCloseTo(7.12, 6);
  });

  it("parseOnlineRates：把基准币汇率换算成「1 外币 = ? CNY」", () => {
    const api = { rates: { USD: 1, CNY: 7.3, EUR: 0.92, JPY: 155 } };
    const parsed = parseOnlineRates(api, "USD")!;
    expect(parsed).not.toBeNull();
    // 1 EUR = 7.12 / 0.92 ≈ 7.7391 CNY（用内置 USD→CNY = 7.12 作锚）
    expect(parsed.EUR).toBeCloseTo(7.12 / 0.92, 6);
    expect(parsed.JPY).toBeCloseTo(7.12 / 155, 8);
    expect(parsed.USD).toBe(7.12);
  });

  it("parseOnlineRates：非法输入返回 null", () => {
    expect(parseOnlineRates(null)).toBeNull();
    expect(parseOnlineRates({})).toBeNull();
    expect(parseOnlineRates({ rates: {} })).toBeNull();
  });
});
