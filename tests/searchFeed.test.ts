import { describe, expect, it } from "vitest";
import {
  createToolSearchFeed,
  matchesToolSearchInput,
} from "../src/tools/searchFeed";
import {
  CURL_SEARCH_FEED,
  IPV6_SEARCH_FEED,
  MAC_SEARCH_FEED,
  PUNYCODE_SEARCH_FEED,
  ULID_SEARCH_FEED,
} from "../src/tools/extras/feeds";

/**
 * 与各工具 SEARCH_FEED.pattern 保持同步（避免测试直接 import .tsx 拉起 antd）。
 * 若改了工具侧 pattern，请一并更新此处。
 */
const PATTERNS = {
  calculator:
    /^\s*(?!\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:[\d(][\d+\-*/%^().\s]*[+\-*/%^][\d+\-*/%^().\s]*\s*$|[a-z][a-z0-9]*\s*\()/,
  timestamp:
    /^(?:1\d{9}(?:\d{3})?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?)$/,
  timecalc:
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?$/,
  color: /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*\d+)/,
  "url-parse": /^https?:\/\/\S+$/,
  url: /%[0-9a-f]{2}/,
  base64:
    /^(?=[a-z0-9+/=]{12,}$)(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=|[a-z0-9+/]{4})+$/,
  jwt: /^eyj[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\.[a-z0-9_-]*$/,
  morse: /^[.\-][.\-/ ]{3,}$/,
  json: /^\s*[{\[][\s\S]*[":,][\s\S]*[}\]]\s*$/,
  regex: /^\/[\s\S]{2,}\/[dgimsuy]*$/,
  radix: /^0[xbo][0-9a-f]+$/,
  "id-card": /^(?:\d{15}|\d{17}[\dx])$/,
} as const;

describe("matchesToolSearchInput / feed 门禁", () => {
  it("名称类搜索词不匹配；可解析内容匹配", () => {
    expect(matchesToolSearchInput(PATTERNS.calculator, "计算器")).toBe(false);
    expect(matchesToolSearchInput(PATTERNS.calculator, "89+33")).toBe(true);
    expect(matchesToolSearchInput(/^\d+\+\d+$/, "1+1")).toBe(true);
    expect(matchesToolSearchInput(/^\d+\+\d+$/, "计算器")).toBe(false);
  });

  it("空白返回 false；feed 对不匹配内容无副作用", () => {
    expect(matchesToolSearchInput(/a/, "   ")).toBe(false);
    expect(matchesToolSearchInput(/a/, "")).toBe(false);
    // 未挂载时不匹配不应留下 pending（挂载后也不会被写入）
    const { feed, useFeedValue } = createToolSearchFeed(/^\d+\+\d+$/);
    feed("计算器");
    feed("not-an-expr");
    // useFeedValue 存在即可被工具挂载；此处仅确认 create 可用
    expect(typeof useFeedValue).toBe("function");
  });
});

describe("各工具 inputPattern：工具名不命中，可解析样例命中", () => {
  const cases: Array<{
    name: string;
    pattern: RegExp;
    toolNames: string[];
    samples: string[];
  }> = [
    {
      name: "calculator",
      pattern: PATTERNS.calculator,
      toolNames: ["计算器", "calculator", "算式"],
      samples: ["89+33", "(1+2)*3", "sqrt(16)"],
    },
    {
      name: "timestamp",
      pattern: PATTERNS.timestamp,
      toolNames: ["时间戳转换", "timestamp"],
      samples: ["1700000000", "2026-10-13", "2026/10/13 15:30:00"],
    },
    {
      name: "timecalc",
      pattern: PATTERNS.timecalc,
      toolNames: ["时间计算器", "timecalc"],
      samples: ["2026-10-13", "2026/10/13 15:30:00"],
    },
    {
      name: "color",
      pattern: PATTERNS.color,
      toolNames: ["颜色转换", "color"],
      samples: ["#ff5500", "rgb(255, 85, 0)"],
    },
    {
      name: "url-parse",
      pattern: PATTERNS["url-parse"],
      toolNames: ["URL解析", "url-parse"],
      samples: ["https://example.com/a?b=1"],
    },
    {
      name: "url",
      pattern: PATTERNS.url,
      toolNames: ["URL编解码", "url"],
      samples: ["hello%20world"],
    },
    {
      name: "base64",
      pattern: PATTERNS.base64,
      toolNames: ["Base64", "base64"],
      samples: ["SGVsbG8gV29ybGQ="],
    },
    {
      name: "jwt",
      pattern: PATTERNS.jwt,
      toolNames: ["JWT解析", "jwt"],
      samples: ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"],
    },
    {
      name: "morse",
      pattern: PATTERNS.morse,
      toolNames: ["摩斯电码", "morse"],
      samples: ["... --- ..."],
    },
    {
      name: "json",
      pattern: PATTERNS.json,
      toolNames: ["JSON工具", "json"],
      samples: ['{"a":1}', "[1,2,3]"],
    },
    {
      name: "regex",
      pattern: PATTERNS.regex,
      toolNames: ["正则测试", "regex"],
      samples: ["/foo+/gi"],
    },
    {
      name: "radix",
      pattern: PATTERNS.radix,
      toolNames: ["进制转换", "radix"],
      samples: ["0xff", "0b1010"],
    },
    {
      name: "id-card",
      pattern: PATTERNS["id-card"],
      toolNames: ["身份证校验", "id-card"],
      samples: ["11010519491231002X"],
    },
    {
      name: "punycode",
      pattern: PUNYCODE_SEARCH_FEED.pattern,
      toolNames: ["Punycode", "punycode"],
      samples: ["xn--bcher-kva"],
    },
    {
      name: "ulid",
      pattern: ULID_SEARCH_FEED.pattern,
      toolNames: ["ULID", "ulid"],
      samples: ["01ARZ3NDEKTSV4RRFFQ69G5FAV"],
    },
    {
      name: "mac",
      pattern: MAC_SEARCH_FEED.pattern,
      toolNames: ["MAC地址", "mac"],
      samples: ["aa:bb:cc:dd:ee:ff", "AA-BB-CC-DD-EE-FF"],
    },
    {
      name: "curl",
      pattern: CURL_SEARCH_FEED.pattern,
      toolNames: ["cURL解析", "curl"],
      samples: ["curl https://example.com"],
    },
    {
      name: "ipv6",
      pattern: IPV6_SEARCH_FEED.pattern,
      toolNames: ["IPv6", "ipv6"],
      samples: ["2001:db8::1"],
    },
  ];

  for (const c of cases) {
    it(`${c.name}: 工具名不命中`, () => {
      for (const name of c.toolNames) {
        expect(matchesToolSearchInput(c.pattern, name), name).toBe(false);
      }
    });
    it(`${c.name}: 可解析样例命中`, () => {
      for (const sample of c.samples) {
        expect(matchesToolSearchInput(c.pattern, sample), sample).toBe(true);
      }
    });
  }
});
