/*
 * 人民币金额大写转换（财务/发票标准写法）
 *
 * 规则要点：
 *  - 大写数字：零壹贰叁肆伍陆柒捌玖，单位：拾佰仟万亿
 *  - 整数部分按「万 / 亿」四位一节，节间与节内零按中文规则补「零」
 *  - 小数部分为「角」「分」，有分则不加「整」，有角无分则在角后补「整」
 */

const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const INT_UNITS = ["", "拾", "佰", "仟"];
/** 四位一节的节单位（最多 4 节 = 16 位整数） */
const SECTION_UNITS = ["", "万", "亿", "万亿"];

/** 支持的最大整数位数（16 位，即千万亿级） */
export const MONEY_MAX_DIGITS = 16;

export interface MoneyUpperOptions {
  /** 货币单位：元（默认）/ 圆（传统写法） */
  unit?: "元" | "圆";
}

/** 单个四位小节转大写（保留节内零，去掉首位零） */
function sectionToUpper(section: string): string {
  let out = "";
  const n = section.length;
  let pendingZero = false;
  for (let i = 0; i < n; i++) {
    const d = section.charCodeAt(i) - 48;
    if (d === 0) {
      pendingZero = true;
      continue;
    }
    if (pendingZero && out) out += "零";
    out += DIGITS[d] + INT_UNITS[n - 1 - i];
    pendingZero = false;
  }
  return out;
}

/** 整数部分转大写（按节处理并补节间零） */
function integerToUpper(intPart: string): string {
  if (/^0*$/.test(intPart)) return "";
  const sections: string[] = [];
  for (let end = intPart.length; end > 0; end -= 4) {
    sections.unshift(intPart.slice(Math.max(0, end - 4), end));
  }
  let out = "";
  let prevZeroSection = false;
  sections.forEach((sec, idx) => {
    const unit = SECTION_UNITS[sections.length - 1 - idx] ?? "";
    if (Number(sec) === 0) {
      prevZeroSection = true;
      return;
    }
    // 上一节为零，或本节高位为零（本节内部零已被去掉），都需要补一个「零」
    if (out && (prevZeroSection || (sec.length === 4 && sec.startsWith("0"))))
      out += "零";
    out += sectionToUpper(sec) + unit;
    prevZeroSection = false;
  });
  return out;
}

/**
 * 金额转人民币大写。
 * 支持带千分位逗号、货币符号、正负号的输入，最多两位小数（角、分）。
 * 非法输入会抛出 Error（由调用方展示）。
 */
export function amountToChineseUpper(
  input: string | number,
  options: MoneyUpperOptions = {},
): string {
  const unit = options.unit === "圆" ? "圆" : "元";
  const raw = String(input == null ? "" : input)
    .trim()
    .replace(/[¥￥,\s]/g, "");
  if (!raw) throw new Error("请输入金额");

  const matched = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!matched || (!matched[2] && !matched[3])) {
    throw new Error("金额格式不正确（示例：1234.56）");
  }
  const negative = matched[1] === "-";
  const frac = matched[3] || "";
  if (frac.length > 2) throw new Error("最多支持两位小数（角、分）");

  // 去掉整数部分的前导零（保留单个 0）
  const intPart = (matched[2] || "0").replace(/^0+(?=\d)/, "");
  if (intPart.length > MONEY_MAX_DIGITS) {
    throw new Error(`金额过大，整数部分最多 ${MONEY_MAX_DIGITS} 位`);
  }

  const jiao = frac.length >= 1 ? Number(frac[0]) : 0;
  const fen = frac.length >= 2 ? Number(frac[1]) : 0;

  const intUpper = integerToUpper(intPart);
  let out = intUpper ? `${intUpper}${unit}` : `零${unit}`;

  let fracStr = "";
  if (jiao > 0) fracStr += `${DIGITS[jiao]}角`;
  if (jiao === 0 && fen > 0) fracStr += "零";
  if (fen > 0) fracStr += `${DIGITS[fen]}分`;
  out += fracStr;
  // 无分（含整元/整角）时补「整」
  if (fen === 0) out += "整";

  return negative ? `负${out}` : out;
}

/** 千分位格式化（用于结果对照展示） */
export function formatAmountWithCommas(input: string | number): string {
  const raw = String(input == null ? "" : input)
    .trim()
    .replace(/[¥￥,\s]/g, "");
  const matched = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!matched) return String(input);
  const sign = matched[1] === "-" ? "-" : "";
  const intPart = (matched[2] || "0").replace(/^0+(?=\d)/, "");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${matched[3] ? `.${matched[3]}` : ""}`;
}
