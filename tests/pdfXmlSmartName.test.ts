/*
 * 新增工具（PDF 合并分割 / XML 工具 / 智能取名）纯函数单测
 */
import { describe, expect, it } from "vitest";
import {
  checkXmlWellFormed,
  chunkPageRanges,
  collectXmlStats,
  detectNameGender,
  escapeXml,
  extractPersonSurname,
  formatXml,
  generateSmartNames,
  joinNameStyle,
  keywordToTokens,
  minifyXml,
  parsePageRanges,
  parseXmlNodes,
  splitNameKeywords,
  unescapeXml,
} from "../src/utils";

/* ── PDF：页码范围解析 ───────────────────────────────────── */

describe("PDF：parsePageRanges", () => {
  it("离散页与区间混合", () => {
    const r = parsePageRanges("1-3,5,8-10", 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.segs).toEqual([
        { from: 1, to: 3 },
        { from: 5, to: 5 },
        { from: 8, to: 10 },
      ]);
      expect(r.pages).toBe(7);
    }
  });

  it("开区间：3- 到末尾、-4 从头", () => {
    const a = parsePageRanges("3-", 10);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.segs).toEqual([{ from: 3, to: 10 }]);

    const b = parsePageRanges("-4", 10);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.segs).toEqual([{ from: 1, to: 4 }]);
  });

  it("中文逗号 / 顿号 / 空格分隔兼容", () => {
    const r = parsePageRanges("1，2、3 4", 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.segs).toHaveLength(4);
  });

  it("非法输入：空 / 超范围 / 起大于止 / 无法识别", () => {
    expect(parsePageRanges("", 10)).toMatchObject({ ok: false });
    expect(parsePageRanges("11", 10)).toMatchObject({ ok: false });
    expect(parsePageRanges("5-3", 10)).toMatchObject({ ok: false });
    expect(parsePageRanges("abc", 10)).toMatchObject({ ok: false });
    expect(parsePageRanges("0-2", 10)).toMatchObject({ ok: false });
    expect(parsePageRanges("1-", 0)).toMatchObject({ ok: false });
  });
});

describe("PDF：chunkPageRanges", () => {
  it("整除分块", () => {
    const r = chunkPageRanges(9, 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.segs).toEqual([
        { from: 1, to: 3 },
        { from: 4, to: 6 },
        { from: 7, to: 9 },
      ]);
      expect(r.pages).toBe(9);
    }
  });

  it("非整除：最后一块为余数", () => {
    const r = chunkPageRanges(10, 4);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.segs).toHaveLength(3);
      expect(r.segs[2]).toEqual({ from: 9, to: 10 });
    }
  });

  it("size=1 等价每页一份", () => {
    const r = chunkPageRanges(5, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.segs).toHaveLength(5);
  });

  it("非法 size", () => {
    expect(chunkPageRanges(10, 0)).toMatchObject({ ok: false });
    expect(chunkPageRanges(10, -1)).toMatchObject({ ok: false });
    expect(chunkPageRanges(10, 1.5)).toMatchObject({ ok: false });
  });
});

/* ── XML 工具 ────────────────────────────────────────────── */

describe("XML：转义与反转义", () => {
  it("五个预定义字符全部转义", () => {
    expect(escapeXml(`a<b>c&d"e'f`)).toBe("a&lt;b&gt;c&amp;d&quot;e&apos;f");
  });

  it("命名实体反转义", () => {
    expect(unescapeXml("&lt;a&gt;&amp;&quot;&apos;")).toBe(`<a>&"'`);
  });

  it("数字实体：十进制与十六进制", () => {
    expect(unescapeXml("&#65;&#x42;")).toBe("AB");
  });

  it("未知实体保持原样", () => {
    expect(unescapeXml("&nbsp;&foo;")).toBe("&nbsp;&foo;");
  });

  it("转义 → 反转义往返一致", () => {
    const raw = `1 < 2 && "x" || 'y'`;
    expect(unescapeXml(escapeXml(raw))).toBe(raw);
  });
});

describe("XML：well-formed 校验", () => {
  it("合法多结构文档通过（声明 / 注释 / CDATA / 属性 / 自闭合）", () => {
    const src = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- note -->\n<root a="1"><b>text</b><c/><d><![CDATA[1<2]]></d></root>`;
    expect(checkXmlWellFormed(src)).toBeNull();
  });

  it("允许 DOCTYPE 含内部子集", () => {
    const src = `<!DOCTYPE root [<!ELEMENT root EMPTY>]><root/>`;
    expect(checkXmlWellFormed(src)).toBeNull();
  });

  it("未闭合标签报错并带行列", () => {
    const msg = checkXmlWellFormed("<a>\n  <b>text</a>");
    expect(msg).toMatch(/第 2 行第 \d+ 列/);
    expect(msg).toMatch(/标签不匹配|未闭合/);
  });

  it("属性缺引号 / 缺等号报错", () => {
    expect(checkXmlWellFormed("<a b=1/>")).toMatch(/引号/);
    expect(checkXmlWellFormed("<a b/>")).toMatch(/"="/);
  });

  it("多个根元素报错", () => {
    expect(checkXmlWellFormed("<a/><b/>")).toMatch(/多个根元素|根元素已闭合/);
  });

  it("闭合后杂散文本报错", () => {
    expect(checkXmlWellFormed("<a/>tail")).toMatch(/根元素/);
  });
});

describe("XML：解析与统计", () => {
  it("parseXmlNodes 解析节点树", () => {
    const nodes = parseXmlNodes(`<r x="1"><a/><b>t</b><!--c--></r>`);
    expect(nodes).toHaveLength(1);
    const root = nodes[0] as Extract<
      (typeof nodes)[number],
      { kind: "element" }
    >;
    expect(root.kind).toBe("element");
    expect(root.name).toBe("r");
    expect(root.attrs).toEqual([{ name: "x", value: "1", quote: '"' }]);
    expect(root.children).toHaveLength(3);
  });

  it("collectXmlStats 统计元素 / 属性 / 深度 / 根名", () => {
    const stats = collectXmlStats(`<r><a><b/></a><c d="1" e="2"/></r>`);
    expect(stats).toEqual({ elements: 4, attrs: 2, depth: 3, root: "r" });
  });

  it("collectXmlStats 非法输入返回 null", () => {
    expect(collectXmlStats("<a>")).toBeNull();
  });
});

describe("XML：格式化与压缩", () => {
  const SRC = `<r><a><b>hello</b></a><c x="1">long text that exceeds single line limit should be wrapped into child line for readability</c></r>`;

  it("formatXml 按缩进美化，短文本保持单行", () => {
    const out = formatXml(SRC, 2);
    const lines = out.split("\n");
    expect(lines[0]).toBe("<r>");
    expect(lines[1]).toBe("  <a>");
    expect(lines[2]).toBe("    <b>hello</b>");
    expect(lines[3]).toBe("  </a>");
    expect(out).toContain("</r>");
  });

  it("formatXml 缩进 4", () => {
    const out = formatXml("<r><a/></r>", 4);
    expect(out.split("\n")[1]).toBe("    <a/>");
  });

  it("minifyXml 去除标签间空白并丢弃注释", () => {
    const out = minifyXml(`<r> <a> x </a> <!-- note --> </r>`);
    expect(out).toBe("<r><a>x</a></r>");
  });

  it("压缩 → 格式化往返保持语义（文本空白折叠除外）", () => {
    const mini = minifyXml(SRC);
    expect(checkXmlWellFormed(mini)).toBeNull();
    const statsMini = collectXmlStats(mini);
    const statsSrc = collectXmlStats(SRC);
    expect(statsMini).toEqual(statsSrc);
  });
});

/* ── 智能取名（算法模式） ────────────────────────────────── */

describe("智能取名：关键词拆分与词元", () => {
  it("splitNameKeywords 兼容多种分隔符", () => {
    expect(splitNameKeywords("订单 队列,配置、缓存;索引/列表|去重")).toEqual([
      "订单",
      "队列",
      "配置",
      "缓存",
      "索引",
      "列表",
      "去重",
    ]);
    expect(splitNameKeywords("   ")).toEqual([]);
  });

  it("keywordToTokens：英文驼峰 / 分隔符拆词", () => {
    expect(keywordToTokens("orderQueue")).toEqual(["order", "queue"]);
    expect(keywordToTokens("order-queue_v2")).toEqual(["order", "queue", "v2"]);
  });

  it("keywordToTokens：中文转无声调拼音", () => {
    expect(keywordToTokens("订单")).toEqual(["ding", "dan"]);
  });

  it("joinNameStyle 五种风格", () => {
    const tokens = ["order", "queue", "v2"];
    expect(joinNameStyle(tokens, "camel")).toBe("orderQueueV2");
    expect(joinNameStyle(tokens, "pascal")).toBe("OrderQueueV2");
    expect(joinNameStyle(tokens, "snake")).toBe("order_queue_v2");
    expect(joinNameStyle(tokens, "kebab")).toBe("order-queue-v2");
    expect(joinNameStyle(tokens, "constant")).toBe("ORDER_QUEUE_V2");
  });
});

describe("智能取名：姓氏与性别识别", () => {
  it("extractPersonSurname 识别常见单姓 / 复姓 / 「姓X」形式", () => {
    expect(extractPersonSurname(["王", "男"])).toBe("王");
    expect(extractPersonSurname(["女", "欧阳"])).toBe("欧阳");
    expect(extractPersonSurname(["姓李", "聪慧"])).toBe("李");
    expect(extractPersonSurname(["聪明", "好学"])).toBeNull();
  });

  it("detectNameGender 精确词表匹配，矛盾或缺失返回中性", () => {
    expect(detectNameGender(["男"])).toBe("m");
    expect(detectNameGender(["女孩"])).toBe("f");
    expect(detectNameGender(["聪明"])).toBe("n");
    expect(detectNameGender(["男", "女"])).toBe("n");
  });
});

describe("智能取名：人名场景", () => {
  const MALE_ONLY = "睿哲轩宇泽毅恒诚博瀚骏铭远航骁川峰朗";
  const FEMALE_ONLY = "婉静瑶芸婷雅慧欣悦诗若菡岚月琳怡颖瑾";

  it("姓氏 + 男孩：产出王姓名字，不含女孩专属字", () => {
    const items = generateSmartNames({
      keywords: "王 男",
      scene: "person",
      count: 12,
      seed: 11,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.name.startsWith("王")).toBe(true);
      expect(i.name.length).toBeLessThanOrEqual(3);
      for (const ch of i.name.slice(1)) {
        expect(FEMALE_ONLY.includes(ch)).toBe(false);
      }
    }
    // note 标注姓氏与单/双字名
    expect(items[0].note).toMatch(/姓王 · (单字名|双字名) · /);
  });

  it("姓氏 + 女孩：不含男孩专属字", () => {
    const items = generateSmartNames({
      keywords: "李 女",
      scene: "person",
      count: 12,
      seed: 6,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.name.startsWith("李")).toBe(true);
      for (const ch of i.name.slice(1)) {
        expect(MALE_ONLY.includes(ch)).toBe(false);
      }
    }
  });

  it("复姓识别", () => {
    const items = generateSmartNames({
      keywords: "欧阳 男",
      scene: "person",
      count: 5,
      seed: 2,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(i.name.startsWith("欧阳")).toBe(true);
  });

  it("未识别姓氏时仅产出名并标注", () => {
    const items = generateSmartNames({
      keywords: "聪明",
      scene: "person",
      count: 8,
      seed: 3,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].note).toContain("未识别姓氏");
    for (const i of items) expect(i.name.length).toBeLessThanOrEqual(2);
  });

  it("寓意关键词优先匹配字库", () => {
    const items = generateSmartNames({
      keywords: "王 寓意聪慧",
      scene: "person",
      count: 10,
      seed: 9,
    });
    expect(items.length).toBeGreaterThan(0);
    // 「聪慧」匹配 睿(聪慧明达) 与 慧(聪慧含字)：候选名的用字应只来自匹配池
    const allowed = new Set(["王", "睿", "慧"]);
    for (const i of items) {
      for (const ch of i.name) expect(allowed.has(ch)).toBe(true);
    }
  });
});

describe("智能取名：generateSmartNames", () => {
  it("variable 场景：按风格产出且无重复（英文关键词）", () => {
    const items = generateSmartNames({
      keywords: "order queue",
      scene: "variable",
      style: "camel",
      count: 12,
      seed: 7,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(12);
    const names = items.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
    expect(names).toContain("orderQueue");
  });

  it("variable 场景：中文关键词经拼音产出驼峰", () => {
    const items = generateSmartNames({
      keywords: "订单 队列",
      scene: "variable",
      style: "camel",
      count: 12,
      seed: 7,
    });
    const names = items.map((i) => i.name);
    expect(names).toContain("dingDanDuiLie");
    expect(names).toContain("dingDanDuiLieList");
  });

  it("variable 场景：constant 风格全大写", () => {
    const items = generateSmartNames({
      keywords: "order queue",
      scene: "variable",
      style: "constant",
      count: 5,
    });
    for (const i of items) {
      expect(i.name).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it("project 场景：词根 + 品牌后缀多拼写", () => {
    const items = generateSmartNames({
      keywords: "note",
      scene: "project",
      count: 10,
      seed: 3,
    });
    expect(items.length).toBeGreaterThan(0);
    const names = items.map((i) => i.name).join("\n");
    expect(names).toMatch(/note/i);
  });

  it("nickname 场景：产出中文网名", () => {
    const items = generateSmartNames({
      keywords: "山 海",
      scene: "nickname",
      count: 10,
      seed: 5,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.name).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it("同 seed 结果可复现，不同 seed 换一批", () => {
    const a = generateSmartNames({
      keywords: "风",
      scene: "nickname",
      count: 8,
      seed: 42,
    });
    const b = generateSmartNames({
      keywords: "风",
      scene: "nickname",
      count: 8,
      seed: 42,
    });
    expect(a).toEqual(b);
    const c = generateSmartNames({
      keywords: "风",
      scene: "nickname",
      count: 8,
      seed: 99,
    });
    expect(a.map((i) => i.name).join(",")).not.toBe(
      c.map((i) => i.name).join(","),
    );
  });

  it("空关键词返回空数组", () => {
    expect(generateSmartNames({ keywords: "  ", scene: "variable" })).toEqual(
      [],
    );
  });
});
