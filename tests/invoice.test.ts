/*
 * 发票工具核心逻辑单测（src/tools/invoice/core.ts）
 */
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_MODES,
  DEFAULT_INVOICE_TEMPLATE,
  archiveFolderFor,
  invoiceFileNameSafe,
  invoicesToCsv,
  parseInvoiceText,
  renderInvoiceTemplate,
} from "../src/tools/invoice/core";

/** 数电票（增值税专用发票）典型文本布局 */
const SHU_DIAN_TEXT = `数电票（增值税专用发票）
发票号码：24302400000012345678
开票日期：2026年10月14日
购买方信息
名称：武汉某某科技有限公司
统一社会信用代码/纳税人识别号：91420100MA4KXXXXX1
地址、电话：武汉市东湖高新区 027-88886666
开户行及账号：中国银行武汉光谷支行
项目名称 金额 税率 税额
技术服务费 1000.00 6% 60.00
价税合计（大写）壹仟零陆拾元整（小写）¥1060.00
销售方信息
名称：北京某某信息技术有限公司
统一社会信用代码/纳税人识别号：91110108MA0XXXXX2
地址、电话：北京市海淀区 010-66668888
开户行及账号：招商银行北京分行
备注：无
收款人：张三 复核：李四 开票人：王五`;

/** 老式电子发票（代码 12 位 + 号码 8 位） */
const LEGACY_TEXT = `电子发票（增值税普通发票）
发票代码：011002000111
发票号码：12345678
开票日期：2025年08月15日
购买方
名称：张三
纳税人识别号：420111199001011234
地址、电话：武汉市江岸区
开户行及账号：农业银行
商品名称 金额 税额
办公用品 300.00 39.00
价税合计（大写）叁佰元整（小写）¥300.00
销售方
名称：武汉某某超市有限公司
纳税人识别号：91420100MA4KXXXXX3
地址、电话：武汉市江汉区
开户行及账号：工商银行`;

describe("发票工具：parseInvoiceText 数电票", () => {
  it("提取号码 / 日期 / 金额 / 购销方与税号", () => {
    const info = parseInvoiceText(SHU_DIAN_TEXT);
    expect(info.invoiceNo).toBe("24302400000012345678");
    expect(info.invoiceCode).toBe("");
    expect(info.date).toBe("2026-10-14");
    expect(info.amount).toBe(1060);
    expect(info.buyer).toBe("武汉某某科技有限公司");
    expect(info.seller).toBe("北京某某信息技术有限公司");
    expect(info.buyerTaxId).toBe("91420100MA4KXXXXX1");
    expect(info.sellerTaxId).toBe("91110108MA0XXXXX2");
    expect(info.type).toContain("数电票");
    expect(info.missing).toEqual([]);
  });
});

describe("发票工具：parseInvoiceText 老式电子发票", () => {
  it("提取代码 + 8 位号码与日期金额", () => {
    const info = parseInvoiceText(LEGACY_TEXT);
    expect(info.invoiceCode).toBe("011002000111");
    expect(info.invoiceNo).toBe("12345678");
    expect(info.date).toBe("2025-08-15");
    expect(info.amount).toBe(300);
    expect(info.buyer).toBe("张三");
    expect(info.seller).toBe("武汉某某超市有限公司");
    expect(info.missing).toEqual([]);
  });
});

describe("发票工具：parseInvoiceText 异常输入", () => {
  it("空文本（扫描件）标记全部缺失", () => {
    const info = parseInvoiceText("");
    expect(info.missing).toContain("invoiceNo");
    expect(info.missing).toContain("date");
    expect(info.amount).toBeNull();
  });

  it("部分字段缺失时仅标记缺失项", () => {
    const info = parseInvoiceText("发票号码：24302400000012345678\n开票日期：2026年1月2日");
    expect(info.invoiceNo).toBe("24302400000012345678");
    expect(info.date).toBe("2026-01-02");
    expect(info.missing).toEqual(expect.arrayContaining(["buyer", "seller", "amount"]));
    expect(info.missing).not.toContain("invoiceNo");
  });
});

describe("发票工具：renderInvoiceTemplate", () => {
  const info = parseInvoiceText(SHU_DIAN_TEXT);

  it("默认模板：日期_销售方_号码", () => {
    const name = renderInvoiceTemplate(DEFAULT_INVOICE_TEMPLATE, info, 1);
    expect(name).toBe("2026-10-14_北京某某信息技术有限公司_24302400000012345678");
  });

  it("占位符缺失时折叠连续分隔符", () => {
    const name = renderInvoiceTemplate("{date}_{seller}_{invoiceNo}", {
      ...info,
      seller: "",
    }, 1);
    expect(name).toBe("2026-10-14_24302400000012345678");
  });

  it("{index} 序号递增", () => {
    expect(renderInvoiceTemplate("{index}", info, 3)).toBe("3");
  });

  it("非法字符被剔除", () => {
    const name = renderInvoiceTemplate("{seller}", {
      ...info,
      seller: "A/B:C*D?",
    }, 1);
    expect(name).toBe("ABCD");
  });
});

describe("发票工具：archiveFolderFor", () => {
  const info = parseInvoiceText(SHU_DIAN_TEXT);

  it("按年月分目录", () => {
    expect(archiveFolderFor(info, "year-month")).toBe("2026/10");
  });
  it("未识别日期归入未识别日期目录", () => {
    expect(archiveFolderFor({ ...info, date: "" }, "year-month")).toBe("未识别日期");
  });
  it("按销售方 / 购买方 / 类型分目录", () => {
    expect(archiveFolderFor(info, "seller")).toBe("北京某某信息技术有限公司");
    expect(archiveFolderFor(info, "buyer")).toBe("武汉某某科技有限公司");
    expect(archiveFolderFor(info, "type")).toBe("数电票（增值税专用发票）");
  });
  it("平铺模式返回空串", () => {
    expect(archiveFolderFor(info, "flat")).toBe("");
  });
  it("归档模式选项齐全", () => {
    expect(ARCHIVE_MODES.map((m) => m.value)).toEqual([
      "flat",
      "year-month",
      "seller",
      "buyer",
      "type",
    ]);
  });
});

describe("发票工具：invoiceFileNameSafe", () => {
  it("剔除 Windows 非法字符并去首尾分隔符", () => {
    expect(invoiceFileNameSafe('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
    expect(invoiceFileNameSafe("  __x__  ")).toBe("x");
    expect(invoiceFileNameSafe("...")).toBe("invoice");
  });
});

describe("发票工具：invoicesToCsv", () => {
  it("带 UTF-8 BOM、字段转义、金额数值", () => {
    const info = parseInvoiceText(SHU_DIAN_TEXT);
    const csv = invoicesToCsv([{ fileName: "2026-10-14_北京某某_发票", info }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("发票号码,发票代码,开票日期,价税合计");
    expect(csv).toContain("24302400000012345678");
    expect(csv).toContain("1060");
    expect(csv).toContain("武汉某某科技有限公司");
  });

  it("含逗号 / 引号字段被正确转义", () => {
    const info = parseInvoiceText(SHU_DIAN_TEXT);
    const csv = invoicesToCsv([
      {
        fileName: 'a,b"c',
        info: { ...info, seller: 'XX"科技,有限公司' },
      },
    ]);
    expect(csv).toContain('"a,b""c"');
    expect(csv).toContain('"XX""科技,有限公司"');
  });
});
