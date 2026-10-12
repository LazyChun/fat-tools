/*
 * 表情包制作纯函数单测
 */
import { describe, expect, it } from "vitest";
import {
  memeFitFontSize,
  memeFileName,
  memeTemplateOf,
  memeTextLayout,
  wrapMemeText,
  MEME_TEMPLATES,
} from "../src/utils";

/** 假测量：宽 ≈ 字符数 × 字号 × 0.6（拉丁窄、中文按 1 字宽处理） */
const measure = (line: string, fs: number): number => [...line].length * fs * 0.6;

describe("wrapMemeText 换行", () => {
  it("按空白切词并拼接", () => {
    expect(wrapMemeText("hello world", 20, 2)).toEqual(["hello world"]);
    expect(wrapMemeText("a b c d", 5, 2)).toEqual(["a b c", "d"]);
  });

  it("中文按字符数硬切", () => {
    const lines = wrapMemeText("我真的会谢你开心就好", 6, 2);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("我真的会谢你");
    expect(lines[1]).toBe("开心就好");
  });

  it("超长词按字符硬切", () => {
    expect(wrapMemeText("abcdefghijklmnopqrstuvwxyz", 8, 2)).toEqual(["abcdefgh", "ijklmnop"]);
  });

  it("限制最大行数，超出丢弃", () => {
    const lines = wrapMemeText("one two three four five", 10, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.join(" ")).not.toContain("five");
  });

  it("空输入返回空数组", () => {
    expect(wrapMemeText("", 10, 2)).toEqual([]);
    expect(wrapMemeText("   ", 10, 2)).toEqual([]);
    expect(wrapMemeText("abc", 0, 2)).toEqual([]);
    expect(wrapMemeText("abc", 10, 0)).toEqual([]);
  });

  it("空白归一化：多个空格只保留一个分隔", () => {
    expect(wrapMemeText("a   b   c", 20, 2)).toEqual(["a b c"]);
  });
});

describe("memeFitFontSize 字号适配", () => {
  it("全部行放得下时直接返回基准字号", () => {
    expect(memeFitFontSize({ lines: ["ok"], maxWidth: 800, maxHeight: 120, baseFontSize: 100, minFontSize: 14, measure })).toBe(100);
  });

  it("放不下时二分缩小到能放下", () => {
    const text = "这是一段比较长的文字"; // 10 字
    const fs = memeFitFontSize({
      lines: [text],
      maxWidth: 200,
      maxHeight: 120,
      baseFontSize: 100,
      minFontSize: 14,
      measure,
    });
    // 10 字 × fs × 0.6 ≤ 200 → fs ≤ 33
    expect(fs).toBe(33);
    const width = [...text].length * fs * 0.6;
    expect(width).toBeLessThanOrEqual(200);
    // fs+1 放不下
    expect([...text].length * (fs + 1) * 0.6).toBeGreaterThan(200);
  });

  it("行数过多时受高度约束", () => {
    const fs = memeFitFontSize({
      lines: ["a", "b", "c", "d"],
      maxWidth: 800,
      maxHeight: 60,
      baseFontSize: 80,
      minFontSize: 14,
      measure,
    });
    // 4 行 × fs × 1.15 ≤ 60 → fs ≤ 13
    expect(fs).toBe(14); // 下限兜底
  });

  it("最小字号也放不下时返回最小字号", () => {
    expect(
      memeFitFontSize({ lines: ["aaaaaaaaaaaaaaaaaaaaaaaa"], maxWidth: 10, maxHeight: 10, baseFontSize: 100, minFontSize: 14, measure }),
    ).toBe(14);
  });

  it("空行返回最小字号", () => {
    expect(memeFitFontSize({ lines: [], maxWidth: 800, maxHeight: 200, baseFontSize: 80, minFontSize: 14, measure })).toBe(14);
  });

  it("支持自定义行高系数", () => {
    const fs = memeFitFontSize({
      lines: ["a", "b"],
      maxWidth: 800,
      maxHeight: 60,
      baseFontSize: 80,
      minFontSize: 14,
      measure,
      lineHeight: 2,
    });
    expect(fs).toBe(15); // 2 行 × fs × 2 ≤ 60 → fs ≤ 15
  });
});

describe("memeTextLayout 布局", () => {
  it("无文字时返回 null", () => {
    const layout = memeTextLayout({
      width: 800,
      height: 600,
      topText: "",
      bottomText: "   ",
      baseFontSize: 64,
      minFontSize: 14,
      topPadding: 36,
      bottomPadding: 36,
      measure,
    });
    expect(layout.top).toBeNull();
    expect(layout.bottom).toBeNull();
  });

  it("顶部文字在画布上半部，底部文字在下半部", () => {
    const layout = memeTextLayout({
      width: 800,
      height: 600,
      topText: "顶部文字",
      bottomText: "底部文字",
      baseFontSize: 64,
      minFontSize: 14,
      topPadding: 36,
      bottomPadding: 36,
      measure,
    });
    expect(layout.top).not.toBeNull();
    expect(layout.bottom).not.toBeNull();
    const topY = layout.top!.ys[0];
    const bottomY = layout.bottom!.ys[0];
    expect(topY).toBeLessThan(300);
    expect(bottomY).toBeGreaterThan(300);
    expect(layout.top!.x).toBe(400);
  });

  it("文字水平居中（x = 宽一半）", () => {
    const layout = memeTextLayout({
      width: 600,
      height: 600,
      topText: "居中",
      bottomText: "居中",
      baseFontSize: 64,
      minFontSize: 14,
      topPadding: 36,
      bottomPadding: 36,
      measure,
    });
    expect(layout.top!.x).toBe(300);
    expect(layout.bottom!.x).toBe(300);
  });

  it("底部区从底部向上：第二行基线 > 第一行基线", () => {
    const layout = memeTextLayout({
      width: 800,
      height: 600,
      topText: "",
      bottomText: "first part second part third part",
      baseFontSize: 64,
      minFontSize: 14,
      topPadding: 36,
      bottomPadding: 36,
      measure,
    });
    expect(layout.bottom).not.toBeNull();
    expect(layout.bottom!.lines.length).toBe(2);
    expect(layout.bottom!.ys.length).toBe(2);
    expect(layout.bottom!.ys[1]).toBeGreaterThan(layout.bottom!.ys[0]);
  });

  it("字号会被适配：长文本行数与字号乘积不超出区域高", () => {
    const layout = memeTextLayout({
      width: 800,
      height: 600,
      topText: "",
      bottomText: "这是一段特别特别特别特别特别特别特别长的底部文字内容",
      baseFontSize: 64,
      minFontSize: 14,
      topPadding: 36,
      bottomPadding: 36,
      measure,
    });
    const zone = layout.bottom!;
    const blockH = zone.lines.length * zone.fontSize * zone.lineHeight;
    expect(blockH).toBeLessThanOrEqual(600 * 0.3 + 36 * 2);
  });
});

describe("模板与文件名", () => {
  it("memeTemplateOf 返回对应模板，未知回退纯白", () => {
    expect(memeTemplateOf("yellow").name).toBe("黄豆脸");
    expect(memeTemplateOf("green").width).toBe(600);
    expect(memeTemplateOf("nope" as never).key).toBe("plain");
  });

  it("MEME_TEMPLATES 数量与 key 唯一", () => {
    const keys = MEME_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(MEME_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it("memeFileName 生成带时间戳的文件名", () => {
    expect(memeFileName("png")).toMatch(/^meme-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/);
  });
});
