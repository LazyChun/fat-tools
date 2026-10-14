/*
 * 电子发票处理核心逻辑（纯函数，不依赖 DOM / pdf.js，便于 vitest 单测）
 *
 * 面向中国电子发票 PDF（数电票 / 增值税电子发票 / 通用电子发票等）：
 *  - parseInvoiceText：从 pdf.js 提取的页面文本中解析关键字段
 *  - invoiceFileName：按命名模板生成安全文件名
 *  - archiveFolderFor：按归档规则计算目标目录
 *  - invoicesToCsv：导出提取结果 CSV
 */

/** 发票解析结果 */
export interface InvoiceInfo {
  /** 发票号码（数电票 20 位 / 老式 8 位） */
  invoiceNo: string;
  /** 发票代码（老式 12 位，数电票无） */
  invoiceCode: string;
  /** 开票日期，归一化为 YYYY-MM-DD；无法解析为空串 */
  date: string;
  /** 价税合计金额（元）；无法解析为 null */
  amount: number | null;
  /** 购买方名称 */
  buyer: string;
  /** 销售方名称 */
  seller: string;
  /** 购买方统一社会信用代码 / 纳税人识别号 */
  buyerTaxId: string;
  /** 销售方统一社会信用代码 / 纳税人识别号 */
  sellerTaxId: string;
  /** 发票类型（数电票 / 增值税电子普通发票 …） */
  type: string;
  /** 缺失字段名列表（便于 UI 提示哪些字段没提取到） */
  missing: string[];
}

/** 创建一条空发票记录（供字段合并） */
function emptyInvoice(): InvoiceInfo {
  return {
    invoiceNo: "",
    invoiceCode: "",
    date: "",
    amount: null,
    buyer: "",
    seller: "",
    buyerTaxId: "",
    sellerTaxId: "",
    type: "",
    missing: [],
  };
}

/** 去掉全部空白（含全角空格），发票字段值不含空格，便于跨行匹配 */
function normalize(s: string): string {
  return s.replace(/[\s\u3000\u00a0]/g, "");
}

/** 返回候选正则中第一个命中，未命中返回 null */
function pickRe(
  patterns: RegExp[],
  src: string,
): RegExpMatchArray | null {
  for (const re of patterns) {
    const m = src.match(re);
    if (m) return m;
  }
  return null;
}

/** 从某个起点字段名到下一个已知字段名之间取「字段名: 值」 */
function fieldAfter(
  seg: string,
  name: string,
  stopNames: string[],
): string {
  const idx = seg.indexOf(name);
  if (idx < 0) return "";
  const rest = seg.slice(idx + name.length).replace(/^[:：]?\s*/, "");
  const stopRe = new RegExp(stopNames.join("|"));
  const end = stopRe.exec(rest);
  const raw = end ? rest.slice(0, end.index) : rest;
  // 截取到段内出现的其它常见字段分隔（地址、电话、开户行、账号、备注）
  const cut = /(?:地址|电话|开户行|账号|备注|复核|收款人|开票人)/.exec(raw);
  return (cut ? raw.slice(0, cut.index) : raw).trim();
}

/** 去掉值尾部的杂字（如「元整」「）」「(」等残留） */
function cleanValue(v: string): string {
  return v.replace(/[（(].*$/, "").replace(/[）)]$/, "").trim();
}

/** 金额文本 → 数值（支持千分位与 ¥ 符号） */
function parseAmountText(s: string): number | null {
  const m = s.match(/(\d[\d,]*)(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, "") + (m[2] ? `.${m[2]}` : ""));
  return Number.isFinite(v) ? v : null;
}

/**
 * 从 pdf.js 提取的发票 PDF 文本中解析关键字段。
 * 兼容数电票（20 位号码）与传统电子发票（代码 12 位 + 号码 8 位）。
 */
export function parseInvoiceText(text: string): InvoiceInfo {
  const out = emptyInvoice();
  const src = normalize(text);
  if (!src) {
    out.missing = ["invoiceNo", "date", "amount", "buyer", "seller"];
    return out;
  }

  // ── 发票类型 ──
  const typeM = pickRe(
    [
      /(数电票（[^）]+）)/,
      /(电子发票（[^）]+）)/,
      /(增值税电子[^（\s]+)/,
      /(增值税[^（\s]{0,4}发票)/,
      /(通用电子发票)/,
    ],
    src,
  );
  if (typeM) out.type = typeM[1].trim();

  // ── 发票号码 / 代码 ──
  // 数电票：发票号码：20 位数字；老式：发票代码 12 位 + 发票号码 8 位
  const noM = pickRe(
    [
      /发票号码[:：]?\s*(\d{20})/,
      /发票号码[:：]?\s*(\d{8})/,
      /(?:号码|NO\.?)[:：]?\s*(\d{20})/i,
    ],
    src,
  );
  if (noM) out.invoiceNo = noM[1];
  const codeM = src.match(/发票代码[:：]?\s*(\d{12})/);
  if (codeM) out.invoiceCode = codeM[1];

  // ── 开票日期（中文年月日 或 数字连写） ──
  const dateM = pickRe(
    [
      /开票日期[:：]?\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/,
      /开票日期[:：]?\s*(\d{4})-(\d{1,2})-(\d{1,2})/,
      /开票日期[:：]?\s*(\d{4})(\d{2})(\d{2})/,
    ],
    src,
  );
  if (dateM) {
    const [, y, mo, d] = dateM;
    out.date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // ── 价税合计（优先「（小写）¥xx」形态，兜底找合计后的数字） ──
  const amountM = pickRe(
    [
      /价税合计[^¥￥]*[¥￥]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/,
      /(?:价税合计|合计)[^0-9]*([0-9,]+(?:\.[0-9]{1,2})?)/,
    ],
    src,
  );
  if (amountM) {
    const v = parseAmountText(amountM[1]);
    if (v !== null) out.amount = v;
  }

  // ── 购买方 / 销售方信息段 ──
  const buyerSeg = segmentBetween(src, "购买方", "销售方");
  const sellerSeg = segmentBetween(src, "销售方", undefined, "购买方");
  const stopNames = [
    "统一社会信用代码",
    "纳税人识别号",
    "地址、电话",
    "开户行及账号",
  ];
  if (buyerSeg) {
    out.buyer = cleanValue(fieldAfter(buyerSeg, "名称", stopNames));
    out.buyerTaxId = cleanValue(
      extractTaxId(buyerSeg) || fieldAfter(buyerSeg, "纳税人识别号", ["地址、电话", "开户行及账号"]),
    );
  }
  if (sellerSeg) {
    out.seller = cleanValue(fieldAfter(sellerSeg, "名称", stopNames));
    out.sellerTaxId = cleanValue(
      extractTaxId(sellerSeg) || fieldAfter(sellerSeg, "纳税人识别号", ["地址、电话", "开户行及账号"]),
    );
  }

  // ── 缺失字段标记 ──
  const missing: string[] = [];
  if (!out.invoiceNo) missing.push("invoiceNo");
  if (!out.date) missing.push("date");
  if (out.amount === null) missing.push("amount");
  if (!out.buyer) missing.push("buyer");
  if (!out.seller) missing.push("seller");
  out.missing = missing;

  return out;
}

/** 取段内的统一社会信用代码 / 纳税人识别号（兼容「统一社会信用代码/纳税人识别号：xxx」复合标签） */
function extractTaxId(seg: string): string {
  const m = seg.match(
    /(?:统一社会信用代码|纳税人识别号)[^0-9A-Z]*([0-9A-Z]{15,20})/,
  );
  return m ? m[1] : "";
}

/** 取 from 到 to（或 from 到文末）之间的文本；from 不存在返回 null */
function segmentBetween(
  src: string,
  from: string,
  to?: string,
  fromEnd?: string,
): string | null {
  const start = src.indexOf(from);
  if (start < 0) return null;
  const begin = start + from.length;
  const endOf = to ?? fromEnd;
  const end = endOf ? src.indexOf(endOf, begin) : -1;
  return end < 0 ? src.slice(begin) : src.slice(begin, end);
}

/* ── 命名模板 ─────────────────────────────────────────────── */

/** 模板占位符说明（UI 展示用） */
export const INVOICE_TEMPLATE_TOKENS: { token: string; desc: string }[] = [
  { token: "{date}", desc: "开票日期（YYYY-MM-DD）" },
  { token: "{invoiceNo}", desc: "发票号码" },
  { token: "{seller}", desc: "销售方名称" },
  { token: "{buyer}", desc: "购买方名称" },
  { token: "{amount}", desc: "价税合计金额" },
  { token: "{type}", desc: "发票类型" },
  { token: "{index}", desc: "序号（从 1 开始）" },
];

export const DEFAULT_INVOICE_TEMPLATE = "{date}_{seller}_{invoiceNo}";

/** 渲染命名模板：未知字段 / 缺失字段留空并折叠连续分隔符 */
export function renderInvoiceTemplate(
  template: string,
  info: InvoiceInfo,
  index: number,
): string {
  const values: Record<string, string> = {
    date: info.date,
    invoiceNo: info.invoiceNo,
    seller: info.seller,
    buyer: info.buyer,
    amount: info.amount !== null ? String(info.amount) : "",
    type: info.type,
    index: String(index),
  };
  let name = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key];
    return v === undefined ? "" : v;
  });
  name = name
    // 折叠连续的下划线 / 短横线 / 空格，避免缺失字段留下 `__`
    .replace(/[_\- ]{2,}/g, "_")
    .replace(/^[_\- ]+|[_\- ]+$/g, "");
  return invoiceFileNameSafe(name);
}

/** 文件名安全化：剔除 Windows / 跨平台非法字符，去首尾空白与分隔符 */
export function invoiceFileNameSafe(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[_\- ]+|[_\- ]+$/g, "")
    .replace(/[. ]+$/g, "");
  return cleaned || "invoice";
}

/* ── 归档规则 ─────────────────────────────────────────────── */

export type ArchiveMode = "flat" | "year-month" | "seller" | "buyer" | "type";

export const ARCHIVE_MODES: { value: ArchiveMode; label: string; hint: string }[] = [
  { value: "flat", label: "不归档（平铺）", hint: "所有文件直接放在 ZIP 根目录" },
  { value: "year-month", label: "按开票年月", hint: "如 2026/10/xxx.pdf" },
  { value: "seller", label: "按销售方", hint: "如 北京XX科技有限公司/xxx.pdf" },
  { value: "buyer", label: "按购买方", hint: "如 个人/xxx.pdf" },
  { value: "type", label: "按发票类型", hint: "如 数电票/xxx.pdf" },
];

/** 计算某张发票在归档中的目录（相对路径，空串表示根目录） */
export function archiveFolderFor(info: InvoiceInfo, mode: ArchiveMode): string {
  switch (mode) {
    case "year-month": {
      const m = info.date.match(/^(\d{4})-(\d{2})/);
      return m ? `${m[1]}/${m[2]}` : "未识别日期";
    }
    case "seller":
      return invoiceFileNameSafe(info.seller) || "未识别销售方";
    case "buyer":
      return invoiceFileNameSafe(info.buyer) || "未识别购买方";
    case "type":
      return invoiceFileNameSafe(info.type) || "未识别类型";
    case "flat":
    default:
      return "";
  }
}

/* ── CSV 导出 ─────────────────────────────────────────────── */

export interface InvoiceRow {
  fileName: string;
  info: InvoiceInfo;
}

/** 提取结果 → CSV 文本（UTF-8 BOM，Excel 直接打开不乱码） */
export function invoicesToCsv(rows: InvoiceRow[]): string {
  const esc = (v: string | number | null): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    "文件名",
    "发票号码",
    "发票代码",
    "开票日期",
    "价税合计",
    "购买方名称",
    "销售方名称",
    "购买方税号",
    "销售方税号",
    "发票类型",
    "缺失字段",
  ];
  const lines = [
    head.join(","),
    ...rows.map((r) =>
      [
        esc(r.fileName),
        esc(r.info.invoiceNo),
        esc(r.info.invoiceCode),
        esc(r.info.date),
        esc(r.info.amount),
        esc(r.info.buyer),
        esc(r.info.seller),
        esc(r.info.buyerTaxId),
        esc(r.info.sellerTaxId),
        esc(r.info.type),
        esc(r.info.missing.join("、")),
      ].join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
