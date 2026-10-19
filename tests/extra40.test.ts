/*
 * 新增 40 个工具的纯函数测试。每个工具至少锁住一条主路径。
 */
import { describe, expect, it } from "vitest";
import { EXTRA_TOOLS } from "../src/tools/extras/manifest";
import {
  convertCase,
  fillTemplate,
  findReplace,
  markdownTableToTsv,
  maskText,
  processColumns,
  toFullWidth,
  toHalfWidth,
  toMarkdownTable,
  toPinyin,
  wordFrequency,
} from "../src/tools/extras/textLogic";
import {
  applyCipher,
  base32DecodeText,
  base32EncodeText,
  codePointsToText,
  contrastRatio,
  domainToAscii,
  domainToUnicode,
  escapeString,
  hexDump,
  hexToText,
  inspectText,
  punycodeEncode,
  textToHex,
  unescapeString,
} from "../src/tools/extras/codecLogic";
import {
  buildCurl,
  bumpSemver,
  compareSemver,
  flattenJsonText,
  generateUlid,
  inspectPath,
  joinPath,
  jsonToTypescript,
  parseCurl,
  parseDotenv,
  parseIpv6,
  parseMac,
  parseSemver,
  parseUlid,
  parseUserAgent,
  satisfiesSemver,
  searchHttpStatus,
  searchMime,
  sortSemver,
  unflattenJsonText,
} from "../src/tools/extras/devLogic";
import {
  addWorkdays,
  calcBmi,
  calcCompound,
  calcGeometry,
  calcPercent,
  calcRatio,
  calcSalary,
  convertCoord,
  fromRoman,
  haversine,
  inspectLuhn,
  randomNumbers,
  rollDice,
  toRoman,
  workdaysBetween,
} from "../src/tools/extras/lifeLogic";

const EXISTING = [
  "text-diff", "word-count", "regex", "calculator", "radix", "json", "hash", "uuid", "timestamp",
  "base64", "url", "color", "morse", "barcode", "qrcode", "naming", "lines", "markdown", "url-parse",
  "jwt", "unit", "draw", "meme", "password", "random-string", "wheel", "periodic", "timer", "timecalc",
  "holiday", "kinship", "bloodtype", "currency", "money-upper", "lunar", "dns", "cron", "hanzi",
  "zodiac", "scicalc", "yijing", "pdf-merge", "pdf-split", "invoice", "grid-split", "grid-merge",
  "screenshot", "media-convert", "xml", "data-convert", "smart-name", "todo", "nav", "dynasty",
  "id-card", "ip-cidr", "chmod", "html-entity", "loan", "history",
];

describe("新工具清单", () => {
  it("正好 40 个，且不与现有工具撞 id", () => {
    const ids = EXTRA_TOOLS.map((tool) => tool.id);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    expect(ids.filter((id) => EXISTING.includes(id))).toEqual([]);
    expect(new Set(EXTRA_TOOLS.map((tool) => tool.title)).size).toBe(40);
  });
});

describe("文本", () => {
  it("拼音", () => {
    expect(toPinyin("中国", "symbol", " ")).toBe("zhōng guó");
    expect(toPinyin("中国", "none", " ")).toBe("zhong guo");
    expect(toPinyin("中国", "num", " ")).toBe("zhong1 guo2");
    expect(toPinyin("中国", "initial", "")).toBe("zg");
  });

  it("全半角", () => {
    expect(toHalfWidth("Ａ１　")).toBe("A1 ");
    expect(toFullWidth("A1 ")).toBe("Ａ１　");
  });

  it("查找替换", () => {
    expect(findReplace("a1b2", "(\\d)", "#$1", { regex: true })).toMatchObject({ output: "a#1b#2", count: 2 });
    expect(findReplace("a1", "(?<n>\\d)", "{$<n>}", { regex: true }).output).toBe("a{1}");
    expect(findReplace("大苹果 苹果", "苹果", "果", { wholeWord: true }).output).toBe("大苹果 果");
  });

  it("词频", () => {
    const chars = wordFrequency("苹果苹果 apple apple", "char", true, false, 10);
    expect(chars.find((item) => item.token === "苹")?.count).toBe(2);
    expect(chars.find((item) => item.token === "apple")?.count).toBe(2);
    const words = wordFrequency("苹果苹果", "word", true, false, 10);
    expect(words[0]).toMatchObject({ token: "苹果", count: 2 });
  });

  it("模板、表格、大小写、列、脱敏", () => {
    expect(fillTemplate("你好{{name|匿名}}", {}, "mustache").output).toBe("你好匿名");
    expect(fillTemplate("你好{{name}}", { name: "李" }, "mustache").output).toBe("你好李");
    expect(toMarkdownTable("a,b\n1,2")).toBe("| a | b |\n| ---: | ---: |\n| 1 | 2 |");
    expect(markdownTableToTsv("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe("a\tb\n1\t2");
    expect(convertCase("hELLo", "toggle")).toBe("HellO");
    expect(convertCase("hello world. foo", "sentence")).toBe("Hello world. Foo");
    expect(processColumns("a,b,c\n1,2,3", ",", 2).extracted).toBe("b\n2");
    expect(maskText("13812345678", "phone")).toBe("138****5678");
    expect(maskText("ada@example.com", "email")).toBe("a**@example.com");
    expect(maskText("张三丰", "name")).toBe("张*丰");
    expect(maskText("联系 13812345678", "auto")).toContain("138****5678");
  });
});

describe("编码", () => {
  it("古典密码", () => {
    expect(applyCipher("xyz", "caesar", 1, "", false).output).toBe("yza");
    expect(applyCipher("xyz", "caesar", 1, "", true).output).toBe("wxy");
    expect(applyCipher("hello", "rot13", 0, "", false).output).toBe("uryyb");
    expect(applyCipher("A", "rot47", 0, "", false).output).toBe("p");
    expect(applyCipher("hello", "atbash", 0, "", false).output).toBe("svool");
    expect(applyCipher("ATTACKATDAWN", "vigenere", 0, "LEMON", false).output).toBe("LXFOPVEFRNHR");
    expect(applyCipher("LXFOPVEFRNHR", "vigenere", 0, "LEMON", true).output).toBe("ATTACKATDAWN");
  });

  it("Punycode", () => {
    expect(punycodeEncode("他们为什么不说中文")).toBe("ihqwcrb4cv8a8dqg056pqjye");
    expect(punycodeEncode("bücher")).toBe("bcher-kva");
    expect(domainToAscii("bücher.example").output).toBe("xn--bcher-kva.example");
    expect(domainToUnicode("xn--bcher-kva.example").output).toBe("bücher.example");
  });

  it("Unicode、转义、Base32、hex、对比度", () => {
    const glyph = inspectText("你")[0];
    expect(glyph.hex).toBe("U+4F60");
    expect(glyph.utf8).toBe("E4 BD A0");
    expect(codePointsToText("U+4F60 U+597D").text).toBe("你好");
    expect(escapeString('a"b\n', "json").inner).toBe('a\\"b\\n');
    expect(unescapeString('a\\"b\\n', "json").output).toBe('a"b\n');
    expect(escapeString("a'b\n", "python").quoted).toBe("'a\\'b\\n'");
    const encoded = base32EncodeText("foobar", true);
    expect(encoded.output).toBe("MZXW6YTBOI======");
    expect(base32DecodeText("MZXW6YTBOI======").output).toBe("foobar");
    expect(textToHex("Hi")).toBe("48 69");
    expect(hexToText("48 69").output).toBe("Hi");
    expect(hexDump("Hi")).toContain("48 69");
    const contrast = contrastRatio("#000", "#fff");
    expect(contrast.ok && contrast.result.ratio).toBe(21);
    expect(contrast.ok && contrast.result.aaaNormal).toBe(true);
    expect(contrastRatio("#fff", "#fff").ok && contrastRatio("#fff", "#fff")).toMatchObject({
      ok: true,
      result: { ratio: 1, aaNormal: false },
    });
  });
});

describe("开发", () => {
  it("JSON 类型与扁平化", () => {
    const typed = jsonToTypescript('[{"id":1,"name":"a"},{"id":2}]');
    expect(typed.code).toContain("name?: string");
    expect(typed.code).toContain("export type Root = RootItem[];");
    const flat = flattenJsonText('{"a":{"b":1},"c":[2,{"d":3}]}');
    expect(JSON.parse(flat.output)).toEqual({ "a.b": 1, "c.0": 2, "c.1.d": 3 });
    expect(JSON.parse(unflattenJsonText(flat.output).output)).toEqual({ a: { b: 1 }, c: [2, { d: 3 }] });
  });

  it("ULID、IPv6、MAC、UA", () => {
    const id = generateUlid(0, new Uint8Array(10));
    expect(id).toHaveLength(26);
    expect(parseUlid(id)).toMatchObject({ ok: true, time: 0, random: "0000000000000000" });
    const v6 = parseIpv6("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(v6.ok && v6.info.compressed).toBe("2001:db8::1");
    expect(v6.ok && v6.info.expanded).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(parseIpv6("::1").ok && parseIpv6("::1")).toMatchObject({ ok: true, info: { compressed: "::1", ipv4: null } });
    const mapped = parseIpv6("::ffff:192.0.2.1");
    expect(mapped.ok && mapped.info.ipv4).toBe("192.0.2.1");
    const mac = parseMac("AA-BB-CC-DD-EE-FF");
    expect(mac.ok && mac.info).toMatchObject({ colon: "aa:bb:cc:dd:ee:ff", dot: "aabb.ccdd.eeff", multicast: false, local: true });
    const ua = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(ua).toMatchObject({ browser: "Chrome", browserVersion: "120.0.0.0", os: "Windows", osVersion: "10/11", device: "桌面" });
    expect(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1").device).toBe("手机");
  });

  it("HTTP、MIME、SemVer、路径、dotenv、curl", () => {
    expect(searchHttpStatus("404")[0].name).toBe("Not Found");
    expect(searchMime("png")[0].mime).toBe("image/png");
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
    expect(sortSemver(["2.0.0", "1.0.0-alpha", "1.0.0"])).toEqual(["1.0.0-alpha", "1.0.0", "2.0.0"]);
    expect(bumpSemver("1.2.3-alpha", "minor")).toBe("1.3.0");
    expect(satisfiesSemver("1.9.0", "^1.2.3")).toBe(true);
    expect(satisfiesSemver("2.0.0", "^1.2.3")).toBe(false);
    expect(parseSemver("01.2.3")).toBeNull();
    expect(inspectPath("/a/b/../c.txt").normalized).toBe("/a/c.txt");
    expect(inspectPath("/a/b/c.txt").ext).toBe(".txt");
    expect(joinPath(["a", "/b", "c"], "posix")).toBe("/b/c");
    expect(inspectPath("C:\\a\\b\\..\\c", "win").normalized).toBe("C:\\a\\c");
    const env = parseDotenv("# c\nexport A=1\nB=\"x y\"\nC='a\\n'\n");
    expect(env.error).toBeUndefined();
    expect(env.entries).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "x y" },
      { key: "C", value: "a\\n" },
    ]);
    const curl = parseCurl(`curl -X POST https://api.example.com/v1 -H "Content-Type: application/json" -d '{"a":1}'`);
    expect(curl.ok && curl.request).toMatchObject({
      method: "POST",
      url: "https://api.example.com/v1",
      body: '{"a":1}',
      headers: [{ name: "Content-Type", value: "application/json" }],
    });
    if (curl.ok) expect(parseCurl(buildCurl(curl.request)).ok).toBe(true);
  });
});

describe("数值与生活", () => {
  it("百分比、比例、复利、罗马数字、几何", () => {
    const percent = calcPercent(25, 100, 100, 150, 100, 8, 20);
    expect(percent.ratio).toBe(25);
    expect(percent.change).toBe(50);
    expect(percent.zhePay).toBe(80);
    expect(percent.offPay).toBe(80);
    const ratio = calcRatio(1920, 1080, 1280, "width");
    expect(ratio).toMatchObject({ text: "16:9", nearest: "16:9", scaledWidth: 1280, scaledHeight: 720 });
    expect(calcRatio(1080, 1920)).toMatchObject({ text: "9:16", nearest: "9:16" });
    const compound = calcCompound(1000, 12, 1, 12, 0);
    expect(compound).toMatchObject({ future: 1126.83, contributed: 1000, interest: 126.83 });
    expect(toRoman(1994)).toBe("MCMXCIV");
    expect(fromRoman("mcmxciv")).toBe(1994);
    expect(() => fromRoman("IIII")).toThrow();
    const triangle = calcGeometry("triangle", [3, 4, 5]);
    expect(triangle).toMatchObject({ items: expect.arrayContaining([{ label: "面积", value: "6" }, { label: "角 C", value: "90°" }]) });
  });

  it("骰子、随机数、工作日", () => {
    const roll = rollDice("2d6+3", () => 0);
    expect(roll).toMatchObject({ total: 5 });
    const nums = randomNumbers(1, 3, 3, true, 0, (() => {
      const seq = [0, 0.5, 0.99];
      let i = 0;
      return () => seq[i++ % seq.length];
    })());
    expect(nums).toEqual([1, 2, 3]);
    expect(workdaysBetween("2026-10-19", "2026-10-23", false)).toMatchObject({ count: 5 });
    expect(workdaysBetween("2026-10-01", "2026-10-08", true)).toMatchObject({ count: 1 });
    expect(addWorkdays("2026-10-23", 1, false)).toBe("2026-10-26");
  });

  it("BMI、工资、坐标、Luhn", () => {
    expect(calcBmi(70, 175)).toMatchObject({ bmi: 22.9, category: "正常" });
    const pay = calcSalary({
      gross: 10000,
      monthIndex: 1,
      pensionRate: 8,
      medicalRate: 2,
      unemploymentRate: 0.5,
      fundRate: 12,
      baseMin: null,
      baseMax: null,
      specialDeduction: 0,
      threshold: 5000,
    });
    expect(pay).toMatchObject({ social: 2250, tax: 82.5, net: 7667.5, bracket: "3%" });
    const high = calcSalary({
      gross: 30000,
      monthIndex: 2,
      pensionRate: 0,
      medicalRate: 0,
      unemploymentRate: 0,
      fundRate: 0,
      baseMin: null,
      baseMax: null,
      specialDeduction: 0,
      threshold: 5000,
    });
    expect(high).toMatchObject({ tax: 1730, net: 28270 });
    const london = convertCoord(0, 51.5, "wgs84");
    expect(london).toMatchObject({ wgs84: [0, 51.5], gcj02: [0, 51.5] });
    const beijing = convertCoord(116.397, 39.909, "wgs84");
    if (!("error" in beijing)) {
      expect(beijing.gcj02[0]).not.toBeCloseTo(116.397, 3);
      const back = convertCoord(beijing.gcj02[0], beijing.gcj02[1], "gcj02");
      if (!("error" in back)) expect(back.wgs84[0]).toBeCloseTo(116.397, 4);
    }
    const meters = haversine(116.397, 39.909, 121.473, 31.23);
    expect(meters).toBeGreaterThan(1_000_000);
    expect(meters).toBeLessThan(1_300_000);
    expect(inspectLuhn("4111 1111 1111 1111")).toMatchObject({ valid: true, brand: "Visa", expected: "1" });
    expect(inspectLuhn("4111111111111112")).toMatchObject({ valid: false, expected: "1" });
  });
});
