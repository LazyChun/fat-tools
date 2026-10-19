/*
 * 中国大陆居民身份证号码：校验、信息提取、15 位升位
 *
 * 校验位算法：ISO 7064:1983 MOD 11-2
 * 权重 W = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]
 * 校验码映射：余数 0..10 → 1,0,X,9,8,7,6,5,4,3,2
 */

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_MAP = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

/** 省级行政区划（身份证前 2 位） */
export const PROVINCE_MAP: Record<string, string> = {
  "11": "北京市",
  "12": "天津市",
  "13": "河北省",
  "14": "山西省",
  "15": "内蒙古自治区",
  "21": "辽宁省",
  "22": "吉林省",
  "23": "黑龙江省",
  "31": "上海市",
  "32": "江苏省",
  "33": "浙江省",
  "34": "安徽省",
  "35": "福建省",
  "36": "江西省",
  "37": "山东省",
  "41": "河南省",
  "42": "湖北省",
  "43": "湖南省",
  "44": "广东省",
  "45": "广西壮族自治区",
  "46": "海南省",
  "50": "重庆市",
  "51": "四川省",
  "52": "贵州省",
  "53": "云南省",
  "54": "西藏自治区",
  "61": "陕西省",
  "62": "甘肃省",
  "63": "青海省",
  "64": "宁夏回族自治区",
  "65": "新疆维吾尔自治区",
  "71": "台湾省",
  "81": "香港特别行政区",
  "82": "澳门特别行政区",
  "91": "国外",
};

export type IdCardGender = "男" | "女";

export interface IdCardInfo {
  /** 规范化后的号码（15 位会升为 18 位） */
  normalized: string;
  /** 原始输入位数 */
  length: 15 | 18;
  /** 校验是否通过（15 位无校验位，视为格式合法即通过） */
  valid: boolean;
  /** 错误信息（valid=false 时） */
  error?: string;
  provinceCode: string;
  province: string;
  regionCode: string;
  birth: string;
  birthDate: Date | null;
  age: number | null;
  gender: IdCardGender;
  genderCode: number;
  checkDigit: string;
  expectedCheckDigit: string;
}

/** 计算 17 位本体码对应的校验位 */
export function calcIdCardCheckDigit(body17: string): string {
  if (!/^\d{17}$/.test(body17)) throw new Error("本体码须为 17 位数字");
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (body17.charCodeAt(i) - 48) * WEIGHTS[i];
  return CHECK_MAP[sum % 11];
}

/** 15 位升 18 位（年份补 19，并追加校验位） */
export function upgradeIdCard15(id15: string): string {
  const raw = id15.trim().toUpperCase();
  if (!/^\d{15}$/.test(raw)) throw new Error("须为 15 位数字");
  const body17 = raw.slice(0, 6) + "19" + raw.slice(6);
  return body17 + calcIdCardCheckDigit(body17);
}

function parseBirth(yyyymmdd: string): Date | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  // 合理出生年份：1800 ~ 明年（兼容国标样例 1880 等）
  const maxY = new Date().getFullYear() + 1;
  if (y < 1800 || y > maxY) return null;
  return dt;
}

function calcAge(birth: Date, now = new Date()): number {
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() * 100 + now.getDate();
  const bmd = birth.getMonth() * 100 + birth.getDate();
  if (md < bmd) age -= 1;
  return Math.max(0, age);
}

function formatBirth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 解析并校验身份证号 */
export function parseIdCard(input: string): IdCardInfo {
  const raw = input.trim().toUpperCase().replace(/[\s-]/g, "");
  const empty = (error: string): IdCardInfo => ({
    normalized: raw,
    length: raw.length === 15 ? 15 : 18,
    valid: false,
    error,
    provinceCode: "",
    province: "",
    regionCode: "",
    birth: "",
    birthDate: null,
    age: null,
    gender: "男",
    genderCode: 0,
    checkDigit: "",
    expectedCheckDigit: "",
  });

  if (!raw) return empty("请输入身份证号码");
  if (!/^\d{15}$|^\d{17}[\dX]$/.test(raw)) {
    return empty("格式错误：应为 15 位数字，或 18 位（末位可为 X）");
  }

  let normalized = raw;
  let length: 15 | 18 = 18;
  if (raw.length === 15) {
    length = 15;
    try {
      normalized = upgradeIdCard15(raw);
    } catch (e) {
      return empty((e as Error).message);
    }
  }

  const regionCode = normalized.slice(0, 6);
  const provinceCode = normalized.slice(0, 2);
  const province = PROVINCE_MAP[provinceCode] || "未知省市";
  const birthRaw = normalized.slice(6, 14);
  const birthDate = parseBirth(birthRaw);
  if (!birthDate) return { ...empty("出生日期无效"), length, normalized, provinceCode, province, regionCode };

  const genderCode = Number(normalized.charAt(16));
  const gender: IdCardGender = genderCode % 2 === 1 ? "男" : "女";
  const checkDigit = normalized.charAt(17);
  const expectedCheckDigit = calcIdCardCheckDigit(normalized.slice(0, 17));
  const valid = checkDigit === expectedCheckDigit;

  return {
    normalized,
    length,
    valid,
    error: valid ? undefined : `校验位错误：当前 ${checkDigit}，应为 ${expectedCheckDigit}`,
    provinceCode,
    province,
    regionCode,
    birth: formatBirth(birthDate),
    birthDate,
    age: calcAge(birthDate),
    gender,
    genderCode,
    checkDigit,
    expectedCheckDigit,
  };
}
