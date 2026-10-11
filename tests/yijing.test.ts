/*
 * 易经六十四卦工具纯函数单测：
 * 卦象映射、八卦先天数、起卦算法、动爻与断卦规则。
 */
import { describe, expect, it } from "vitest";
import {
  bitsFromLines,
  divinateByCoin,
  divinateByNumber,
  divinateByTime,
  divinationFromBits,
  judgingRuleText,
  linesFromBits,
  trigramIndex,
  trigramLines,
  trigramsFromBits,
  xiantianNumberOf,
  xiantianTrigramIndex,
  type YaoLine,
} from "../src/utils";
import {
  HEXAGRAMS,
  hexagramByBits,
  hexagramByNo,
  hexagramDisplayName,
  yaoTextsOf,
  YAO_TEXTS,
} from "../src/tools/hexagramData";

/* ── 六十四卦表 ─────────────────────────────────────── */

describe("六十四卦数据表", () => {
  it("共 64 卦，卦序 1..64 无缺漏", () => {
    expect(HEXAGRAMS).toHaveLength(64);
    expect(new Set(HEXAGRAMS.map((h) => h.no)).size).toBe(64);
    HEXAGRAMS.forEach((h, i) => expect(h.no).toBe(i + 1));
  });

  it("上下卦组合两两唯一（覆盖全部 8×8）", () => {
    const keys = new Set(HEXAGRAMS.map((h) => `${h.upper}-${h.lower}`));
    expect(keys.size).toBe(64);
  });

  it("上下卦序号均在 0..7 范围内", () => {
    for (const h of HEXAGRAMS) {
      expect(h.upper).toBeGreaterThanOrEqual(0);
      expect(h.upper).toBeLessThanOrEqual(7);
      expect(h.lower).toBeGreaterThanOrEqual(0);
      expect(h.lower).toBeLessThanOrEqual(7);
    }
  });

  it("通行本卦序抽样正确（卦名 / 上下卦）", () => {
    const expectMap: [number, string, number, number][] = [
      [1, "乾", 7, 7],
      [2, "坤", 0, 0],
      [3, "屯", 2, 4],
      [11, "泰", 0, 7],
      [12, "否", 7, 0],
      [29, "坎", 2, 2],
      [30, "离", 5, 5],
      [63, "既济", 2, 5],
      [64, "未济", 5, 2],
    ];
    for (const [no, name, upper, lower] of expectMap) {
      const h = hexagramByNo(no);
      expect([h.name, h.upper, h.lower]).toEqual([name, upper, lower]);
    }
  });

  it("八纯卦的展示名为「X为Y」", () => {
    const expectMap: [number, string][] = [
      [1, "乾为天"],
      [2, "坤为地"],
      [29, "坎为水"],
      [30, "离为火"],
      [51, "震为雷"],
      [52, "艮为山"],
      [57, "巽为风"],
      [58, "兑为泽"],
    ];
    for (const [no, disp] of expectMap) {
      expect(hexagramDisplayName(hexagramByNo(no))).toBe(disp);
    }
  });

  it("非纯卦展示为「上象下象卦名」", () => {
    expect(hexagramDisplayName(hexagramByNo(3))).toBe("水雷屯");
    expect(hexagramDisplayName(hexagramByNo(11))).toBe("地天泰");
    expect(hexagramDisplayName(hexagramByNo(63))).toBe("水火既济");
  });

  it("每卦均有卦辞、象辞、释义与关键词", () => {
    for (const h of HEXAGRAMS) {
      expect(h.judgment.length).toBeGreaterThan(0);
      expect(h.image.length).toBeGreaterThan(0);
      expect(h.meaning.length).toBeGreaterThan(0);
      expect(h.keywords.length).toBeGreaterThan(0);
    }
  });
});

/* ── 二进制 ↔ 卦 ────────────────────────────────────── */

describe("二进制与卦象互推", () => {
  it("乾卦六爻皆阳 → bits = 0b111111 = 63", () => {
    expect(bitsFromLines([1, 1, 1, 1, 1, 1])).toBe(0b111111);
  });

  it("坤卦六爻皆阴 → bits = 0", () => {
    expect(bitsFromLines([0, 0, 0, 0, 0, 0])).toBe(0);
  });

  it("bits 63 → 乾卦；bits 0 → 坤卦", () => {
    expect(hexagramByBits(0b111111).name).toBe("乾");
    expect(hexagramByBits(0).name).toBe("坤");
  });

  it("bits ↔ lines 往返一致（全 64 卦）", () => {
    for (let bits = 0; bits < 64; bits++) {
      expect(bitsFromLines(linesFromBits(bits))).toBe(bits);
    }
  });

  it("bits → 上下卦拆分正确", () => {
    // 泰：下乾(7)上坤(0) → 下三位 111，上三位 000 → bits = 0b000111 = 7
    expect(trigramsFromBits(7)).toEqual({ lower: 7, upper: 0 });
    expect(hexagramByBits(7).name).toBe("泰");
    // 否：下坤(0)上乾(7) → bits = 0b111000 = 56
    expect(trigramsFromBits(56)).toEqual({ lower: 0, upper: 7 });
    expect(hexagramByBits(56).name).toBe("否");
  });

  it("hexagramByBits 与 HEXAGRAMS 全表一致", () => {
    for (const h of HEXAGRAMS) {
      const bits =
        trigramIndex(trigramLines(h.lower)) | (trigramIndex(trigramLines(h.upper)) << 3);
      expect(hexagramByBits(bits).no).toBe(h.no);
    }
  });
});

/* ── 八卦三爻 ───────────────────────────────────────── */

describe("八卦三爻表", () => {
  it("乾 = [阳阳阳]，坤 = [阴阴阴]", () => {
    expect(trigramLines(7)).toEqual([1, 1, 1]);
    expect(trigramLines(0)).toEqual([0, 0, 0]);
  });

  it("八卦索引 ↔ 三爻往返一致", () => {
    for (let i = 0; i < 8; i++) {
      expect(trigramIndex(trigramLines(i))).toBe(i);
    }
  });

  it("先天八卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8", () => {
    expect(xiantianTrigramIndex(1)).toBe(7); // 乾
    expect(xiantianTrigramIndex(2)).toBe(6); // 兑
    expect(xiantianTrigramIndex(3)).toBe(5); // 离
    expect(xiantianTrigramIndex(4)).toBe(4); // 震
    expect(xiantianTrigramIndex(5)).toBe(3); // 巽
    expect(xiantianTrigramIndex(6)).toBe(2); // 坎
    expect(xiantianTrigramIndex(7)).toBe(1); // 艮
    expect(xiantianTrigramIndex(8)).toBe(0); // 坤
  });

  it("先天数 ↔ 八卦序往返一致（1..8）", () => {
    for (let n = 1; n <= 8; n++) {
      expect(xiantianNumberOf(xiantianTrigramIndex(n))).toBe(n);
    }
  });

  it("先天数支持大数与 0 的回绕", () => {
    expect(xiantianTrigramIndex(9)).toBe(xiantianTrigramIndex(1));
    expect(xiantianTrigramIndex(0)).toBe(xiantianTrigramIndex(8));
    expect(xiantianTrigramIndex(-1)).toBe(xiantianTrigramIndex(7));
  });
});

/* ── 起卦算法 ───────────────────────────────────────── */

describe("金钱卦", () => {
  it("产出 6 爻，动爻位置合法", () => {
    for (let i = 0; i < 200; i++) {
      const r = divinateByCoin();
      expect(r.lines).toHaveLength(6);
      expect(r.originalBits).toBeGreaterThanOrEqual(0);
      expect(r.originalBits).toBeLessThan(64);
      for (const n of r.movingLines) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(6);
      }
      expect(r.basis).toContain("金钱卦");
    }
  });

  it("变卦 = 本卦动爻取反，静爻不变", () => {
    for (let i = 0; i < 100; i++) {
      const r = divinateByCoin();
      const moving = new Set(r.movingLines);
      for (let k = 0; k < 6; k++) {
        const orig = (r.originalBits >> k) & 1;
        const chg = (r.changedBits >> k) & 1;
        expect(chg).toBe(moving.has(k + 1) ? 1 - orig : orig);
      }
    }
  });

  it("三正或三反才为动爻（固定随机源可复现）", () => {
    // 交替序列：每次 3 枚铜钱 [>=0.5, >=0.5, >=0.5] → 0 正 → 动
    const seq = [0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9];
    let p = 0;
    const rng = () => seq[p++ % seq.length];
    const r = divinateByCoin(rng);
    // 第一爻 0.9,0.9,0.9 → 0 正 → 阴 + 动
    expect(r.lines[0].yao).toBe(0);
    expect(r.lines[0].moving).toBe(true);
    // 第二爻 0.1,0.1,0.1 → 3 正 → 阳 + 动
    expect(r.lines[1].yao).toBe(1);
    expect(r.lines[1].moving).toBe(true);
  });
});

describe("时间起卦", () => {
  it("同一时刻结果稳定（确定性算法）", () => {
    const d = new Date(2026, 9, 11, 14, 30, 0);
    const a = divinateByTime(d);
    const b = divinateByTime(d);
    expect(a.originalBits).toBe(b.originalBits);
    expect(a.movingLines).toEqual(b.movingLines);
  });

  it("恒为单动爻，且 basis 含「时间起卦」", () => {
    for (const h of [0, 6, 12, 18, 23]) {
      const r = divinateByTime(new Date(2026, 5, 15, h, 0, 0));
      expect(r.movingLines).toHaveLength(1);
      expect(r.movingLines[0]).toBeGreaterThanOrEqual(1);
      expect(r.movingLines[0]).toBeLessThanOrEqual(6);
      expect(r.basis).toContain("时间起卦");
    }
  });

  it("跨年份均能正常起卦（不抛异常）", () => {
    for (let y = 1950; y <= 2026; y += 7) {
      const r = divinateByTime(new Date(y, 3, 1, 8, 0, 0));
      expect(r.originalBits).toBeGreaterThanOrEqual(0);
      expect(r.originalBits).toBeLessThan(64);
    }
  });
});

describe("报数起卦", () => {
  it("上下卦由报数先天数决定", () => {
    const r = divinateByNumber(1, 1); // 上乾下乾 → 乾为天
    expect(hexagramByBits(r.originalBits).name).toBe("乾");
  });

  it("(1,8) → 上乾下坤 → 天地否", () => {
    const r = divinateByNumber(1, 8);
    expect(hexagramByBits(r.originalBits).no).toBe(12);
  });

  it("(8,1) → 上坤下乾 → 地天泰", () => {
    const r = divinateByNumber(8, 1);
    expect(hexagramByBits(r.originalBits).no).toBe(11);
  });

  it("动爻恒为 1 爻且在 1..6", () => {
    for (let a = 1; a <= 20; a++) {
      for (let b = 1; b <= 20; b++) {
        const r = divinateByNumber(a, b);
        expect(r.movingLines).toHaveLength(1);
        expect(r.movingLines[0]).toBeGreaterThanOrEqual(1);
        expect(r.movingLines[0]).toBeLessThanOrEqual(6);
      }
    }
  });
});

/* ── 历史恢复 ───────────────────────────────────────── */

describe("divinationFromBits 重建", () => {
  it("重建后的六爻、动爻、变卦与原结果一致", () => {
    const bits = 0b101010;
    const r = divinationFromBits("coin", bits, [2, 5], "test");
    expect(r.lines.map((l) => l.yao)).toEqual(linesFromBits(bits) as YaoLine[]);
    expect(r.movingLines).toEqual([2, 5]);
    // 动爻取反
    const expectChanged = linesFromBits(bits).map((y, i) =>
      [2, 5].includes(i + 1) ? (1 - y) as YaoLine : y,
    );
    expect(r.changedBits).toBe(bitsFromLines(expectChanged as YaoLine[]));
  });
});

/* ── 断卦规则 ───────────────────────────────────────── */

describe("断卦规则文本", () => {
  it("0..6 动爻均有对应规则且不重复", () => {
    const texts = new Set<string>();
    for (let n = 0; n <= 6; n++) texts.add(judgingRuleText(n));
    expect(texts.size).toBe(7);
  });

  it("无动爻 / 一爻动 / 六爻皆动文案明确", () => {
    expect(judgingRuleText(0)).toContain("六爻安静");
    expect(judgingRuleText(1)).toContain("一爻独动");
    expect(judgingRuleText(6)).toContain("六爻皆动");
  });
});

/* ── 爻辞 ───────────────────────────────────────────── */

describe("爻辞数据", () => {
  it("收录的每卦均为 6 条爻辞", () => {
    for (const [, texts] of Object.entries(YAO_TEXTS)) {
      expect(texts).toHaveLength(6);
    }
  });

  it("乾卦初九爻辞正确", () => {
    expect(yaoTextsOf(1)[0]).toBe("初九：潜龙勿用。");
    expect(yaoTextsOf(1)[5]).toBe("上九：亢龙有悔。");
  });

  it("坤卦六二爻辞正确", () => {
    expect(yaoTextsOf(2)[1]).toContain("直方大");
  });

  it("未收录的卦返回空数组（UI 可降级）", () => {
    expect(yaoTextsOf(999)).toEqual([]);
  });
});
