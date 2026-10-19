/*
 * 文本类新工具界面。
 */
import React, { useMemo, useState } from "react";
import { Button, Input, InputNumber, Segmented, Select, Space } from "antd";
import {
  convertCase,
  detectDelimiter,
  fillTemplate,
  findReplace,
  markdownTableToTsv,
  maskText,
  parseVarLines,
  processColumns,
  toFullWidth,
  toHalfWidth,
  toMarkdownTable,
  toPinyin,
  wordFrequency,
  type CaseStyle,
  type MaskKind,
  type PinyinStyle,
  type TemplateSyntax,
} from "./textLogic";
import { CopyButton, Err, ExtraPage, Note, Out } from "./kit";

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

const PINYIN_OPTIONS: { value: PinyinStyle; label: string }[] = [
  { value: "symbol", label: "带声调" },
  { value: "none", label: "无声调" },
  { value: "num", label: "数字调" },
  { value: "initial", label: "首字母" },
];

export const PinyinTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("汉字注音，Hello");
  const [style, setStyle] = useState<PinyinStyle>("symbol");
  const [sep, setSep] = useState(" ");
  const output = useMemo(() => toPinyin(input, style, sep), [input, style, sep]);
  return (
    <ExtraPage
      title="拼音转换"
      toolId="pinyin"
      onBack={onBack}
      action="convert"
      summary={input.trim() ? `注音 ${input.trim().length} 字` : ""}
      detail={{ input, style, sep }}
      active={!!input.trim()}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.style) setStyle(d.style as PinyinStyle);
        if (typeof d.sep === "string") setSep(d.sep);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented size="small" value={style} options={PINYIN_OPTIONS} onChange={(v) => setStyle(v as PinyinStyle)} />
        <Input value={sep} onChange={(e) => setSep(e.target.value)} placeholder="分隔符" style={{ width: 88 }} />
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} placeholder="输入汉字" />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Note>整段汉字注音。首字母可以把分隔符清空，得到连续缩写。</Note>
    </ExtraPage>
  );
};

export const WidthTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("Ｈｅｌｌｏ，世界　１２３");
  const [dir, setDir] = useState<"half" | "full">("half");
  const output = dir === "half" ? toHalfWidth(input) : toFullWidth(input);
  return (
    <ExtraPage
      title="全半角转换"
      toolId="width"
      onBack={onBack}
      action="convert"
      summary={input ? (dir === "half" ? "转为半角" : "转为全角") : ""}
      detail={{ input, dir }}
      active={!!input}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.dir === "half" || d.dir === "full") setDir(d.dir);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={dir}
        onChange={(v) => setDir(v as "half" | "full")}
        options={[
          { value: "half", label: "全角 → 半角" },
          { value: "full", label: "半角 → 全角" },
        ]}
      />
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Note>转换 ASCII 字母、数字、标点和空格。汉字本身保持不变。</Note>
    </ExtraPage>
  );
};

export const ReplaceTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("订单 A12 和 a12");
  const [find, setFind] = useState("a(\\d+)");
  const [replacement, setReplacement] = useState("NO-$1");
  const [regex, setRegex] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [wholeWord, setWholeWord] = useState(false);
  const result = useMemo(
    () => findReplace(input, find, replacement, { regex, ignoreCase, wholeWord }),
    [input, find, replacement, regex, ignoreCase, wholeWord],
  );
  return (
    <ExtraPage
      title="查找替换"
      toolId="replace"
      onBack={onBack}
      action="replace"
      summary={result.error ? "" : `替换 ${result.count} 处`}
      detail={{ input, find, replacement, regex, ignoreCase, wholeWord }}
      active={!!input && !!find && !result.error}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        setFind(String(d.find ?? ""));
        setReplacement(String(d.replacement ?? ""));
        setRegex(Boolean(d.regex));
        setIgnoreCase(Boolean(d.ignoreCase));
        setWholeWord(Boolean(d.wholeWord));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="查找" style={{ width: 180 }} />
        <Input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="替换为" style={{ width: 180 }} />
        <Segmented
          size="small"
          value={regex ? "re" : "text"}
          onChange={(v) => setRegex(v === "re")}
          options={[
            { value: "text", label: "普通文本" },
            { value: "re", label: "正则" },
          ]}
        />
        <Button size="small" type={ignoreCase ? "primary" : "default"} onClick={() => setIgnoreCase((v) => !v)}>
          忽略大小写
        </Button>
        <Button size="small" type={wholeWord ? "primary" : "default"} onClick={() => setWholeWord((v) => !v)}>
          整词
        </Button>
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={result.output} />
      <Err text={result.error} />
      <Note>{result.error ? "请修改查找内容。" : `共替换 ${result.count} 处。正则可用 $1 和 $<name>。`}</Note>
    </ExtraPage>
  );
};

export const WordFreqTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("苹果苹果 apple Apple 的 的 北京");
  const [mode, setMode] = useState<"char" | "word">("word");
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [ignoreStop, setIgnoreStop] = useState(true);
  const [top, setTop] = useState(20);
  const items = useMemo(
    () => wordFrequency(input, mode, ignoreCase, ignoreStop, top),
    [input, mode, ignoreCase, ignoreStop, top],
  );
  const max = items[0]?.count || 1;
  const copied = items.map((item) => `${item.token}\t${item.count}`).join("\n");
  return (
    <ExtraPage
      title="词频统计"
      toolId="wordfreq"
      onBack={onBack}
      action="count"
      summary={items.length ? `前 ${items.length} 项，最高「${items[0].token}」` : ""}
      detail={{ input, mode, ignoreCase, ignoreStop, top }}
      active={!!input.trim()}
      extra={<CopyButton text={copied} label="复制词频" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.mode === "char" || d.mode === "word") setMode(d.mode);
        setIgnoreCase(Boolean(d.ignoreCase));
        setIgnoreStop(Boolean(d.ignoreStop));
        if (typeof d.top === "number") setTop(d.top);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as "char" | "word")}
          options={[
            { value: "word", label: "词 / 二字" },
            { value: "char", label: "汉字逐字" },
          ]}
        />
        <Button size="small" type={ignoreCase ? "primary" : "default"} onClick={() => setIgnoreCase((v) => !v)}>
          忽略大小写
        </Button>
        <Button size="small" type={ignoreStop ? "primary" : "default"} onClick={() => setIgnoreStop((v) => !v)}>
          忽略虚词
        </Button>
        <InputNumber min={5} max={200} value={top} onChange={(v) => setTop(v || 20)} addonBefore="前" addonAfter="项" />
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} />
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {items.map((item) => (
          <div key={item.token} style={{ display: "grid", gridTemplateColumns: "96px 1fr 88px", gap: 8, alignItems: "center" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.token}</span>
            <div style={{ background: "rgba(22,119,255,0.12)", borderRadius: 4 }}>
              <div style={{ width: `${(item.count / max) * 100}%`, height: 8, background: "#1677ff", borderRadius: 4 }} />
            </div>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {item.count} · {item.percent}%
            </span>
          </div>
        ))}
      </div>
      <Note>英文按单词统计。汉字在「逐字」下按字，在「二字」下对连续汉字做二字滑动窗口。</Note>
    </ExtraPage>
  );
};

export const TemplateTool: React.FC<Props> = ({ onBack }) => {
  const [template, setTemplate] = useState("{{name|朋友}}，欢迎来到 {{city}}。订单 ${id}。");
  const [varsText, setVarsText] = useState("name=Ada\ncity=北京\nid=1001");
  const [syntax, setSyntax] = useState<TemplateSyntax>("mustache");
  const vars = useMemo(() => parseVarLines(varsText), [varsText]);
  const result = useMemo(() => fillTemplate(template, vars, syntax), [template, vars, syntax]);
  return (
    <ExtraPage
      title="模板填充"
      toolId="template"
      onBack={onBack}
      action="fill"
      summary={template.trim() ? `填充 ${Object.keys(vars).length} 个变量` : ""}
      detail={{ template, varsText, syntax }}
      active={!!template.trim()}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => {
        setTemplate(String(d.template ?? ""));
        setVarsText(String(d.varsText ?? ""));
        if (d.syntax === "mustache" || d.syntax === "dollar" || d.syntax === "percent") setSyntax(d.syntax);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={syntax}
        onChange={(v) => setSyntax(v as TemplateSyntax)}
        options={[
          { value: "mustache", label: "{{key}}" },
          { value: "dollar", label: "${key}" },
          { value: "percent", label: "%key%" },
        ]}
      />
      <TextArea value={template} onChange={(e) => setTemplate(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="模板" />
      <div style={{ height: 8 }} />
      <TextArea value={varsText} onChange={(e) => setVarsText(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder={"name=Ada\ncity=北京"} />
      <div style={{ height: 8 }} />
      <Out value={result.output} />
      <Note>
        每行一个 key=value，# 开头是注释。{"{{key|默认值}}"} 在变量缺失时使用默认值。
        {result.missing.length ? ` 尚未提供：${result.missing.join("、")}` : ""}
      </Note>
    </ExtraPage>
  );
};

export const MdTableTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("名称,数量,单价\n苹果,2,3.5\n梨,1,4");
  const [delimiter, setDelimiter] = useState("auto");
  const [back, setBack] = useState(false);
  const markdown = useMemo(() => toMarkdownTable(input, delimiter), [input, delimiter]);
  const output = back ? markdownTableToTsv(input) : markdown;
  return (
    <ExtraPage
      title="Markdown 表格"
      toolId="md-table"
      onBack={onBack}
      action="convert"
      summary={output ? (back ? "还原为 TSV" : "生成表格") : ""}
      detail={{ input, delimiter, back }}
      active={!!input.trim()}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (typeof d.delimiter === "string") setDelimiter(d.delimiter);
        setBack(Boolean(d.back));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          size="small"
          value={delimiter}
          onChange={setDelimiter}
          style={{ width: 140 }}
          options={[
            { value: "auto", label: `自动（${detectDelimiter(input) === "space" ? "空白" : detectDelimiter(input) === "\t" ? "Tab" : detectDelimiter(input)}）` },
            { value: ",", label: "逗号" },
            { value: "\t", label: "Tab" },
            { value: ";", label: "分号" },
            { value: "|", label: "竖线" },
            { value: "space", label: "空白" },
          ]}
        />
        <Segmented
          size="small"
          value={back ? "tsv" : "md"}
          onChange={(v) => setBack(v === "tsv")}
          options={[
            { value: "md", label: "生成表格" },
            { value: "tsv", label: "还原 TSV" },
          ]}
        />
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Note>数字列会右对齐。还原时会丢掉 Markdown 的对齐行。</Note>
    </ExtraPage>
  );
};

export const TextCaseTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("hello WORLD. this is a test");
  const [style, setStyle] = useState<CaseStyle>("title");
  const output = convertCase(input, style);
  return (
    <ExtraPage
      title="大小写转换"
      toolId="text-case"
      onBack={onBack}
      action="convert"
      summary={input.trim() ? style : ""}
      detail={{ input, style }}
      active={!!input.trim()}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (typeof d.style === "string") setStyle(d.style as CaseStyle);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={style}
        onChange={(v) => setStyle(v as CaseStyle)}
        options={[
          { value: "upper", label: "全大写" },
          { value: "lower", label: "全小写" },
          { value: "title", label: "词首大写" },
          { value: "sentence", label: "句首大写" },
          { value: "toggle", label: "对调" },
        ]}
      />
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Note>只改变拉丁字母。标识符的 camelCase / snake_case 用「命名转换」。</Note>
    </ExtraPage>
  );
};

export const ColumnsTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("名称\t数量\n苹果\t2\n梨\t10");
  const [delimiter, setDelimiter] = useState("auto");
  const [index, setIndex] = useState(2);
  const [mode, setMode] = useState<"pick" | "align">("pick");
  const result = useMemo(() => processColumns(input, delimiter, index), [input, delimiter, index]);
  const output = mode === "align" ? result.aligned : result.extracted;
  return (
    <ExtraPage
      title="列提取"
      toolId="columns"
      onBack={onBack}
      action="convert"
      summary={result.columnCount ? `${result.columnCount} 列` : ""}
      detail={{ input, delimiter, index, mode }}
      active={!!input.trim() && !result.error}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (typeof d.delimiter === "string") setDelimiter(d.delimiter);
        if (typeof d.index === "number") setIndex(d.index);
        if (d.mode === "pick" || d.mode === "align") setMode(d.mode);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          size="small"
          value={delimiter}
          onChange={setDelimiter}
          style={{ width: 120 }}
          options={[
            { value: "auto", label: "自动" },
            { value: "\t", label: "Tab" },
            { value: ",", label: "逗号" },
            { value: "|", label: "竖线" },
            { value: "space", label: "空白" },
          ]}
        />
        <InputNumber min={1} max={50} value={index} onChange={(v) => setIndex(v || 1)} addonBefore="第" addonAfter="列" />
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as "pick" | "align")}
          options={[
            { value: "pick", label: "抽出该列" },
            { value: "align", label: "对齐全部" },
          ]}
        />
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Err text={result.error} />
      <Note>列号从 1 开始。对齐按字符显示宽度计算，汉字按两个英文字符宽。</Note>
    </ExtraPage>
  );
};

const MASK_OPTIONS: { value: MaskKind; label: string }[] = [
  { value: "auto", label: "自动" },
  { value: "phone", label: "手机" },
  { value: "email", label: "邮箱" },
  { value: "id", label: "身份证" },
  { value: "bank", label: "银行卡" },
  { value: "name", label: "姓名" },
];

export const MaskTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("张三丰 13812345678 ada@example.com");
  const [kind, setKind] = useState<MaskKind>("auto");
  const output = maskText(input, kind);
  return (
    <ExtraPage
      title="信息脱敏"
      toolId="mask"
      onBack={onBack}
      action="mask"
      summary={input.trim() ? kind : ""}
      detail={{ input, kind }}
      active={!!input.trim()}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (typeof d.kind === "string") setKind(d.kind as MaskKind);
      }}
    >
      <Segmented size="small" style={{ marginBottom: 12 }} value={kind} options={MASK_OPTIONS} onChange={(v) => setKind(v as MaskKind)} />
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Note>自动模式会打码手机、邮箱、身份证，以及能通过 Luhn 校验的 16–19 位卡号。这是打码，不会校验号码真伪。</Note>
    </ExtraPage>
  );
};
