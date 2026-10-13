/*
 * 摩斯电码工具：文本 ↔ 摩斯电码双向转换
 *
 * 编码：字母间空格、单词间 " / "；解码兼容 3 个以上空格作单词分隔。
 * 额外提供电码音频点播（Web Audio 振荡器）与对照表，方便学习 / 抄收。
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Collapse, Input, Radio, Space, Tag, Typography } from "antd";
import {
  ClearOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  MORSE_TABLE,
  isMorseSymbols,
  morseToText,
  textToMorse,
  unsupportedMorseChars,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

const { Text, Paragraph } = Typography;

// 摩斯电码的全局搜索直达：匹配点/划组成的摩斯电码串（如 ".... ---"）
export const MORSE_SEARCH_FEED = createToolSearchFeed(/^[.\-][.\-/ ]{3,}$/);

interface Props {
  onBack?: () => void;
}

type Mode = "encode" | "decode";

/** 电码时长参数（秒） */
const UNIT = 0.08;
const TONE_HZ = 620;

const MorseTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("SOS hello world");
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");

  // 全局搜索直达：命中输入模式后自动填入（文本/电码共用主输入框）
  MORSE_SEARCH_FEED.useFeedValue(setInput);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  const output = useMemo(
    () => (mode === "encode" ? textToMorse(input) : morseToText(input)),
    [mode, input],
  );

  /** 待播放的电码（解码模式下由结果回编码得到） */
  const playableMorse = useMemo(
    () => (mode === "encode" ? output : textToMorse(output)),
    [mode, output],
  );
  const canPlay = playableMorse.trim() !== "";

  const badChars = useMemo(
    () => (mode === "encode" ? unsupportedMorseChars(input) : []),
    [mode, input],
  );

  const symbolCount = useMemo(
    () => [...output.replace(/\s/g, "")].length,
    [output],
  );

  // 操作记录（防抖落库）
  useEffect(() => {
    recordUsageDebounced(
      "morse",
      () =>
        input.trim()
          ? {
              toolId: "morse",
              toolTitle: "摩斯电码",
              action: mode === "encode" ? "encode" : "decode",
              summary: `${mode === "encode" ? input.trim().slice(0, 30) : output.trim().slice(0, 40)} → ${output.trim().slice(0, 40) || "—"}`,
              detail: { mode, input },
            }
          : null,
      2000,
    );
  }, [input, mode, output]);

  /** 停止当前播放 */
  const stopPlayback = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopFnRef.current?.();
    stopFnRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  /** 播放一段电码音频（点 1 单位、划 3 单位、字母间 3 单位、单词间 7 单位） */
  const play = useCallback(() => {
    const morse = playableMorse;
    if (!morse.trim()) return;
    stopPlayback();

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      setAudioError("当前环境不支持音频播放（缺少 AudioContext）。");
      return;
    }
    setAudioError("");
    const ctx = audioCtxRef.current ?? new Ctor();
    audioCtxRef.current = ctx;
    void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = TONE_HZ;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);

    let t = ctx.currentTime + 0.06;
    const words = morse.trim().split(/\s*\/\s*|\s{3,}/);
    for (const word of words) {
      const letters = word
        .trim()
        .split(/\s+/)
        .filter((s) => s !== "");
      for (const letter of letters) {
        for (const sym of letter) {
          const dur = sym === "-" ? UNIT * 3 : UNIT;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.22, t + 0.006);
          gain.gain.setValueAtTime(0.22, t + dur - 0.006);
          gain.gain.linearRampToValueAtTime(0, t + dur);
          t += dur + UNIT; // 符号间隔 1 单位
        }
        t += UNIT * 2; // 补齐字母间隔 3 单位
      }
      t += UNIT * 4; // 补齐单词间隔 7 单位
    }
    const end = t + 0.05;
    osc.start(ctx.currentTime);
    osc.stop(end);

    stopFnRef.current = () => {
      try {
        osc.stop();
      } catch {
        /* 已停止 */
      }
    };
    setPlaying(true);
    timerRef.current = window.setTimeout(
      () => {
        setPlaying(false);
        stopFnRef.current = null;
        timerRef.current = null;
      },
      (end - ctx.currentTime) * 1000 + 150,
    );
  }, [playableMorse, stopPlayback]);

  /** 把输出结果回填到输入框（编码 ⇄ 解码互转） */
  const swap = useCallback(() => {
    const next = mode === "encode" ? "decode" : "encode";
    setInput(output);
    setMode(next);
  }, [mode, output]);

  const tableItems = useMemo(() => {
    const entries = Object.entries(MORSE_TABLE);
    const half = Math.ceil(entries.length / 2);
    return [entries.slice(0, half), entries.slice(half)];
  }, []);

  return (
    <ToolShell title="摩斯电码" onBack={onBack}>
      <div style={{ display: "grid", gap: 12 }}>
        <Space size={8} wrap>
          <Radio.Group
            size="small"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "文本 → 电码", value: "encode" },
              { label: "电码 → 文本", value: "decode" },
            ]}
          />
          <Button size="small" icon={<SwapOutlined />} onClick={swap}>
            结果转输入
          </Button>
          <Button
            size="small"
            type={playing ? "default" : "primary"}
            disabled={!canPlay}
            icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={playing ? stopPlayback : play}
          >
            {playing ? "停止" : "播放"}
          </Button>
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={() => {
              stopPlayback();
              setInput("");
            }}
          >
            清空
          </Button>
        </Space>

        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoSize={{ minRows: 3, maxRows: 8 }}
          placeholder={
            mode === "encode"
              ? "输入文本，如 SOS hello world"
              : "输入电码，如 ... --- ... / .... . .-.. .-.. ---"
          }
          style={{ fontFamily: "monospace" }}
        />

        {badChars.length > 0 ? (
          <Text type="warning" style={{ fontSize: 12 }}>
            以下字符暂无双字符号对应，已输出占位符「?」：{badChars.join(" ")}
          </Text>
        ) : null}

        {audioError ? (
          <Text type="danger" style={{ fontSize: 12 }}>
            {audioError}
          </Text>
        ) : null}

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              转换结果
            </Text>
            <Tag bordered={false}>{symbolCount} 个符号</Tag>
            <div style={{ flex: 1 }} />
            {output ? <CopyButton text={output} /> : null}
          </div>
          <div
            style={{
              minHeight: 64,
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(128,128,128,0.08)",
              fontFamily: "monospace",
              fontSize: 14,
              lineHeight: 1.8,
              wordBreak: "break-all",
              whiteSpace: "pre-wrap",
            }}
          >
            {output || <Text type="secondary">—</Text>}
          </div>
          {mode === "decode" && input.trim() && !isMorseSymbols(input) ? (
            <Text type="warning" style={{ fontSize: 12 }}>
              输入含非电码字符（仅支持 . - 空格 /
              与换行），这些片段会显示为「?」。
            </Text>
          ) : null}
        </div>

        {mode === "encode" && output.trim() ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 6,
            }}
          >
            <StatRow
              label="字符数"
              value={[...input.replace(/\s/g, "")].length}
            />
            <StatRow
              label="单词数"
              value={input.trim() ? input.trim().split(/\s+/).length : 0}
            />
            <StatRow
              label="音长估算"
              value={`${(symbolCount * UNIT).toFixed(1)} 秒起`}
            />
          </div>
        ) : null}

        <Collapse
          ghost
          size="small"
          items={[
            {
              key: "table",
              label: "摩斯电码对照表",
              children: (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: 12,
                  }}
                >
                  {tableItems.map((group, gi) => (
                    <div
                      key={gi}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(88px, 1fr))",
                        gap: 4,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      {group.map(([ch, code]) => (
                        <div key={ch} style={{ display: "flex", gap: 6 }}>
                          <Text strong style={{ width: 12 }}>
                            {ch}
                          </Text>
                          <Text type="secondary">{code}</Text>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />

        <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
          规则：点「.」1 单位、划「-」3 单位，符号间隔 1 单位，字母间隔 3
          单位，单词间隔 7 单位； 文本中的空格在电码里写作「/」。
        </Paragraph>

        <ToolHistoryPanel
          toolId="morse"
          toolTitle="摩斯电码"
          onRestore={(d) => {
            if (typeof d.input === "string") {
              suppressNextRecord("morse");
              setMode(d.mode === "decode" ? "decode" : "encode");
              setInput(d.input);
            }
          }}
        />
      </div>
    </ToolShell>
  );
};

export default MorseTool;
