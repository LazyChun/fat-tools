/*
 * 汉字拆解工具：拆字部件、结构分析、拼音、笔画数。
 *
 * 部件数据与算法在 utils.ts（CHAR_DECOMPOSE / decomposeChar），
 * 拼音由 pinyin-pro 提供，本组件只做交互与可视化。
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Card, Empty, Input, Space, Tag, Typography } from "antd";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { decomposeChar, type CharDecomposeResult } from "../utils";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

/** 示例字，点击即可拆解 */
const SAMPLES = ["好", "明", "森", "想", "谢", "海", "花", "你"];

const STRUCTURE_COLOR: Record<string, string> = {
  独体: "default",
  左右: "blue",
  左中右: "geekblue",
  上下: "green",
  上中下: "cyan",
  半包围: "orange",
  全包围: "volcano",
  品字: "purple",
};

const ChineseCharTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("好");

  // 多字输入时逐个拆解（上限 20 字，避免卡顿）
  const chars = useMemo(() => [...input.trim()].slice(0, 20), [input]);
  const results = useMemo<CharDecomposeResult[]>(
    () => chars.map((c) => decomposeChar(c)),
    [chars],
  );
  const hanResults = useMemo(() => results.filter((r) => r.isHan), [results]);

  useEffect(() => {
    recordUsageDebounced(
      "hanzi",
      () =>
        hanResults.length > 0
          ? {
              toolId: "hanzi",
              toolTitle: "汉字拆解",
              action: "decompose",
              summary: `${hanResults.map((r) => r.char).join("")} → ${hanResults
                .map((r) => `${r.char}(${r.structure}${r.strokes ? " " + r.strokes + "画" : ""})`)
                .join("、")}`,
              detail: { input: hanResults.map((r) => r.char).join("") },
            }
          : null,
      800,
    );
  }, [hanResults]);

  return (
    <ToolShell title="汉字拆解" onBack={onBack}>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入汉字（可多字，最多 20 字），如：明、想、汉字拆解"
        allowClear
        style={{ marginBottom: 8, fontSize: 16 }}
      />

      <Space size={6} wrap style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          示例：
        </Text>
        {SAMPLES.map((s) => (
          <Tag
            key={s}
            style={{ cursor: "pointer", marginInlineEnd: 0, fontSize: 16 }}
            onClick={() => setInput(s)}
          >
            {s}
          </Tag>
        ))}
      </Space>

      {hanResults.length === 0 ? (
        <Empty description="请输入汉字以查看拆解结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          {hanResults.map((r) => (
            <CharCard key={r.char} result={r} />
          ))}
        </div>
      )}

      <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
        部件拆解基于内置常用字表，笔画数为常见字参考值；拼音由 pinyin-pro 提供（多音字以逗号分隔）。
        未收录的汉字仍会显示拼音与笔画（若可得），部件为空属正常。
      </Text>

      <ToolHistoryPanel
        toolId="hanzi"
        toolTitle="汉字拆解"
        onRestore={(d) => {
          suppressNextRecord("hanzi");
          if (typeof d.input === "string") setInput(d.input);
        }}
      />
    </ToolShell>
  );
};

/** 单个汉字的拆解卡片 */
const CharCard: React.FC<{ result: CharDecomposeResult }> = ({ result }) => {
  const partsText = result.parts.length ? result.parts.join(" + ") : "（未收录部件）";
  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{result.char}</span>
          <Tag color={STRUCTURE_COLOR[result.structure] ?? "default"} style={{ marginInlineEnd: 0 }}>
            {result.structure}
          </Tag>
          <Tag color="gold" style={{ marginInlineEnd: 0 }}>
            {result.strokes > 0 ? `${result.strokes} 画` : "笔画未知"}
          </Tag>
        </Space>
      }
      extra={<CopyButton text={partsText} />}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <StatRow label="拼音" value={result.pinyin || "—"} copyable />
        <StatRow label="部件" value={partsText} copyable />
        <StatRow
          label="部件数"
          value={result.parts.length > 0 ? `${result.parts.length} 个` : "—"}
        />
      </div>
      {result.parts.length > 0 ? (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {result.parts.map((p, i) => (
            <div
              key={`${p}-${i}`}
              style={{
                minWidth: 44,
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(22,119,255,0.08)",
                border: "1px solid rgba(22,119,255,0.25)",
                textAlign: "center",
                fontSize: 18,
              }}
            >
              {p}
            </div>
          ))}
        </div>
      ) : (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 10 }}
          message="该字为独体字或暂未收录部件拆解"
        />
      )}
    </Card>
  );
};

export default ChineseCharTool;
