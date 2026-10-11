import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  convertRadix,
  countTextStats,
  diffToRows,
  evaluateExpression,
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
