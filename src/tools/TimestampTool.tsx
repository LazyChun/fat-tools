/*
 * 时间戳转换工具：当前时间戳实时显示、双向转换
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Radio, Space, Tag } from "antd";
import dayjs from "dayjs";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

interface Props {
  onBack?: () => void;
}

type Unit = "s" | "ms";

const TimestampTool: React.FC<Props> = ({ onBack }) => {
  const [now, setNow] = useState(() => Date.now());
  const [tsInput, setTsInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [unit, setUnit] = useState<Unit>("ms");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const nowFormatted = useMemo(() => dayjs(now).format("YYYY-MM-DD HH:mm:ss"), [now]);

  const tsToDate = useMemo(() => {
    const raw = tsInput.trim();
    if (!raw || !/^-?\d+$/.test(raw)) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    // 自动识别：纯秒级时间戳（10 位左右）
    const ms = unit === "s" ? n * 1000 : Math.abs(n) < 1e11 ? n * 1000 : n;
    const d = dayjs(ms);
    return d.isValid() ? d : null;
  }, [tsInput, unit]);

  const dateToTs = useMemo(() => {
    const raw = dateInput.trim();
    if (!raw) return null;
    const d = dayjs(raw);
    return d.isValid() ? d : null;
  }, [dateInput]);

  // 输入停顿 2.5s 后把本次双向转换落库
  React.useEffect(() => {
    recordUsageDebounced(
      "timestamp",
      () => {
        if (tsToDate) {
          return {
            toolId: "timestamp",
            toolTitle: "时间戳转换",
            action: "tsToDate",
            summary: `${tsInput} → ${tsToDate.format("YYYY-MM-DD HH:mm:ss")}`,
            detail: { input: tsInput, unit, result: tsToDate.format("YYYY-MM-DD HH:mm:ss") },
          };
        }
        if (dateToTs) {
          const ms = dateToTs.valueOf();
          return {
            toolId: "timestamp",
            toolTitle: "时间戳转换",
            action: "dateToTs",
            summary: `${dateInput} → ${unit === "s" ? Math.floor(ms / 1000) : ms}`,
            detail: { input: dateInput, unit, resultMs: ms },
          };
        }
        return null;
      },
      2500,
    );
  }, [tsInput, dateInput, unit, tsToDate, dateToTs]);

  const relative = (d: dayjs.Dayjs): string => {
    const diff = d.valueOf() - Date.now();
    const abs = Math.abs(diff);
    const units: Array<[number, string]> = [
      [1000, "秒"],
      [60_000, "分钟"],
      [3_600_000, "小时"],
      [86_400_000, "天"],
    ];
    let value = abs;
    let name = "毫秒";
    for (const [scale, label] of units) {
      if (abs >= scale) {
        value = abs / scale;
        name = label;
      }
    }
    return `${diff >= 0 ? "未来" : "过去"} ${Math.round(value)} ${name}`;
  };

  return (
    <ToolShell title="时间戳转换" onBack={onBack}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(128,128,128,0.08)" }}>
          <Space size={12} wrap>
            <Tag color="blue">当前时间</Tag>
            <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{nowFormatted}</span>
            <span style={{ fontFamily: "monospace" }}>{now}</span>
            <CopyButton text={String(now)} label="复制时间戳" />
            <CopyButton text={nowFormatted} label="复制时间" />
          </Space>
        </div>

        <div>
          <Space size={8} style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>时间戳 → 日期</span>
            <Radio.Group
              size="small"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              optionType="button"
              options={[
                { label: "秒", value: "s" },
                { label: "毫秒", value: "ms" },
              ]}
            />
          </Space>
          <Input
            value={tsInput}
            onChange={(e) => setTsInput(e.target.value)}
            placeholder="输入时间戳，如 1790000000000"
            style={{ fontFamily: "monospace" }}
            suffix={
              tsToDate ? (
                <Tag color="success">{relative(tsToDate)}</Tag>
              ) : tsInput ? (
                <Tag color="error">无效</Tag>
              ) : undefined
            }
          />
          {tsToDate ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6, marginTop: 8 }}>
              <StatRow label="本地时间" value={tsToDate.format("YYYY-MM-DD HH:mm:ss")} copyable />
              <StatRow label="ISO 8601" value={tsToDate.toISOString()} copyable />
              <StatRow label="UTC" value={tsToDate.toDate().toUTCString()} />
              <StatRow label="星期" value={`星期${"日一二三四五六"[tsToDate.day()]}`} />
            </div>
          ) : null}
        </div>

        <div>
          <div style={{ marginBottom: 8, fontSize: 13 }}>日期 → 时间戳</div>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              placeholder="输入日期时间，如 2026-10-11 11:30:00"
              style={{ fontFamily: "monospace" }}
            />
            <Button onClick={() => setDateInput(dayjs().format("YYYY-MM-DD HH:mm:ss"))}>现在</Button>
          </Space.Compact>
          {dateToTs ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6, marginTop: 8 }}>
              <StatRow label="毫秒时间戳" value={dateToTs.valueOf()} copyable />
              <StatRow label="秒时间戳" value={Math.floor(dateToTs.valueOf() / 1000)} copyable />
            </div>
          ) : dateInput ? (
            <Tag color="error" style={{ marginTop: 8 }}>无法解析的日期格式</Tag>
          ) : null}
        </div>

        <ToolHistoryPanel
          toolId="timestamp"
          toolTitle="时间戳转换"
          reloadKey={tsToDate || dateToTs ? 1 : 0}
          onRestore={(d) => {
            suppressNextRecord("timestamp");
            const input = String(d.input ?? "");
            const u = d.unit === "s" ? "s" : "ms";
            setUnit(u);
            if (d.resultMs !== undefined) {
              setDateInput(input);
              setTsInput("");
            } else {
              setTsInput(input);
              setDateInput("");
            }
          }}
        />
      </div>
    </ToolShell>
  );
};

export default TimestampTool;
