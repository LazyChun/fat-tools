/*
 * 数据格式转换：JSON / YAML / CSV / TSV 互转（实时预览）
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Select, Space, Tag, Tooltip, Typography } from "antd";
import {
  ClearOutlined,
  DownloadOutlined,
  RetweetOutlined,
} from "@ant-design/icons";
import {
  DATA_FORMATS,
  detectFormat,
  parseText,
  stringifyText,
  summarizeValue,
  type DataFormat,
} from "./dataConvert";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

type FromFormat = DataFormat | "auto";

const SAMPLE_JSON = `[
  { "name": "张三", "age": 28, "city": "杭州" },
  { "name": "李四", "age": 34, "city": "上海" }
]`;

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Props {
  onBack?: () => void;
}

const DataConvertTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState(SAMPLE_JSON);
  const [from, setFrom] = useState<FromFormat>("auto");
  const [to, setTo] = useState<DataFormat>("yaml");

  const effectiveFrom: DataFormat =
    from === "auto" ? detectFormat(input) : from;

  const result = useMemo(() => {
    if (!input.trim())
      return { out: "", error: "", rows: 0, keys: [] as string[] };
    try {
      const value = parseText(effectiveFrom, input.trim());
      const out = stringifyText(to, value);
      const stat = summarizeValue(value);
      return { out, error: "", rows: stat.rows, keys: stat.keys };
    } catch (e) {
      return {
        out: "",
        error: (e as Error).message,
        rows: 0,
        keys: [] as string[],
      };
    }
  }, [input, effectiveFrom, to]);

  // 输入停顿 2s 后落库
  useEffect(() => {
    recordUsageDebounced(
      "data-convert",
      () => {
        if (!input.trim() || result.error) return null;
        return {
          toolId: "data-convert",
          toolTitle: "数据格式转换",
          action: "convert",
          summary: `${effectiveFrom.toUpperCase()} → ${to.toUpperCase()}（${result.rows} 行）`,
          detail: { input: input.slice(0, 2000), from: effectiveFrom, to },
        };
      },
      2000,
    );
  }, [input, effectiveFrom, to, result.error, result.rows]);

  const swap = useCallback(() => {
    setInput(result.out || input);
    setFrom(to);
    setTo(effectiveFrom);
  }, [result.out, input, to, effectiveFrom]);

  const label = (f: DataFormat | "auto") =>
    f === "auto"
      ? "自动识别"
      : (DATA_FORMATS.find((d) => d.value === f)?.label ?? f);

  return (
    <ToolShell
      title="数据格式转换"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Tooltip title="把输出结果作为新的输入，并交换格式">
            <Button
              size="small"
              icon={<RetweetOutlined />}
              disabled={!result.out}
              onClick={swap}
            >
              交换
            </Button>
          </Tooltip>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!result.out}
            onClick={() => downloadText(result.out, `converted.${to}`)}
          >
            下载
          </Button>
          <CopyButton text={() => result.out} label="复制结果" />
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={() => {
              setInput("");
            }}
          >
            清空
          </Button>
        </Space>
      }
    >
      <Space size={10} wrap style={{ marginBottom: 12 }}>
        <Space size={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            源格式
          </Text>
          <Select
            size="small"
            style={{ width: 130 }}
            value={from}
            onChange={(v) => setFrom(v as FromFormat)}
            options={[{ value: "auto", label: "自动识别" }, ...DATA_FORMATS]}
          />
          {from === "auto" ? (
            <Tag color="blue">{label(effectiveFrom)}</Tag>
          ) : null}
        </Space>
        <Text type="secondary">→</Text>
        <Space size={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            目标格式
          </Text>
          <Select
            size="small"
            style={{ width: 110 }}
            value={to}
            onChange={(v) => setTo(v as DataFormat)}
            options={DATA_FORMATS}
          />
        </Space>
        <Button
          size="small"
          type="link"
          style={{ padding: 0 }}
          onClick={() => setInput(SAMPLE_JSON)}
        >
          载入示例
        </Button>
        {result.out ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {result.rows} 行
            {result.keys.length ? ` / ${result.keys.length} 个字段` : ""}
          </Text>
        ) : null}
      </Space>

      {result.error ? (
        <Alert
          type="error"
          showIcon
          message={`转换失败：${result.error}`}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            输入（{label(effectiveFrom)}）
          </Text>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder="在此粘贴 JSON / YAML / CSV / TSV 内容…"
            style={{
              width: "100%",
              height: 360,
              marginTop: 4,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(128,128,128,0.35)",
              background: "transparent",
              color: "inherit",
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            输出（{label(to)}）
          </Text>
          <textarea
            value={result.out}
            readOnly
            spellCheck={false}
            placeholder="转换结果将显示在这里"
            style={{
              width: "100%",
              height: 360,
              marginTop: 4,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(128,128,128,0.35)",
              background: "rgba(128,128,128,0.06)",
              color: "inherit",
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />
        </div>
      </div>

      <Text
        type="secondary"
        style={{ fontSize: 12, display: "block", marginTop: 8 }}
      >
        说明：CSV / TSV
        以首行为表头转换为「对象数组」；反向导出时自动收集各对象字段的并集。
      </Text>

      <ToolHistoryPanel
        toolId="data-convert"
        toolTitle="数据格式转换"
        onRestore={(d) => {
          suppressNextRecord("data-convert");
          if (typeof d.input === "string") setInput(d.input);
          if (
            typeof d.from === "string" &&
            ["json", "yaml", "csv", "tsv"].includes(d.from)
          ) {
            setFrom(d.from as DataFormat);
          }
          if (
            typeof d.to === "string" &&
            ["json", "yaml", "csv", "tsv"].includes(d.to)
          ) {
            setTo(d.to as DataFormat);
          }
        }}
      />
    </ToolShell>
  );
};

export default DataConvertTool;
