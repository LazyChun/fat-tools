/*
 * 编码类新工具界面。
 */
import React, { useCallback, useMemo, useState } from "react";
import { Input, InputNumber, Segmented, Space } from "antd";
import {
  applyCipher,
  base32DecodeText,
  base32EncodeText,
  codePointsToText,
  contrastRatio,
  domainToAscii,
  domainToUnicode,
  escapeString,
  hexDump,
  hexToText,
  inspectText,
  parseCssColor,
  textToHex,
  unescapeString,
  type CipherKind,
  type EscapeLang,
} from "./codecLogic";
import { PUNYCODE_SEARCH_FEED } from "./feeds";
import { CopyButton, Err, ExtraPage, Note, Out, Rows, StatRow } from "./kit";

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

export const CipherTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("ATTACK AT DAWN");
  const [kind, setKind] = useState<CipherKind>("caesar");
  const [shift, setShift] = useState(3);
  const [key, setKey] = useState("LEMON");
  const [decode, setDecode] = useState(false);
  const result = useMemo(() => applyCipher(input, kind, shift, key, decode), [input, kind, shift, key, decode]);
  return (
    <ExtraPage
      title="古典密码"
      toolId="cipher"
      onBack={onBack}
      action={decode ? "decode" : "encode"}
      summary={result.output ? kind : ""}
      detail={{ input, kind, shift, key, decode }}
      active={!!input && !result.error}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (typeof d.kind === "string") setKind(d.kind as CipherKind);
        if (typeof d.shift === "number") setShift(d.shift);
        setKey(String(d.key ?? ""));
        setDecode(Boolean(d.decode));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={kind}
          onChange={(v) => setKind(v as CipherKind)}
          options={[
            { value: "caesar", label: "凯撒" },
            { value: "rot13", label: "ROT13" },
            { value: "rot47", label: "ROT47" },
            { value: "atbash", label: "Atbash" },
            { value: "vigenere", label: "维吉尼亚" },
          ]}
        />
        {kind === "caesar" ? (
          <InputNumber min={-25} max={25} value={shift} onChange={(v) => setShift(v || 0)} addonBefore="移" addonAfter="位" />
        ) : null}
        {kind === "vigenere" ? (
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="密钥" style={{ width: 140 }} />
        ) : null}
        {kind === "caesar" || kind === "vigenere" ? (
          <Segmented
            size="small"
            value={decode ? "dec" : "enc"}
            onChange={(v) => setDecode(v === "dec")}
            options={[
              { value: "enc", label: "加密" },
              { value: "dec", label: "解密" },
            ]}
          />
        ) : null}
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={result.output} />
      <Err text={result.error} />
      <Note>只移动拉丁字母，空格和汉字保持原样。ROT13、ROT47 和 Atbash 再做一次即还原。</Note>
    </ExtraPage>
  );
};

export const PunycodeTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("bücher.例子");
  const [dir, setDir] = useState<"ascii" | "unicode">("ascii");
  const feed = useCallback((value: string) => {
    setInput(value);
    if (value.includes("xn--")) setDir("unicode");
  }, []);
  PUNYCODE_SEARCH_FEED.useFeedValue(feed);
  const result = dir === "ascii" ? domainToAscii(input) : domainToUnicode(input);
  return (
    <ExtraPage
      title="Punycode"
      toolId="punycode"
      onBack={onBack}
      action={dir === "ascii" ? "encode" : "decode"}
      summary={result.output ? result.output : ""}
      detail={{ input, dir }}
      active={!!input.trim() && !result.error}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.dir === "ascii" || d.dir === "unicode") setDir(d.dir);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={dir}
        onChange={(v) => setDir(v as "ascii" | "unicode")}
        options={[
          { value: "ascii", label: "转 ASCII" },
          { value: "unicode", label: "转 Unicode" },
        ]}
      />
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="域名，如 bücher.例子 或 xn--bcher-kva" />
      <div style={{ height: 8 }} />
      <Out value={result.output} />
      <Err text={result.error} />
      <Note>按域名标签转换。含非 ASCII 的标签加上 xn-- 前缀，纯英文标签保持不变。</Note>
    </ExtraPage>
  );
};

export const UnicodeTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("你 A 🙂");
  const [dir, setDir] = useState<"inspect" | "restore">("inspect");
  const glyphs = useMemo(() => (dir === "inspect" ? inspectText(input).slice(0, 300) : []), [input, dir]);
  const restored = dir === "restore" ? codePointsToText(input) : { text: "", error: undefined as string | undefined };
  const copied =
    dir === "restore"
      ? restored.text
      : glyphs.map((g) => `${g.char}\t${g.hex}\t${g.utf8}\t${g.js}`).join("\n");
  return (
    <ExtraPage
      title="Unicode 码点"
      toolId="unicode"
      onBack={onBack}
      action={dir}
      summary={dir === "inspect" ? `${glyphs.length} 个码点` : restored.text ? `还原 ${[...restored.text].length} 个字符` : ""}
      detail={{ input, dir }}
      active={!!input && (dir === "inspect" || !restored.error)}
      extra={<CopyButton text={copied} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.dir === "inspect" || d.dir === "restore") setDir(d.dir);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={dir}
        onChange={(v) => setDir(v as "inspect" | "restore")}
        options={[
          { value: "inspect", label: "拆解字符" },
          { value: "restore", label: "从码点还原" },
        ]}
      />
      <TextArea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 8 }}
        placeholder={dir === "inspect" ? "输入文本" : "U+4F60 \\u597D 0x1F642"}
      />
      <div style={{ height: 8 }} />
      {dir === "restore" ? <Out value={restored.text} /> : null}
      <Err text={dir === "restore" ? restored.error : undefined} />
      {dir === "inspect" ? (
        <Rows>
          {glyphs.map((glyph, index) => (
            <StatRow
              key={`${glyph.cp}-${index}`}
              label={glyph.char}
              value={`${glyph.hex}  UTF-8 ${glyph.utf8}  ${glyph.js}  ${glyph.block}`}
              copyable
            />
          ))}
        </Rows>
      ) : null}
      <Note>还原接受 U+4F60、\u4F60、\u{"{1F642}"}、0x4F60。一次最多展示前 300 个字符。</Note>
    </ExtraPage>
  );
};

export const EscapeTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState('say "hello"\n');
  const [lang, setLang] = useState<EscapeLang>("json");
  const [dir, setDir] = useState<"escape" | "unescape">("escape");
  const escaped = escapeString(input, lang);
  const unescaped = unescapeString(input, lang);
  const output = dir === "escape" ? escaped.quoted : unescaped.output;
  return (
    <ExtraPage
      title="字符串转义"
      toolId="escape"
      onBack={onBack}
      action={dir}
      summary={input ? `${lang} ${dir}` : ""}
      detail={{ input, lang, dir }}
      active={!!input && (dir === "escape" || !unescaped.error)}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.lang === "json" || d.lang === "python") setLang(d.lang);
        if (d.dir === "escape" || d.dir === "unescape") setDir(d.dir);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={lang}
          onChange={(v) => setLang(v as EscapeLang)}
          options={[
            { value: "json", label: "JSON / JS" },
            { value: "python", label: "Python" },
          ]}
        />
        <Segmented
          size="small"
          value={dir}
          onChange={(v) => setDir(v as "escape" | "unescape")}
          options={[
            { value: "escape", label: "转义" },
            { value: "unescape", label: "反转义" },
          ]}
        />
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      {dir === "escape" ? <Note>上面是带引号的字面量。内容本身：{escaped.inner}</Note> : <Err text={unescaped.error} />}
    </ExtraPage>
  );
};

export const Base32Tool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("foobar");
  const [dir, setDir] = useState<"encode" | "decode">("encode");
  const [pad, setPad] = useState(true);
  const encoded = base32EncodeText(input, pad);
  const decoded = base32DecodeText(input);
  const result = dir === "encode" ? encoded : decoded;
  return (
    <ExtraPage
      title="Base32"
      toolId="base32"
      onBack={onBack}
      action={dir}
      summary={result.output ? `${dir} ${input.length} 字符` : ""}
      detail={{ input, dir, pad }}
      active={!!input.trim() && !result.error}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.dir === "encode" || d.dir === "decode") setDir(d.dir);
        setPad(d.pad !== false);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={dir}
          onChange={(v) => setDir(v as "encode" | "decode")}
          options={[
            { value: "encode", label: "编码" },
            { value: "decode", label: "解码" },
          ]}
        />
        {dir === "encode" ? (
          <Segmented
            size="small"
            value={pad ? "pad" : "nopad"}
            onChange={(v) => setPad(v === "pad")}
            options={[
              { value: "pad", label: "带填充" },
              { value: "nopad", label: "去掉 =" },
            ]}
          />
        ) : null}
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 8 }} />
      <Out value={result.output} />
      <Err text={result.error} />
      <Note>RFC 4648 标准字母表 A–Z 和 2–7。文本按 UTF-8 字节编码，常用来读写 TOTP 密钥。</Note>
    </ExtraPage>
  );
};

export const HexDumpTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("Hi 你");
  const [mode, setMode] = useState<"hex" | "text" | "dump">("dump");
  const [upper, setUpper] = useState(false);
  const hex = textToHex(input, upper);
  const back = hexToText(input);
  const dump = hexDump(input);
  const output = mode === "hex" ? hex : mode === "text" ? back.output : dump;
  const error = mode === "text" ? back.error : undefined;
  return (
    <ExtraPage
      title="十六进制转储"
      toolId="hexdump"
      onBack={onBack}
      action={mode}
      summary={input.trim() ? mode : ""}
      detail={{ input, mode, upper }}
      active={!!input.trim() && !error}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.mode === "hex" || d.mode === "text" || d.mode === "dump") setMode(d.mode);
        setUpper(Boolean(d.upper));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as "hex" | "text" | "dump")}
          options={[
            { value: "dump", label: "hexdump" },
            { value: "hex", label: "转十六进制" },
            { value: "text", label: "转文本" },
          ]}
        />
        {mode === "hex" ? (
          <Segmented
            size="small"
            value={upper ? "up" : "low"}
            onChange={(v) => setUpper(v === "up")}
            options={[
              { value: "low", label: "小写" },
              { value: "up", label: "大写" },
            ]}
          />
        ) : null}
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Err text={error} />
      <Note>按 UTF-8 字节处理。hexdump 的右侧只显示可打印 ASCII，其他字节用点代替。</Note>
    </ExtraPage>
  );
};

function swatch(input: string, fallback: string): string {
  const parsed = parseCssColor(input);
  if (!parsed.ok) return fallback;
  const { r, g, b } = parsed.rgb;
  return `rgb(${r}, ${g}, ${b})`;
}

export const ContrastTool: React.FC<Props> = ({ onBack }) => {
  const [fg, setFg] = useState("#1a1a1a");
  const [bg, setBg] = useState("#ffffff");
  const result = contrastRatio(fg, bg);
  const ratio = result.ok ? `${result.result.ratio}:1` : "";
  return (
    <ExtraPage
      title="对比度"
      toolId="contrast"
      onBack={onBack}
      action="check"
      summary={ratio}
      detail={{ fg, bg }}
      active={result.ok}
      extra={<CopyButton text={ratio} label="复制比值" />}
      onRestore={(d) => {
        setFg(String(d.fg ?? ""));
        setBg(String(d.bg ?? ""));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input value={fg} onChange={(e) => setFg(e.target.value)} addonBefore="前景" style={{ width: 220 }} />
        <Input value={bg} onChange={(e) => setBg(e.target.value)} addonBefore="背景" style={{ width: 220 }} />
      </Space>
      <div style={{ display: "flex", minHeight: 88, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(128,128,128,0.3)" }}>
        <div style={{ flex: 1, background: swatch(bg, "#fff"), color: swatch(fg, "#111"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          正文 18px
        </div>
        <div style={{ flex: 1, background: swatch(bg, "#fff"), color: swatch(fg, "#111"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700 }}>
          大字
        </div>
      </div>
      {result.ok ? (
        <div style={{ marginTop: 12 }}>
          <Rows>
            <StatRow label="对比度" value={ratio} copyable />
            <StatRow label="AA 正文" value={result.result.aaNormal ? "达标（≥ 4.5）" : "不足 4.5"} />
            <StatRow label="AA 大字" value={result.result.aaLarge ? "达标（≥ 3）" : "不足 3"} />
            <StatRow label="AAA 正文" value={result.result.aaaNormal ? "达标（≥ 7）" : "不足 7"} />
            <StatRow label="AAA 大字" value={result.result.aaaLarge ? "达标（≥ 4.5）" : "不足 4.5"} />
          </Rows>
        </div>
      ) : (
        <Err text={result.error} />
      )}
      <Note>按 WCAG 2 相对亮度计算。支持 #RGB、#RRGGBB、rgb() 和 black / white 等颜色名。大字约等于 18pt，或 14pt 粗体。</Note>
    </ExtraPage>
  );
};
