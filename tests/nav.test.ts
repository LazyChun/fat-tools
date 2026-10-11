/*
 * 网站导航工具纯函数单测：
 * URL 规范化、数据校验、过滤、不可变更新、导入导出
 */
import { describe, expect, it } from "vitest";
import {
  buildExport,
  countLinks,
  defaultPages,
  deleteGroup,
  deleteLink,
  deletePage,
  faviconCandidates,
  filterPage,
  getDomain,
  hueOf,
  isImageIcon,
  isValidHttpUrl,
  moveGroup,
  moveLink,
  movePage,
  NAV_EXPORT_TYPE,
  normalizePages,
  normalizeUrl,
  parseImport,
  parseImportText,
  upsertGroup,
  upsertLink,
  upsertPage,
  type NavGroup,
  type NavLink,
  type NavPage,
} from "../src/tools/navData";

/* ── 测试夹具 ─────────────────────────────────────────────── */

function makeLink(id: string, title: string, url: string, desc?: string): NavLink {
  return { id, title, url, desc };
}

function makePages(): NavPage[] {
  const g1: NavGroup = {
    id: "g1",
    title: "搜索",
    links: [
      makeLink("l1", "百度", "https://www.baidu.com", "中文搜索"),
      makeLink("l2", "Google", "https://google.com"),
    ],
  };
  const g2: NavGroup = {
    id: "g2",
    title: "开发",
    links: [makeLink("l3", "GitHub", "https://github.com")],
  };
  return [{ id: "p1", name: "主页", groups: [g1, g2] }];
}

/* ── URL 规范化 ───────────────────────────────────────────── */

describe("normalizeUrl", () => {
  it("空白输入返回空串", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });

  it("无协议域名补 https://", () => {
    expect(normalizeUrl("github.com")).toBe("https://github.com");
    expect(normalizeUrl("github.com/abc?x=1")).toBe("https://github.com/abc?x=1");
    expect(normalizeUrl("example.com:8443/path")).toBe("https://example.com:8443/path");
    expect(normalizeUrl("  baidu.com ")).toBe("https://baidu.com");
  });

  it("本地主机补 http://", () => {
    expect(normalizeUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeUrl("localhost")).toBe("http://localhost");
    expect(normalizeUrl("127.0.0.1:8080/api")).toBe("http://127.0.0.1:8080/api");
    expect(normalizeUrl("[::1]:8080")).toBe("http://[::1]:8080");
  });

  it("已有协议原样保留", () => {
    expect(normalizeUrl("https://a.com")).toBe("https://a.com");
    expect(normalizeUrl("http://a.com")).toBe("http://a.com");
    expect(normalizeUrl("ftp://files.com")).toBe("ftp://files.com");
  });
});

describe("isValidHttpUrl", () => {
  it("合法 http(s) 链接", () => {
    expect(isValidHttpUrl("https://github.com")).toBe(true);
    expect(isValidHttpUrl("http://localhost:3000/x")).toBe(true);
  });

  it("拒绝危险 / 非法链接", () => {
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("file:///c:/windows")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("https:// has space.com")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("getDomain", () => {
  it("去掉 www. 前缀", () => {
    expect(getDomain("https://www.baidu.com/s")).toBe("baidu.com");
    expect(getDomain("https://github.com")).toBe("github.com");
    expect(getDomain("http://localhost:3000")).toBe("localhost");
  });

  it("非法 URL 返回空串", () => {
    expect(getDomain("not-a-url")).toBe("");
  });
});

describe("faviconCandidates / isImageIcon / hueOf", () => {
  it("候选依次为站点 ico 与第三方服务", () => {
    const list = faviconCandidates("https://github.com/repo");
    expect(list[0]).toBe("https://github.com/favicon.ico");
    expect(list[1]).toContain("google.com/s2/favicons");
    expect(list[1]).toContain(encodeURIComponent("github.com"));
  });

  it("非法 URL 返回空候选", () => {
    expect(faviconCandidates("bad")).toEqual([]);
  });

  it("isImageIcon 区分图片地址与 emoji 文字", () => {
    expect(isImageIcon("https://a.com/x.png")).toBe(true);
    expect(isImageIcon("/static/x.png")).toBe(true);
    expect(isImageIcon("data:image/png;base64,xxxx")).toBe(true);
    expect(isImageIcon("🐙")).toBe(false);
    expect(isImageIcon("Git")).toBe(false);
    expect(isImageIcon(undefined)).toBe(false);
    expect(isImageIcon("")).toBe(false);
  });

  it("hueOf 稳定且落在 0-359", () => {
    const h = hueOf("github.com");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(hueOf("github.com")).toBe(h);
  });
});

/* ── 默认数据与规范化 ─────────────────────────────────────── */

describe("defaultPages / normalizePages", () => {
  it("默认播种多个页面，且全部链接 URL 合法", () => {
    const pages = defaultPages();
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const p of pages) {
      expect(p.id).toBeTruthy();
      expect(p.groups.length).toBeGreaterThan(0);
      for (const g of p.groups) {
        for (const l of g.links) {
          expect(l.title).toBeTruthy();
          expect(isValidHttpUrl(l.url)).toBe(true);
        }
      }
    }
  });

  it("丢弃标题或 URL 非法的链接，保留合法部分", () => {
    const pages = normalizePages([
      {
        id: "p",
        name: "页",
        groups: [
          {
            id: "g",
            title: "组",
            links: [
              { id: "ok", title: "A", url: "github.com" },
              { id: "noTitle", title: "  ", url: "https://a.com" },
              { id: "badUrl", title: "B", url: "javascript:alert(1)" },
              null,
            ],
          },
          null,
        ],
      },
      "not-an-object",
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0].groups).toHaveLength(1);
    expect(pages[0].groups[0].links).toHaveLength(1);
    expect(pages[0].groups[0].links[0].url).toBe("https://github.com");
  });

  it("空分组保留，缺省名称 / id 自动补全", () => {
    const pages = normalizePages([{ groups: [] }]);
    expect(pages).toHaveLength(1);
    expect(pages[0].name).toBe("未命名导航页");
    expect(pages[0].id).toBeTruthy();
    expect(pages[0].groups).toEqual([]);
  });

  it("非数组输入返回空数组", () => {
    expect(normalizePages(null)).toEqual([]);
    expect(normalizePages({})).toEqual([]);
    expect(normalizePages("x")).toEqual([]);
  });
});

describe("countLinks / filterPage", () => {
  it("countLinks 递归统计", () => {
    expect(countLinks(makePages())).toBe(3);
    expect(countLinks([])).toBe(0);
  });

  it("空关键字返回原页", () => {
    const pages = makePages();
    expect(filterPage(pages[0], "")).toBe(pages[0]);
    expect(filterPage(pages[0], "   ")).toBe(pages[0]);
  });

  it("按名称 / 域名 / 备注 / URL 命中，且只保留命中的分组", () => {
    const page = makePages()[0];
    const byTitle = filterPage(page, "github");
    expect(byTitle.groups).toHaveLength(1);
    expect(byTitle.groups[0].id).toBe("g2");

    const byDomain = filterPage(page, "baidu");
    expect(byDomain.groups[0].links.map((l) => l.id)).toEqual(["l1"]);

    const byDesc = filterPage(page, "中文搜索");
    expect(byDesc.groups[0].links.map((l) => l.id)).toEqual(["l1"]);

    const none = filterPage(page, "不存在的关键字xyz");
    expect(none.groups).toEqual([]);
  });
});

/* ── 不可变更新 ───────────────────────────────────────────── */

describe("链接更新", () => {
  it("upsertLink：新增与覆盖", () => {
    const pages = makePages();
    const added = upsertLink(pages, "p1", "g1", makeLink("l9", "New", "https://new.com"));
    expect(added[0].groups[0].links).toHaveLength(3);
    // 原数组不被修改
    expect(pages[0].groups[0].links).toHaveLength(2);

    const updated = upsertLink(added, "p1", "g1", makeLink("l9", "New2", "https://new2.com"));
    const g1 = updated[0].groups.find((g) => g.id === "g1")!;
    expect(g1.links).toHaveLength(3);
    expect(g1.links.find((l) => l.id === "l9")?.title).toBe("New2");
  });

  it("deleteLink / moveLink", () => {
    const pages = makePages();
    expect(deleteLink(pages, "p1", "g1", "l1")[0].groups[0].links.map((l) => l.id)).toEqual([
      "l2",
    ]);

    const moved = moveLink(pages, "p1", "g1", "l1", 1);
    expect(moved[0].groups[0].links.map((l) => l.id)).toEqual(["l2", "l1"]);
    // 越界移动返回原引用
    expect(moveLink(pages, "p1", "g1", "l1", -1)).toBe(pages);
    expect(moveLink(pages, "p1", "g1", "missing", 1)).toBe(pages);
  });
});

describe("分组更新", () => {
  it("新增 / 删除 / 排序分组", () => {
    const pages = makePages();
    const withNew = upsertGroup(pages, "p1", { id: "g3", title: "新组", links: [] });
    expect(withNew[0].groups.map((g) => g.id)).toEqual(["g1", "g2", "g3"]);

    expect(deleteGroup(withNew, "p1", "g2")[0].groups.map((g) => g.id)).toEqual(["g1", "g3"]);

    const moved = moveGroup(pages, "p1", "g1", 1);
    expect(moved[0].groups.map((g) => g.id)).toEqual(["g2", "g1"]);
    expect(moveGroup(pages, "p1", "g1", -1)).toBe(pages);
  });
});

describe("导航页更新", () => {
  it("新增 / 删除 / 排序导航页", () => {
    const pages = makePages();
    const p2: NavPage = { id: "p2", name: "次页", groups: [] };
    const two = upsertPage(pages, p2);
    expect(two.map((p) => p.id)).toEqual(["p1", "p2"]);

    expect(movePage(two, "p2", -1).map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(deletePage(two, "p1").map((p) => p.id)).toEqual(["p2"]);
    expect(movePage(two, "p1", -1)).toBe(two);
  });
});

/* ── 导入 / 导出 ──────────────────────────────────────────── */

describe("buildExport / parseImport", () => {
  it("标准导出结构可往返解析", () => {
    const pages = makePages();
    const exp = buildExport(pages);
    expect(exp.type).toBe(NAV_EXPORT_TYPE);
    expect(exp.version).toBe(1);
    expect(exp.exportedAt).toBeTruthy();

    const back = parseImport(exp);
    expect(back).not.toBeNull();
    expect(back![0].id).toBe("p1");
  });

  it("兼容裸数组；非法结构 / 空页面返回 null", () => {
    expect(parseImport(makePages())).toHaveLength(1);
    expect(parseImport({ type: "other" })).toBeNull();
    expect(parseImport({ type: NAV_EXPORT_TYPE, pages: [] })).toBeNull();
    expect(parseImport(null)).toBeNull();
    expect(parseImport(123)).toBeNull();
  });

  it("parseImportText：合法 JSON 解析，非法 JSON 为 null", () => {
    const text = JSON.stringify(buildExport(makePages()));
    expect(parseImportText(text)![0].name).toBe("主页");
    expect(parseImportText("{not json")).toBeNull();
  });
});
