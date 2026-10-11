/*
 * 行处理：对多行文本做去重 / 排序 / 去空行 / 过滤 / 加行号 / 反转等批处理
 */
import React, { useMemo, useState } from "react";
import { Checkbox, Input, InputNumber, Select, Space, Typography } from "antd";
import {
  DEFAULT_LINES_OPTIONS,
  processLines,
  type LineSortMode,
  type LinesOptions,
} from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const SORT_OPTIONS: { value: LineSortMode; label: string }[] = [
  { value: "none", label: "不排序" },
  { value: "asc", label: "升序 A→Z" },
  { value: "desc", label: "降序 Z→A" },
  { value: "natural", label: "自然序（识别数字）" },
  { value: "length-asc", label: "按长度升序" },
  { value: "length-desc", label: "按长度降序" },
  { value: "shuffle", label: "随机打乱" },
];

const LinesTool: React.FC<Props> = ({ onBack }) => {
  const [text, setText] = useState("banana\napple\ncherry\napple\n\nBanana");
  const [opt, setOpt] = useState<LinesOptions>({ ...DEFAULT_LINES_OPTIONS });

  const output = useMemo(() => processLines(text, opt), [text, opt]);

  const set = <K extends keyof LinesOptions>(key: K, value: LinesOptions[K]) =>
    setOpt((prev) => ({ ...prev, [key]: value }));

  React.useEffect(() => {
    recordUsageDebounced(
      "lines",
      () =>
        text.trim()
          ? {
              toolId: "lines",
              toolTitle: "行处理",
              action: "process",
              summary: `处理 ${text.split("\n").length} 行 → ${output.split("\n").length} 行`,
              detail: { input: text, options: opt, output },
            }
          : null,
      2500,
    );
  }, [text, opt, output]);

  return (
    <ToolShell
      title="行处理"
      onBack={onBack}
      extra={output ? <CopyButton text={output} label="复制结果" /> : null}
    >
      <div style={{ display: "flex", gap: 10, height: "100%", minHeight: 0, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", minHeight: 240 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            输入（每行一条）
          </Text>
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ flex: 1, fontFamily: "monospace", resize: "none" }}
          />
        </div>

        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", minHeight: 240 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            输出（{output ? output.split("\n").length : 0} 行）
          </Text>
          <Input.TextArea
            value={output}
            readOnly
            style={{ flex: 1, fontFamily: "monospace", resize: "none" }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(128,128,128,0.08)",
        }}
      >
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            排序
          </Text>
          <Select
            size="small"
            style={{ width: 150 }}
            value={opt.sort}
            options={SORT_OPTIONS}
            onChange={(v) => set("sort", v)}
          />
        </Space>

        <Checkbox checked={opt.trim} onChange={(e) => set("trim", e.target.checked)}>
          去首尾空格
        </Checkbox>
        <Checkbox checked={opt.removeEmpty} onChange={(e) => set("removeEmpty", e.target.checked)}>
          去空行
        </Checkbox>
        <Checkbox checked={opt.dedupe} onChange={(e) => set("dedupe", e.target.checked)}>
          去重
        </Checkbox>
        <Checkbox
          checked={opt.caseInsensitive}
          onChange={(e) => set("caseInsensitive", e.target.checked)}
        >
          忽略大小写
        </Checkbox>
        <Checkbox checked={opt.reverse} onChange={(e) => set("reverse", e.target.checked)}>
          反转行序
        </Checkbox>
        <Checkbox checked={opt.number} onChange={(e) => set("number", e.target.checked)}>
          加行号
        </Checkbox>
        {opt.number ? (
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              起始
            </Text>
            <InputNumber
              size="small"
              min={0}
              value={opt.numberStart}
              onChange={(v) => set("numberStart", v || 0)}
              style={{ width: 64 }}
            />
          </Space>
        ) : null}

        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            过滤
          </Text>
          <Select
            size="small"
            style={{ width: 96 }}
            value={opt.filterMode}
            options={[
              { value: "contains", label: "保留含" },
              { value: "not-contains", label: "排除含" },
            ]}
            onChange={(v) => set("filterMode", v)}
          />
          <Input
            size="small"
            style={{ width: 120 }}
            value={opt.filter}
            placeholder="关键词…"
            onChange={(e) => set("filter", e.target.value)}
          />
        </Space>
      </div>

      <ToolHistoryPanel
        toolId="lines"
        toolTitle="行处理"
        onRestore={(d) => {
          if (typeof d.input === "string") {
            suppressNextRecord("lines");
            setText(d.input);
          }
          if (d.options && typeof d.options === "object") {
            setOpt({ ...DEFAULT_LINES_OPTIONS, ...(d.options as Partial<LinesOptions>) });
          }
        }}
      />
    </ToolShell>
  );
};

export default LinesTool;
