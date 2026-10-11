/*
 * 网站导航工具：数据模型、纯函数与本地持久化
 *
 * 数据层级：NavPage（导航页）→ NavGroup（分组）→ NavLink（网站链接）
 * 支持任意多个导航页；全部配置保存在 localStorage，可整体导出 / 导入 JSON。
 */

// ── 类型定义 ──────────────────────────────────────────────────

export interface NavLink {
  id: string;
  title: string;
  /** 规范化后的完整 URL（带 http/https 协议） */
  url: string;
  /** 备注（可选，卡片上以副标题 / tooltip 展示） */
  desc?: string;
  /**
   * 自定义图标（可选）：
   * - 以 http(s)://、/、data: 开头时当作图片地址
   * - 其它内容按文字 / emoji 渲染
   * 为空时自动使用站点 favicon，失败回退首字母方块
   */
  icon?: string;
}

export interface NavGroup {
  id: string;
  title: string;
  links: NavLink[];
}

export interface NavPage {
  id: string;
  name: string;
  groups: NavGroup[];
}

/** 导出文件结构 */
export interface NavExport {
  type: "fat-tools.nav";
  version: number;
  pages: NavPage[];
  exportedAt: string;
}

// ── 常量 ──────────────────────────────────────────────────────

export const NAV_EXPORT_TYPE = "fat-tools.nav";
export const NAV_DATA_VERSION = 1;

const LS_PAGES_KEY = "fat-tools.navPages.v1";
const LS_ACTIVE_KEY = "fat-tools.navActivePage.v1";

// ── 基础工具 ──────────────────────────────────────────────────

/** 生成短随机 id（同其它工具的 id 风格） */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampText(v: unknown, max: number, fallback = ""): string {
  const s = typeof v === "string" ? v.trim() : String(v ?? "").trim();
  return s ? s.slice(0, max) : fallback;
}

// ── URL 处理 ──────────────────────────────────────────────────

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCALHOST_RE = /^localhost(?::\d+)?(?:[/?#]|$)/i;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/;
const IPV6_RE = /^\[[0-9a-f:]+](?::\d+)?(?:[/?#]|$)/i;

/**
 * 规范化用户输入的网址：
 * - 已有协议（含非 http 协议）原样返回
 * - localhost / 127.0.0.1 / [::1] 补 http://
 * - 其它（域名 / 带端口的主机名）补 https://
 */
export function normalizeUrl(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  if (SCHEME_RE.test(s)) return s;
  if (LOCALHOST_RE.test(s) || IPV4_RE.test(s) || IPV6_RE.test(s)) {
    return `http://${s}`;
  }
  return `https://${s}`;
}

/** 是否为可打开的 http(s) 链接且主机名合法 */
export function isValidHttpUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (!u.hostname) return false;
    if (/\s/.test(url)) return false;
    return true;
  } catch {
    return false;
  }
}

/** 取展示用域名（去掉 www. 前缀与末尾点号） */
export function getDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/\.$/, "");
    return host.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * favicon 自动获取候选列表（按顺序尝试，全部失败由组件回退首字母）：
 * 1. 站点自身 /favicon.ico —— 不依赖第三方服务，国内网络也可用
 * 2. Google favicon 服务 —— 兜底获取高清图标
 */
export function faviconCandidates(url: string): string[] {
  let origin = "";
  let host = "";
  try {
    const u = new URL(url);
    origin = u.origin;
    host = u.hostname;
  } catch {
    return [];
  }
  const list: string[] = [];
  if (origin) list.push(`${origin}/favicon.ico`);
  if (host)
    list.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    );
  return list;
}

/** 自定义图标字段是否应作为图片渲染 */
export function isImageIcon(icon: string | undefined): boolean {
  if (!icon) return false;
  const s = icon.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("/") || s.startsWith("data:");
}

/** 根据字符串生成稳定的色相（用于首字母方块底色） */
export function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

// ── 默认数据（首次使用时播种） ────────────────────────────────

function link(title: string, url: string, desc?: string): NavLink {
  return { id: uid(), title, url, desc };
}

export function defaultPages(): NavPage[] {
  return [
    {
      id: uid(),
      name: "常用导航",
      groups: [
        {
          id: uid(),
          title: "搜索引擎",
          links: [
            link("百度", "https://www.baidu.com", "全球最大中文搜索引擎"),
            link("Google", "https://www.google.com", "全球搜索"),
            link("必应", "https://www.bing.com", "微软搜索引擎"),
            link("搜狗", "https://www.sogou.com", "微信 / 知乎内容检索"),
          ],
        },
        {
          id: uid(),
          title: "常用网站",
          links: [
            link("知乎", "https://www.zhihu.com", "问答社区"),
            link("微博", "https://weibo.com", "热点资讯社交平台"),
            link("哔哩哔哩", "https://www.bilibili.com", "弹幕视频网站"),
            link("豆瓣", "https://www.douban.com", "书影音评分评论"),
            link("淘宝", "https://www.taobao.com", "网上购物"),
            link("京东", "https://www.jd.com", "正品自营电商"),
          ],
        },
        {
          id: uid(),
          title: "影音娱乐",
          links: [
            link("网易云音乐", "https://music.163.com", "在线音乐"),
            link("优酷", "https://www.youku.com", "在线视频"),
            link("YouTube", "https://www.youtube.com", "全球视频平台"),
          ],
        },
      ],
    },
    {
      id: uid(),
      name: "开发导航",
      groups: [
        {
          id: uid(),
          title: "代码社区",
          links: [
            link("GitHub", "https://github.com", "全球最大代码托管平台"),
            link("Stack Overflow", "https://stackoverflow.com", "编程问答社区"),
            link("掘金", "https://juejin.cn", "中文技术社区"),
            link("V2EX", "https://www.v2ex.com", "创意工作者社区"),
            link("CSDN", "https://www.csdn.net", "中文开发者社区"),
          ],
        },
        {
          id: uid(),
          title: "文档手册",
          links: [
            link(
              "MDN Web Docs",
              "https://developer.mozilla.org",
              "Web 权威文档",
            ),
            link("React", "https://react.dev", "React 官方文档"),
            link("TypeScript", "https://www.typescriptlang.org", "TS 官方文档"),
            link("Ant Design", "https://ant.design", "企业级 UI 组件库"),
            link("Python", "https://docs.python.org", "Python 官方文档"),
          ],
        },
        {
          id: uid(),
          title: "工具服务",
          links: [
            link("npm", "https://www.npmjs.com", "Node 包仓库"),
            link("Docker Hub", "https://hub.docker.com", "容器镜像仓库"),
            link("Can I Use", "https://caniuse.com", "浏览器特性兼容表"),
            link("CodePen", "https://codepen.io", "在线前端练习场"),
            link("RegExr", "https://regexr.com", "正则表达式在线测试"),
          ],
        },
      ],
    },
    {
      id: uid(),
      name: "AI 导航",
      groups: [
        {
          id: uid(),
          title: "AI 助手",
          links: [
            link("ChatGPT", "https://chat.openai.com", "OpenAI 对话模型"),
            link("Claude", "https://claude.ai", "Anthropic 对话模型"),
            link("DeepSeek", "https://chat.deepseek.com", "深度求索 AI"),
            link("豆包", "https://www.doubao.com", "字节跳动 AI 助手"),
            link("Kimi", "https://kimi.moonshot.cn", "月之暗面长文本助手"),
            link("通义千问", "https://tongyi.aliyun.com", "阿里大模型"),
          ],
        },
      ],
    },
  ];
}

// ── 数据规范化（读取本地 / 导入文件时统一校验） ───────────────

function normalizeLink(raw: unknown): NavLink | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = clampText(o.title, 60);
  const url = normalizeUrl(clampText(o.url, 2048));
  if (!title || !isValidHttpUrl(url)) return null;
  const link: NavLink = { id: clampText(o.id, 64) || uid(), title, url };
  const desc = clampText(o.desc, 200);
  if (desc) link.desc = desc;
  const icon = clampText(o.icon, 500);
  if (icon) link.icon = icon;
  return link;
}

function normalizeGroup(raw: unknown): NavGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = clampText(o.title, 60) || "未命名分组";
  const linksRaw = Array.isArray(o.links) ? o.links : [];
  const links = linksRaw
    .map(normalizeLink)
    .filter((x): x is NavLink => x !== null);
  // 空分组也保留（用户可能刚建好分组还没加链接）
  return { id: clampText(o.id, 64) || uid(), title, links };
}

function normalizePage(raw: unknown): NavPage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const groupsRaw = Array.isArray(o.groups) ? o.groups : [];
  const groups = groupsRaw
    .map(normalizeGroup)
    .filter((x): x is NavGroup => x !== null);
  const name = clampText(o.name, 40) || "未命名导航页";
  return { id: clampText(o.id, 64) || uid(), name, groups };
}

/** 容错解析任意来源数据为导航页数组（非法输入返回空数组） */
export function normalizePages(raw: unknown): NavPage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePage).filter((x): x is NavPage => x !== null);
}

/** 统计全部链接数量 */
export function countLinks(pages: NavPage[]): number {
  return pages.reduce(
    (sum, p) => sum + p.groups.reduce((s, g) => s + g.links.length, 0),
    0,
  );
}

/**
 * 关键字过滤当前页：返回仅包含命中链接的分组（标题 / 域名 / 备注 / URL）。
 * 空关键字返回原页；没有任何命中时返回 groups 为空的页对象。
 */
export function filterPage(page: NavPage, query: string): NavPage {
  const q = query.trim().toLowerCase();
  if (!q) return page;
  const groups = page.groups
    .map((g) => {
      const links = g.links.filter((l) => {
        const domain = getDomain(l.url);
        return (
          l.title.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          domain.toLowerCase().includes(q) ||
          (l.desc || "").toLowerCase().includes(q)
        );
      });
      return links.length ? { ...g, links } : null;
    })
    .filter((x): x is NavGroup => x !== null);
  return { ...page, groups };
}

// ── 不可变更新操作（便于测试与撤销） ──────────────────────────

function mapPages(
  pages: NavPage[],
  pageId: string,
  fn: (p: NavPage) => NavPage,
): NavPage[] {
  return pages.map((p) => (p.id === pageId ? fn(p) : p));
}

function mapGroups(
  groups: NavGroup[],
  groupId: string,
  fn: (g: NavGroup) => NavGroup,
): NavGroup[] {
  return groups.map((g) => (g.id === groupId ? fn(g) : g));
}

function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** 新增或更新链接（link.id 已存在则覆盖；需指定所在分组） */
export function upsertLink(
  pages: NavPage[],
  pageId: string,
  groupId: string,
  link: NavLink,
): NavPage[] {
  return mapPages(pages, pageId, (p) => ({
    ...p,
    groups: mapGroups(p.groups, groupId, (g) => {
      const idx = g.links.findIndex((l) => l.id === link.id);
      if (idx >= 0) {
        const links = g.links.slice();
        links[idx] = link;
        return { ...g, links };
      }
      return { ...g, links: [...g.links, link] };
    }),
  }));
}

export function deleteLink(
  pages: NavPage[],
  pageId: string,
  groupId: string,
  linkId: string,
): NavPage[] {
  return mapPages(pages, pageId, (p) => ({
    ...p,
    groups: mapGroups(p.groups, groupId, (g) => ({
      ...g,
      links: g.links.filter((l) => l.id !== linkId),
    })),
  }));
}

export function moveLink(
  pages: NavPage[],
  pageId: string,
  groupId: string,
  linkId: string,
  delta: -1 | 1,
): NavPage[] {
  const page = pages.find((p) => p.id === pageId);
  const group = page?.groups.find((g) => g.id === groupId);
  const idx = group?.links.findIndex((l) => l.id === linkId) ?? -1;
  // 不存在或已到边界：返回原引用（避免无谓重渲染）
  if (!group || idx < 0 || idx + delta < 0 || idx + delta >= group.links.length)
    return pages;
  return mapPages(pages, pageId, (p) => ({
    ...p,
    groups: mapGroups(p.groups, groupId, (g) => ({
      ...g,
      links: moveItem(g.links, idx, delta),
    })),
  }));
}

/** 新增或更新分组 */
export function upsertGroup(
  pages: NavPage[],
  pageId: string,
  group: NavGroup,
): NavPage[] {
  return mapPages(pages, pageId, (p) => {
    const idx = p.groups.findIndex((g) => g.id === group.id);
    if (idx >= 0) {
      const groups = p.groups.slice();
      groups[idx] = group;
      return { ...p, groups };
    }
    return { ...p, groups: [...p.groups, group] };
  });
}

export function deleteGroup(
  pages: NavPage[],
  pageId: string,
  groupId: string,
): NavPage[] {
  return mapPages(pages, pageId, (p) => ({
    ...p,
    groups: p.groups.filter((g) => g.id !== groupId),
  }));
}

export function moveGroup(
  pages: NavPage[],
  pageId: string,
  groupId: string,
  delta: -1 | 1,
): NavPage[] {
  const page = pages.find((p) => p.id === pageId);
  const idx = page?.groups.findIndex((g) => g.id === groupId) ?? -1;
  // 不存在或已到边界：返回原引用
  if (!page || idx < 0 || idx + delta < 0 || idx + delta >= page.groups.length)
    return pages;
  return mapPages(pages, pageId, (p) => ({
    ...p,
    groups: moveItem(p.groups, idx, delta),
  }));
}

/** 新增或更新导航页 */
export function upsertPage(pages: NavPage[], page: NavPage): NavPage[] {
  const idx = pages.findIndex((p) => p.id === page.id);
  if (idx >= 0) {
    const next = pages.slice();
    next[idx] = page;
    return next;
  }
  return [...pages, page];
}

export function deletePage(pages: NavPage[], pageId: string): NavPage[] {
  return pages.filter((p) => p.id !== pageId);
}

export function movePage(
  pages: NavPage[],
  pageId: string,
  delta: -1 | 1,
): NavPage[] {
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx < 0 || idx + delta < 0 || idx + delta >= pages.length) return pages;
  return moveItem(pages, idx, delta);
}

// ── 导入 / 导出 ───────────────────────────────────────────────

export function buildExport(pages: NavPage[]): NavExport {
  return {
    type: NAV_EXPORT_TYPE,
    version: NAV_DATA_VERSION,
    pages,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * 解析导入数据：
 * - 支持标准导出结构 { type: "fat-tools.nav", pages: [...] }
 * - 兼容直接粘贴页数组
 * 解析失败或无有效页面时返回 null（由调用方提示用户）
 */
export function parseImport(raw: unknown): NavPage[] | null {
  let candidate: unknown = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.type === NAV_EXPORT_TYPE || Array.isArray(o.pages)) {
      candidate = o.pages;
    } else {
      return null;
    }
  }
  const pages = normalizePages(candidate);
  return pages.length ? pages : null;
}

/** 解析 JSON 文本导入；JSON 非法返回 null */
export function parseImportText(text: string): NavPage[] | null {
  try {
    return parseImport(JSON.parse(text));
  } catch {
    return null;
  }
}

// ── localStorage 持久化 ───────────────────────────────────────

/** 读取导航页；首次使用（无存储）时返回内置默认页 */
export function loadPages(): NavPage[] {
  try {
    const raw = window.localStorage.getItem(LS_PAGES_KEY);
    if (raw === null) return defaultPages();
    const pages = normalizePages(JSON.parse(raw));
    return pages.length ? pages : defaultPages();
  } catch {
    return defaultPages();
  }
}

export function savePages(pages: NavPage[]): void {
  try {
    window.localStorage.setItem(LS_PAGES_KEY, JSON.stringify(pages));
  } catch {
    /* ignore */
  }
}

export function loadActivePageId(): string | null {
  try {
    return window.localStorage.getItem(LS_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActivePageId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(LS_ACTIVE_KEY, id);
    else window.localStorage.removeItem(LS_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
