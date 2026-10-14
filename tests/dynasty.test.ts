/*
 * 中华朝代年鉴：数据完整性 + 纯函数单测
 */
import { describe, expect, it } from "vitest";
import {
  areaRank,
  areaRatio,
  assignLanes,
  durationYears,
  dynastyHighlights,
  polygonPath,
  spanLabel,
  timelineX,
  yearLabel,
} from "../src/utils";
import { DYNASTIES, ERAS, FIGURE_ROLE_LABEL, dynastyById } from "../src/tools/dynastyData";
import { DYNASTY_TERRITORIES, CHINA_OUTLINE, ISLANDS } from "../src/tools/territoryData";

/* ── 数据完整性 ─────────────────────────────────────────── */

describe("朝代数据：完整性", () => {
  it("id 唯一、时期合法、起止合法且人物/大事记非空", () => {
    const ids = new Set<string>();
    const eraIds = new Set(ERAS.map((e) => e.id));
    for (const d of DYNASTIES) {
      expect(ids.has(d.id), `重复 id: ${d.id}`).toBe(false);
      ids.add(d.id);
      expect(eraIds.has(d.era), `未知时期: ${d.era}`).toBe(true);
      expect(d.start).toBeLessThan(d.end);
      expect(d.capital.length).toBeGreaterThan(0);
      expect(d.figures.length).toBeGreaterThan(0);
      expect(d.events.length).toBeGreaterThan(0);
      expect(d.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    // 覆盖全部八个时期
    expect(eraIds.size).toBe(8);
    expect(DYNASTIES.length).toBeGreaterThanOrEqual(28);
  });

  it("每个朝代都有疆域示意图形", () => {
    for (const d of DYNASTIES) {
      const shape = DYNASTY_TERRITORIES[d.id];
      expect(shape, `缺少疆域数据: ${d.id}`).toBeDefined();
      expect(shape.polys.length).toBeGreaterThan(0);
      for (const p of shape.polys) {
        expect(p.pts.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("人物角色与角色标签表一致", () => {
    for (const d of DYNASTIES) {
      for (const f of d.figures) {
        expect(FIGURE_ROLE_LABEL[f.role], `${d.name}·${f.name} 角色缺失`).toBeDefined();
      }
    }
  });

  it("大事记按 sort 升序", () => {
    for (const d of DYNASTIES) {
      for (let i = 1; i < d.events.length; i += 1) {
        expect(d.events[i].sort).toBeGreaterThanOrEqual(d.events[i - 1].sort);
      }
    }
  });

  it("中国轮廓与岛屿数据合法", () => {
    expect(CHINA_OUTLINE.length).toBeGreaterThanOrEqual(20);
    expect(ISLANDS.length).toBe(2);
    for (const p of polygonPath(CHINA_OUTLINE).split(" ").filter((s) => /^\d+$/.test(s))) {
      expect(Number.isFinite(Number(p))).toBe(true);
    }
    expect(polygonPath(CHINA_OUTLINE)).toMatch(/^M /);
    expect(polygonPath(CHINA_OUTLINE).endsWith(" Z")).toBe(true);
    expect(polygonPath([])).toBe("");
  });
});

/* ── 年份 / 时间段 ──────────────────────────────────────── */

describe("年份工具", () => {
  it("yearLabel 正确处理公元前 / 公元", () => {
    expect(yearLabel(-221)).toBe("前 221");
    expect(yearLabel(-2070)).toBe("前 2070");
    expect(yearLabel(618)).toBe("618");
    expect(yearLabel(0)).toBe("0");
  });

  it("spanLabel 与 durationYears", () => {
    expect(spanLabel(-221, -206)).toBe("前 221 — 前 206");
    expect(spanLabel(618, 907)).toBe("618 — 907");
    expect(spanLabel(1949, 2026, true)).toBe("1949 — 至今");
    expect(durationYears(-221, -206)).toBe(15);
    expect(durationYears(618, 907)).toBe(289);
  });
});

/* ── 时间轴布局 ─────────────────────────────────────────── */

describe("时间轴车道分配", () => {
  it("同车道内首尾不重叠（贪心不变量）", () => {
    const lanes = assignLanes(DYNASTIES);
    const byLane = new Map<number, { start: number; end: number }[]>();
    DYNASTIES.forEach((d, i) => {
      const l = lanes[i];
      if (!byLane.has(l)) byLane.set(l, []);
      byLane.get(l)!.push({ start: d.start, end: d.end });
    });
    for (const [, items] of byLane) {
      items.sort((a, b) => a.start - b.start);
      for (let i = 1; i < items.length; i += 1) {
        expect(items[i].start).toBeGreaterThanOrEqual(items[i - 1].end);
      }
    }
  });

  it("主序列在 0 车道，并立政权分层", () => {
    const lanes = assignLanes(DYNASTIES);
    const laneOf = (id: string) => lanes[DYNASTIES.findIndex((d) => d.id === id)];
    expect(laneOf("xia")).toBe(0);
    expect(laneOf("dongjin")).toBe(0); // 正朔与十六国分层
    expect(laneOf("shiliuguo")).toBe(1);
    expect(laneOf("wuzhou")).toBe(1);
    expect(laneOf("liao")).toBe(1);
    expect(laneOf("xixia")).toBe(2);
    expect(laneOf("jin")).toBe(3);
    expect(Math.max(...lanes)).toBe(3);
  });

  it("timelineX 单调且落在范围内", () => {
    expect(timelineX(-2070, -2070, 2026, 1000)).toBe(0);
    expect(timelineX(2026, -2070, 2026, 1000)).toBe(1000);
    expect(timelineX(-221, -2070, 2026, 4096)).toBeGreaterThan(0);
    expect(timelineX(-221, -2070, 2026, 4096)).toBeLessThan(4096);
  });
});

/* ── 面积 / 之最统计 ────────────────────────────────────── */

describe("面积与历代之最", () => {
  it("areaRatio / areaRank", () => {
    expect(areaRatio(1400, 1400)).toBe(1);
    expect(areaRatio(700, 1400)).toBe(0.5);
    expect(areaRatio(2000, 1400)).toBe(1);
    expect(areaRank(1400, [1400, 1000, 600, 300])).toBe(1);
    expect(areaRank(300, [1400, 1000, 600, 300])).toBe(4);
  });

  it("历代之最：国祚最长 / 疆域最大 / 大一统占比", () => {
    const hl = dynastyHighlights(DYNASTIES);
    expect(hl.longest.name).toBe("商");
    expect(hl.longest.years).toBe(554);
    expect(hl.largest.name).toBe("元");
    expect(hl.largest.area).toBe(1400);
    expect(hl.unifiedYears).toBeGreaterThan(1500);
    expect(hl.totalYears).toBeGreaterThan(4000);
    expect(hl.unifiedRatio).toBeGreaterThan(0.3);
    expect(hl.unifiedRatio).toBeLessThan(0.4);
    // 占比与分项一致
    expect(hl.unifiedRatio).toBeCloseTo(hl.unifiedYears / hl.totalYears, 6);
  });

  it("空输入返回空之最", () => {
    const hl = dynastyHighlights([]);
    expect(hl.longest.name).toBe("");
    expect(hl.largest.area).toBe(0);
    expect(hl.totalYears).toBe(0);
  });

  it("dynastyById 查找与边界", () => {
    expect(dynastyById("tang")?.name).toBe("唐");
    expect(dynastyById("not-exist")).toBeUndefined();
  });
});
