/*
 * 第二批 13 个工具的纯函数测试：每个工具至少锁住一条主路径。
 */
import { describe, expect, it } from "vitest";
import { EXTRA_TOOLS } from "../src/tools/extras/manifest";
import { MORE_TOOLS } from "../src/tools/extras/moreManifest";
import {
  base64UrlEncode, bits32, buildHttpMessage, buildJwtPayload, calcBitwise, calcCombination,
  calcDueDate, convertZoneTable, decimalToFraction, evalFraction, fitImageSize, formatSql,
  fractionToMixed, generateFakeRows, groupsToText, hexToHsl, hslToHex, jwtSigningInput,
  loremText, makePalette, offsetLabel, paletteToCss, parseFieldSpec, parseHexColor,
  parseHttpMessage, readableTextColor, rowsToCsv, rowsToJson, rowsToSql, shadeScale,
  splitGroups, zoneOffsetMinutes,
} from "../src/tools/extras/moreLogic";

const CORE_IDS = [
  "text-diff", "word-count", "regex", "calculator", "radix", "json", "hash", "uuid", "timestamp",
  "base64", "url", "color", "morse", "barcode", "qrcode", "naming", "lines", "markdown", "url-parse",
  "jwt", "unit", "draw", "meme", "password", "random-string", "wheel", "periodic", "timer", "timecalc",
  "holiday", "kinship", "bloodtype", "currency", "money-upper", "lunar", "dns", "cron", "hanzi",
  "zodiac", "scicalc", "yijing", "pdf-merge", "pdf-split", "invoice", "grid-split", "grid-merge",
  "screenshot", "media-convert", "xml", "data-convert", "smart-name", "todo", "nav", "dynasty",
  "id-card", "ip-cidr", "chmod", "html-entity", "loan", "history",
];

describe("第二批工具清单", () => {
  it("13 个，且不与第一批 40 个 / 原有工具撞 id 或标题", () => {
    const ids = MORE_TOOLS.map((tool) => tool.id);
    const existing = [...CORE_IDS, ...EXTRA_TOOLS.map((tool) => tool.id)];
    expect(ids).toHaveLength(13);
    expect(new Set(ids).size).toBe(13);
    expect(EXTRA_TOOLS).toHaveLength(40);
    expect(ids.filter((id) => existing.includes(id))).toEqual([]);
    expect(new Set(MORE_TOOLS.map((tool) => tool.title)).size).toBe(13);
    expect(new Set([...existing, ...ids]).size).toBe(existing.length + ids.length);
  });
});

describe("SQL 格式化", () => {
  it("美化保留字符串内的空格，关键字大写", () => {
    const pretty = formatSql("select a,b from t where name='a b' and id=1 order by a desc;", "pretty");
    expect(pretty).toContain("SELECT");
    expect(pretty).toContain("'a b'");
    expect(pretty).toContain("ORDER BY");
    expect(pretty.split("\n").length).toBeGreaterThan(3);
  });

  it("压缩、大小写转换与空输入", () => {
    expect(formatSql("select  a , b  from  t", "minify")).toBe("select a, b from t");
    expect(formatSql("select 'Hello World' from t", "upper")).toBe("SELECT 'Hello World' FROM t");
    expect(formatSql("SELECT 'Hi' FROM t", "lower")).toBe("select 'Hi' from t");
    expect(formatSql("", "pretty")).toBe("");
    expect(formatSql("select /* keep   me */ 1", "minify")).toContain("/* keep   me */");
  });
});

describe("JWT 生成", () => {
  it("UTF-8 安全的 base64url 与 iat/exp 注入", () => {
    expect(base64UrlEncode("f")).toBe("Zg");
    expect(base64UrlEncode("你好")).toBe("5L2g5aW9");
    expect(base64UrlEncode("a?b~c")).toBe("YT9ifmM");
    const built = buildJwtPayload('{"sub":"1"}', 3600, 1000);
    expect(built.ok ? built.payload.exp : 0).toBe(4600);
    expect(built.ok ? built.payload.iat : 0).toBe(1000);
    expect(buildJwtPayload("{oops", 0).ok).toBe(false);
    expect(buildJwtPayload("[1,2]", 0).ok).toBe(false);
    expect(jwtSigningInput({ alg: "HS256" }, { a: 1 }).split(".")).toHaveLength(2);
  });
});

describe("HTTP 报文", () => {
  it("解析请求（含折叠头）与响应", () => {
    const msg = parseHttpMessage('POST /api HTTP/1.1\r\nHost: example.com\r\nX-A: one\r\n  two\r\n\r\n{"a":1}');
    expect(msg.ok).toBe(true);
    expect(msg.kind).toBe("request");
    expect(msg.method).toBe("POST");
    expect(msg.headers[1].value).toBe("one two");
    expect(msg.body).toBe('{"a":1}');
    const res = parseHttpMessage("HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n\r\nmissing");
    expect(res.status).toBe(404);
    expect(res.reason).toBe("Not Found");
    expect(parseHttpMessage("garbage").ok).toBe(false);
  });

  it("生成报文时自动补 Host 与 Content-Length", () => {
    const raw = buildHttpMessage({
      kind: "request", method: "POST", target: "https://example.com/api", version: "HTTP/1.1",
      status: 200, reason: "OK", headers: [{ name: "Accept", value: "*/*" }], body: "hi",
      autoLength: true, autoHost: true,
    });
    expect(raw).toContain("POST https://example.com/api HTTP/1.1\r\n");
    expect(raw).toContain("Host: example.com");
    expect(raw).toContain("Content-Length: 2");
    expect(raw.endsWith("\r\n\r\nhi")).toBe(true);
  });
});

describe("位运算", () => {
  it("与 / 或 / 移位 / 取反", () => {
    expect(calcBitwise("0xF0", "&", "0x0F").decimal).toBe(0);
    expect(calcBitwise("0xF0", "|", "0x0F").decimal).toBe(255);
    expect(calcBitwise("1", "<<", "3").decimal).toBe(8);
    expect(calcBitwise("0", "~", "").decimal).toBe(-1);
    expect(calcBitwise("0b1010", "^", "0b0110").decimal).toBe(12);
    expect(calcBitwise("abc", "&", "1").ok).toBe(false);
    expect(bits32(1)).toContain("0001");
  });
});

describe("配色方案", () => {
  it("HEX / HSL 互转与经典配色", () => {
    expect(parseHexColor("#38f")).toBe("#3388ff");
    expect(parseHexColor("nope")).toBeNull();
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hexToHsl("#ff0000").h).toBe(0);
    expect(makePalette("#ff0000", "complementary")[1].hex).toBe("#00ffff");
    expect(makePalette("#ff0000", "triadic")).toHaveLength(3);
    expect(shadeScale("#ff0000", 5)).toHaveLength(5);
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(paletteToCss(makePalette("#ff0000", "analogous"), "vars")).toContain("--color-1:");
  });
});

describe("图片尺寸", () => {
  it("等比缩放默认不放大，可强制拉伸 / 放大", () => {
    expect(fitImageSize(4000, 2000, 1000, 1000)).toEqual({ width: 1000, height: 500, scale: 0.25 });
    expect(fitImageSize(100, 100, 1000, 1000)).toMatchObject({ width: 100, height: 100 });
    expect(fitImageSize(100, 100, 1000, 1000, true, true).width).toBe(1000);
    expect(fitImageSize(100, 50, 300, 100, false)).toMatchObject({ width: 300, height: 100 });
  });
});

describe("测试数据生成", () => {
  it("字段解析、可复现、三种导出", () => {
    const spec = parseFieldSpec("id=id\nname=name\nphone=phone\namount=decimal\n# 注释行");
    expect(spec.error).toBeUndefined();
    expect(spec.fields).toHaveLength(4);
    const rows = generateFakeRows(spec.fields, 3, 42);
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe(1);
    expect(String(rows[0].phone)).toMatch(/^1[3-9]\d{9}$/);
    expect(generateFakeRows(spec.fields, 3, 42)).toEqual(rows);
    expect(JSON.parse(rowsToJson(rows))).toHaveLength(3);
    expect(rowsToCsv(rows).split("\n")).toHaveLength(4);
    expect(rowsToSql(rows)).toContain("INSERT INTO `test_data`");
    expect(parseFieldSpec("a=nope").error).toContain("未知字段类型");
    expect(parseFieldSpec("").error).toContain("至少配置一个字段");
  });
});

describe("占位文本", () => {
  it("按单位生成且种子可复现", () => {
    expect(loremText("en", "word", 5, 1).split(" ")).toHaveLength(5);
    expect(loremText("zh", "paragraph", 2, 1)).toContain("\n\n");
    expect(loremText("zh", "sentence", 1, 7)).toBe(loremText("zh", "sentence", 1, 7));
    expect(loremText("en", "sentence", 1, 1).endsWith(".")).toBe(true);
  });
});

describe("随机分组", () => {
  it("均衡分组、按人数分组与越界校验", () => {
    const groups = splitGroups(["a", "b", "c", "d", "e"], "groups", 2, 1);
    expect(groups.ok).toBe(true);
    expect(groups.groups).toHaveLength(2);
    expect(groups.groups.map((g) => g.length).sort()).toEqual([2, 3]);
    expect(splitGroups(["a", "b", "c", "d", "e"], "size", 2, 1).groups).toHaveLength(3);
    expect(splitGroups(["a"], "groups", 2, 1).ok).toBe(false);
    expect(splitGroups(["a", "a", " "], "groups", 1, 1).groups[0]).toEqual(["a"]);
    expect(groupsToText(groups.groups)).toContain("第 1 组");
  });
});

describe("世界时区换算", () => {
  it("UTC 偏移含夏令时，墙上时间换算正确", () => {
    expect(zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Asia/Shanghai")).toBe(480);
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(offsetLabel(330)).toBe("UTC+5:30");
    const table = convertZoneTable(Date.UTC(2026, 10, 8, 4, 0, 0), "Asia/Shanghai", [
      { zone: "UTC", label: "UTC" }, { zone: "Asia/Tokyo", label: "东京" },
    ]);
    expect(table[0].time).toBe("2026-11-07 20:00:00");
    expect(table[1].time).toBe("2026-11-08 05:00:00");
    expect(table[0].dayNote).toBe("前一天");
    expect(table[1].diffHours).toBe(1);
  });
});

describe("预产期计算", () => {
  it("LMP + 280 天，孕周与里程碑", () => {
    const info = calcDueDate("2026-01-01", "lmp", 28, "2026-03-01");
    expect(info.ok).toBe(true);
    expect(info.daysPregnant).toBe(59);
    expect(info.weeks).toBe(8);
    expect(info.days).toBe(3);
    expect(info.milestones).toHaveLength(9);
    expect(info.milestones[8].date).toBe(info.dueDate);
    expect(info.daysLeft).toBeGreaterThan(200);
    expect(calcDueDate("2026-01-01", "conception", 28, "2026-03-01").dueDate).not.toBe(info.dueDate);
    expect(calcDueDate("bad", "lmp", 28).ok).toBe(false);
    expect(calcDueDate("2099-01-01", "lmp", 28).ok).toBe(false);
  });
});

describe("分数计算", () => {
  it("精确四则运算、带分数与小数还原", () => {
    const sum = evalFraction("1/2 + 3/4");
    expect(sum.ok ? sum.text : "").toBe("5/4");
    expect(sum.ok ? sum.mixed : "").toBe("1 1/4");
    const decimalSum = evalFraction("0.1 + 0.2");
    expect(decimalSum.ok ? decimalSum.text : "").toBe("3/10");
    expect(evalFraction("1/0").ok).toBe(false);
    expect(evalFraction("(1+2)*3").ok).toBe(true);
    const frac = decimalToFraction(0.125);
    expect(frac.ok ? frac.text : "").toBe("1/8");
    const pi = decimalToFraction(Math.PI, 10000);
    expect(pi.ok ? pi.text : "").toBe("355/113");
    expect(fractionToMixed({ n: -5, d: 4 })).toBe("-1 1/4");
  });
});

describe("排列组合与概率", () => {
  it("阶乘 / 排列 / 组合 / 二项分布", () => {
    expect(calcCombination("factorial", 5, 0, 0.5).value).toBe(120);
    expect(calcCombination("combination", 52, 5, 0.5).value).toBe(2598960);
    expect(calcCombination("permutation", 10, 3, 0.5).value).toBe(720);
    expect(calcCombination("repeat-combination", 3, 2, 0.5).value).toBe(6);
    expect(calcCombination("binomial", 10, 5, 0.5).value).toBeCloseTo(0.24609375);
    expect(calcCombination("binomial-cum", 10, 10, 0.5).value).toBeCloseTo(1);
    expect(calcCombination("at-least-once", 6, 0, 1 / 6).value).toBeCloseTo(1 - (5 / 6) ** 6);
    expect(calcCombination("combination", 5, 6, 0.5).ok).toBe(false);
    expect(calcCombination("combination", 171, 2, 0.5).ok).toBe(false);
  });
});
