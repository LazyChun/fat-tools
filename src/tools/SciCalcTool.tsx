/*
 * 科学计算器：表达式计算（复用 utils 的递归下降解析器）+ 科学函数面板 +
 * 角度/弧度制切换 + 统计模式（描述统计）。
 *
 * 与传统计算器不同，这里所有科学函数都需要在 utils.FUNCTIONS 中已注册，
 * 因此本组件不新增解析逻辑，仅组织交互层。
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  Radio,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { ClearOutlined, DeleteOutlined } from "@ant-design/icons";
import {
  SCI_CONSTANTS,
  SCI_FUNCTIONS,
  evaluateExpression,
  formatNumber,
  parseNumberList,
  summarizeNumbers,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, suppressNextRecord } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";
import { CALCULATOR_SEARCH_FEED } from "./CalculatorTool";

// 科学计算器的全局搜索直达：算式形态与计算器一致（复用其正则源，
// 计算器侧调整自动跟随；其函数调用分支为前缀匹配，勿在外层加 $），
// 另支持 "1, 2, 3" 逗号分隔数字列表（统计模式，自带首尾锚定）
export const SCI_CALC_SEARCH_FEED = createToolSearchFeed(
  new RegExp(
    `(?:${CALCULATOR_SEARCH_FEED.pattern.source}|^\\d+(?:\\.\\d+)?(?:\\s*,\\s*\\d+(?:\\.\\d+)?){2,}$)`,
  ),
);

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

/** 按键布局：每项 [显示文本, 插入文本, 说明] */
interface Key {
  label: string;
  insert: string;
  tip?: string;
}

const BASIC_KEYS: Key[][] = [
  [
    { label: "7", insert: "7" },
    { label: "8", insert: "8" },
    { label: "9", insert: "9" },
    { label: "÷", insert: "/", tip: "除" },
    { label: "C", insert: "__C__", tip: "清空" },
  ],
  [
    { label: "4", insert: "4" },
    { label: "5", insert: "5" },
    { label: "6", insert: "6" },
    { label: "×", insert: "*", tip: "乘" },
    { label: "⌫", insert: "__B__", tip: "退格" },
  ],
  [
    { label: "1", insert: "1" },
    { label: "2", insert: "2" },
    { label: "3", insert: "3" },
    { label: "−", insert: "-", tip: "减" },
    { label: "(", insert: "(" },
  ],
  [
    { label: "0", insert: "0" },
    { label: ".", insert: "." },
    { label: "π", insert: "pi", tip: "圆周率" },
    { label: "+", insert: "+" },
    { label: ")", insert: ")" },
  ],
];

const SCI_KEYS: Key[][] = [
  [
    { label: "√", insert: "sqrt(", tip: "平方根" },
    { label: "∛", insert: "cbrt(", tip: "立方根" },
    { label: "x²", insert: "^2", tip: "平方" },
    { label: "xʸ", insert: "^", tip: "乘方" },
    { label: "|x|", insert: "abs(", tip: "绝对值" },
    { label: "n!", insert: "fact(", tip: "阶乘" },
  ],
  [
    { label: "sin", insert: "sin(", tip: "正弦" },
    { label: "cos", insert: "cos(", tip: "余弦" },
    { label: "tan", insert: "tan(", tip: "正切" },
    { label: "asin", insert: "asin(", tip: "反正弦" },
    { label: "acos", insert: "acos(", tip: "反余弦" },
    { label: "atan", insert: "atan(", tip: "反正切" },
  ],
  [
    { label: "ln", insert: "ln(", tip: "自然对数" },
    { label: "log", insert: "log(", tip: "常用对数" },
    { label: "log₂", insert: "log2(", tip: "以 2 为底" },
    { label: "eˣ", insert: "exp(", tip: "e 的 x 次方" },
    { label: "e", insert: "e", tip: "自然常数" },
    { label: "10ˣ", insert: "10^", tip: "10 的 x 次方" },
  ],
  [
    { label: "gcd", insert: "gcd(", tip: "最大公约数" },
    { label: "lcm", insert: "lcm(", tip: "最小公倍数" },
    { label: "nCr", insert: "nCr(", tip: "组合数" },
    { label: "nPr", insert: "nPr(", tip: "排列数" },
    { label: "hypot", insert: "hypot(", tip: "斜边" },
    { label: "π", insert: "pi" },
  ],
];

interface HistoryItem {
  expr: string;
  result: string;
}

const SciCalcTool: React.FC<Props> = ({ onBack }) => {
  const [expr, setExpr] = useState("");
  const [angleMode, setAngleMode] = useState<"rad" | "deg">("rad");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"calc" | "stats">("calc");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [statsInput, setStatsInput] = useState("1, 2, 3, 4, 5, 6, 7, 8, 9, 10");
  const [mem, setMem] = useState<number | null>(null);

  // 全局搜索直达：算式填入表达式框，逗号分隔数字列表填入统计输入并切换统计模式
  const feedSciCalc = useCallback((value: string) => {
    if (/^\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)+$/.test(value.trim())) {
      setMode("stats");
      setStatsInput(value);
    } else {
      setMode("calc");
      setExpr(value);
    }
  }, []);
  SCI_CALC_SEARCH_FEED.useFeedValue(feedSciCalc);

  const compute = useCallback(
    (input?: string) => {
      const source = (input ?? expr).trim();
      if (!source) return;
      try {
        const value = evaluateExpression(source, {
          angleMode,
          memory: mem ?? undefined,
        });
        const formatted = formatNumber(value);
        setResult(formatted);
        setError("");
        setHistory((h) =>
          [{ expr: source, result: formatted }, ...h].slice(0, 30),
        );
        recordUsage({
          toolId: "scicalc",
          toolTitle: "科学计算器",
          action: "calculate",
          summary: `${source} = ${formatted}`,
          detail: { input: source, result: formatted, angleMode },
        });
      } catch (e) {
        setError((e as Error).message);
        setResult("");
      }
    },
    [expr, angleMode],
  );

  const press = (key: Key) => {
    if (key.insert === "__C__") {
      setExpr("");
      setResult("");
      setError("");
      return;
    }
    if (key.insert === "__B__") {
      setExpr((v) => v.slice(0, -1));
      return;
    }
    setExpr((v) => v + key.insert);
  };

  // 键盘输入支持回车即时计算
  const stats = useMemo(
    () => summarizeNumbers(parseNumberList(statsInput)),
    [statsInput],
  );

  return (
    <ToolShell
      title="科学计算器"
      onBack={onBack}
      extra={
        <Space size={8} wrap>
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { value: "calc", label: "表达式" },
              { value: "stats", label: "统计" },
            ]}
          />
          <Radio.Group
            size="small"
            value={angleMode}
            onChange={(e) => setAngleMode(e.target.value)}
            optionType="button"
            options={[
              { label: "RAD", value: "rad" },
              { label: "DEG", value: "deg" },
            ]}
          />
        </Space>
      }
    >
      {mode === "calc" ? (
        <>
          <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
            <Input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onPressEnter={() => compute()}
              placeholder="输入表达式，如 sin(pi/6)+log(2,8)+fact(5) 或 2^10，回车计算"
              style={{ fontFamily: "monospace", fontSize: 15 }}
              allowClear
            />
            <Button type="primary" onClick={() => compute()}>
              计算
            </Button>
          </Space.Compact>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              padding: "8px 14px",
              borderRadius: 8,
              background: result
                ? "rgba(22,119,255,0.08)"
                : "rgba(128,128,128,0.06)",
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              结果
            </Text>
            <Text
              strong
              style={{
                fontSize: 22,
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {result || "—"}
            </Text>
            {result ? <CopyButton text={result} label="复制" /> : null}
            {result ? (
              <Tooltip title="写入记忆，可在表达式里用 mem 引用">
                <Button size="small" onClick={() => setMem(Number(result))}>
                  M+
                </Button>
              </Tooltip>
            ) : null}
            {mem !== null ? (
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                M = {formatNumber(mem)}
              </Tag>
            ) : null}
          </div>

          {error ? (
            <Tag color="error" style={{ marginBottom: 10 }}>
              {error}
            </Tag>
          ) : null}

          {mem !== null ? (
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                记忆值 M = {formatNumber(mem)}
              </Text>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            }}
          >
            <Card size="small" title="数字键盘">
              <div style={{ display: "grid", gap: 4 }}>
                {BASIC_KEYS.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      gap: 4,
                    }}
                  >
                    {row.map((k) => (
                      <Tooltip key={k.label} title={k.tip}>
                        <Button
                          size="small"
                          danger={k.insert === "__C__"}
                          onClick={() => press(k)}
                          style={{ fontFamily: "monospace" }}
                        >
                          {k.label}
                        </Button>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

            <Card size="small" title="科学函数">
              <div style={{ display: "grid", gap: 4 }}>
                {SCI_KEYS.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gap: 4,
                    }}
                  >
                    {row.map((k) => (
                      <Tooltip key={k.label} title={k.tip}>
                        <Button
                          size="small"
                          onClick={() => press(k)}
                          style={{ fontFamily: "monospace", padding: "0 4px" }}
                        >
                          {k.label}
                        </Button>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              支持：+ - * / % ^ 括号、隐式乘法（2pi）、常量 pi /
              e，以及全部科学函数。 当前为
              {angleMode === "rad"
                ? "弧度制（三角函数的输入输出按弧度）"
                : "角度制（三角函数的输入按角度）"}
              。
            </Text>
          </div>

          {history.length > 0 ? (
            <Card size="small" title="本次会话历史" style={{ marginTop: 10 }}>
              <div style={{ maxHeight: 180, overflow: "auto" }}>
                {history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      padding: "3px 0",
                      cursor: "pointer",
                    }}
                    onClick={() => setExpr(h.expr)}
                    title="点击回填表达式"
                  >
                    {h.expr} = <Text strong>{h.result}</Text>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <StatsPanel input={statsInput} onChange={setStatsInput} stats={stats} />
      )}

      <Card size="small" title="函数速查" style={{ marginTop: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 4,
          }}
        >
          {SCI_FUNCTIONS.map((f) => (
            <div key={f.name} style={{ display: "flex", gap: 6, fontSize: 12 }}>
              <Text code style={{ fontSize: 12 }}>
                {f.name}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {f.desc}
              </Text>
            </div>
          ))}
          {SCI_CONSTANTS.map((c) => (
            <div key={c.name} style={{ display: "flex", gap: 6, fontSize: 12 }}>
              <Text code style={{ fontSize: 12 }}>
                {c.name} = {c.value}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {c.desc}
              </Text>
            </div>
          ))}
        </div>
      </Card>

      <ToolHistoryPanel
        toolId="scicalc"
        toolTitle="科学计算器"
        onRestore={(d) => {
          suppressNextRecord("scicalc");
          if (typeof d.input === "string") setExpr(d.input);
          if (d.angleMode === "deg" || d.angleMode === "rad")
            setAngleMode(d.angleMode);
        }}
      />
    </ToolShell>
  );
};

/** 统计面板：一组数值的描述统计 */
const StatsPanel: React.FC<{
  input: string;
  onChange: (v: string) => void;
  stats: ReturnType<typeof summarizeNumbers>;
}> = ({ input, onChange, stats }) => (
  <div>
    <Input.TextArea
      value={input}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      placeholder="输入一组数字，用逗号 / 空格 / 换行分隔，如：1, 2, 3, 4, 5"
      style={{ fontFamily: "monospace", marginBottom: 10 }}
    />
    {stats ? (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 6,
        }}
      >
        <StatRow label="个数" value={stats.count} />
        <StatRow label="求和" value={formatNumber(stats.sum)} copyable />
        <StatRow label="平均值" value={formatNumber(stats.mean)} copyable />
        <StatRow label="中位数" value={formatNumber(stats.median)} copyable />
        <StatRow label="最小值" value={formatNumber(stats.min)} />
        <StatRow label="最大值" value={formatNumber(stats.max)} />
        <StatRow
          label="样本标准差"
          value={formatNumber(stats.stddev)}
          copyable
        />
        <StatRow
          label="总体标准差"
          value={formatNumber(stats.stddevP)}
          copyable
        />
        <StatRow
          label="样本方差"
          value={formatNumber(stats.variance)}
          copyable
        />
      </div>
    ) : (
      <Text type="secondary">请输入至少一个有效数字</Text>
    )}
    {stats ? (
      <div style={{ marginTop: 10 }}>
        <CopyButton
          text={() =>
            [
              `个数\t${stats.count}`,
              `求和\t${formatNumber(stats.sum)}`,
              `平均值\t${formatNumber(stats.mean)}`,
              `中位数\t${formatNumber(stats.median)}`,
              `最小值\t${formatNumber(stats.min)}`,
              `最大值\t${formatNumber(stats.max)}`,
              `样本标准差\t${formatNumber(stats.stddev)}`,
              `总体标准差\t${formatNumber(stats.stddevP)}`,
              `样本方差\t${formatNumber(stats.variance)}`,
            ].join("\n")
          }
          label="复制统计结果"
        />
      </div>
    ) : null}
  </div>
);

export default SciCalcTool;
