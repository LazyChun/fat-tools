import { describe, expect, it } from "vitest";
import {
  amountToChineseUpper,
  formatAmountWithCommas,
} from "../src/tools/moneyUpper";
import {
  describeCron,
  formatCronDate,
  nextCronRuns,
  parseCron,
} from "../src/tools/cron";
import {
  convertText,
  detectFormat,
  parseDelimited,
  recordsToObjects,
  toDelimited,
  valueToRecords,
} from "../src/tools/dataConvert";

describe("金额大写转换", () => {
  it("整数与角分写法", () => {
    expect(amountToChineseUpper(0)).toBe("零元整");
    expect(amountToChineseUpper(100)).toBe("壹佰元整");
    expect(amountToChineseUpper(1000)).toBe("壹仟元整");
    expect(amountToChineseUpper(10)).toBe("壹拾元整");
    expect(amountToChineseUpper("123456.78")).toBe(
      "壹拾贰万叁仟肆佰伍拾陆元柒角捌分",
    );
  });

  it("零的处理（节间 / 节内）", () => {
    expect(amountToChineseUpper(1000000)).toBe("壹佰万元整");
    expect(amountToChineseUpper(100000001)).toBe("壹亿零壹元整");
    expect(amountToChineseUpper(10010)).toBe("壹万零壹拾元整");
    expect(amountToChineseUpper(1020304)).toBe("壹佰零贰万零叁佰零肆元整");
  });

  it("角分与「整」的规则", () => {
    expect(amountToChineseUpper("1.5")).toBe("壹元伍角整");
    expect(amountToChineseUpper("1.55")).toBe("壹元伍角伍分");
    expect(amountToChineseUpper("1.05")).toBe("壹元零伍分");
    expect(amountToChineseUpper("0.05")).toBe("零元零伍分");
    expect(amountToChineseUpper("0.5")).toBe("零元伍角整");
  });

  it("货币单位与负数、格式化", () => {
    expect(amountToChineseUpper("100", { unit: "圆" })).toBe("壹佰圆整");
    expect(amountToChineseUpper("-1234.56")).toBe("负壹仟贰佰叁拾肆元伍角陆分");
    expect(amountToChineseUpper("¥1,234.5")).toBe("壹仟贰佰叁拾肆元伍角整");
    expect(formatAmountWithCommas("1234567.8")).toBe("1,234,567.8");
  });

  it("非法输入抛出异常", () => {
    expect(() => amountToChineseUpper("abc")).toThrow();
    expect(() => amountToChineseUpper("1.234")).toThrow();
    expect(() => amountToChineseUpper("")).toThrow();
  });
});

describe("Cron 表达式解析", () => {
  it("5 段表达式解析与说明", () => {
    const r = parseCron("0 9 * * 1-5");
    expect(r.ok).toBe(true);
    expect(r.hasSeconds).toBe(false);
    const dow = r.fields.find((f) => f.key === "dayOfWeek");
    expect(dow?.values).toEqual([1, 2, 3, 4, 5]);
    expect(describeCron(r)).toContain("周一-周五");
  });

  it("宏与秒级字段", () => {
    expect(parseCron("@daily").normalized).toBe("0 0 * * *");
    const r = parseCron("*/10 * * * * *");
    expect(r.ok).toBe(true);
    expect(r.hasSeconds).toBe(true);
    expect(r.fields[0].values).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("月份/星期英文缩写与周日归一", () => {
    const r = parseCron("0 0 1 JAN SUN");
    expect(r.ok).toBe(true);
    expect(r.fields.find((f) => f.key === "month")?.values).toEqual([1]);
    expect(r.fields.find((f) => f.key === "dayOfWeek")?.values).toEqual([0]);
    expect(
      parseCron("0 0 * * 7").fields.find((f) => f.key === "dayOfWeek")?.values,
    ).toEqual([0]);
  });

  it("L（当月最后一天）", () => {
    const r = parseCron("0 0 L * *");
    expect(r.ok).toBe(true);
    expect(r.fields.find((f) => f.key === "dayOfMonth")?.lastDay).toBe(true);
  });

  it("非法表达式给出错误", () => {
    expect(parseCron("").ok).toBe(false);
    expect(parseCron("0 0 * *").ok).toBe(false);
    expect(parseCron("99 0 * * *").ok).toBe(false);
    expect(parseCron("0 0 * * MON#2").ok).toBe(false);
    expect(parseCron("@sometimes").ok).toBe(false);
  });

  it("推算未来执行时间", () => {
    const from = new Date(2026, 0, 1, 0, 0, 0); // 2026-01-01（周四）
    const r = nextCronRuns(parseCron("0 9 * * 1-5"), 3, from);
    expect(r.ok).toBe(true);
    expect(r.dates.map((d) => formatCronDate(d, false))).toEqual([
      "2026-01-01 09:00 周四",
      "2026-01-02 09:00 周五",
      "2026-01-05 09:00 周一",
    ]);

    const last = nextCronRuns(parseCron("0 0 L * *"), 2, from);
    expect(last.dates.map((d) => formatCronDate(d, false))).toEqual([
      "2026-01-31 00:00 周六",
      "2026-02-28 00:00 周六",
    ]);
  });
});

describe("数据格式转换", () => {
  it("CSV 解析（引号 / 转义 / 换行）", () => {
    expect(parseDelimited("a,b\n1,2", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseDelimited('name,note\n"张,三","say ""hi"""', ",")).toEqual([
      ["name", "note"],
      ["张,三", 'say "hi"'],
    ]);
    expect(recordsToObjects(parseDelimited("a,b\n1,2", ","))).toEqual([
      { a: "1", b: "2" },
    ]);
    expect(toDelimited([["x"], ['a"b']], ",")).toBe('x\r\n"a""b"');
  });

  it("对象数组 → CSV 收集字段并集", () => {
    expect(valueToRecords([{ a: 1 }, { b: 2 }])).toEqual([
      ["a", "b"],
      ["1", ""],
      ["", "2"],
    ]);
  });

  it("JSON / YAML / CSV 互转", () => {
    const json = '[{"name":"张三","age":28},{"name":"李四","age":34}]';
    const yaml = convertText(json, "json", "yaml");
    expect(yaml).toContain("name: 张三");
    expect(JSON.parse(convertText(yaml, "yaml", "json"))).toEqual(
      JSON.parse(json),
    );

    const csv = convertText(json, "json", "csv");
    expect(csv.split("\r\n")[0]).toBe("name,age");
    // CSV 单元格统一为字符串，不做数字coerce（避免前导零等信息丢失）
    expect(JSON.parse(convertText(csv, "csv", "json"))).toEqual([
      { name: "张三", age: "28" },
      { name: "李四", age: "34" },
    ]);
  });

  it("格式识别", () => {
    expect(detectFormat('{"a":1}')).toBe("json");
    expect(detectFormat("a,b\n1,2")).toBe("csv");
    expect(detectFormat("a\tb\n1\t2")).toBe("tsv");
    expect(detectFormat("key: value\nother: 1")).toBe("yaml");
  });

  it("非数组无法导出 CSV", () => {
    expect(() => convertText('{"a":1}', "json", "csv")).toThrow();
  });
});
