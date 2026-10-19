/*
 * 数据格式转换：JSON / YAML / CSV / TSV 互转
 *
 * - CSV/TSV 解析为「对象数组」（首行为表头）
 * - 对象/二维数组 → CSV/TSV（自动收集并集字段，单元格按 RFC 4180 转义）
 * - JSON/YAML 通过 JSON.parse / js-yaml 处理
 */
import { load as yamlLoad, dump as yamlDump } from "js-yaml";

export type DataFormat = "json" | "yaml" | "csv" | "tsv";

export const DATA_FORMATS: { value: DataFormat; label: string }[] = [
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "csv", label: "CSV" },
  { value: "tsv", label: "TSV" },
];

function delimiterOf(format: DataFormat): string {
  return format === "tsv" ? "\t" : ",";
}

/** 解析分隔符文本为二维数组（支持双引号包裹与 "" 转义） */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      started = true;
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
      continue;
    }
    field += ch;
    started = true;
  }
  if (started || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  // 丢弃完全空白的行
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** 二维数组 → 分隔符文本 */
export function toDelimited(rows: (string | number | boolean | null | undefined)[][], delimiter: string): string {
  const cell = (v: string | number | boolean | null | undefined): string => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return rows.map((r) => r.map(cell).join(delimiter)).join("\r\n");
}

/** 二维数组（首行表头）→ 对象数组 */
export function recordsToObjects(records: string[][]): Record<string, string>[] {
  if (records.length === 0) return [];
  const header = records[0].map((h, i) => {
    const name = (h ?? "").trim();
    return name || `列${i + 1}`;
  });
  return records.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => {
      // 同名列加序号，避免互相覆盖
      const finalKey = key in obj ? `${key}_${i + 1}` : key;
      obj[finalKey] = row[i] ?? "";
    });
    return obj;
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 任意值 → 二维数组（用于导出 CSV/TSV） */
export function valueToRecords(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    throw new Error("导出 CSV/TSV 需要数组结构（对象数组或二维数组），当前为单个对象/标量");
  }
  if (value.length === 0) return [];
  if (Array.isArray(value[0])) {
    return (value as unknown[][]).map((row) =>
      row.map((c) => (isPlainObject(c) || Array.isArray(c) ? JSON.stringify(c) : c == null ? "" : String(c))),
    );
  }
  if (isPlainObject(value[0])) {
    const keys: string[] = [];
    for (const item of value) {
      if (!isPlainObject(item)) throw new Error("数组元素类型不一致，无法导出 CSV/TSV");
      for (const k of Object.keys(item)) if (!keys.includes(k)) keys.push(k);
    }
    const cellText = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      if (isPlainObject(v) || Array.isArray(v)) return JSON.stringify(v);
      return String(v);
    };
    return [keys, ...value.map((item) => keys.map((k) => cellText((item as Record<string, unknown>)[k])))];
  }
  // 标量数组 → 单列
  return [["value"], ...value.map((v) => [v == null ? "" : String(v)])];
}

/** 解析文本为 JS 值 */
export function parseText(format: DataFormat, text: string): unknown {
  switch (format) {
    case "json":
      return JSON.parse(text);
    case "yaml":
      return yamlLoad(text);
    case "csv":
      return recordsToObjects(parseDelimited(text, delimiterOf(format)));
    case "tsv":
      return recordsToObjects(parseDelimited(text, delimiterOf(format)));
  }
}

/** JS 值序列化为文本 */
export function stringifyText(format: DataFormat, value: unknown): string {
  switch (format) {
    case "json":
      return JSON.stringify(value, null, 2);
    case "yaml":
      return yamlDump(value, { indent: 2, lineWidth: 120, noRefs: true, quotingType: '"' }).trimEnd();
    case "csv":
      return toDelimited(valueToRecords(value), delimiterOf(format));
    case "tsv":
      return toDelimited(valueToRecords(value), delimiterOf(format));
  }
}

/** 文本 + 源格式 → 目标格式 */
export function convertText(text: string, from: DataFormat, to: DataFormat): string {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("请输入要转换的内容");
  const value = parseText(from, trimmed);
  if (value === undefined) throw new Error("解析结果为空，无法转换");
  return stringifyText(to, value);
}

/** 启发式识别文本格式 */
export function detectFormat(text: string): DataFormat {
  const trimmed = (text || "").trim();
  if (!trimmed) return "json";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length >= 2) {
    if (lines[0].includes("\t")) return "tsv";
    if (lines[0].includes(",")) return "csv";
  }
  return "yaml";
}

/** 结果结构摘要（行/列/字段数） */
export function summarizeValue(value: unknown): { rows: number; keys: string[] } {
  if (Array.isArray(value)) {
    if (value.length && isPlainObject(value[0])) {
      const keys: string[] = [];
      for (const item of value) {
        if (isPlainObject(item)) for (const k of Object.keys(item)) if (!keys.includes(k)) keys.push(k);
      }
      return { rows: value.length, keys };
    }
    return { rows: value.length, keys: [] };
  }
  if (isPlainObject(value)) return { rows: 1, keys: Object.keys(value) };
  return { rows: value === null || value === undefined ? 0 : 1, keys: [] };
}
