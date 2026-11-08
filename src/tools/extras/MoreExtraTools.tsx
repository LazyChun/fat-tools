/*
 * 第二批新增 13 个工具的界面。
 *
 * 统一走 ExtraPage（标题 / 复制 / 操作记录 / 历史恢复），纯计算逻辑在 moreLogic.ts。
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, DatePicker, Input, InputNumber, Segmented, Select, Space, Switch, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  buildHttpMessage, buildJwtPayload, bytesToBase64Url, calcBitwise, calcCombination, calcDueDate,
  convertZoneTable, decimalToFraction, evalFraction, FAKE_TYPES, fitImageSize, formatSql,
  fractionToMixed, generateFakeRows, groupsToText, hexToHsl, jwtHeader, jwtSigningInput,
  loremText, makePalette, offsetLabel, paletteToCss, parseFieldSpec, parseHexColor, parseHttpMessage,
  readableTextColor, rowsToCsv, rowsToJson, rowsToSql, shadeScale, splitGroups, ZONES,
  type BitOp, type CombinationMode, type DueBasis, type GroupMode, type HttpHeader,
  type JwtAlg, type LoremLang, type LoremUnit, type PaletteScheme, type SqlMode,
} from "./moreLogic";
import { CopyButton, Err, ExtraPage, Note, Out, Rows, StatRow } from "./kit";

const { TextArea } = Input;
const { Text } = Typography;

interface Props { onBack?: () => void }

const CARD: React.CSSProperties = { padding: 12, borderRadius: 8, background: "rgba(128,128,128,0.08)" };
const MONO: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" };
const RANDOM_SEED = () => Math.floor(Math.random() * 1_000_000_000);

function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseHeaderLines(text: string): HttpHeader[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const colon = line.indexOf(":");
    return colon < 1
      ? { name: line, value: "" }
      : { name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
  });
}

/* ------------------------------------------------------------------ */
/* 1. SQL 格式化                                                       */
/* ------------------------------------------------------------------ */
export const SqlFormatTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState(
    "SELECT u.id, u.name, o.total FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE u.status = 'active' AND o.total > 100 ORDER BY o.total DESC LIMIT 20;",
  );
  const [mode, setMode] = useState<SqlMode>("pretty");
  const output = useMemo(() => formatSql(input, mode), [input, mode]);
  return (
    <ExtraPage
      title="SQL 格式化" toolId="sql-format" onBack={onBack} action={mode}
      summary={input.trim() ? `${input.length} 字符` : ""} detail={{ input, mode }} active={!!output}
      extra={<CopyButton text={output} label="复制 SQL" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        const saved = String(d.mode ?? "");
        if (["pretty", "minify", "upper", "lower"].includes(saved)) setMode(saved as SqlMode);
      }}
    >
      <Segmented
        size="small" value={mode} onChange={(v) => setMode(v as SqlMode)} style={{ marginBottom: 12 }}
        options={[
          { value: "pretty", label: "美化" }, { value: "minify", label: "压缩" },
          { value: "upper", label: "关键字大写" }, { value: "lower", label: "关键字小写" },
        ]}
      />
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴 SQL" autoSize={{ minRows: 5, maxRows: 12 }} style={MONO} />
      <div style={{ height: 8 }} />
      <Out value={output} placeholder="格式化结果" />
      <Note>按主子句换行、括号内缩进；字符串字面量与 -- / /* */ 注释原样保留，不会被误改大小写。适用于常见 SQL 方言，不覆盖存储过程语法。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 2. JWT 生成                                                         */
/* ------------------------------------------------------------------ */
export const JwtSignTool: React.FC<Props> = ({ onBack }) => {
  const [alg, setAlg] = useState<JwtAlg>("HS256");
  const [payloadJson, setPayloadJson] = useState('{\n  "sub": "1234567890",\n  "name": "Ada",\n  "role": "admin"\n}');
  const [secret, setSecret] = useState("");
  const [ttl, setTtl] = useState(3600);
  const [token, setToken] = useState("");
  const [headerJson, setHeaderJson] = useState("");
  const [payloadOut, setPayloadOut] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const built = buildJwtPayload(payloadJson, ttl);
    if (!built.ok) {
      setToken(""); setError(built.error); return;
    }
    if (!secret) {
      setToken(""); setError("请填写签名密钥"); return;
    }
    if (typeof crypto === "undefined" || !crypto.subtle) {
      setToken(""); setError("当前环境不支持 WebCrypto，无法在本地签发"); return;
    }
    const header = jwtHeader(alg);
    const signingInput = jwtSigningInput(header, built.payload);
    const hash = alg === "HS256" ? "SHA-256" : alg === "HS384" ? "SHA-384" : "SHA-512";
    (async () => {
      try {
        const key = await crypto.subtle.importKey(
          "raw", new TextEncoder().encode(secret) as unknown as BufferSource,
          { name: "HMAC", hash }, false, ["sign"],
        );
        const signature = await crypto.subtle.sign(
          "HMAC", key, new TextEncoder().encode(signingInput) as unknown as BufferSource,
        );
        if (cancelled) return;
        setToken(`${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`);
        setHeaderJson(JSON.stringify(header, null, 2));
        setPayloadOut(JSON.stringify(built.payload, null, 2));
        setError("");
      } catch {
        if (!cancelled) { setToken(""); setError("签名失败，请检查密钥与浏览器权限"); }
      }
    })();
    return () => { cancelled = true; };
  }, [alg, payloadJson, secret, ttl]);

  return (
    <ExtraPage
      title="JWT 生成" toolId="jwt-sign" onBack={onBack} action="sign"
      summary={token ? `${alg} · ${token.length} 字符` : ""}
      detail={{ alg, payloadJson, ttl }} active={!!token}
      extra={<CopyButton text={token} label="复制 Token" />}
      onRestore={(d) => {
        setPayloadJson(String(d.payloadJson ?? ""));
        const savedAlg = String(d.alg ?? "");
        if (["HS256", "HS384", "HS512"].includes(savedAlg)) setAlg(savedAlg as JwtAlg);
        if (typeof d.ttl === "number") setTtl(d.ttl);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          value={alg} onChange={(v) => setAlg(v)} style={{ width: 130 }}
          options={["HS256", "HS384", "HS512"].map((v) => ({ value: v, label: v }))}
        />
        <Select
          value={ttl} onChange={(v) => setTtl(v)} style={{ width: 180 }}
          options={[
            { value: 0, label: "不注入 iat/exp" }, { value: 3600, label: "有效期 1 小时" },
            { value: 86400, label: "有效期 1 天" }, { value: 604800, label: "有效期 7 天" },
            { value: 2592000, label: "有效期 30 天" },
          ]}
        />
        <Input.Password
          value={secret} onChange={(e) => setSecret(e.target.value)}
          placeholder="HMAC 签名密钥" style={{ width: 240 }} autoComplete="off"
        />
      </Space>
      <TextArea value={payloadJson} onChange={(e) => setPayloadJson(e.target.value)} autoSize={{ minRows: 6, maxRows: 12 }} style={MONO} />
      <div style={{ height: 8 }} />
      <Out value={token} placeholder="生成的 JWT" />
      <Err text={error} />
      {token ? (
        <Rows>
          <StatRow label="Header" value={headerJson.replace(/\s+/g, " ")} copyable />
          <StatRow label="Payload" value={payloadOut.replace(/\s+/g, " ")} copyable />
        </Rows>
      ) : null}
      <Note>签名全程在浏览器用 WebCrypto 完成，密钥不会上传，也<b>不会写入操作记录</b>（历史恢复后需重新填写）。生成的 Token 可粘到「JWT 解析」里验证。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 3. HTTP 报文解析                                                    */
/* ------------------------------------------------------------------ */
export const HttpMessageTool: React.FC<Props> = ({ onBack }) => {
  const [dir, setDir] = useState<"parse" | "build">("parse");
  const [raw, setRaw] = useState(
    "POST /api/v1/users HTTP/1.1\r\nHost: example.com\r\nContent-Type: application/json\r\nX-Trace-Id: abc123\r\n\r\n{\"name\":\"Ada\"}",
  );
  const [method, setMethod] = useState("POST");
  const [target, setTarget] = useState("https://example.com/api/v1/users");
  const [version, setVersion] = useState("HTTP/1.1");
  const [status, setStatus] = useState(200);
  const [reason, setReason] = useState("OK");
  const [kind, setKind] = useState<"request" | "response">("request");
  const [headersText, setHeadersText] = useState("Content-Type: application/json\nAccept: */*");
  const [body, setBody] = useState('{"name":"Ada"}');
  const [autoLength, setAutoLength] = useState(true);
  const [autoHost, setAutoHost] = useState(true);

  const parsed = useMemo(() => parseHttpMessage(raw), [raw]);
  const built = useMemo(() => buildHttpMessage({
    kind, method, target, version, status, reason,
    headers: parseHeaderLines(headersText), body, autoLength, autoHost,
  }), [kind, method, target, version, status, reason, headersText, body, autoLength, autoHost]);
  const output = dir === "parse" ? (parsed.ok ? raw : "") : built;

  return (
    <ExtraPage
      title="HTTP 报文解析" toolId="http-message" onBack={onBack} action={dir}
      summary={dir === "parse" ? (parsed.ok ? `${parsed.kind} · ${parsed.headers.length} 个头` : "") : `${kind} · ${built.length} 字符`}
      detail={{ dir, raw, method, target, version, status, reason, kind, headersText, body, autoLength, autoHost }}
      active={dir === "parse" ? parsed.ok : !!built}
      extra={<CopyButton text={output} label="复制报文" />}
      onRestore={(d) => {
        setRaw(String(d.raw ?? "")); setMethod(String(d.method ?? "GET"));
        setTarget(String(d.target ?? "/")); setVersion(String(d.version ?? "HTTP/1.1"));
        setStatus(Number(d.status ?? 200)); setReason(String(d.reason ?? "OK"));
        setHeadersText(String(d.headersText ?? "")); setBody(String(d.body ?? ""));
        if (d.dir === "parse" || d.dir === "build") setDir(d.dir);
        if (d.kind === "request" || d.kind === "response") setKind(d.kind);
        setAutoLength(d.autoLength !== false); setAutoHost(d.autoHost !== false);
      }}
    >
      <Segmented
        size="small" value={dir} onChange={(v) => setDir(v as "parse" | "build")} style={{ marginBottom: 12 }}
        options={[{ value: "parse", label: "解析报文" }, { value: "build", label: "生成报文" }]}
      />
      {dir === "parse" ? (
        <>
          <TextArea value={raw} onChange={(e) => setRaw(e.target.value)} autoSize={{ minRows: 7, maxRows: 14 }} style={MONO} />
          <Err text={parsed.error} />
          {parsed.ok ? (
            <>
              <div style={{ height: 8 }} />
              <Rows>
                <StatRow label="类型" value={parsed.kind === "request" ? "请求报文" : "响应报文"} />
                <StatRow label="首行" value={parsed.startLine} copyable />
                {parsed.kind === "request" ? (
                  <>
                    <StatRow label="方法 / 目标" value={`${parsed.method} ${parsed.target}`} copyable />
                    <StatRow label="协议" value={parsed.version} />
                  </>
                ) : (
                  <>
                    <StatRow label="状态码" value={`${parsed.status} ${parsed.reason}`} copyable />
                    <StatRow label="协议" value={parsed.version} />
                  </>
                )}
                <StatRow label="正文长度" value={`${parsed.body.length} 字符`} />
              </Rows>
              <div style={{ height: 8 }} />
              <Text strong>请求 / 响应头（{parsed.headers.length}）</Text>
              <div style={{ height: 6 }} />
              <Rows>
                {parsed.headers.map((h, i) => <StatRow key={`${h.name}-${i}`} label={h.name} value={h.value} copyable />)}
              </Rows>
              <div style={{ height: 8 }} />
              <Text strong>正文</Text>
              <div style={{ height: 6 }} />
              <Out value={parsed.body} placeholder="（无正文）" />
            </>
          ) : null}
        </>
      ) : (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Segmented
              size="small" value={kind} onChange={(v) => setKind(v as "request" | "response")}
              options={[{ value: "request", label: "请求" }, { value: "response", label: "响应" }]}
            />
            <Space.Compact>
              <Select value={method} onChange={setMethod} style={{ width: 110 }} disabled={kind === "response"}
                options={["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((v) => ({ value: v, label: v }))} />
              <Input value={kind === "request" ? target : `/ ${status} ${reason}`} onChange={(e) => {
                if (kind === "request") setTarget(e.target.value);
              }} disabled={kind === "response"} style={{ width: 320 }} />
            </Space.Compact>
            <InputNumber value={status} onChange={(v) => setStatus(Number(v ?? 200))} min={100} max={599} style={{ width: 90 }} disabled={kind === "request"} />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 130 }} disabled={kind === "request"} placeholder="OK" />
            <Select value={version} onChange={setVersion} style={{ width: 120 }}
              options={["HTTP/1.1", "HTTP/1.0", "HTTP/2"].map((v) => ({ value: v, label: v }))} />
          </Space>
          <Space wrap style={{ marginBottom: 12 }}>
            <Space size={4}><Switch size="small" checked={autoLength} onChange={setAutoLength} /><Text type="secondary">自动 Content-Length</Text></Space>
            <Space size={4}><Switch size="small" checked={autoHost} onChange={setAutoHost} /><Text type="secondary">自动 Host</Text></Space>
          </Space>
          <TextArea value={headersText} onChange={(e) => setHeadersText(e.target.value)} placeholder="每行一个头：Name: value" autoSize={{ minRows: 3, maxRows: 8 }} style={MONO} />
          <div style={{ height: 8 }} />
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="正文（可留空）" autoSize={{ minRows: 3, maxRows: 8 }} style={MONO} />
          <div style={{ height: 8 }} />
          <Out value={built} placeholder="生成的报文" />
        </>
      )}
      <Note>解析支持折叠头字段与 CRLF / LF 换行；生成时使用标准 CRLF，并在目标为完整 URL 时自动补 Host。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 4. 位运算                                                           */
/* ------------------------------------------------------------------ */
export const BitwiseTool: React.FC<Props> = ({ onBack }) => {
  const [a, setA] = useState("0xFF00");
  const [op, setOp] = useState<BitOp>("&");
  const [b, setB] = useState("0x0FF0");
  const result = useMemo(() => calcBitwise(a, op, b), [a, op, b]);
  return (
    <ExtraPage
      title="位运算" toolId="bitwise" onBack={onBack} action={op}
      summary={result.ok ? String(result.decimal) : ""} detail={{ a, op, b }} active={result.ok}
      extra={<CopyButton text={result.ok ? String(result.decimal) : ""} label="复制结果" />}
      onRestore={(d) => {
        setA(String(d.a ?? "")); setB(String(d.b ?? ""));
        const saved = String(d.op ?? "");
        if (["&", "|", "^", "~", "<<", ">>", ">>>"].includes(saved)) setOp(saved as BitOp);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input value={a} onChange={(e) => setA(e.target.value)} addonBefore="A" style={{ width: 200, ...MONO }} />
        <Select value={op} onChange={(v) => setOp(v)} style={{ width: 110 }}
          options={["&", "|", "^", "~", "<<", ">>", ">>>"].map((v) => ({ value: v, label: v }))} />
        <Input value={b} onChange={(e) => setB(e.target.value)} addonBefore="B" disabled={op === "~"} style={{ width: 200, ...MONO }} />
      </Space>
      <Err text={result.error} />
      {result.ok ? (
        <>
          <Rows>
            <StatRow label="有符号十进制" value={result.decimal} copyable />
            <StatRow label="无符号十进制" value={result.unsigned} copyable />
            <StatRow label="十六进制" value={result.hex} copyable />
          </Rows>
          <div style={{ height: 8 }} />
          <div style={{ ...CARD, ...MONO, lineHeight: 1.9 }}>
            <div><Text type="secondary">A&nbsp;&nbsp;&nbsp;&nbsp;</Text>{result.aBinary}</div>
            <div><Text type="secondary">B&nbsp;&nbsp;&nbsp;&nbsp;</Text>{result.bBinary}</div>
            <div><Text type="secondary">结果&nbsp;</Text><Text strong>{result.binary}</Text></div>
          </div>
        </>
      ) : null}
      <Note>按 32 位有符号整数计算（JS 位运算语义）；移位量取 B 的低 5 位。输入支持十进制、0x 十六进制、0b 二进制与 0o 八进制。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 5. 配色方案                                                         */
/* ------------------------------------------------------------------ */
export const PaletteTool: React.FC<Props> = ({ onBack }) => {
  const [hexInput, setHexInput] = useState("#3B82F6");
  const [scheme, setScheme] = useState<PaletteScheme>("analogous");
  const [cssStyle, setCssStyle] = useState<"vars" | "gradient" | "array">("vars");
  const hex = parseHexColor(hexInput);
  const palette = useMemo(() => makePalette(hex || "#3B82F6", scheme), [hex, scheme]);
  const shades = useMemo(() => shadeScale(hex || "#3B82F6", 9), [hex]);
  const css = useMemo(() => paletteToCss(palette, cssStyle), [palette, cssStyle]);
  const hsl = hexToHsl(hex || "#3B82F6");
  return (
    <ExtraPage
      title="配色方案" toolId="palette" onBack={onBack} action={scheme}
      summary={hex ? `${hex} · ${palette.length} 色` : ""} detail={{ hexInput, scheme, cssStyle }} active={!!hex}
      extra={<CopyButton text={css} label="复制 CSS" />}
      onRestore={(d) => {
        setHexInput(String(d.hexInput ?? "#3B82F6"));
        const saved = String(d.scheme ?? "");
        if (["complementary", "analogous", "triadic", "split", "tetradic", "monochromatic"].includes(saved)) setScheme(saved as PaletteScheme);
        const style = String(d.cssStyle ?? "");
        if (["vars", "gradient", "array"].includes(style)) setCssStyle(style as "vars" | "gradient" | "array");
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <input type="color" value={hex || "#3b82f6"} onChange={(e) => setHexInput(e.target.value)} style={{ width: 44, height: 32, border: "none", background: "transparent", cursor: "pointer" }} />
        <Input value={hexInput} onChange={(e) => setHexInput(e.target.value)} addonBefore="主色" style={{ width: 180, ...MONO }} />
        <Select value={scheme} onChange={(v) => setScheme(v)} style={{ width: 150 }}
          options={[
            { value: "analogous", label: "邻近色" }, { value: "complementary", label: "互补色" },
            { value: "split", label: "分裂互补" }, { value: "triadic", label: "三角配色" },
            { value: "tetradic", label: "四分配色" }, { value: "monochromatic", label: "单色明暗" },
          ]}
        />
      </Space>
      {!hex ? <Err text="请输入合法的 HEX 颜色，如 #3B82F6 或 #38f" /> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {palette.map((color) => (
          <button
            key={color.hex + color.role} type="button"
            onClick={() => navigator.clipboard?.writeText(color.hex)}
            title={`点击复制 ${color.hex}`}
            style={{
              flex: "1 1 110px", minWidth: 110, height: 84, borderRadius: 8, border: "1px solid rgba(128,128,128,0.25)",
              background: color.hex, color: readableTextColor(color.hex), cursor: "pointer", textAlign: "left", padding: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>{color.role}</div>
            <div style={{ ...MONO, fontSize: 12, marginTop: 4 }}>{color.hex.toUpperCase()}</div>
          </button>
        ))}
      </div>
      <Text strong>同色相明暗阶梯</Text>
      <div style={{ display: "flex", gap: 2, margin: "6px 0 12px" }}>
        {shades.map((color) => <div key={color} title={color} style={{ flex: 1, height: 30, background: color }} />)}
      </div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Segmented size="small" value={cssStyle} onChange={(v) => setCssStyle(v as "vars" | "gradient" | "array")}
          options={[{ value: "vars", label: "CSS 变量" }, { value: "gradient", label: "渐变" }, { value: "array", label: "色值数组" }]} />
        <Text type="secondary" style={{ fontSize: 12 }}>HSL({Math.round(hsl.h)}°, {Math.round(hsl.s * 100)}%, {Math.round(hsl.l * 100)}%)</Text>
      </Space>
      <Out value={css} />
      <Note>色块上的文字色按 WCAG 相对亮度自动选黑或白；点击色块可复制色值。与「颜色转换」不同，这里是由一个主色推导整套配色。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 6. 图片压缩                                                         */
/* ------------------------------------------------------------------ */
interface Compressed { url: string; size: number; width: number; height: number }

export const ImageCompressTool: React.FC<Props> = ({ onBack }) => {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [maxWidth, setMaxWidth] = useState(1600);
  const [maxHeight, setMaxHeight] = useState(1600);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<"image/jpeg" | "image/webp" | "image/png">("image/jpeg");
  const [keepRatio, setKeepRatio] = useState(true);
  const [allowEnlarge, setAllowEnlarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Compressed | null>(null);
  const [error, setError] = useState("");

  const loadFile = (picked: File) => {
    if (!picked.type.startsWith("image/")) { setError("请选择图片文件"); return; }
    const url = URL.createObjectURL(picked);
    const image = new Image();
    image.onload = () => {
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      setSourceUrl(url);
      setFile(picked);
      setResult(null);
      setError("");
    };
    image.onerror = () => { setError("图片读取失败"); URL.revokeObjectURL(url); };
    image.src = url;
  };

  const compress = () => {
    if (!file || !sourceUrl) { setError("请先选择一张图片"); return; }
    setBusy(true);
    const image = new Image();
    image.onload = () => {
      const fit = fitImageSize(image.naturalWidth, image.naturalHeight, maxWidth, maxHeight, keepRatio, allowEnlarge);
      const canvas = document.createElement("canvas");
      canvas.width = fit.width;
      canvas.height = fit.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setError("无法创建 canvas 上下文"); setBusy(false); return; }
      if (format === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, fit.width, fit.height); }
      ctx.drawImage(image, 0, 0, fit.width, fit.height);
      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) { setError("图片编码失败，可尝试换一种输出格式"); return; }
        setResult({ url: URL.createObjectURL(blob), size: blob.size, width: fit.width, height: fit.height });
        setError("");
      }, format, quality / 100);
    };
    image.onerror = () => { setError("图片读取失败"); setBusy(false); };
    image.src = sourceUrl;
  };

  const fit = fitImageSize(natural.width || 1, natural.height || 1, maxWidth, maxHeight, keepRatio, allowEnlarge);
  const ratio = file && result ? Math.round((1 - result.size / file.size) * 1000) / 10 : 0;
  const ext = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";

  return (
    <ExtraPage
      title="图片压缩" toolId="image-compress" onBack={onBack} action="compress"
      summary={result ? `${fit.width}×${fit.height} · ${(result.size / 1024).toFixed(1)} KB` : ""}
      detail={{ fileName: file?.name ?? "", maxWidth, maxHeight, quality, format, keepRatio, allowEnlarge }}
      active={!!result}
      extra={result ? <Button size="small" href={result.url} download={`compressed.${ext}`}>下载图片</Button> : null}
      onRestore={(d) => {
        setMaxWidth(Number(d.maxWidth ?? 1600)); setMaxHeight(Number(d.maxHeight ?? 1600));
        setQuality(Number(d.quality ?? 80));
        const saved = String(d.format ?? "");
        if (["image/jpeg", "image/webp", "image/png"].includes(saved)) setFormat(saved as "image/jpeg" | "image/webp" | "image/png");
        setKeepRatio(d.keepRatio !== false); setAllowEnlarge(d.allowEnlarge === true);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <input type="file" accept="image/*" onChange={(e) => { const picked = e.target.files?.[0]; if (picked) loadFile(picked); }} />
        <Select value={format} onChange={(v) => setFormat(v)} style={{ width: 130 }}
          options={[{ value: "image/jpeg", label: "JPEG" }, { value: "image/webp", label: "WebP" }, { value: "image/png", label: "PNG" }]} />
        <Space size={4}><Text type="secondary">最大宽</Text><InputNumber value={maxWidth} onChange={(v) => setMaxWidth(Number(v ?? 1600))} min={1} max={10000} style={{ width: 100 }} /></Space>
        <Space size={4}><Text type="secondary">最大高</Text><InputNumber value={maxHeight} onChange={(v) => setMaxHeight(Number(v ?? 1600))} min={1} max={10000} style={{ width: 100 }} /></Space>
        <Space size={4}><Text type="secondary">质量</Text><InputNumber value={quality} onChange={(v) => setQuality(Number(v ?? 80))} min={1} max={100} style={{ width: 80 }} disabled={format === "image/png"} /></Space>
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Space size={4}><Switch size="small" checked={keepRatio} onChange={setKeepRatio} /><Text type="secondary">保持比例</Text></Space>
        <Space size={4}><Switch size="small" checked={allowEnlarge} onChange={setAllowEnlarge} /><Text type="secondary">允许放大</Text></Space>
        <Button type="primary" size="small" onClick={compress} loading={busy} disabled={!file}>开始压缩</Button>
      </Space>
      <Err text={error} />
      {file ? (
        <Rows>
          <StatRow label="原图" value={`${file.name} · ${natural.width}×${natural.height} · ${(file.size / 1024).toFixed(1)} KB`} />
          <StatRow label="目标尺寸" value={`${fit.width}×${fit.height}（${Math.round(fit.scale * 100)}%）`} />
          {result ? <StatRow label="压缩后" value={`${(result.size / 1024).toFixed(1)} KB · 体积减少 ${ratio}%`} copyable /> : null}
        </Rows>
      ) : null}
      {result ? (
        <div style={{ marginTop: 12 }}>
          <img src={result.url} alt="压缩结果预览" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid rgba(128,128,128,0.25)" }} />
        </div>
      ) : null}
      <Note>图片只在本地 canvas 里缩放与重新编码，不上传。JPEG 会用白底填充透明区域；PNG 不支持质量参数。与「格式转换」不同，这里专注等比缩放与体积压缩。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 7. 测试数据生成                                                     */
/* ------------------------------------------------------------------ */
export const FakeDataTool: React.FC<Props> = ({ onBack }) => {
  const [spec, setSpec] = useState("id=id\nname=name\nphone=phone\nemail=email\ncity=city\ncompany=company\ncreated=date\namount=decimal");
  const [count, setCount] = useState(10);
  const [seed, setSeed] = useState(20261108);
  const [format, setFormat] = useState<"json" | "csv" | "sql">("json");
  const [table, setTable] = useState("test_data");
  const parsed = useMemo(() => parseFieldSpec(spec), [spec]);
  const rows = useMemo(() => (parsed.error ? [] : generateFakeRows(parsed.fields, count, seed)), [parsed, count, seed]);
  const output = useMemo(() => {
    if (parsed.error) return "";
    return format === "json" ? rowsToJson(rows) : format === "csv" ? rowsToCsv(rows) : rowsToSql(rows, table);
  }, [parsed.error, rows, format, table]);
  return (
    <ExtraPage
      title="测试数据生成" toolId="fake-data" onBack={onBack} action={format}
      summary={output ? `${rows.length} 行 × ${parsed.fields.length} 字段` : ""}
      detail={{ spec, count, seed, format, table }} active={!!output}
      extra={<Space size={4}><CopyButton text={output} label="复制数据" /><Button size="small" onClick={() => downloadText(output, `fake-data.${format}`, format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8")}>下载</Button></Space>}
      onRestore={(d) => {
        setSpec(String(d.spec ?? "")); setCount(Number(d.count ?? 10)); setSeed(Number(d.seed ?? 1));
        setTable(String(d.table ?? "test_data"));
        const saved = String(d.format ?? "");
        if (["json", "csv", "sql"].includes(saved)) setFormat(saved as "json" | "csv" | "sql");
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented size="small" value={format} onChange={(v) => setFormat(v as "json" | "csv" | "sql")}
          options={[{ value: "json", label: "JSON" }, { value: "csv", label: "CSV" }, { value: "sql", label: "SQL" }]} />
        <Space size={4}><Text type="secondary">行数</Text><InputNumber value={count} onChange={(v) => setCount(Number(v ?? 10))} min={1} max={500} style={{ width: 90 }} /></Space>
        <Space size={4}><Text type="secondary">种子</Text><InputNumber value={seed} onChange={(v) => setSeed(Number(v ?? 1))} style={{ width: 130 }} /></Space>
        <Button size="small" onClick={() => setSeed(RANDOM_SEED())}>换一批</Button>
        {format === "sql" ? <Input value={table} onChange={(e) => setTable(e.target.value)} addonBefore="表名" style={{ width: 190 }} /> : null}
      </Space>
      <TextArea value={spec} onChange={(e) => setSpec(e.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} style={MONO} />
      <Err text={parsed.error} />
      <div style={{ height: 8 }} />
      <Out value={output} placeholder="生成的数据" />
      <Note>每行配置一个字段：<code>字段名=类型</code>，省略字段名时直接用类型名。可用类型：{FAKE_TYPES.map((t) => t.value).join("、")}。同一种子可复现同一批数据，所有数据都是虚构的。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 8. 占位文本                                                         */
/* ------------------------------------------------------------------ */
export const LoremTool: React.FC<Props> = ({ onBack }) => {
  const [lang, setLang] = useState<LoremLang>("zh");
  const [unit, setUnit] = useState<LoremUnit>("paragraph");
  const [count, setCount] = useState(3);
  const [seed, setSeed] = useState(42);
  const output = useMemo(() => loremText(lang, unit, count, seed), [lang, unit, count, seed]);
  return (
    <ExtraPage
      title="占位文本" toolId="lorem" onBack={onBack} action={`${lang}-${unit}`}
      summary={`${count} ${unit}`} detail={{ lang, unit, count, seed }} active={!!output}
      extra={<Space size={4}><CopyButton text={output} label="复制文本" /><Button size="small" onClick={() => downloadText(output, "lorem.txt")}>下载 .txt</Button></Space>}
      onRestore={(d) => {
        const savedLang = String(d.lang ?? "");
        const savedUnit = String(d.unit ?? "");
        if (savedLang === "zh" || savedLang === "en") setLang(savedLang);
        if (["paragraph", "sentence", "word"].includes(savedUnit)) setUnit(savedUnit as LoremUnit);
        setCount(Number(d.count ?? 3)); setSeed(Number(d.seed ?? 42));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented size="small" value={lang} onChange={(v) => setLang(v as LoremLang)}
          options={[{ value: "zh", label: "中文" }, { value: "en", label: "Lorem ipsum" }]} />
        <Segmented size="small" value={unit} onChange={(v) => setUnit(v as LoremUnit)}
          options={[{ value: "paragraph", label: "段落" }, { value: "sentence", label: "句子" }, { value: "word", label: "词" }]} />
        <Space size={4}><Text type="secondary">数量</Text><InputNumber value={count} onChange={(v) => setCount(Number(v ?? 1))} min={1} max={50} style={{ width: 90 }} /></Space>
        <Space size={4}><Text type="secondary">种子</Text><InputNumber value={seed} onChange={(v) => setSeed(Number(v ?? 1))} style={{ width: 120 }} /></Space>
        <Button size="small" onClick={() => setSeed(RANDOM_SEED())}>换一批</Button>
      </Space>
      <Out value={output} placeholder="生成的占位文本" />
      <Note>中文由句库随机拼接，英文是标准 Lorem ipsum 词表；固定种子可复现，适合做排版与设计稿的填充内容。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 9. 随机分组                                                         */
/* ------------------------------------------------------------------ */
export const RandomGroupTool: React.FC<Props> = ({ onBack }) => {
  const [names, setNames] = useState("张三\n李四\n王五\n赵六\n钱七\n孙八\n周九\n吴十\n郑十一\n冯十二\n陈十三\n褚十四");
  const [mode, setMode] = useState<GroupMode>("groups");
  const [value, setValue] = useState(3);
  const [seed, setSeed] = useState(7);
  const result = useMemo(() => splitGroups(names.split("\n"), mode, value, seed), [names, mode, value, seed]);
  const text = useMemo(() => (result.ok ? groupsToText(result.groups) : ""), [result]);
  return (
    <ExtraPage
      title="随机分组" toolId="random-group" onBack={onBack} action={mode}
      summary={result.ok ? `${result.groups.length} 组` : ""} detail={{ names, mode, value, seed }} active={result.ok}
      extra={<Space size={4}><CopyButton text={text} label="复制分组" /><Button size="small" onClick={() => downloadText(text, "groups.txt")}>下载 .txt</Button></Space>}
      onRestore={(d) => {
        setNames(String(d.names ?? "")); setValue(Number(d.value ?? 3)); setSeed(Number(d.seed ?? 7));
        if (d.mode === "groups" || d.mode === "size") setMode(d.mode);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented size="small" value={mode} onChange={(v) => setMode(v as GroupMode)}
          options={[{ value: "groups", label: "分成 N 组" }, { value: "size", label: "每组 N 人" }]} />
        <Space size={4}><Text type="secondary">N</Text><InputNumber value={value} onChange={(v) => setValue(Number(v ?? 1))} min={1} max={200} style={{ width: 90 }} /></Space>
        <Space size={4}><Text type="secondary">种子</Text><InputNumber value={seed} onChange={(v) => setSeed(Number(v ?? 1))} style={{ width: 120 }} /></Space>
        <Button size="small" onClick={() => setSeed(RANDOM_SEED())}>重新分</Button>
      </Space>
      <TextArea value={names} onChange={(e) => setNames(e.target.value)} placeholder="每行一个名字" autoSize={{ minRows: 6, maxRows: 10 }} />
      <Err text={result.error} />
      {result.ok ? (
        <>
          <div style={{ height: 10 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {result.groups.map((group, i) => (
              <div key={i} style={CARD}>
                <Text strong>第 {i + 1} 组（{group.length} 人）</Text>
                <div style={{ marginTop: 6, lineHeight: 1.8 }}>{group.join("、")}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 10 }} />
          <Out value={text} />
        </>
      ) : null}
      <Note>名单会先去重再洗牌，各组人数差不超过 1；固定种子可复现同一结果。和「转盘抽签」「随机数」不同，这里是一次性把整份名单均衡分完。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 10. 世界时区换算                                                    */
/* ------------------------------------------------------------------ */
export const TimezoneTool: React.FC<Props> = ({ onBack }) => {
  const [when, setWhen] = useState<Dayjs | null>(() => dayjs());
  const [fromZone, setFromZone] = useState("Asia/Shanghai");
  const [selected, setSelected] = useState<string[]>([
    "Asia/Shanghai", "Asia/Tokyo", "Europe/London", "America/New_York", "UTC", "Australia/Sydney",
  ]);
  const wallMs = when
    ? Date.UTC(when.year(), when.month(), when.date(), when.hour(), when.minute(), when.second())
    : 0;
  const rows = useMemo(
    () => convertZoneTable(wallMs, fromZone, ZONES.filter((z) => selected.includes(z.zone))),
    [wallMs, fromZone, selected],
  );
  return (
    <ExtraPage
      title="世界时区换算" toolId="timezone" onBack={onBack} action="convert"
      summary={when ? when.format("YYYY-MM-DD HH:mm:ss") : ""}
      detail={{ iso: when ? when.format("YYYY-MM-DD HH:mm:ss") : "", fromZone, selected }}
      active={!!when && rows.length > 0}
      extra={<Button size="small" onClick={() => setWhen(dayjs())}>此刻</Button>}
      onRestore={(d) => {
        const iso = String(d.iso ?? "");
        setWhen(iso ? dayjs(iso) : dayjs());
        setFromZone(String(d.fromZone ?? "Asia/Shanghai"));
        if (Array.isArray(d.selected)) setSelected(d.selected.map(String));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker
          value={when} onChange={(v) => setWhen(v)} allowClear={false}
          showTime={{ format: "HH:mm:ss" }} format="YYYY-MM-DD HH:mm:ss"
        />
        <Space size={4}>
          <Text type="secondary">基准时区</Text>
          <Select value={fromZone} onChange={setFromZone} style={{ width: 190 }}
            options={ZONES.map((z) => ({ value: z.zone, label: z.label }))} />
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>{offsetLabel(convertZoneTable(wallMs, fromZone, [{ zone: fromZone, label: "" }])[0]?.offsetMinutes ?? 0)}</Text>
      </Space>
      <div style={{ ...CARD, marginBottom: 12 }}>
        <Text strong style={{ fontSize: 12 }}>要查看的城市</Text>
        <div style={{ height: 8 }} />
        <Checkbox.Group
          value={selected} onChange={(v) => setSelected(v.map(String))}
          options={ZONES.map((z) => ({ label: z.label, value: z.zone }))}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
        {rows.map((row) => (
          <div key={row.zone} style={CARD}>
            <Text strong>{row.label}</Text>
            <div style={{ ...MONO, fontSize: 16, margin: "6px 0" }}>{row.time}</div>
            <Space size={6} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>{row.offsetLabel}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {row.diffHours === 0 ? "与基准同时" : `比基准${row.diffHours > 0 ? "快" : "慢"} ${Math.abs(row.diffHours)} 小时`}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{row.dayNote}</Text>
            </Space>
          </div>
        ))}
      </div>
      <Note>偏移由浏览器 Intl 时区数据库实时计算，自动包含夏令时（例如伦敦夏天 UTC+1、纽约冬天 UTC-5）。与「时间戳转换」不同，这里是多个城市的墙上时间对照。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 11. 预产期计算                                                      */
/* ------------------------------------------------------------------ */
export const DueDateTool: React.FC<Props> = ({ onBack }) => {
  const [start, setStart] = useState<Dayjs | null>(() => dayjs().subtract(60, "day"));
  const [basis, setBasis] = useState<DueBasis>("lmp");
  const [cycle, setCycle] = useState(28);
  const result = useMemo(
    () => calcDueDate(start ? start.format("YYYY-MM-DD") : "", basis, cycle),
    [start, basis, cycle],
  );
  return (
    <ExtraPage
      title="预产期计算" toolId="due-date" onBack={onBack} action={basis}
      summary={result.ok ? result.dueDate : ""}
      detail={{ date: start ? start.format("YYYY-MM-DD") : "", basis, cycle }} active={result.ok}
      extra={<CopyButton text={result.ok ? result.dueDate : ""} label="复制预产期" />}
      onRestore={(d) => {
        const date = String(d.date ?? "");
        setStart(date ? dayjs(date) : dayjs());
        if (d.basis === "lmp" || d.basis === "conception") setBasis(d.basis);
        setCycle(Number(d.cycle ?? 28));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Space size={4}>
          <Text type="secondary">起始日期</Text>
          <DatePicker value={start} onChange={(v) => setStart(v)} allowClear={false} />
        </Space>
        <Segmented size="small" value={basis} onChange={(v) => setBasis(v as DueBasis)}
          options={[{ value: "lmp", label: "末次月经第一天" }, { value: "conception", label: "受孕日" }]} />
        <Space size={4}>
          <Text type="secondary">周期</Text>
          <InputNumber value={cycle} onChange={(v) => setCycle(Number(v ?? 28))} min={20} max={60} style={{ width: 90 }} />
          <Text type="secondary">天</Text>
        </Space>
      </Space>
      <Err text={result.error} />
      {result.ok ? (
        <>
          <div style={{ ...CARD, marginBottom: 12 }}>
            <Text type="secondary">预计分娩日期</Text>
            <div style={{ fontSize: 28, fontWeight: 700, margin: "4px 0" }}>{result.dueDate}</div>
            <Text type="secondary">当前孕 {result.weeks} 周 {result.days} 天 · {result.stage} · 距预产期还有 {result.daysLeft} 天</Text>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(128,128,128,0.18)", marginTop: 10 }}>
              <div style={{ width: `${result.progressPct}%`, height: "100%", borderRadius: 4, background: "#eb2f96" }} />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>孕期进度 {result.progressPct}%</Text>
          </div>
          <Rows>
            <StatRow label="已孕天数" value={`${result.daysPregnant} 天`} />
            <StatRow label="所处阶段" value={result.stage} />
            <StatRow label="剩余天数" value={`${result.daysLeft} 天`} />
          </Rows>
          <div style={{ height: 12 }} />
          <Text strong>孕期关键节点</Text>
          <div style={{ height: 6 }} />
          <Rows>
            {result.milestones.map((m) => (
              <StatRow key={m.weeks} label={`${m.weeks} 周 · ${m.label}`} value={m.date} copyable />
            ))}
          </Rows>
        </>
      ) : null}
      <Note>按 Naegele 法则：末次月经第一天 + 280 天（周期每多 1 天顺延 1 天），受孕日 + 266 天。结果仅为估算，实际分娩日期以产检医生为准。</Note>
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 12. 分数计算                                                        */
/* ------------------------------------------------------------------ */
export const FractionTool: React.FC<Props> = ({ onBack }) => {
  const [dir, setDir] = useState<"expr" | "decimal">("expr");
  const [expr, setExpr] = useState("1/2 + 3/4 * (2 - 0.5)");
  const [decimal, setDecimal] = useState(0.125);
  const [maxDen, setMaxDen] = useState(10000);
  const evaluated = useMemo(() => evalFraction(expr), [expr]);
  const converted = useMemo(() => decimalToFraction(decimal, maxDen), [decimal, maxDen]);
  return (
    <ExtraPage
      title="分数计算" toolId="fraction" onBack={onBack} action={dir}
      summary={dir === "expr" ? (evaluated.ok ? evaluated.text : "") : (converted.ok ? converted.text : "")}
      detail={{ dir, expr, decimal, maxDen }}
      active={dir === "expr" ? evaluated.ok : converted.ok}
      extra={<CopyButton text={dir === "expr" ? (evaluated.ok ? evaluated.text : "") : (converted.ok ? converted.text : "")} label="复制分数" />}
      onRestore={(d) => {
        setExpr(String(d.expr ?? "")); setDecimal(Number(d.decimal ?? 0.125)); setMaxDen(Number(d.maxDen ?? 10000));
        if (d.dir === "expr" || d.dir === "decimal") setDir(d.dir);
      }}
    >
      <Segmented size="small" value={dir} onChange={(v) => setDir(v as "expr" | "decimal")} style={{ marginBottom: 12 }}
        options={[{ value: "expr", label: "分数四则运算" }, { value: "decimal", label: "小数转分数" }]} />
      {dir === "expr" ? (
        <>
          <Input value={expr} onChange={(e) => setExpr(e.target.value)} addonBefore="表达式" style={MONO} />
          <Err text={evaluated.ok ? undefined : evaluated.error} />
          {evaluated.ok ? (
            <>
              <div style={{ height: 10 }} />
              <Rows>
                <StatRow label="最简分数" value={evaluated.text} copyable />
                <StatRow label="带分数" value={evaluated.mixed} copyable />
                <StatRow label="小数近似" value={String(evaluated.decimal)} copyable />
                <StatRow label="分子 / 分母" value={`${evaluated.fraction.n} / ${evaluated.fraction.d}`} />
              </Rows>
            </>
          ) : null}
          <Note>支持 + - * / 与括号，整数、小数和分数可混写；全程用有理数精确计算，不会像浮点那样产生 0.30000000000000004。</Note>
        </>
      ) : (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Space size={4}><Text type="secondary">小数</Text><InputNumber value={decimal} onChange={(v) => setDecimal(Number(v ?? 0))} step={0.001} style={{ width: 190 }} /></Space>
            <Space size={4}><Text type="secondary">最大分母</Text><InputNumber value={maxDen} onChange={(v) => setMaxDen(Number(v ?? 10000))} min={2} max={1000000} style={{ width: 130 }} /></Space>
          </Space>
          <Space wrap style={{ marginBottom: 12 }}>
            {[["1/2", 0.5], ["1/3", 0.333333], ["2/3", 0.666667], ["1/4", 0.25], ["3/4", 0.75], ["1/8", 0.125], ["π", 3.141592653589793]].map(([label, value]) => (
              <Button key={String(label)} size="small" onClick={() => setDecimal(Number(value))}>{label}</Button>
            ))}
          </Space>
          <Err text={converted.ok ? undefined : converted.error} />
          {converted.ok ? (
            <Rows>
              <StatRow label="最简分数" value={converted.text} copyable />
              <StatRow label="带分数" value={fractionToMixed(converted.fraction)} copyable />
              <StatRow label="分子 / 分母" value={`${converted.fraction.n} / ${converted.fraction.d}`} />
              <StatRow label="逼近误差" value={converted.errorValue.toExponential(2)} />
            </Rows>
          ) : null}
          <Note>用连分数找分母不超过上限的最佳有理逼近，适合把测量结果、循环小数还原成常见分数（π 约等于 355/113）。</Note>
        </>
      )}
    </ExtraPage>
  );
};

/* ------------------------------------------------------------------ */
/* 13. 排列组合与概率                                                  */
/* ------------------------------------------------------------------ */
export const CombinationTool: React.FC<Props> = ({ onBack }) => {
  const [mode, setMode] = useState<CombinationMode>("combination");
  const [n, setN] = useState(52);
  const [k, setK] = useState(5);
  const [p, setP] = useState(0.5);
  const result = useMemo(() => calcCombination(mode, n, k, p), [mode, n, k, p]);
  const needK = mode !== "factorial" && mode !== "at-least-once";
  const needP = mode === "binomial" || mode === "binomial-cum" || mode === "at-least-once";
  const shown = Number.isInteger(result.value)
    ? result.value.toLocaleString("zh-CN")
    : result.value < 0.0001 ? result.value.toExponential(6) : result.value.toPrecision(10);
  return (
    <ExtraPage
      title="排列组合" toolId="combination" onBack={onBack} action={mode}
      summary={result.ok ? String(shown) : ""} detail={{ mode, n, k, p }} active={result.ok}
      extra={<CopyButton text={result.ok ? String(result.value) : ""} label="复制数值" />}
      onRestore={(d) => {
        const saved = String(d.mode ?? "");
        const allowed: CombinationMode[] = ["factorial", "permutation", "combination", "repeat-combination", "binomial", "binomial-cum", "at-least-once"];
        if (allowed.includes(saved as CombinationMode)) setMode(saved as CombinationMode);
        setN(Number(d.n ?? 10)); setK(Number(d.k ?? 3)); setP(Number(d.p ?? 0.5));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Select value={mode} onChange={(v) => setMode(v)} style={{ width: 190 }}
          options={[
            { value: "combination", label: "组合 C(n,k)" }, { value: "permutation", label: "排列 P(n,k)" },
            { value: "repeat-combination", label: "可重复组合 H(n,k)" }, { value: "factorial", label: "阶乘 n!" },
            { value: "binomial", label: "二项分布 P(X=k)" }, { value: "binomial-cum", label: "累计 P(X≤k)" },
            { value: "at-least-once", label: "至少成功一次" },
          ]}
        />
        <Space size={4}><Text type="secondary">n</Text><InputNumber value={n} onChange={(v) => setN(Number(v ?? 0))} min={0} max={170} style={{ width: 90 }} /></Space>
        <Space size={4}><Text type="secondary">k</Text><InputNumber value={k} onChange={(v) => setK(Number(v ?? 0))} min={0} max={170} style={{ width: 90 }} disabled={!needK} /></Space>
        <Space size={4}><Text type="secondary">p</Text><InputNumber value={p} onChange={(v) => setP(Number(v ?? 0))} min={0} max={1} step={0.1} style={{ width: 100 }} disabled={!needP} /></Space>
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button size="small" onClick={() => { setMode("combination"); setN(52); setK(5); }}>52 张牌抽 5 张</Button>
        <Button size="small" onClick={() => { setMode("permutation"); setN(10); setK(3); }}>10 人排前三</Button>
        <Button size="small" onClick={() => { setMode("binomial"); setN(10); setK(5); setP(0.5); }}>抛 10 次恰好 5 次正面</Button>
        <Button size="small" onClick={() => { setMode("at-least-once"); setN(6); setP(1 / 6); }}>掷 6 次骰子至少一次 6</Button>
      </Space>
      <Err text={result.error} />
      {result.ok ? (
        <>
          <div style={CARD}>
            <Text type="secondary">计算结果</Text>
            <div style={{ fontSize: 26, fontWeight: 700, ...MONO, wordBreak: "break-all", margin: "4px 0" }}>{shown}</div>
            <div style={{ ...MONO, fontSize: 12 }}>{result.formula}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{result.note}</Text>
          </div>
        </>
      ) : null}
      <Note>组合数用乘除交替计算避免中间溢出；n 上限 170（超出会超过浮点数可表示范围）。概率结果按二项分布独立重复试验计算。</Note>
    </ExtraPage>
  );
};

