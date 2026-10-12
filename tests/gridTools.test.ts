import { describe, expect, it } from "vitest";
import {
  gridCellBounds,
  gridCellFileName,
  humanFileSize,
  safeFileBase,
} from "../src/utils";

describe("gridCellBounds", () => {
  it("3×3 整除：9 格无缝覆盖整图", () => {
    const cells = gridCellBounds(3, 3, 300, 300);
    expect(cells).toHaveLength(9);
    // 每格 100×100
    expect(cells[0]).toMatchObject({ row: 0, col: 0, x: 0, y: 0, w: 100, h: 100 });
    expect(cells[1]).toMatchObject({ row: 0, col: 1, x: 100, y: 0, w: 100, h: 100 });
    expect(cells[4]).toMatchObject({ row: 1, col: 1, x: 100, y: 100, w: 100, h: 100 });
    expect(cells[8]).toMatchObject({ row: 2, col: 2, x: 200, y: 200, w: 100, h: 100 });
  });

  it("不整除：余数并入末行末列，格子拼回整图", () => {
    const cells = gridCellBounds(2, 2, 101, 203);
    expect(cells).toHaveLength(4);
    // 50×101（列方向 50/51，行方向 101/102）
    expect(cells[0]).toMatchObject({ x: 0, y: 0, w: 50, h: 101 });
    expect(cells[1]).toMatchObject({ x: 50, y: 0, w: 51, h: 101 });
    expect(cells[2]).toMatchObject({ x: 0, y: 101, w: 50, h: 102 });
    expect(cells[3]).toMatchObject({ x: 50, y: 101, w: 51, h: 102 });
    // 无缝拼回：末格右边界 = 宽，下边界 = 高
    const last = cells[3];
    expect(last.x + last.w).toBe(101);
    expect(last.y + last.h).toBe(203);
  });

  it("2×1 单行拆分", () => {
    const cells = gridCellBounds(1, 2, 199, 50);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ w: 99, h: 50 });
    expect(cells[1]).toMatchObject({ x: 99, w: 100, h: 50 });
  });

  it("图片尺寸小于格子数返回空数组", () => {
    expect(gridCellBounds(3, 3, 2, 300)).toEqual([]);
    expect(gridCellBounds(3, 3, 300, 2)).toEqual([]);
  });

  it("非法行列防御性取整", () => {
    expect(gridCellBounds(0, 0, 300, 300)).toHaveLength(1);
    // 2.9 → 2 行，2.1 → 2 列
    expect(gridCellBounds(2.9, 2.1, 300, 300)).toHaveLength(4);
  });
});

describe("gridCellFileName", () => {
  it("9 格以下不补零", () => {
    expect(gridCellFileName("sprite", 3, 3, 0, 0)).toBe("sprite_r1_c1.png");
    expect(gridCellFileName("sprite", 3, 3, 2, 2)).toBe("sprite_r3_c3.png");
  });

  it("行列超过 9 时按总行列数补零对齐字典序", () => {
    expect(gridCellFileName("sheet", 12, 12, 0, 0)).toBe("sheet_r01_c01.png");
    expect(gridCellFileName("sheet", 12, 12, 11, 11)).toBe("sheet_r12_c12.png");
    // 行 2 位 / 列 1 位：统一按最大位数补零，文件名宽度一致
    expect(gridCellFileName("sheet", 12, 3, 11, 2)).toBe("sheet_r12_c03.png");
  });
});

describe("safeFileBase", () => {
  it("去掉扩展名并清洗非法字符", () => {
    expect(safeFileBase("hero_sheet.png")).toBe("hero_sheet");
    expect(safeFileBase("我的 精灵图.sheet.png")).toBe("我的_精灵图.sheet");
    // 非法字符 → _，首尾下划线会被清理
    expect(safeFileBase("a/b:c*d?.png")).toBe("a_b_c_d");
  });

  it("空名回退 sprite", () => {
    expect(safeFileBase(".png")).toBe("sprite");
    expect(safeFileBase("")).toBe("sprite");
  });
});

describe("humanFileSize", () => {
  it("B / KB / MB / GB", () => {
    expect(humanFileSize(512)).toBe("512 B");
    expect(humanFileSize(2048)).toBe("2.0 KB");
    expect(humanFileSize(3 * 1024 * 1024)).toBe("3.00 MB");
    expect(humanFileSize(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });
});
