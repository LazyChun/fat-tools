/*
 * 文本对比工具：LCS 行级 diff，左右对照显示
 */
import React, { useMemo, useState } from "react";
import { Button, Empty, Input, Space, Tag, Tooltip } from "antd";
import { ClearOutlined, SwapOutlined } from "@ant-design/icons";
import { diffToRows, lineDiff } from "../utils";
import { ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

const MAX_INPUT = 200_000;

const lineBg = (type: string): string => {
  if (type === "add") return "rgba(82, 196, 26, 0.18)";
  if (type === "del") return "rgba(255, 77, 79, 0.18)";
  if (type === "change") return "rgba(250, 173, 20, 0.16)";
  return "transparent";
};

const TextDiffTool: React.FC<Props> = ({ onBack }) => {
  const [aText, setAText] = useState("");
  const [bText, setBText] = useState("");
  const [result, setResult] = useState<ReturnType<typeof diffToRows> | null>(null);
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    if (!result) return null;
    let add = 0;
    let del = 0;
    for (const r of result) {
      if (r.type === "add" || r.type === "change") add++;
      if (r.type === "del" || r.type === "change") del++;
    }
    const same = result.filter((r) => r.type === "same").length;
    return { add, del, same };
  }, [result]);

  const run = () => {
    if (aText.length > MAX_INPUT || bText.length > MAX_INPUT) {
      setError("文本过长（上限 20 万字符），请拆分后对比");
      setResult(null);
      return;
    }
    setError("");
    const rows = diffToRows(lineDiff(aText, bText));
    setResult(rows);
    let add = 0;
    let del = 0;
    for (const r of rows) {
      if (r.type === "add" || r.type === "change") add++;
      if (r.type === "del" || r.type === "change") del++;
    }
    recordUsage({
      toolId: "diff",
      toolTitle: "文本对比",
      action: "diff",
      summary: `对比完成：+${add} 新增 / -${del} 删除（左 ${aText.length} 字 ↔ 右 ${bText.length} 字）`,
      detail: {
        added: add,
        deleted: del,
        leftLen: aText.length,
        rightLen: bText.length,
        aText,
        bText,
      },
    });
  };

  const swap = () => {
    setAText(bText);
    setBText(aText);
    setResult(null);
  };

  const clear = () => {
    setAText("");
    setBText("");
    setResult(null);
    setError("");
  };

  return (
    <ToolShell
      title="文本对比"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Tooltip title="交换左右文本">
            <Button size="small" icon={<SwapOutlined />} onClick={swap} />
          </Tooltip>
          <Button size="small" icon={<ClearOutlined />} onClick={clear}>
            清空
          </Button>
          <Button size="small" type="primary" onClick={run}>
            对比
          </Button>
        </Space>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <TextArea
          value={aText}
          onChange={(e) => setAText(e.target.value)}
          placeholder="原始文本…"
          autoSize={{ minRows: 6, maxRows: 10 }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <TextArea
          value={bText}
          onChange={(e) => setBText(e.target.value)}
          placeholder="目标文本…"
          autoSize={{ minRows: 6, maxRows: 10 }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      {error ? <div style={{ color: "#cf1322", marginBottom: 8 }}>{error}</div> : null}

      {result === null ? (
        <Empty description="输入两段文本后点击「对比」" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Space size={8} style={{ marginBottom: 8 }}>
            <Tag color="green">+{stats?.add ?? 0} 新增</Tag>
            <Tag color="red">-{stats?.del ?? 0} 删除</Tag>
            <Tag>={stats?.same ?? 0} 相同</Tag>
          </Space>
          <div
            style={{
              border: "1px solid rgba(128,128,128,0.3)",
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 480,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: "20px",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minWidth: 480 }}>
              {result.map((row, i) => {
                const bg = lineBg(row.type);
                const renderSide = (
                  side: { no: number; text: string } | undefined,
                  sideType: "left" | "right",
                ) => (
                  <div style={{ display: "flex", background: bg, borderBottom: "1px solid rgba(128,128,128,0.12)" }}>
                    <span
                      style={{
                        width: 36,
                        flexShrink: 0,
                        textAlign: "right",
                        paddingRight: 6,
                        opacity: 0.5,
                        userSelect: "none",
                      }}
                    >
                      {side ? side.no : ""}
                    </span>
                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {side ? side.text : "\u00A0"}
                    </span>
                    {row.type === "change" ? (
                      <span
                        style={{
                          marginLeft: "auto",
                          paddingRight: 6,
                          opacity: 0.6,
                          userSelect: "none",
                        }}
                      >
                        {sideType === "left" ? "-" : "+"}
                      </span>
                    ) : null}
                  </div>
                );
                return (
                  <React.Fragment key={i}>
                    {renderSide(row.left, "left")}
                    {renderSide(row.right, "right")}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </>
      )}

      <ToolHistoryPanel
        toolId="diff"
        toolTitle="文本对比"
        reloadKey={result ? 1 : 0}
        onRestore={(d) => {
          setAText(String(d.aText ?? ""));
          setBText(String(d.bText ?? ""));
          setResult(null);
          setError("");
        }}
      />
    </ToolShell>
  );
};

export default TextDiffTool;
