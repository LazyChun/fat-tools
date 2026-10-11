/*
 * 正则测试工具：匹配高亮、分组捕获、命名分组
 */
import React, { useMemo, useState } from "react";
import { Checkbox, Input, Space, Tag, Typography } from "antd";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

interface MatchInfo {
  index: number;
  text: string;
  groups: string[];
  named: Record<string, string>;
}

interface Flag {
  key: string;
  label: string;
  desc: string;
}

const FLAGS: Flag[] = [
  { key: "g", label: "g", desc: "全局匹配" },
  { key: "i", label: "i", desc: "忽略大小写" },
  { key: "m", label: "m", desc: "多行模式" },
  { key: "s", label: "s", desc: "dotAll（. 匹配换行）" },
  { key: "u", label: "u", desc: "Unicode 模式" },
];

const RegexTool: React.FC<Props> = ({ onBack }) => {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState<string[]>(["g"]);
  const [text, setText] = useState("");

  const { error, matches, segments } = useMemo(() => {
    if (!pattern || !text) return { error: "", matches: [] as MatchInfo[], segments: null };
    let re: RegExp;
    try {
      re = new RegExp(pattern, [...new Set(flags)].join(""));
    } catch (e) {
      return { error: (e as Error).message, matches: [], segments: null };
    }
    const list: MatchInfo[] = [];
    const segs: Array<{ text: string; match: boolean }> = [];
    let last = 0;
    if (flags.includes("g")) {
      for (const m of text.matchAll(re)) {
        if (m[0] === "") break; // 防止零宽死循环
        list.push({
          index: m.index ?? 0,
          text: m[0],
          groups: m.slice(1).map((g) => g ?? "未匹配"),
          named: m.groups ? Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v ?? "未匹配"])) : {},
        });
        if ((m.index ?? 0) > last) segs.push({ text: text.slice(last, m.index), match: false });
        segs.push({ text: m[0], match: true });
        last = (m.index ?? 0) + m[0].length;
        if (segs.length > 5000) break;
      }
    } else {
      const m = re.exec(text);
      if (m) {
        list.push({
          index: m.index,
          text: m[0],
          groups: m.slice(1).map((g) => g ?? "未匹配"),
          named: m.groups ? Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v ?? "未匹配"])) : {},
        });
        if (m.index > last) segs.push({ text: text.slice(last, m.index), match: false });
        segs.push({ text: m[0], match: true });
        last = m.index + m[0].length;
      }
    }
    if (last < text.length) segs.push({ text: text.slice(last), match: false });
    return { error: "", matches: list, segments: segs };
  }, [pattern, flags, text]);

  // 输入停顿 3s 后把本次正则测试落库
  React.useEffect(() => {
    recordUsageDebounced(
      "regex",
      () =>
        pattern && text && !error
          ? {
              toolId: "regex",
              toolTitle: "正则测试",
              action: "test",
              summary: `/${pattern}/${flags.join("")} 命中 ${matches.length} 处`,
              detail: { pattern, flags: flags.join(""), text, matchCount: matches.length, textLen: text.length },
            }
          : null,
      3000,
    );
  }, [pattern, flags, text, error, matches]);

  return (
    <ToolShell title="正则测试" onBack={onBack}>
      <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
        <Input
          addonBefore="/"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="正则表达式，如 (\\d{4})-(\\d{2})"
          style={{ fontFamily: "monospace" }}
        />
        <Input
          addonAfter="/"
          value={flags.join("")}
          onChange={(e) => setFlags([...e.target.value.toLowerCase().replace(/[^gimsu]/g, "")])}
          style={{ width: 90, fontFamily: "monospace" }}
        />
      </Space.Compact>
      <Space size={12} style={{ marginBottom: 12 }}>
        {FLAGS.map((f) => (
          <Checkbox
            key={f.key}
            checked={flags.includes(f.key)}
            onChange={(e) =>
              setFlags((prev) => (e.target.checked ? [...prev, f.key] : prev.filter((x) => x !== f.key)))
            }
          >
            <Text code>{f.key}</Text> {f.desc}
          </Checkbox>
        ))}
      </Space>

      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入测试文本…"
        autoSize={{ minRows: 4, maxRows: 8 }}
        style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
      />

      {error ? <Tag color="error">{error}</Tag> : null}

      {!error && text && pattern ? (
        <>
          <StatRow label="匹配数量" value={matches.length} />
          {segments && segments.some((s) => s.match) ? (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                border: "1px solid rgba(128,128,128,0.3)",
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: 160,
                overflow: "auto",
              }}
            >
              {segments.map((s, i) =>
                s.match ? (
                  <mark
                    key={i}
                    style={{ background: "rgba(250,173,20,0.45)", color: "inherit", borderRadius: 2 }}
                  >
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>
          ) : null}
          {matches.length > 0 ? (
            <div style={{ marginTop: 8, maxHeight: 200, overflow: "auto" }}>
              {matches.map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: "4px 8px",
                    marginBottom: 4,
                    borderRadius: 6,
                    background: "rgba(128,128,128,0.08)",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <Tag color="blue">#{i + 1}</Tag>
                    <Text code>{JSON.stringify(m.text)}</Text>
                    <Text type="secondary" style={{ marginLeft: 6 }}>位置 {m.index}</Text>
                  </div>
                  {m.groups.length > 0 ? (
                    <div style={{ marginTop: 2, opacity: 0.85 }}>
                      分组：{m.groups.map((g, gi) => (
                        <Tag key={gi} style={{ fontFamily: "monospace" }}>${gi + 1}={JSON.stringify(g)}</Tag>
                      ))}
                    </div>
                  ) : null}
                  {Object.keys(m.named).length > 0 ? (
                    <div style={{ marginTop: 2, opacity: 0.85 }}>
                      {Object.entries(m.named).map(([k, v]) => (
                        <Tag key={k} color="purple" style={{ fontFamily: "monospace" }}>
                          {k}={JSON.stringify(v)}
                        </Tag>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <ToolHistoryPanel
        toolId="regex"
        toolTitle="正则测试"
        reloadKey={pattern && text && !error ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("regex");
          setPattern(String(d.pattern ?? ""));
          setFlags([...String(d.flags ?? "g").replace(/[^gimsu]/g, "")]);
          setText(String(d.text ?? ""));
        }}
      />
    </ToolShell>
  );
};

export default RegexTool;
