/*
 * 易经六十四卦 · 起卦与解卦
 *
 * 起卦方式：金钱卦（摇铜钱）、时间起卦、报数起卦、大衍筮法（模拟）。
 * 解卦：本卦 → 变卦（动爻变），给出卦辞、象传、白话解读、五行与断卦提示。
 *
 * 所有卦数据见 tools/hexagramData.ts，纯计算见 utils.ts，仅娱乐参考。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  InputNumber,
  Radio,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { BookOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  divinateByCoin,
  divinateByNumber,
  divinateByTime,
  divinateByYarrow,
  divinationFromBits,
  formatDate,
  judgingRuleText,
  type DivinationMethod,
  type DivinationResult,
  type YaoLine,
} from "../utils";
import {
  HEXAGRAMS,
  PALACE_ELEMENT,
  TRIGRAM_NAMES,
  TRIGRAM_NATURE,
  TRIGRAM_SYMBOL,
  YAO_POSITION_MEANING,
  hexagramByBits,
  hexagramDisplayName,
  yaoPositionName,
  yaoTextsOf,
  type Hexagram,
} from "./hexagramData";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, suppressNextRecord } from "../historyClient";

const { Text, Paragraph } = Typography;

interface Props {
  onBack?: () => void;
}

const METHOD_LABEL: Record<DivinationMethod, string> = {
  coin: "金钱卦",
  time: "时间起卦",
  number: "报数起卦",
  yarrow: "大衍筮法",
};

/** 爻线绘制：尺寸参数 */
const YAO_W = 116;
const YAO_H = 12;
const YAO_GAP = 9;
const YAO_LEFT = 74;

const YijingTool: React.FC<Props> = ({ onBack }) => {
  const [method, setMethod] = useState<DivinationMethod>("coin");
  const [result, setResult] = useState<DivinationResult | null>(null);
  const [casting, setCasting] = useState(false);
  const [castStep, setCastStep] = useState(0);
  const [timeForCast, setTimeForCast] = useState<Dayjs>(() => dayjs());
  const [numA, setNumA] = useState<number>(3);
  const [numB, setNumB] = useState<number>(5);
  const [numC, setNumC] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewBits, setViewBits] = useState<number | null>(null);

  /** 摇卦动画定时器 */
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    [],
  );

  /** 摇卦：逐爻推进的动画 */
  const cast = useCallback(
    (m: DivinationMethod) => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const make = (): DivinationResult => {
        switch (m) {
          case "time":
            return divinateByTime(timeForCast.toDate());
          case "number":
            return divinateByNumber(numA, numB, numC ?? undefined);
          case "yarrow":
            return divinateByYarrow();
          default:
            return divinateByCoin();
        }
      };
      const target = make();
      setCasting(true);
      setCastStep(0);
      setResult(null);
      let step = 0;
      timerRef.current = window.setInterval(() => {
        step += 1;
        setCastStep(step);
        if (step >= 6) {
          window.clearInterval(timerRef.current!);
          timerRef.current = null;
          setResult(target);
          setCasting(false);
          recordUsage({
            toolId: "yijing",
            toolTitle: "易经算命",
            action: "cast",
            summary: `${METHOD_LABEL[m]} → ${hexagramDisplayName(hexagramByBits(target.originalBits))}` +
              (target.changedBits !== target.originalBits
                ? ` 变 ${hexagramDisplayName(hexagramByBits(target.changedBits))}`
                : "") +
              `（动爻 ${target.movingLines.length ? target.movingLines.join("、") : "无"}）`,
            detail: {
              method: target.method,
              originalBits: target.originalBits,
              movingLines: target.movingLines,
              basis: target.basis,
            },
          });
          setReloadKey((k) => k + 1);
        }
      }, 110);
    },
    [numA, numB, numC, timeForCast],
  );

  /** 当前展示的卦（支持点击 64 卦浏览） */
  const shownBits = viewBits ?? result?.originalBits ?? null;
  const original = useMemo(() => (shownBits === null ? null : hexagramByBits(shownBits)), [shownBits]);
  const changed = useMemo(
    () => (result ? hexagramByBits(result.changedBits) : null),
    [result],
  );
  const changedDiffers = !!result && result.changedBits !== result.originalBits;

  /** 展示用动爻集合（浏览态不显示动爻） */
  const movingSet = useMemo(() => {
    if (viewBits !== null || !result) return new Set<number>();
    return new Set(result.movingLines);
  }, [result, viewBits]);

  const shownLines = useMemo<YaoLine[]>(() => {
    if (shownBits === null) return [0, 0, 0, 0, 0, 0];
    return Array.from({ length: 6 }, (_, i) => (((shownBits >> i) & 1) ? 1 : 0)) as YaoLine[];
  }, [shownBits]);

  return (
    <ToolShell
      title="易经算命"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Segmented
            size="small"
            value={method}
            onChange={(v) => setMethod(v as DivinationMethod)}
            options={[
              { label: "金钱卦", value: "coin" },
              { label: "时间起卦", value: "time" },
              { label: "报数起卦", value: "number" },
              { label: "大衍筮法", value: "yarrow" },
            ]}
          />
        </Space>
      }
    >
      {/* 起卦参数区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={10} wrap align="center">
          {method === "time" ? (
            <>
              <Text type="secondary">起卦时刻</Text>
              <DatePicker
                showTime={{ format: "HH:mm" }}
                format="YYYY-MM-DD HH:mm"
                value={timeForCast}
                onChange={(v) => v && setTimeForCast(v)}
                allowClear={false}
              />
            </>
          ) : null}
          {method === "number" ? (
            <>
              <Text type="secondary">上卦数</Text>
              <InputNumber min={1} max={99} value={numA} onChange={(v) => setNumA(v ?? 1)} style={{ width: 78 }} />
              <Text type="secondary">下卦数</Text>
              <InputNumber min={1} max={99} value={numB} onChange={(v) => setNumB(v ?? 1)} style={{ width: 78 }} />
              <Text type="secondary">动爻数（可空）</Text>
              <InputNumber min={1} max={99} value={numC} onChange={(v) => setNumC(v)} style={{ width: 78 }} placeholder="空" />
            </>
          ) : null}
          <Button
            type="primary"
            icon={<SyncOutlined />}
            loading={casting}
            onClick={() => cast(method)}
          >
            {casting ? `摇第 ${castStep} 爻…` : result ? "重新起卦" : "开始起卦"}
          </Button>
          {result ? (
            <Button icon={<ReloadOutlined />} onClick={() => setViewBits(null)}>
              回到本次结果
            </Button>
          ) : null}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {method === "coin"
              ? "三枚铜钱，摇六次，自下而上成卦"
              : method === "time"
                ? "以年月日时之数起卦，取后天之机"
                : method === "number"
                  ? "心中默念所问，随心报数"
                  : "五十蓍草，大衍之数（本工具为随机模拟）"}
          </Text>
        </Space>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(300px, auto) 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* 左：卦象图 */}
        <Card size="small" title={<Space><BookOutlined /> 卦象</Space>}>
          <HexagramGraphic
            lines={shownLines}
            moving={movingSet}
            casting={casting}
            castStep={castStep}
          />
          {original ? (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{hexagramDisplayName(original)}卦</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                第 {original.no} 卦 · {original.palace}（{PALACE_ELEMENT[original.palace]}） · {original.season}
              </Text>
              <div style={{ marginTop: 6 }}>
                <Space size={4} wrap>
                  {original.keywords.map((k) => (
                    <Tag key={k} color="volcano" style={{ marginInlineEnd: 0 }}>
                      {k}
                    </Tag>
                  ))}
                </Space>
              </div>
              <div style={{ marginTop: 6 }}>
                <Tag color="gold">
                  上卦 {TRIGRAM_SYMBOL[original.upper]} {TRIGRAM_NAMES[original.upper]}（{TRIGRAM_NATURE[original.upper]}）
                </Tag>
                <Tag color="green">
                  下卦 {TRIGRAM_SYMBOL[original.lower]} {TRIGRAM_NAMES[original.lower]}（{TRIGRAM_NATURE[original.lower]}）
                </Tag>
              </div>
            </div>
          ) : null}
        </Card>

        {/* 右：解卦 */}
        <div style={{ display: "grid", gap: 10 }}>
          {!result && !original ? (
            <Alert
              type="info"
              showIcon
              message="请选择起卦方式并点击「开始起卦」"
              description="金钱卦最常用：心中默念所问之事，摇动六次成卦。也可用时间起卦（以当下时刻）或报数起卦。"
            />
          ) : null}

          {result ? (
            <Card size="small" title="起卦依据">
              <Paragraph style={{ marginBottom: 0, fontSize: 13 }}>{result.basis}</Paragraph>
              <div style={{ marginTop: 6 }}>
                <Space size={6} wrap>
                  <Tag color="blue">{METHOD_LABEL[result.method]}</Tag>
                  <Tag color={result.movingLines.length ? "red" : "default"}>
                    动爻：{result.movingLines.length ? result.movingLines.map((n) => YAO_NAMES[n - 1]).join("、") : "无（六爻安静）"}
                  </Tag>
                </Space>
              </div>
            </Card>
          ) : null}

          {original ? (
            <Card
              size="small"
              title={`本卦 · ${hexagramDisplayName(original)}卦`}
              extra={
                <CopyButton
                  text={() =>
                    `${hexagramDisplayName(original)}卦（第 ${original.no} 卦）\n卦辞：${original.judgment}\n象曰：${original.image}\n释义：${original.meaning}`
                  }
                  label="复制"
                />
              }
            >
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="卦辞">
                  <Text style={{ fontSize: 13 }}>{original.judgment}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="象曰">
                  <Text style={{ fontSize: 13 }}>{original.image}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="释义">
                  <Text style={{ fontSize: 13 }}>{original.meaning}</Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ) : null}

          {/* 变卦 */}
          {result && changedDiffers && changed ? (
            <Card size="small" title={`变卦 · ${hexagramDisplayName(changed)}卦`}>
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="卦辞">
                  <Text style={{ fontSize: 13 }}>{changed.judgment}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="象曰">
                  <Text style={{ fontSize: 13 }}>{changed.image}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="释义">
                  <Text style={{ fontSize: 13 }}>{changed.meaning}</Text>
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 8 }}>
                <Tag color="purple">
                  {hexagramDisplayName(original!)} → {hexagramDisplayName(changed)}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  动则生变，本卦为体、变卦为用，观其所变而知进退。
                </Text>
              </div>
            </Card>
          ) : null}

          {/* 爻辞 */}
          {original ? (
            <Card size="small" title={`爻辞 · ${hexagramDisplayName(original)}卦`}>
              <YaoList
                lines={shownLines}
                moving={movingSet}
                texts={yaoTextsOf(original.no)}
              />
            </Card>
          ) : null}

          {/* 断卦提示 */}
          {result ? (
            <Card size="small" title="断卦提示">
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 8 }}
                message={judgingRuleText(result.movingLines.length)}
              />
              <div style={{ display: "grid", gap: 4 }}>
                {[...new Set([...(result.movingLines.length ? result.movingLines : [3])])].map((n) => (
                  <Text key={n} type="secondary" style={{ fontSize: 12 }}>
                    {yaoPositionName(n - 1, shownLines[n - 1] ?? 1)}：{YAO_POSITION_MEANING[n - 1]}
                  </Text>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {/* 六十四卦速查 */}
      <Card size="small" title="六十四卦速查（点击查看）" style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(74px, 1fr))", gap: 6 }}>
          {HEXAGRAMS.map((h) => {
            const bits = hexagramByBitsNo(h);
            const active = shownBits !== null && hexagramByBits(shownBits).no === h.no;
            return (
              <Tooltip key={h.no} title={`${hexagramDisplayName(h)}：${h.keywords.join("、")}`}>
                <div
                  onClick={() => {
                    setViewBits(bits);
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 4px",
                    borderRadius: 6,
                    textAlign: "center",
                    fontSize: 12,
                    background: active ? "rgba(22,119,255,0.16)" : "rgba(128,128,128,0.08)",
                    border: active ? "1px solid rgba(22,119,255,0.5)" : "1px solid transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.6 }}>{h.no}</div>
                  <div style={{ fontWeight: 600 }}>{h.name}</div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </Card>

      <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
        说明：卦辞、象辞、爻辞取自《周易》通行本原文；吉凶解读为传统象义的白话归纳，
        起卦（尤其大衍筮法）为随机模拟，结果仅供娱乐参考与传统文化了解，不构成任何决策依据。
      </Text>

      <ToolHistoryPanel
        toolId="yijing"
        toolTitle="易经算命"
        reloadKey={reloadKey}
        onRestore={(d) => {
          suppressNextRecord("yijing");
          const bits = typeof d.originalBits === "number" ? d.originalBits : null;
          const moving = Array.isArray(d.movingLines) ? (d.movingLines as number[]) : [];
          const m = (d.method as DivinationMethod) || "coin";
          if (bits === null) return;
          const rebuilt = divinationFromBits(m, bits, moving, String(d.basis || ""));
          setViewBits(null);
          setResult(rebuilt);
          setMethod(m);
        }}
      />
    </ToolShell>
  );
};

/** 爻位名（用于动爻展示） */
const YAO_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

/** 通过卦对象反查二进制（避免上层直接依赖 hexagramBits） */
function hexagramByBitsNo(h: Hexagram): number {
  let bits = 0;
  const lower = TRIGRAM_LINES[h.lower];
  const upper = TRIGRAM_LINES[h.upper];
  lower.forEach((y, i) => y && (bits |= 1 << i));
  upper.forEach((y, i) => y && (bits |= 1 << (i + 3)));
  return bits;
}

/** 八卦三爻表（本地副本，避免与 hexagramData 重复导出） */
const TRIGRAM_LINES: YaoLine[][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

/** 卦象图形：自下而上六爻，动爻高亮并标注 */
const HexagramGraphic: React.FC<{
  lines: YaoLine[];
  moving: Set<number>;
  casting: boolean;
  castStep: number;
}> = ({ lines, moving, casting, castStep }) => {
  const height = 6 * (YAO_H + YAO_GAP) + 20;
  const width = YAO_LEFT + YAO_W + 56;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", margin: "0 auto" }}>
      {[5, 4, 3, 2, 1, 0].map((i, row) => {
        const y = row * (YAO_H + YAO_GAP) + 10;
        const yao = lines[i] ?? 0;
        const isMoving = moving.has(i + 1);
        const revealed = !casting || castStep > i;
        const yin = yao === 0;
        const color = isMoving ? "#f5222d" : "currentColor";
        const opacity = revealed ? 1 : 0.16;
        const label = yaoPositionName(i, yao);
        const half = (YAO_W - 14) / 2;
        return (
          <g key={i} opacity={opacity} style={{ transition: "opacity 0.2s" }}>
            <text x={6} y={y + YAO_H / 2 + 1} fontSize={11} fill="currentColor" opacity={0.6} dominantBaseline="middle">
              {label}
            </text>
            {yin ? (
              <>
                <rect x={YAO_LEFT} y={y} width={half} height={YAO_H} rx={2} fill={color} />
                <rect x={YAO_LEFT + half + 14} y={y} width={half} height={YAO_H} rx={2} fill={color} />
              </>
            ) : (
              <rect x={YAO_LEFT} y={y} width={YAO_W} height={YAO_H} rx={2} fill={color} />
            )}
            {isMoving ? (
              <text x={YAO_LEFT + YAO_W + 8} y={y + YAO_H / 2 + 1} fontSize={12} fill="#f5222d" dominantBaseline="middle">
                ○动
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};

/** 爻辞列表（自下而上倒序显示，即上爻在顶部） */
const YaoList: React.FC<{
  lines: YaoLine[];
  moving: Set<number>;
  texts: string[];
}> = ({ lines, moving, texts }) => {
  if (texts.length === 0) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        本卦爻辞未收录于本工具数据表，请参考《周易》通行本原文。
      </Text>
    );
  }
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {[5, 4, 3, 2, 1, 0].map((i) => {
        const isMoving = moving.has(i + 1);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "5px 8px",
              borderRadius: 6,
              background: isMoving ? "rgba(245,34,45,0.08)" : i % 2 === 0 ? "rgba(128,128,128,0.06)" : "transparent",
              borderLeft: isMoving ? "2px solid #f5222d" : "2px solid transparent",
            }}
          >
            <Tag color={isMoving ? "red" : "default"} style={{ marginInlineEnd: 0, flexShrink: 0, fontSize: 11 }}>
              {yaoPositionName(i, lines[i])}
            </Tag>
            <Text style={{ fontSize: 12.5, flex: 1 }}>{texts[i]}</Text>
          </div>
        );
      })}
    </div>
  );
};

export default YijingTool;
