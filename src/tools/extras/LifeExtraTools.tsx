/*
 * 数值与生活类新工具界面。
 */
import React, { useMemo, useState } from "react";
import { Button, DatePicker, Input, InputNumber, Segmented, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  addWorkdays,
  calcBmi,
  calcCompound,
  calcGeometry,
  calcPercent,
  calcRatio,
  calcSalary,
  convertCoord,
  fromRoman,
  haversine,
  inspectLuhn,
  randomNumbers,
  rollDice,
  toRoman,
  workdaysBetween,
  type CoordSystem,
} from "./lifeLogic";
import { CopyButton, Err, ExtraPage, Note, Out, Rows, StatRow, numText, yuan } from "./kit";

interface Props {
  onBack?: () => void;
}

export const PercentTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<"ratio" | "value" | "change" | "zhe" | "off">("ratio");
  const [a, setA] = useState(25);
  const [b, setB] = useState(200);
  const [price, setPrice] = useState(100);
  const pack = calcPercent(a, b, b, a, price, a, a);
  const line =
    mode === "ratio"
      ? `${a} 是 ${b} 的 ${numText(pack.ratio, 4)}%`
      : mode === "value"
        ? `${b} 的 ${a}% 是 ${numText(pack.ofTotal, 4)}`
        : mode === "change"
          ? `从 ${b} 到 ${a}，变化 ${numText(pack.change, 4)}%`
          : mode === "zhe"
            ? `${price} 打 ${a} 折，应付 ${numText(pack.zhePay, 2)}`
            : `${price} 减免 ${a}%，应付 ${numText(pack.offPay, 2)}`;
  return (
    <ExtraPage
      title="百分比"
      toolId="percent"
      onBack={onBack}
      action="calculate"
      summary={line}
      detail={{ mode, a, b, price }}
      active
      extra={<CopyButton text={line} label="复制结果" />}
      onRestore={(d) => {
        if (typeof d.mode === "string") setMode(d.mode as typeof mode);
        if (typeof d.a === "number") setA(d.a);
        if (typeof d.b === "number") setB(d.b);
        if (typeof d.price === "number") setPrice(d.price);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={mode}
        onChange={(v) => setMode(v as typeof mode)}
        options={[
          { value: "ratio", label: "占比" },
          { value: "value", label: "求值" },
          { value: "change", label: "增减" },
          { value: "zhe", label: "打折" },
          { value: "off", label: "减免" },
        ]}
      />
      <Space wrap>
        {mode === "ratio" ? (
          <>
            <InputNumber value={a} onChange={(v) => setA(v || 0)} addonBefore="部分" />
            <InputNumber value={b} onChange={(v) => setB(v || 0)} addonBefore="整体" />
          </>
        ) : null}
        {mode === "value" ? (
          <>
            <InputNumber value={b} onChange={(v) => setB(v || 0)} addonBefore="基数" />
            <InputNumber value={a} onChange={(v) => setA(v || 0)} addonAfter="%" />
          </>
        ) : null}
        {mode === "change" ? (
          <>
            <InputNumber value={b} onChange={(v) => setB(v || 0)} addonBefore="原来" />
            <InputNumber value={a} onChange={(v) => setA(v || 0)} addonBefore="现在" />
          </>
        ) : null}
        {mode === "zhe" || mode === "off" ? (
          <>
            <InputNumber value={price} onChange={(v) => setPrice(v || 0)} addonBefore="原价" />
            <InputNumber value={a} onChange={(v) => setA(v || 0)} addonAfter={mode === "zhe" ? "折" : "%"} />
          </>
        ) : null}
      </Space>
      <div style={{ marginTop: 16, fontSize: 20 }}>{line}</div>
      <Note>打折按「8 折 = 支付 80%」计算，8.5 折也可用。减免是在原价上减去百分之几。</Note>
    </ExtraPage>
  );
};

export const RatioTool: React.FC<Props> = ({ onBack }) => {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [target, setTarget] = useState(1280);
  const [by, setBy] = useState<"width" | "height">("width");
  const result = calcRatio(width, height, target, by);
  const text = "error" in result ? "" : `${result.text}（${numText(result.decimal, 4)}）`;
  return (
    <ExtraPage
      title="比例计算"
      toolId="ratio"
      onBack={onBack}
      action="calculate"
      summary={text}
      detail={{ width, height, target, by }}
      active={"text" in result}
      extra={<CopyButton text={text} label="复制比例" />}
      onRestore={(d) => {
        if (typeof d.width === "number") setWidth(d.width);
        if (typeof d.height === "number") setHeight(d.height);
        if (typeof d.target === "number") setTarget(d.target);
        if (d.by === "width" || d.by === "height") setBy(d.by);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber min={0} value={width} onChange={(v) => setWidth(v || 0)} addonBefore="宽" />
        <InputNumber min={0} value={height} onChange={(v) => setHeight(v || 0)} addonBefore="高" />
        <InputNumber min={0} value={target} onChange={(v) => setTarget(v || 0)} addonBefore="目标" />
        <Segmented
          size="small"
          value={by}
          onChange={(v) => setBy(v as "width" | "height")}
          options={[
            { value: "width", label: "固定宽" },
            { value: "height", label: "固定高" },
          ]}
        />
      </Space>
      {"error" in result ? (
        <Err text={result.error} />
      ) : (
        <Rows>
          <StatRow label="约分" value={result.text} copyable />
          <StatRow label="小数" value={numText(result.decimal, 6)} copyable />
          <StatRow label="接近画幅" value={result.nearest} />
          <StatRow label="缩放后" value={`${numText(result.scaledWidth ?? 0, 2)} × ${numText(result.scaledHeight ?? 0, 2)}`} copyable />
        </Rows>
      )}
      <Note>按整数约分。画幅会在 16:9、4:3、3:2、1:1、21:9 及其竖版之间选最接近的一个。</Note>
    </ExtraPage>
  );
};

export const CompoundTool: React.FC<Props> = ({ onBack }) => {
  const [principal, setPrincipal] = useState(10000);
  const [rate, setRate] = useState(3);
  const [years, setYears] = useState(10);
  const [times, setTimes] = useState(12);
  const [extra, setExtra] = useState(500);
  const [timing, setTiming] = useState<"end" | "begin">("end");
  const result = calcCompound(principal, rate, years, times, extra, timing);
  const summary = "future" in result ? `终值 ${yuan(result.future)}` : "";
  return (
    <ExtraPage
      title="复利计算"
      toolId="compound"
      onBack={onBack}
      action="calculate"
      summary={summary}
      detail={{ principal, rate, years, times, extra, timing }}
      active={"future" in result}
      extra={<CopyButton text={summary} label="复制终值" />}
      onRestore={(d) => {
        if (typeof d.principal === "number") setPrincipal(d.principal);
        if (typeof d.rate === "number") setRate(d.rate);
        if (typeof d.years === "number") setYears(d.years);
        if (typeof d.times === "number") setTimes(d.times);
        if (typeof d.extra === "number") setExtra(d.extra);
        if (d.timing === "end" || d.timing === "begin") setTiming(d.timing);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber min={0} value={principal} onChange={(v) => setPrincipal(v || 0)} addonBefore="本金" />
        <InputNumber value={rate} onChange={(v) => setRate(v || 0)} addonAfter="% / 年" />
        <InputNumber min={1} max={100} value={years} onChange={(v) => setYears(v || 1)} addonAfter="年" />
        <InputNumber min={1} max={365} value={times} onChange={(v) => setTimes(v || 1)} addonBefore="每年" addonAfter="次" />
        <InputNumber min={0} value={extra} onChange={(v) => setExtra(v || 0)} addonBefore="每期追加" />
        <Segmented
          size="small"
          value={timing}
          onChange={(v) => setTiming(v as "end" | "begin")}
          options={[
            { value: "end", label: "期末投入" },
            { value: "begin", label: "期初投入" },
          ]}
        />
      </Space>
      {"error" in result ? (
        <Err text={result.error} />
      ) : (
        <>
          <Rows>
            <StatRow label="终值" value={yuan(result.future)} copyable />
            <StatRow label="累计投入" value={yuan(result.contributed)} copyable />
            <StatRow label="利息" value={yuan(result.interest)} copyable />
          </Rows>
          <div style={{ marginTop: 12, maxHeight: 240, overflow: "auto", display: "grid", gap: 4 }}>
            {result.rows.map((row) => (
              <StatRow key={row.year} label={`第 ${row.year} 年`} value={yuan(row.balance)} />
            ))}
          </div>
        </>
      )}
      <Note>追加金额按计息周期投入。每年 12 次时，追加额就是每月金额。这是收益估算，不是贷款月供。</Note>
    </ExtraPage>
  );
};

export const RomanTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("1994");
  const result = useMemo(() => {
    const text = input.trim();
    if (!text) return { output: "", error: "" };
    if (/^\d+$/.test(text)) {
      try {
        return { output: toRoman(Number(text)), error: "" };
      } catch (e) {
        return { output: "", error: e instanceof Error ? e.message : "无法转换" };
      }
    }
    try {
      return { output: String(fromRoman(text)), error: "" };
    } catch (e) {
      return { output: "", error: e instanceof Error ? e.message : "无法转换" };
    }
  }, [input]);
  return (
    <ExtraPage
      title="罗马数字"
      toolId="roman"
      onBack={onBack}
      action="convert"
      summary={result.output ? `${input.trim()} → ${result.output}` : ""}
      detail={{ input }}
      active={!!result.output}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => setInput(String(d.input ?? ""))}
    >
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="1994 或 MCMXCIV" style={{ width: 240, fontFamily: "ui-monospace, monospace" }} />
      <div style={{ marginTop: 16, fontSize: 28, fontFamily: "ui-monospace, monospace" }}>{result.output}</div>
      <Err text={result.error} />
      <Note>只接受 1 到 3999 的规范写法。4 是 IV，IIII 会被拒绝。</Note>
    </ExtraPage>
  );
};

export const GeometryTool: React.FC<Props> = ({ onBack }) => {
  const [shape, setShape] = useState<"rect" | "circle" | "triangle" | "trapezoid">("rect");
  const [a, setA] = useState(3);
  const [b, setB] = useState(4);
  const [c, setC] = useState(5);
  const result = calcGeometry(shape, [a, b, c]);
  const labels =
    shape === "rect" ? ["长", "宽"] : shape === "circle" ? ["半径"] : shape === "triangle" ? ["边 A", "边 B", "边 C"] : ["上底", "下底", "高"];
  return (
    <ExtraPage
      title="几何计算"
      toolId="geometry"
      onBack={onBack}
      action="calculate"
      summary={"items" in result ? result.items.map((item) => `${item.label} ${item.value}`).join("，") : ""}
      detail={{ shape, a, b, c }}
      active={"items" in result}
      onRestore={(d) => {
        if (d.shape === "rect" || d.shape === "circle" || d.shape === "triangle" || d.shape === "trapezoid") setShape(d.shape);
        if (typeof d.a === "number") setA(d.a);
        if (typeof d.b === "number") setB(d.b);
        if (typeof d.c === "number") setC(d.c);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={shape}
        onChange={(v) => setShape(v as typeof shape)}
        options={[
          { value: "rect", label: "矩形" },
          { value: "circle", label: "圆" },
          { value: "triangle", label: "三角形" },
          { value: "trapezoid", label: "梯形" },
        ]}
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber value={a} onChange={(v) => setA(v || 0)} addonBefore={labels[0]} />
        {labels[1] ? <InputNumber value={b} onChange={(v) => setB(v || 0)} addonBefore={labels[1]} /> : null}
        {labels[2] ? <InputNumber value={c} onChange={(v) => setC(v || 0)} addonBefore={labels[2]} /> : null}
      </Space>
      {"error" in result ? (
        <Err text={result.error} />
      ) : (
        <Rows>
          {result.items.map((item) => (
            <StatRow key={item.label} label={item.label} value={item.value} copyable />
          ))}
        </Rows>
      )}
      <Note>三角形用三边，余弦定理求角。梯形面积是（上底 + 下底）× 高 / 2。</Note>
    </ExtraPage>
  );
};

export const DiceTool: React.FC<Props> = ({ onBack }) => {
  const [expr, setExpr] = useState("2d6+3");
  const [roll, setRoll] = useState(() => rollDice("2d6+3"));
  const throwDice = () => setRoll(rollDice(expr));
  const summary = "total" in roll ? `${expr} = ${roll.total}` : "";
  return (
    <ExtraPage
      title="骰子"
      toolId="dice"
      onBack={onBack}
      action="roll"
      summary={summary}
      detail={{ expr, roll }}
      active={"total" in roll}
      extra={
        <Button size="small" type="primary" onClick={throwDice}>
          再掷一次
        </Button>
      }
      onRestore={(d) => {
        const next = String(d.expr ?? "2d6+3");
        setExpr(next);
        setRoll(rollDice(next));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input value={expr} onChange={(e) => setExpr(e.target.value)} onPressEnter={throwDice} style={{ width: 200, fontFamily: "ui-monospace, monospace" }} />
        <Button type="primary" onClick={throwDice}>
          掷骰
        </Button>
      </Space>
      {"error" in roll ? (
        <Err text={roll.error} />
      ) : (
        <>
          <div style={{ fontSize: 40, fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>{roll.total}</div>
          <Rows>
            {roll.parts.map((part, index) => (
              <StatRow
                key={`${part.label}-${index}`}
                label={part.label}
                value={part.faces ? `${part.faces.join(" + ")} = ${part.value}` : String(part.value)}
              />
            ))}
          </Rows>
        </>
      )}
      <Note>支持 2d6+1d4-1 这种写法。d 前面省略数字时按 1 颗计算。</Note>
    </ExtraPage>
  );
};

export const RandomNumTool: React.FC<Props> = ({ onBack }) => {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [count, setCount] = useState(5);
  const [decimals, setDecimals] = useState(0);
  const [unique, setUnique] = useState(true);
  const [values, setValues] = useState<number[] | { error: string }>(() => randomNumbers(1, 100, 5, true, 0));
  const draw = () => setValues(randomNumbers(min, max, count, unique, decimals));
  const text = Array.isArray(values) ? values.join("\n") : "";
  return (
    <ExtraPage
      title="随机数"
      toolId="random-num"
      onBack={onBack}
      action="generate"
      summary={text ? `${Array.isArray(values) ? values.length : 0} 个数` : ""}
      detail={{ min, max, count, decimals, unique, text }}
      active={!!text}
      extra={<CopyButton text={text} label="复制" />}
      onRestore={(d) => {
        if (typeof d.min === "number") setMin(d.min);
        if (typeof d.max === "number") setMax(d.max);
        if (typeof d.count === "number") setCount(d.count);
        if (typeof d.decimals === "number") setDecimals(d.decimals);
        setUnique(Boolean(d.unique));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber value={min} onChange={(v) => setMin(v ?? 0)} addonBefore="最小" />
        <InputNumber value={max} onChange={(v) => setMax(v ?? 0)} addonBefore="最大" />
        <InputNumber min={1} max={500} value={count} onChange={(v) => setCount(v || 1)} addonBefore="个数" />
        <InputNumber min={0} max={8} value={decimals} onChange={(v) => setDecimals(v || 0)} addonBefore="小数" />
        <Button size="small" type={unique ? "primary" : "default"} onClick={() => setUnique((v) => !v)}>
          不重复
        </Button>
        <Button type="primary" onClick={draw}>
          生成
        </Button>
      </Space>
      {Array.isArray(values) ? <Out value={text} /> : <Err text={values.error} />}
      <Note>用系统随机源。不重复时，整数区间必须容得下要的个数。</Note>
    </ExtraPage>
  );
};

export const WorkdayTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<"between" | "add">("between");
  const [start, setStart] = useState<Dayjs>(() => dayjs());
  const [end, setEnd] = useState<Dayjs>(() => dayjs().add(6, "day"));
  const [days, setDays] = useState(5);
  const [skip, setSkip] = useState(true);
  const startText = start.format("YYYY-MM-DD");
  const endText = end.format("YYYY-MM-DD");
  const between = workdaysBetween(startText, endText, skip);
  const added = addWorkdays(startText, days, skip);
  const summary =
    mode === "between"
      ? "count" in between
        ? `${between.count} 个工作日`
        : ""
      : typeof added === "string"
        ? added
        : "";
  return (
    <ExtraPage
      title="工作日计算"
      toolId="workday"
      onBack={onBack}
      action="calculate"
      summary={summary}
      detail={{ mode, start: startText, end: endText, days, skip }}
      active={!!summary}
      extra={<CopyButton text={summary} label="复制结果" />}
      onRestore={(d) => {
        if (d.mode === "between" || d.mode === "add") setMode(d.mode);
        const nextStart = dayjs(String(d.start ?? ""));
        const nextEnd = dayjs(String(d.end ?? ""));
        if (nextStart.isValid()) setStart(nextStart);
        if (nextEnd.isValid()) setEnd(nextEnd);
        if (typeof d.days === "number") setDays(d.days);
        setSkip(Boolean(d.skip));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as "between" | "add")}
          options={[
            { value: "between", label: "区间计数" },
            { value: "add", label: "往后推" },
          ]}
        />
        <DatePicker value={start} onChange={(value) => value && setStart(value)} allowClear={false} />
        {mode === "between" ? (
          <DatePicker value={end} onChange={(value) => value && setEnd(value)} allowClear={false} />
        ) : null}
        {mode === "add" ? <InputNumber value={days} onChange={(v) => setDays(v || 0)} addonAfter="个工作日" /> : null}
        <Button size="small" type={skip ? "primary" : "default"} onClick={() => setSkip((v) => !v)}>
          跳过法定放假
        </Button>
      </Space>
      {mode === "between" && "error" in between ? <Err text={between.error} /> : null}
      {mode === "between" && "count" in between ? (
        <Rows>
          <StatRow label="工作日" value={String(between.count)} copyable />
          <StatRow label="起止" value={between.first ? `${between.first} → ${between.last}` : "没有工作日"} />
          <StatRow label="样例" value={between.sample.join("、") || "—"} />
        </Rows>
      ) : null}
      {mode === "add" && typeof added === "string" ? <StatRow label="结果日期" value={added} copyable /> : null}
      {mode === "add" && typeof added !== "string" ? <Err text={added.error} /> : null}
      <Note>周末不计。打开「跳过法定放假」后，会用内置节假日表去掉放假日。周末调休上班没有单独收录，结果可能少算这些天。</Note>
    </ExtraPage>
  );
};

export const BmiTool: React.FC<Props> = ({ onBack }) => {
  const [weight, setWeight] = useState(70);
  const [height, setHeight] = useState(175);
  const result = calcBmi(weight, height);
  const summary = "bmi" in result ? `${result.bmi} ${result.category}` : "";
  return (
    <ExtraPage
      title="体质指数"
      toolId="bmi"
      onBack={onBack}
      action="calculate"
      summary={summary}
      detail={{ weight, height }}
      active={"bmi" in result}
      onRestore={(d) => {
        if (typeof d.weight === "number") setWeight(d.weight);
        if (typeof d.height === "number") setHeight(d.height);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber min={0} value={weight} onChange={(v) => setWeight(v || 0)} addonAfter="kg" />
        <InputNumber min={0} value={height} onChange={(v) => setHeight(v || 0)} addonAfter="cm" />
      </Space>
      {"error" in result ? (
        <Err text={result.error} />
      ) : (
        <Rows>
          <StatRow label="BMI" value={String(result.bmi)} copyable />
          <StatRow label="分级" value={result.category} />
          <StatRow label="健康体重" value={`${result.healthyMin} – ${result.healthyMax} kg`} />
        </Rows>
      )}
      <Note>按中国成人标准：低于 18.5 体重过低，18.5–23.9 正常，24–27.9 超重，28 及以上肥胖。只作参考，不能代替体检。</Note>
    </ExtraPage>
  );
};

export const SalaryTool: React.FC<Props> = ({ onBack }) => {
  const [gross, setGross] = useState(10000);
  const [month, setMonth] = useState(1);
  const [pension, setPension] = useState(8);
  const [medical, setMedical] = useState(2);
  const [unemployment, setUnemployment] = useState(0.5);
  const [fund, setFund] = useState(12);
  const [special, setSpecial] = useState(0);
  const result = calcSalary({
    gross,
    monthIndex: month,
    pensionRate: pension,
    medicalRate: medical,
    unemploymentRate: unemployment,
    fundRate: fund,
    baseMin: null,
    baseMax: null,
    specialDeduction: special,
    threshold: 5000,
  });
  const summary = "net" in result ? `到手 ${yuan(result.net)}` : "";
  return (
    <ExtraPage
      title="税后工资"
      toolId="salary"
      onBack={onBack}
      action="calculate"
      summary={summary}
      detail={{ gross, month, pension, medical, unemployment, fund, special }}
      active={"net" in result}
      extra={<CopyButton text={summary} label="复制到手" />}
      onRestore={(d) => {
        if (typeof d.gross === "number") setGross(d.gross);
        if (typeof d.month === "number") setMonth(d.month);
        if (typeof d.pension === "number") setPension(d.pension);
        if (typeof d.medical === "number") setMedical(d.medical);
        if (typeof d.unemployment === "number") setUnemployment(d.unemployment);
        if (typeof d.fund === "number") setFund(d.fund);
        if (typeof d.special === "number") setSpecial(d.special);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber min={0} value={gross} onChange={(v) => setGross(v || 0)} addonBefore="月薪" />
        <InputNumber min={1} max={12} value={month} onChange={(v) => setMonth(v || 1)} addonBefore="第" addonAfter="月" />
        <InputNumber min={0} value={special} onChange={(v) => setSpecial(v || 0)} addonBefore="专项附加/月" />
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber min={0} max={100} value={pension} onChange={(v) => setPension(v || 0)} addonBefore="养老 %" />
        <InputNumber min={0} max={100} value={medical} onChange={(v) => setMedical(v || 0)} addonBefore="医疗 %" />
        <InputNumber min={0} max={100} value={unemployment} onChange={(v) => setUnemployment(v || 0)} addonBefore="失业 %" />
        <InputNumber min={0} max={100} value={fund} onChange={(v) => setFund(v || 0)} addonBefore="公积金 %" />
      </Space>
      {"error" in result ? (
        <Err text={result.error} />
      ) : (
        <Rows>
          <StatRow label="本月到手" value={yuan(result.net)} copyable />
          <StatRow label="本月个税" value={yuan(result.tax)} copyable />
          <StatRow label="五险一金" value={yuan(result.social)} />
          <StatRow label="养老 / 医疗 / 失业 / 公积金" value={`${yuan(result.pension)} / ${yuan(result.medical)} / ${yuan(result.unemployment)} / ${yuan(result.fund)}`} />
          <StatRow label="累计应纳税所得" value={yuan(result.cumulativeTaxable)} />
          <StatRow label="当前税率档" value={result.bracket} />
          <StatRow label="全年同薪到手" value={yuan(result.yearNet)} />
          <StatRow label="全年个税" value={yuan(result.yearTax)} />
        </Rows>
      )}
      <Note>按累计预扣法，起征点每月 5000。默认费率只是示例，缴费基数上下限和各地比例请按工资单修改。全年数字假设 12 个月工资不变。</Note>
    </ExtraPage>
  );
};

export const CoordTool: React.FC<Props> = ({ onBack }) => {
  const [lng, setLng] = useState(116.397);
  const [lat, setLat] = useState(39.909);
  const [from, setFrom] = useState<CoordSystem>("wgs84");
  const [lng2, setLng2] = useState<number | null>(121.473);
  const [lat2, setLat2] = useState<number | null>(31.23);
  const converted = convertCoord(lng, lat, from);
  const meters =
    lng2 != null && lat2 != null && Number.isFinite(lng2) && Number.isFinite(lat2) ? haversine(lng, lat, lng2, lat2) : null;
  const fmt = (pair: [number, number]) => `${pair[0].toFixed(6)}, ${pair[1].toFixed(6)}`;
  return (
    <ExtraPage
      title="坐标转换"
      toolId="coord"
      onBack={onBack}
      action="convert"
      summary={"wgs84" in converted ? fmt(converted[from]) : ""}
      detail={{ lng, lat, from, lng2, lat2 }}
      active={"wgs84" in converted}
      onRestore={(d) => {
        if (typeof d.lng === "number") setLng(d.lng);
        if (typeof d.lat === "number") setLat(d.lat);
        if (d.from === "wgs84" || d.from === "gcj02" || d.from === "bd09") setFrom(d.from);
        if (typeof d.lng2 === "number" || d.lng2 === null) setLng2(d.lng2 as number | null);
        if (typeof d.lat2 === "number" || d.lat2 === null) setLat2(d.lat2 as number | null);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <InputNumber value={lng} onChange={(v) => setLng(v || 0)} addonBefore="经度" step={0.001} />
        <InputNumber value={lat} onChange={(v) => setLat(v || 0)} addonBefore="纬度" step={0.001} />
        <Segmented
          size="small"
          value={from}
          onChange={(v) => setFrom(v as CoordSystem)}
          options={[
            { value: "wgs84", label: "WGS-84" },
            { value: "gcj02", label: "GCJ-02" },
            { value: "bd09", label: "BD-09" },
          ]}
        />
      </Space>
      {"error" in converted ? (
        <Err text={converted.error} />
      ) : (
        <Rows>
          <StatRow label="WGS-84" value={fmt(converted.wgs84)} copyable />
          <StatRow label="GCJ-02 国测局" value={fmt(converted.gcj02)} copyable />
          <StatRow label="BD-09 百度" value={fmt(converted.bd09)} copyable />
        </Rows>
      )}
      <Space wrap style={{ marginTop: 12 }}>
        <InputNumber value={lng2 ?? undefined} onChange={(v) => setLng2(v)} addonBefore="第二点经度" step={0.001} />
        <InputNumber value={lat2 ?? undefined} onChange={(v) => setLat2(v)} addonBefore="纬度" step={0.001} />
      </Space>
      {meters != null ? (
        <div style={{ marginTop: 8 }}>
          <StatRow label="球面距离" value={meters >= 1000 ? `${numText(meters / 1000, 2)} km` : `${Math.round(meters)} m`} copyable />
        </div>
      ) : null}
      <Note>国内地图常用 GCJ-02，百度地图再加一层 BD-09。偏移是公开近似算法，精度大约到米级，境外坐标不做国测局偏移。</Note>
    </ExtraPage>
  );
};

export const LuhnTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("4111 1111 1111 1111");
  const result = inspectLuhn(input);
  return (
    <ExtraPage
      title="Luhn 校验"
      toolId="luhn"
      onBack={onBack}
      action="check"
      summary={"valid" in result ? (result.valid ? "校验通过" : "校验失败") : ""}
      detail={{ input }}
      active={"valid" in result}
      onRestore={(d) => setInput(String(d.input ?? ""))}
    >
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="卡号或 IMEI，可含空格" style={{ maxWidth: 360, fontFamily: "ui-monospace, monospace" }} />
      {"error" in result ? (
        <Err text={input.trim() ? result.error : undefined} />
      ) : (
        <div style={{ marginTop: 12 }}>
          <Rows>
            <StatRow label="校验" value={result.valid ? "通过" : "不通过"} />
            <StatRow label="应得校验位" value={result.expected} copyable />
            <StatRow label="位数" value={String(result.length)} />
            <StatRow label="卡组织" value={result.brand} />
            <StatRow label="纯数字" value={result.digits} copyable />
          </Rows>
        </div>
      )}
      <Note>Luhn 只检查校验位，Visa、万事达、银联和 15 位 IMEI 都用它。通过校验也不能说明卡真实存在。居民身份证用的是另一套校验，请用「身份证校验」。</Note>
    </ExtraPage>
  );
};
