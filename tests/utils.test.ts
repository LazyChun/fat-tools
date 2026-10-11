import { describe, expect, it } from "vitest";
import {
  addToDate,
  base64Decode,
  base64Encode,
  calendarDiff,
  convertRadix,
  countBusinessDays,
  countTextStats,
  diffToRows,
  evaluateExpression,
  formatDateTime,
  formatDuration,
  isMorseSymbols,
  morseToText,
  parseDateTime,
  textToMorse,
  timeDiff,
  unsupportedMorseChars,
  weekdayLabel,
  hslToRgb,
  lineDiff,
  md5,
  parseHexColor,
  rgbToHex,
  rgbToHsl,
  shaHash,
  uuidV4,
} from "../src/utils";

describe("md5", () => {
  it("标准测试向量", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5("The quick brown fox jumps over the lazy dog")).toBe(
      "9e107d9d372bb6826bd81d3542a419d6",
    );
  });
  it("UTF-8 中文", () => {
    expect(md5("你好")).toBe("7eca689f0d3389d9dea66ae112e5cfd7");
    expect(md5("中文MD5测试")).toBe(md5("中文MD5测试"));
  });
});

describe("shaHash", () => {
  it("SHA-256 标准向量", async () => {
    expect(await shaHash("SHA-256", "")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await shaHash("SHA-256", "abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("evaluateExpression", () => {
  it("四则运算与优先级", () => {
    expect(evaluateExpression("1+2*3")).toBe(7);
    expect(evaluateExpression("(1+2)*3")).toBe(9);
    expect(evaluateExpression("10/4")).toBe(2.5);
    expect(evaluateExpression("10%3")).toBe(1);
    expect(evaluateExpression("2^3^2")).toBe(512); // 右结合
    expect(evaluateExpression("-3+5")).toBe(2);
  });
  it("隐式乘法", () => {
    expect(evaluateExpression("2(3+4)")).toBe(14);
    expect(evaluateExpression("2pi")).toBeCloseTo(Math.PI * 2, 10);
  });
  it("常量与函数", () => {
    expect(evaluateExpression("sqrt(16)")).toBe(4);
    expect(evaluateExpression("max(1,5,3)")).toBe(5);
    expect(evaluateExpression("round(2.6)")).toBe(3);
    expect(evaluateExpression("log(100)")).toBeCloseTo(2, 10);
    expect(evaluateExpression("sin(0)")).toBe(0);
  });
  it("角度制", () => {
    expect(evaluateExpression("sin(30)", { angleMode: "deg" })).toBeCloseTo(0.5, 10);
    expect(evaluateExpression("sin(30)")).toBeCloseTo(Math.sin(30), 10);
  });
  it("错误输入", () => {
    expect(() => evaluateExpression("1/0")).toThrow();
    expect(() => evaluateExpression("(1+2")).toThrow();
    expect(() => evaluateExpression("1+abc")).toThrow();
    expect(() => evaluateExpression("sqrt(")).toThrow();
  });
});

describe("lineDiff", () => {
  it("基本增删改", () => {
    const ops = lineDiff("a\nb\nc", "a\nx\nc");
    expect(ops.map((o) => `${o.type}:${o.text}`)).toEqual(["same:a", "del:b", "add:x", "same:c"]);
  });
  it("左右对照配对", () => {
    const rows = diffToRows(lineDiff("a\nb\nc", "a\nx\nc"));
    expect(rows).toHaveLength(3);
    expect(rows[1].type).toBe("change");
    expect(rows[1].left?.text).toBe("b");
    expect(rows[1].right?.text).toBe("x");
  });
  it("空文本与纯新增", () => {
    const ops = lineDiff("", "l1\nl2");
    expect(ops.every((o) => o.type === "add")).toBe(true);
    const rows = diffToRows(ops);
    expect(rows.every((r) => r.left === undefined && r.right)).toBe(true);
  });
  it("CRLF 归一化", () => {
    const ops = lineDiff("a\r\nb", "a\nb");
    expect(ops.every((o) => o.type === "same")).toBe(true);
  });
});

describe("countTextStats", () => {
  it("中英混排统计", () => {
    const s = countTextStats("Hello 你好\nworld 世界\n\n新段落");
    expect(s.chars).toBe(22); // 按码点
    expect(s.cjkChars).toBe(7);
    expect(s.latinWords).toBe(2); // Hello / world
    expect(s.words).toBe(9);
    expect(s.lines).toBe(4);
    expect(s.nonEmptyLines).toBe(3);
    expect(s.paragraphs).toBe(2);
    expect(s.bytes).toBe(new TextEncoder().encode("Hello 你好\nworld 世界\n\n新段落").length);
  });
});

describe("base64", () => {
  it("往返转换（含中文）", () => {
    const samples = ["", "hello", "你好，世界！", "emoji is skipped here", "line\nbreak\ttab"];
    for (const s of samples) {
      expect(base64Decode(base64Encode(s))).toBe(s);
    }
  });
  it("标准向量", () => {
    expect(base64Encode("hello")).toBe("aGVsbG8=");
    expect(base64Decode("aGVsbG8=")).toBe("hello");
  });
});

describe("convertRadix", () => {
  it("常见进制", () => {
    expect(convertRadix("255", 10, 16)).toBe("ff");
    expect(convertRadix("0xff", 16, 10)).toBe("255");
    expect(convertRadix("1010", 2, 10)).toBe("10");
    expect(convertRadix("-255", 10, 2)).toBe("-11111111");
    expect(convertRadix("777", 8, 10)).toBe("511");
  });
  it("非法输入抛错", () => {
    expect(() => convertRadix("129", 8, 10)).toThrow();
    expect(() => convertRadix("2g", 16, 10)).toThrow();
  });
});

describe("uuidV4", () => {
  it("格式与唯一性", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = uuidV4();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(200);
  });
});

describe("颜色转换", () => {
  it("hex/rgb/hsl 往返", () => {
    const rgb = parseHexColor("#1E90FF");
    expect(rgb).toEqual({ r: 30, g: 144, b: 255 });
    expect(rgbToHex(rgb)).toBe("#1E90FF");
    const hsl = rgbToHsl(rgb);
    expect(hsl).toEqual({ h: 210, s: 100, l: 56 });
    // HSL 量化(56%)后往返存在 ±2 以内的通道舍入误差
    const back = hslToRgb(hsl);
    const roundTrip = parseHexColor(rgbToHex(back));
    expect(Math.abs(roundTrip.r - rgb.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(roundTrip.g - rgb.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(roundTrip.b - rgb.b)).toBeLessThanOrEqual(2);
  });
  it("缩写与非法输入", () => {
    expect(parseHexColor("#F00")).toEqual({ r: 255, g: 0, b: 0 });
    expect(() => parseHexColor("hello")).toThrow();
  });
});

describe("摩斯电码", () => {
  it("文本 → 电码", () => {
    expect(textToMorse("SOS")).toBe("... --- ...");
    expect(textToMorse("hello world")).toBe(".... . .-.. .-.. --- / .-- --- .-. .-.. -..");
    expect(textToMorse("A1")).toBe(".- .----");
    expect(textToMorse("a b")).toBe(".- / -...");
  });
  it("电码 → 文本", () => {
    expect(morseToText("... --- ...")).toBe("SOS");
    expect(morseToText(".... . .-.. .-.. --- / .-- --- .-. .-.. -..")).toBe("HELLO WORLD");
  });
  it("单词分隔兼容 / 与 3 个以上空格", () => {
    expect(morseToText("... --- ... / ... --- ...")).toBe("SOS SOS");
    expect(morseToText(".... . .-.. .-.. ---   .-- --- .-. .-.. -..")).toBe("HELLO WORLD");
  });
  it("往返一致", () => {
    const samples = ["HELLO WORLD", "SOS", "PYTHON 3.12", "A B C", "TEST-123", "OK?"];
    for (const s of samples) {
      expect(morseToText(textToMorse(s))).toBe(s);
    }
  });
  it("多行按行处理", () => {
    expect(textToMorse("SOS\nSOS")).toBe("... --- ...\n... --- ...");
    expect(morseToText("... --- ...\n... --- ...")).toBe("SOS\nSOS");
  });
  it("无法转换的字符输出占位符", () => {
    expect(textToMorse("中")).toBe("?");
    expect(unsupportedMorseChars("a中b文")).toEqual(["中", "文"]);
    expect(unsupportedMorseChars("ABC 123")).toEqual([]);
  });
  it("isMorseSymbols", () => {
    expect(isMorseSymbols(". - / ...")).toBe(true);
    expect(isMorseSymbols("")).toBe(true);
    expect(isMorseSymbols(".- x")).toBe(false);
  });
});

describe("时间计算", () => {
  it("calendarDiff 自然年月日", () => {
    expect(calendarDiff(new Date(2026, 0, 31), new Date(2026, 2, 1))).toEqual({
      years: 0,
      months: 1,
      days: 1,
      sign: 1,
    });
    expect(calendarDiff(new Date(2026, 9, 11), new Date(2027, 9, 11))).toEqual({
      years: 1,
      months: 0,
      days: 0,
      sign: 1,
    });
    expect(calendarDiff(new Date(2020, 1, 29), new Date(2021, 1, 28))).toEqual({
      years: 1,
      months: 0,
      days: 0,
      sign: 1,
    });
    // 保证各分量非负：不会出现 -1 月 + 28 天
    expect(calendarDiff(new Date(2026, 0, 31), new Date(2026, 1, 27))).toEqual({
      years: 0,
      months: 0,
      days: 27,
      sign: 1,
    });
  });
  it("calendarDiff 反向与同一时刻", () => {
    expect(calendarDiff(new Date(2026, 2, 1), new Date(2026, 0, 31)).sign).toBe(-1);
    expect(calendarDiff(new Date(2026, 0, 1), new Date(2026, 0, 1))).toEqual({
      years: 0,
      months: 0,
      days: 0,
      sign: 0,
    });
  });
  it("timeDiff 拆分与总计", () => {
    const d = timeDiff(new Date(2026, 0, 1, 0, 0, 0), new Date(2026, 0, 2, 3, 4, 5));
    expect(d.days).toBe(1);
    expect(d.hours).toBe(3);
    expect(d.minutes).toBe(4);
    expect(d.seconds).toBe(5);
    expect(d.totalSeconds).toBe(97_445);
    expect(d.negative).toBe(false);
  });
  it("timeDiff 反向为负", () => {
    const d = timeDiff(new Date(2026, 0, 2), new Date(2026, 0, 1));
    expect(d.negative).toBe(true);
    expect(d.totalDays).toBe(1);
  });
  it("工作日 / 周末统计（含首尾）", () => {
    // 2026-10-11 是周日
    expect(new Date(2026, 9, 11).getDay()).toBe(0);
    // 周一到周五 = 5 个工作日
    expect(countBusinessDays(new Date(2026, 9, 12), new Date(2026, 9, 16))).toBe(5);
    // 周六到周日 = 0 个工作日
    expect(countBusinessDays(new Date(2026, 9, 10), new Date(2026, 9, 11))).toBe(0);
    // 单个工作日
    expect(countBusinessDays(new Date(2026, 9, 12), new Date(2026, 9, 12))).toBe(1);
    // 一整年：2026-01-01(周四) ~ 2026-12-31(周四)
    const wholeYear = countBusinessDays(new Date(2026, 0, 1), new Date(2026, 11, 31));
    expect(wholeYear).toBe(261);
    expect(365 - wholeYear).toBe(104);
  });
  it("addToDate 单位推进", () => {
    const base = new Date(2026, 9, 11, 10, 0, 0);
    expect(formatDateTime(addToDate(base, 1, "day"))).toBe("2026-10-12 10:00:00");
    expect(formatDateTime(addToDate(base, -1, "hour"))).toBe("2026-10-11 09:00:00");
    expect(formatDateTime(addToDate(base, 2, "week"))).toBe("2026-10-25 10:00:00");
    expect(formatDateTime(addToDate(base, 1, "year"))).toBe("2027-10-11 10:00:00");
    // 月末夹取：1 月 31 日 + 1 月 = 2 月 28 日（非闰年）
    expect(formatDateTime(addToDate(new Date(2026, 0, 31), 1, "month"))).toBe("2026-02-28 00:00:00");
    expect(formatDateTime(addToDate(new Date(2026, 0, 31), 2, "month"))).toBe("2026-03-31 00:00:00");
  });
  it("formatDuration", () => {
    expect(formatDuration(0)).toBe("0 秒");
    expect(formatDuration(1000 * 60 * 90)).toBe("1 小时 30 分钟");
    expect(formatDuration(86_400_000 + 3_600_000)).toBe("1 天 1 小时");
  });
  it("parseDateTime / formatDateTime", () => {
    expect(formatDateTime(parseDateTime("2026-10-11 09:30:00")!)).toBe("2026-10-11 09:30:00");
    expect(formatDateTime(parseDateTime("2026-10-11 09:30")!)).toBe("2026-10-11 09:30:00");
    expect(formatDateTime(parseDateTime("2026/10/11")!)).toBe("2026-10-11 00:00:00");
    expect(parseDateTime("")).toBeNull();
    expect(parseDateTime("   ")).toBeNull();
    expect(parseDateTime("不是日期")).toBeNull();
  });
  it("weekdayLabel", () => {
    expect(weekdayLabel(new Date(2026, 9, 11))).toBe("星期日");
    expect(weekdayLabel(new Date(2026, 9, 12))).toBe("星期一");
  });
});
