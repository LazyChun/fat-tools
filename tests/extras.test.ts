import { describe, expect, it } from "vitest";
import {
  convertNaming,
  convertUnit,
  decodeJwt,
  encodeCode128,
  estimatePasswordBits,
  generatePassword,
  generateRandomString,
  generateRandomStrings,
  processLines,
  renderMarkdown,
  splitWords,
  DEFAULT_LINES_OPTIONS,
  type PasswordOptions,
  type RandomStringOptions,
} from "../src/utils";

describe("splitWords / convertNaming", () => {
  it("拆分 camel / snake / kebab / 空格", () => {
    expect(splitWords("userProfileName")).toEqual(["user", "Profile", "Name"]);
    expect(splitWords("user_profile-name")).toEqual(["user", "profile", "name"]);
    expect(splitWords("HTTPServer")).toEqual(["HTTP", "Server"]);
    expect(splitWords("  hello   world  ")).toEqual(["hello", "world"]);
    expect(splitWords("")).toEqual([]);
  });

  it("多种命名风格互转", () => {
    const input = "user_profile_name";
    expect(convertNaming(input, "camel")).toBe("userProfileName");
    expect(convertNaming(input, "pascal")).toBe("UserProfileName");
    expect(convertNaming(input, "snake")).toBe("user_profile_name");
    expect(convertNaming(input, "kebab")).toBe("user-profile-name");
    expect(convertNaming(input, "constant")).toBe("USER_PROFILE_NAME");
    expect(convertNaming(input, "dot")).toBe("user.profile.name");
    expect(convertNaming(input, "path")).toBe("user/profile/name");
    expect(convertNaming(input, "title")).toBe("User Profile Name");
    expect(convertNaming(input, "sentence")).toBe("User profile name");
    expect(convertNaming("", "camel")).toBe("");
  });
});

describe("processLines", () => {
  const opts = (over: Partial<typeof DEFAULT_LINES_OPTIONS> = {}) => ({
    ...DEFAULT_LINES_OPTIONS,
    ...over,
  });

  it("去空行 + 去首尾空格", () => {
    expect(processLines("a\n\n  b  \n", opts({ trim: true, removeEmpty: true }))).toBe("a\nb");
  });

  it("去重（可忽略大小写）", () => {
    expect(processLines("a\nb\na", opts({ dedupe: true }))).toBe("a\nb");
    expect(processLines("A\na", opts({ dedupe: true }))).toBe("A\na");
    expect(processLines("A\na", opts({ dedupe: true, caseInsensitive: true }))).toBe("A");
  });

  it("排序与反转", () => {
    expect(processLines("b\nc\na", opts({ sort: "asc" }))).toBe("a\nb\nc");
    expect(processLines("b\nc\na", opts({ sort: "desc" }))).toBe("c\nb\na");
    expect(processLines("item10\nitem2", opts({ sort: "natural" }))).toBe("item2\nitem10");
    expect(processLines("a\nb", opts({ reverse: true }))).toBe("b\na");
  });

  it("加行号与过滤", () => {
    expect(processLines("a\nb", opts({ number: true }))).toBe("1. a\n2. b");
    expect(processLines("a\nb\nc", opts({ filter: "b", filterMode: "contains" }))).toBe("b");
    expect(processLines("a\nb\nc", opts({ filter: "b", filterMode: "not-contains" }))).toBe("a\nc");
  });

  it("CRLF 归一化", () => {
    expect(processLines("a\r\nb", opts())).toBe("a\nb");
  });
});

describe("convertUnit", () => {
  it("长度与数据存储", () => {
    expect(convertUnit("length", "m", "cm", 1)).toBeCloseTo(100, 9);
    expect(convertUnit("length", "km", "m", 1)).toBeCloseTo(1000, 9);
    expect(convertUnit("length", "mi", "km", 1)).toBeCloseTo(1.609344, 6);
    expect(convertUnit("data", "kb", "b", 1)).toBe(1024);
    expect(convertUnit("data", "gb", "mb", 1)).toBe(1024);
  });

  it("温度换算", () => {
    expect(convertUnit("temperature", "c", "f", 100)).toBeCloseTo(212, 6);
    expect(convertUnit("temperature", "f", "c", 32)).toBeCloseTo(0, 6);
    expect(convertUnit("temperature", "c", "k", 0)).toBeCloseTo(273.15, 6);
    expect(convertUnit("temperature", "k", "c", 273.15)).toBeCloseTo(0, 6);
  });
});

describe("generatePassword", () => {
  const base: PasswordOptions = {
    length: 16,
    upper: true,
    lower: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: false,
  };

  it("长度与字符集约束", () => {
    const pw = generatePassword(base);
    expect(pw).toHaveLength(16);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(pw)).toBe(true);
  });

  it("可注入随机源以复现", () => {
    const pw = generatePassword({ ...base, length: 8 }, () => 0);
    expect(pw).toHaveLength(8);
    for (const ch of pw) {
      expect("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.?/~").toContain(ch);
    }
  });

  it("排除易混字符", () => {
    const pw = generatePassword({ ...base, length: 40, excludeAmbiguous: true }, () => 0);
    expect(/[Il1O0oB8S5Z2]/.test(pw)).toBe(false);
  });

  it("未选择任何字符类型应报错", () => {
    expect(() =>
      generatePassword({ ...base, upper: false, lower: false, digits: false, symbols: false }),
    ).toThrow();
  });

  it("熵估算随长度与字符集增长", () => {
    expect(estimatePasswordBits({ ...base, length: 10 })).toBeGreaterThan(0);
    expect(estimatePasswordBits({ ...base, length: 20 })).toBeGreaterThan(
      estimatePasswordBits({ ...base, length: 10 }),
    );
  });
});

describe("decodeJwt", () => {
  const b64url = (obj: unknown): string => {
    const s = JSON.stringify(obj);
    return Buffer.from(s, "utf8")
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  it("解码 header / payload 并保留签名段", () => {
    const token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: "1234567890",
      name: "张三",
      exp: 1700000000,
    })}.SIGNATURE`;
    const decoded = decodeJwt(token);
    expect(decoded.header.alg).toBe("HS256");
    expect(decoded.payload.name).toBe("张三");
    expect(decoded.payload.exp).toBe(1700000000);
    expect(decoded.signature).toBe("SIGNATURE");
  });

  it("非法 token 抛错", () => {
    expect(() => decodeJwt("not-a-jwt")).toThrow();
    expect(() => decodeJwt("aaa.###.ccc")).toThrow();
  });
});

describe("renderMarkdown", () => {
  it("标题 / 粗体 / 行内代码", () => {
    expect(renderMarkdown("# Hi")).toContain("<h1>Hi</h1>");
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("列表与代码块", () => {
    const ul = renderMarkdown("- a\n- b");
    expect(ul).toContain("<ul>");
    expect(ul).toContain("<li>a</li>");
    const ol = renderMarkdown("1. one\n2. two");
    expect(ol).toContain("<ol>");
    const code = renderMarkdown("```js\nconst a = 1;\n```");
    expect(code).toContain("<pre><code");
    expect(code).toContain("const a = 1;");
  });

  it("转义 HTML 防止注入", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("链接渲染", () => {
    expect(renderMarkdown("[x](https://a.com)")).toContain('href="https://a.com"');
  });
});

describe("encodeCode128", () => {
  it("每字符 11 模块，起止符与校验位正确", () => {
    const r = encodeCode128("A");
    // Start B(104) + 'A'(33) + 校验 + Stop(106)
    expect(r.valid).toBe(true);
    expect(r.codes).toHaveLength(4);
    expect(r.codes[0]).toBe(104);
    expect(r.codes[1]).toBe(33);
    expect(r.codes[3]).toBe(106);
    // 校验位 = (104*1 + 33*1) % 103 = 137 % 103 = 34
    expect(r.codes[2]).toBe(34);
    // 三个 11 模块字符 + 13 模块终止符
    expect(r.bits).toHaveLength(11 * 3 + 13);
    expect(r.bits.startsWith("11010010000")).toBe(true); // 起点符 B
    expect(r.bits.endsWith("1100011101011")).toBe(true); // 终止符
  });

  it("多字符校验位按位置加权", () => {
    const r = encodeCode128("AB");
    expect(r.codes).toEqual([104, 33, 34, 205 % 103, 106]);
    // 4 个 11 模块字符 + 13 模块终止符
    expect(r.bits).toHaveLength(11 * 4 + 13);
  });

  it("不支持 ASCII 之外的字符时 valid=false", () => {
    expect(encodeCode128("中文").valid).toBe(false);
    expect(encodeCode128("").valid).toBe(true);
  });
});

describe("generateRandomString", () => {
  const base: RandomStringOptions = {
    length: 12,
    classes: ["lower", "upper", "digits"],
    excludeSimilar: false,
    custom: "",
    prefix: "",
    suffix: "",
  };

  it("长度与前缀后缀", () => {
    expect(generateRandomString(base)).toHaveLength(12);
    expect(generateRandomString({ ...base, prefix: "ID-", suffix: "!" })).toHaveLength(12 + 3 + 1);
  });

  it("只用选中的字符集", () => {
    const s = generateRandomString({ ...base, classes: ["digits"], length: 20 });
    expect(/^\d{20}$/.test(s)).toBe(true);
  });

  it("排除易混字符", () => {
    const s = generateRandomString({ ...base, length: 200, excludeSimilar: true });
    expect(/[Il1O0oiB8S5Z2]/.test(s)).toBe(false);
  });

  it("支持自定义字符与去重", () => {
    const s = generateRandomString({ ...base, classes: [], custom: "XYZ", length: 30 });
    expect(/^[XYZ]{30}$/.test(s)).toBe(true);
    const list = generateRandomStrings({ ...base, length: 6 }, 50, true);
    expect(new Set(list).size).toBe(50);
  });

  it("字符集为空时报错", () => {
    expect(() => generateRandomString({ ...base, classes: [], custom: "" })).toThrow();
  });
});
