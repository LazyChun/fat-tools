/*
 * 秒表 / 倒计时：单页面双模式计时器
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, InputNumber, Segmented, Space, Tag, Typography } from "antd";
import {
  CaretRightOutlined,
  PauseOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { ToolShell } from "../components/Common";
import { getSdk, recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

type Mode = "stopwatch" | "countdown";

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const cs = Math.floor((total % 1000) / 10);
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${h > 0 ? `${pad(h)}:` : ""}${pad(m)}:${pad(s)}.${pad(cs)}`;
}

const TimerTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<Mode>("stopwatch");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const [durationSec, setDurationSec] = useState(60);
  const [remaining, setRemaining] = useState(60_000);

  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const baseRef = useRef(0);
  const endRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopLoop, [stopLoop]);

  const beep = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.start();
      window.setTimeout(() => {
        try {
          osc.stop();
          void ctx.close();
        } catch {
          /* ignore */
        }
      }, 700);
    } catch {
      /* 浏览器不支持音频时静默忽略 */
    }
  }, []);

  const startLoop = useCallback(
    (currentMode: Mode) => {
      stopLoop();
      timerRef.current = window.setInterval(() => {
        if (currentMode === "stopwatch") {
          setElapsed(baseRef.current + (performance.now() - startRef.current));
        } else {
          const rem = Math.max(0, endRef.current - performance.now());
          setRemaining(rem);
          if (rem <= 0) {
            stopLoop();
            setRunning(false);
            beep();
            getSdk()?.ui.toast.success("倒计时结束！");
            recordUsage({
              toolId: "timer",
              toolTitle: "秒表 / 倒计时",
              action: "countdown",
              summary: `倒计时 ${durationSec}s 结束`,
              detail: { durationSec },
            });
          }
        }
      }, 50);
    },
    [beep, durationSec, stopLoop],
  );

  const start = () => {
    if (mode === "stopwatch") {
      startRef.current = performance.now();
    } else {
      if (remaining <= 0) return;
      endRef.current = performance.now() + remaining;
    }
    setRunning(true);
    startLoop(mode);
  };

  const pause = () => {
    stopLoop();
    setRunning(false);
    if (mode === "stopwatch") baseRef.current = elapsed;
  };

  const reset = () => {
    stopLoop();
    setRunning(false);
    if (mode === "stopwatch") {
      baseRef.current = 0;
      startRef.current = 0;
      setElapsed(0);
      setLaps([]);
    } else {
      setRemaining(durationSec * 1000);
    }
  };

  const lap = () => {
    if (mode !== "stopwatch" || !running) return;
    setLaps((prev) => [elapsed, ...prev]);
  };

  const switchMode = (m: Mode) => {
    stopLoop();
    setRunning(false);
    setMode(m);
    if (m === "countdown") setRemaining(durationSec * 1000);
  };

  const applyDuration = (sec: number) => {
    const s = Math.max(1, Math.min(24 * 3600, Math.floor(sec)));
    setDurationSec(s);
    if (mode === "countdown" && !running) setRemaining(s * 1000);
  };

  const display = mode === "stopwatch" ? elapsed : remaining;
  const progress = mode === "countdown" && durationSec > 0 ? 1 - remaining / (durationSec * 1000) : 0;

  return (
    <ToolShell
      title="秒表 / 倒计时"
      onBack={onBack}
      extra={
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => switchMode(v as Mode)}
          options={[
            { value: "stopwatch", label: "秒表" },
            { value: "countdown", label: "倒计时" },
          ]}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 12 }}>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 56,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: 1,
          }}
        >
          {formatTime(display)}
        </div>

        {mode === "countdown" ? (
          <>
            <div
              style={{
                width: "min(560px, 100%)",
                height: 6,
                borderRadius: 3,
                background: "rgba(128,128,128,0.2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
                  height: "100%",
                  background: "#1677FF",
                  transition: "width 0.05s linear",
                }}
              />
            </div>
            <Space size={10} wrap style={{ justifyContent: "center" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                时长
              </Text>
              <InputNumber
                size="small"
                min={1}
                max={86399}
                value={durationSec}
                disabled={running}
                onChange={(v) => applyDuration(v || 60)}
                addonAfter="秒"
                style={{ width: 130 }}
              />
              {[60, 180, 300, 600].map((s) => (
                <Button key={s} size="small" disabled={running} onClick={() => applyDuration(s)}>
                  {s / 60} 分
                </Button>
              ))}
            </Space>
          </>
        ) : null}

        <Space size={10}>
          {running ? (
            <Button type="primary" size="large" icon={<PauseOutlined />} onClick={pause}>
              暂停
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              icon={<CaretRightOutlined />}
              onClick={start}
              disabled={mode === "countdown" && remaining <= 0}
            >
              {elapsed > 0 || remaining !== durationSec * 1000 ? "继续" : "开始"}
            </Button>
          )}
          <Button size="large" icon={<ReloadOutlined />} onClick={reset}>
            重置
          </Button>
          <Button
            size="large"
            icon={<ThunderboltOutlined />}
            disabled={mode !== "stopwatch" || !running}
            onClick={lap}
          >
            计次
          </Button>
        </Space>

        {mode === "stopwatch" && laps.length > 0 ? (
          <div style={{ width: "min(560px, 100%)", maxHeight: 220, overflow: "auto" }}>
            {laps.map((t, i) => {
              const prev = laps[i + 1] ?? 0;
              return (
                <div
                  key={`${i}-${t}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "rgba(128,128,128,0.08)",
                    marginBottom: 4,
                    fontFamily: "monospace",
                  }}
                >
                  <Tag style={{ marginInlineEnd: 0 }}>第 {laps.length - i} 次</Tag>
                  <Text style={{ fontFamily: "monospace" }}>+{formatTime(t - prev)}</Text>
                  <Text type="secondary" style={{ fontFamily: "monospace" }}>
                    {formatTime(t)}
                  </Text>
                </div>
              );
            })}
          </div>
        ) : null}

        <Text type="secondary" style={{ fontSize: 12 }}>
          {mode === "stopwatch"
            ? "支持暂停 / 继续 / 计次，精度 10ms"
            : "倒计时结束会播放提示音并弹出通知"}
        </Text>
      </div>
    </ToolShell>
  );
};

export default TimerTool;
