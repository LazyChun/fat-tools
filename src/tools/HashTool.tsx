/*
 * 哈希计算工具：MD5 + SHA-1/256/384/512（输入即算）
 */
import React, { useEffect, useMemo, useState } from "react";
import { Input, Spin } from "antd";
import { md5, shaHash, type ShaAlgorithm } from "../utils";
import { StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

const ALGOS: ShaAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

const HashTool: React.FC<Props> = ({ onBack }) => {
  const [text, setText] = useState("");
  const [shas, setShas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const md5Hex = useMemo(() => (text ? md5(text) : ""), [text]);

  useEffect(() => {
    if (!text) {
      setShas({});
      return;
    }
    let cancelled = false;
    setBusy(true);
    Promise.all(ALGOS.map(async (a) => [a, await shaHash(a, text)] as const))
      .then((pairs) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [a, h] of pairs) next[a] = h;
        setShas(next);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  // 输入停顿 2s 后把本次哈希计算落库
  useEffect(() => {
    recordUsageDebounced("hash", () =>
      text
        ? {
            toolId: "hash",
            toolTitle: "哈希计算",
            action: "hash",
            summary: `计算 ${text.length} 字符的 MD5 + SHA 系列哈希`,
            detail: { input: text, inputLen: text.length, md5: md5Hex },
          }
        : null,
      2000,
    );
  }, [text, md5Hex]);

  return (
    <ToolShell title="哈希计算" onBack={onBack}>
      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入任意文本，自动计算 MD5 与 SHA 系列哈希（UTF-8 编码）…"
        autoSize={{ minRows: 4, maxRows: 8 }}
        style={{ marginBottom: 12 }}
      />
      <Spin spinning={busy} size="small">
        <div style={{ display: "grid", gap: 6 }}>
          {text ? (
            <>
              <StatRow label="MD5" value={md5Hex} copyable />
              {ALGOS.map((a) => (
                <StatRow key={a} label={a} value={shas[a] || "…"} copyable={!!shas[a]} />
              ))}
            </>
          ) : null}
        </div>
      </Spin>

      <ToolHistoryPanel
        toolId="hash"
        toolTitle="哈希计算"
        reloadKey={text ? 1 : 0}
        onRestore={(d) => {
          suppressNextRecord("hash"); // 恢复的输入不再重复落库
          setText(String(d.input ?? ""));
        }}
      />
    </ToolShell>
  );
};

export default HashTool;
