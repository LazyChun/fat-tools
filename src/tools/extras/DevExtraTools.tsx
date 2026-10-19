/*
 * 开发类新工具界面。
 */
import React, { useMemo, useState } from "react";
import { Button, Input, Segmented, Select, Space } from "antd";
import {
  buildCurl,
  bumpSemver,
  compareSemver,
  dotenvToObject,
  flattenJsonText,
  generateUlid,
  inspectPath,
  joinPath,
  jsonToTypescript,
  parseCurl,
  parseDotenv,
  parseIpv6,
  parseMac,
  parseUlid,
  parseUserAgent,
  randomMac,
  satisfiesSemver,
  searchHttpStatus,
  searchMime,
  sortSemver,
  stringifyDotenv,
  unflattenJsonText,
  type PathStyle,
} from "./devLogic";
import { CURL_SEARCH_FEED, IPV6_SEARCH_FEED, MAC_SEARCH_FEED, ULID_SEARCH_FEED } from "./feeds";
import { CopyButton, Err, ExtraPage, Note, Out, Rows, StatRow } from "./kit";

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
}

export const JsonTypeTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState('{\n  "user": {"id": 1, "name": "Ada"},\n  "tags": ["a", "b"]\n}');
  const [root, setRoot] = useState("Root");
  const result = useMemo(() => jsonToTypescript(input, root || "Root"), [input, root]);
  return (
    <ExtraPage
      title="JSON 转类型"
      toolId="json-type"
      onBack={onBack}
      action="generate"
      summary={result.code ? `生成 ${root || "Root"}` : ""}
      detail={{ input, root }}
      active={!!result.code}
      extra={<CopyButton text={result.code} label="复制类型" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        setRoot(String(d.root ?? "Root"));
      }}
    >
      <Input value={root} onChange={(e) => setRoot(e.target.value)} addonBefore="根类型名" style={{ width: 280, marginBottom: 12 }} />
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 6, maxRows: 14 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 8 }} />
      <Out value={result.code} />
      <Err text={result.error} />
      <Note>对象数组会合并字段，不是每个元素都有的键标成可选。这是从样例推断的类型，不是 JSON Schema。</Note>
    </ExtraPage>
  );
};

export const JsonFlatTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState('{\n  "a": {"b": 1},\n  "c": [2, {"d": 3}]\n}');
  const [sep, setSep] = useState(".");
  const [dir, setDir] = useState<"flat" | "nest">("flat");
  const result = dir === "flat" ? flattenJsonText(input, sep) : unflattenJsonText(input, sep);
  return (
    <ExtraPage
      title="JSON 扁平化"
      toolId="json-flat"
      onBack={onBack}
      action={dir}
      summary={result.output ? dir : ""}
      detail={{ input, sep, dir }}
      active={!!result.output}
      extra={<CopyButton text={result.output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (typeof d.sep === "string") setSep(d.sep);
        if (d.dir === "flat" || d.dir === "nest") setDir(d.dir);
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={dir}
          onChange={(v) => setDir(v as "flat" | "nest")}
          options={[
            { value: "flat", label: "压平" },
            { value: "nest", label: "还原" },
          ]}
        />
        <Input value={sep} onChange={(e) => setSep(e.target.value || ".")} addonBefore="分隔符" style={{ width: 160 }} />
      </Space>
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 5, maxRows: 12 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 8 }} />
      <Out value={result.output} />
      <Err text={result.error} />
      <Note>数组用数字下标，例如 c.0。连续的 0..n-1 会还原成数组。</Note>
    </ExtraPage>
  );
};

export const UlidTool: React.FC<Props> = ({ onBack }) => {
  const [generated, setGenerated] = useState(() => generateUlid());
  const [input, setInput] = useState("");
  ULID_SEARCH_FEED.useFeedValue(setInput);
  const parsed = input.trim() ? parseUlid(input) : parseUlid(generated);
  const shown = input.trim() || generated;
  return (
    <ExtraPage
      title="ULID"
      toolId="ulid"
      onBack={onBack}
      action="generate"
      summary={parsed.ok ? parsed.iso : ""}
      detail={{ input, generated }}
      active={parsed.ok}
      extra={<CopyButton text={shown} label="复制 ULID" />}
      onRestore={(d) => {
        setGenerated(String(d.generated ?? ""));
        setInput(String(d.input ?? ""));
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => setGenerated(generateUlid())}>
          再生成一个
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="或粘贴已有 ULID 来反解时间"
          style={{ width: 320, fontFamily: "ui-monospace, monospace" }}
        />
      </Space>
      {parsed.ok ? (
        <Rows>
          <StatRow label="ULID" value={shown} copyable />
          <StatRow label="时间戳" value={String(parsed.time)} copyable />
          <StatRow label="UTC" value={parsed.iso} copyable />
          <StatRow label="随机段" value={parsed.random} copyable />
        </Rows>
      ) : (
        <Err text={parsed.error} />
      )}
      <Note>26 位 Crockford Base32。前 10 位是毫秒时间，所以字典序和生成顺序一致。和 UUID v4 的随机标识不同。</Note>
    </ExtraPage>
  );
};

export const Ipv6Tool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("2001:0db8:0000:0000:0000:0000:0000:0001");
  IPV6_SEARCH_FEED.useFeedValue(setInput);
  const result = useMemo(() => parseIpv6(input), [input]);
  return (
    <ExtraPage
      title="IPv6 转换"
      toolId="ipv6"
      onBack={onBack}
      action="convert"
      summary={result.ok ? result.info.compressed : ""}
      detail={{ input }}
      active={result.ok}
      extra={<CopyButton text={result.ok ? result.info.compressed : ""} label="复制压缩形式" />}
      onRestore={(d) => setInput(String(d.input ?? ""))}
    >
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="2001:db8::1 或 ::ffff:192.0.2.1" style={{ fontFamily: "ui-monospace, monospace", marginBottom: 12 }} />
      {result.ok ? (
        <Rows>
          <StatRow label="压缩" value={result.info.compressed} copyable />
          <StatRow label="展开" value={result.info.expanded} copyable />
          <StatRow label="IPv4 尾段" value={result.info.ipv4 ?? "无"} copyable={!!result.info.ipv4} />
          <StatRow label="区域" value={result.info.zone || "无"} />
        </Rows>
      ) : (
        <Err text={input.trim() ? result.error : undefined} />
      )}
      <Note>支持 :: 压缩、方括号和末尾的 IPv4。网段计算仍使用「IP / CIDR」，那里处理 IPv4。</Note>
    </ExtraPage>
  );
};

export const MacTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("AA-BB-CC-DD-EE-FF");
  MAC_SEARCH_FEED.useFeedValue(setInput);
  const result = useMemo(() => parseMac(input), [input]);
  return (
    <ExtraPage
      title="MAC 地址"
      toolId="mac"
      onBack={onBack}
      action="convert"
      summary={result.ok ? result.info.colon : ""}
      detail={{ input }}
      active={result.ok}
      extra={
        <Button size="small" onClick={() => setInput(randomMac().colon)}>
          随机本地 MAC
        </Button>
      }
      onRestore={(d) => setInput(String(d.input ?? ""))}
    >
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" style={{ fontFamily: "ui-monospace, monospace", marginBottom: 12 }} />
      {result.ok ? (
        <Rows>
          <StatRow label="冒号" value={result.info.colon} copyable />
          <StatRow label="连字符" value={result.info.dash} copyable />
          <StatRow label="点分" value={result.info.dot} copyable />
          <StatRow label="连续" value={result.info.plain} copyable />
          <StatRow label="首字节" value={result.info.firstOctetBits} />
          <StatRow label="投递" value={result.info.multicast ? "组播" : "单播"} />
          <StatRow label="管理" value={result.info.local ? "本地管理" : "全球唯一"} />
        </Rows>
      ) : (
        <Err text={input.trim() ? result.error : undefined} />
      )}
      <Note>首字节最低位是组播位，次低位是本地管理位。随机按钮会生成单播且本地管理的地址。</Note>
    </ExtraPage>
  );
};

export const UaTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  );
  const info = useMemo(() => parseUserAgent(input), [input]);
  const fillMine = () => {
    if (typeof navigator !== "undefined" && navigator.userAgent) setInput(navigator.userAgent);
  };
  return (
    <ExtraPage
      title="UA 解析"
      toolId="ua"
      onBack={onBack}
      action="parse"
      summary={input.trim() ? `${info.browser} / ${info.os}` : ""}
      detail={{ input }}
      active={!!input.trim()}
      extra={
        <Button size="small" onClick={fillMine}>
          使用当前浏览器
        </Button>
      }
      onRestore={(d) => setInput(String(d.input ?? ""))}
    >
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 12 }} />
      <Rows>
        <StatRow label="浏览器" value={`${info.browser} ${info.browserVersion}`.trim()} copyable />
        <StatRow label="系统" value={`${info.os} ${info.osVersion}`.trim()} copyable />
        <StatRow label="设备" value={info.device} />
        <StatRow label="引擎" value={info.engine} />
      </Rows>
      <Note>根据常见标记做本地判断。Windows 10 和 11 的 UA 都写 NT 10.0，因此显示为 10/11。</Note>
    </ExtraPage>
  );
};

export const HttpStatusTool: React.FC<Props> = ({ onBack }) => {
  const [query, setQuery] = useState("");
  const items = useMemo(() => searchHttpStatus(query), [query]);
  return (
    <ExtraPage
      title="HTTP 状态码"
      toolId="http-status"
      onBack={onBack}
      action="search"
      summary={query.trim() ? `${items.length} 条` : ""}
      detail={{ query }}
      active={!!query.trim()}
      onRestore={(d) => setQuery(String(d.query ?? ""))}
    >
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="404、Not Found、重定向" allowClear style={{ marginBottom: 12 }} />
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div key={item.code} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(128,128,128,0.08)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{item.code}</b>
              <span>{item.name}</span>
              <span style={{ marginLeft: "auto", opacity: 0.65, fontSize: 12 }}>{item.category}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 13 }}>{item.desc}</div>
          </div>
        ))}
      </div>
      {!items.length ? <Note>没有匹配的状态码。</Note> : null}
    </ExtraPage>
  );
};

export const MimeTool: React.FC<Props> = ({ onBack }) => {
  const [query, setQuery] = useState("");
  const items = useMemo(() => searchMime(query), [query]);
  const copied = items.map((item) => `${item.ext}\t${item.mime}`).join("\n");
  return (
    <ExtraPage
      title="MIME 类型"
      toolId="mime"
      onBack={onBack}
      action="search"
      summary={query.trim() ? `${items.length} 条` : ""}
      detail={{ query }}
      active={!!query.trim()}
      extra={<CopyButton text={copied} label="复制列表" />}
      onRestore={(d) => setQuery(String(d.query ?? ""))}
    >
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="png、image/jpeg、字体" allowClear style={{ marginBottom: 12 }} />
      <Rows>
        {items.map((item) => (
          <StatRow key={`${item.ext}-${item.mime}`} label={`.${item.ext} · ${item.kind}`} value={item.mime} copyable />
        ))}
      </Rows>
      {!items.length ? <Note>没有匹配的类型。</Note> : null}
    </ExtraPage>
  );
};

export const SemverTool: React.FC<Props> = ({ onBack }) => {
  const [left, setLeft] = useState("1.2.3");
  const [right, setRight] = useState("1.2.10");
  const [list, setList] = useState("2.0.0\n1.0.0-alpha\n1.0.0");
  const [version, setVersion] = useState("1.9.0");
  const [range, setRange] = useState("^1.2.3");
  const [part, setPart] = useState<"major" | "minor" | "patch">("patch");
  let compare = "";
  let compareError = "";
  try {
    const n = compareSemver(left, right);
    compare = n < 0 ? `${left} < ${right}` : n > 0 ? `${left} > ${right}` : `${left} = ${right}`;
  } catch (e) {
    compareError = e instanceof Error ? e.message : "无法比较";
  }
  let sorted = "";
  let sortError = "";
  try {
    const versions = list.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    sorted = sortSemver(versions).join("\n");
  } catch (e) {
    sortError = e instanceof Error ? e.message : "无法排序";
  }
  let bump = "";
  let bumpError = "";
  try {
    bump = bumpSemver(left, part);
  } catch (e) {
    bumpError = e instanceof Error ? e.message : "无法升级";
  }
  let match = "";
  let matchError = "";
  try {
    match = satisfiesSemver(version, range) ? "匹配" : "不匹配";
  } catch (e) {
    matchError = e instanceof Error ? e.message : "范围无效";
  }
  return (
    <ExtraPage
      title="语义化版本"
      toolId="semver"
      onBack={onBack}
      action="compare"
      summary={compare || match}
      detail={{ left, right, list, version, range, part }}
      active={!!compare || !!match}
      onRestore={(d) => {
        setLeft(String(d.left ?? ""));
        setRight(String(d.right ?? ""));
        setList(String(d.list ?? ""));
        setVersion(String(d.version ?? ""));
        setRange(String(d.range ?? ""));
        if (d.part === "major" || d.part === "minor" || d.part === "patch") setPart(d.part);
      }}
    >
      <Space wrap style={{ marginBottom: 8 }}>
        <Input value={left} onChange={(e) => setLeft(e.target.value)} addonBefore="A" style={{ width: 200 }} />
        <Input value={right} onChange={(e) => setRight(e.target.value)} addonBefore="B" style={{ width: 200 }} />
      </Space>
      <div style={{ marginBottom: 12 }}>{compare || compareError}</div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Select
          size="small"
          value={part}
          onChange={(v) => setPart(v)}
          style={{ width: 120 }}
          options={[
            { value: "major", label: "主版本" },
            { value: "minor", label: "次版本" },
            { value: "patch", label: "修订号" },
          ]}
        />
        <span>{bump ? `${left} → ${bump}` : bumpError}</span>
        {bump ? <CopyButton text={bump} /> : null}
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input value={version} onChange={(e) => setVersion(e.target.value)} addonBefore="版本" style={{ width: 200 }} />
        <Input value={range} onChange={(e) => setRange(e.target.value)} addonBefore="范围" style={{ width: 220 }} />
        <b>{match || matchError}</b>
      </Space>
      <TextArea value={list} onChange={(e) => setList(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="每行一个版本" />
      <div style={{ height: 8 }} />
      <Out value={sorted} />
      <Err text={sortError} />
      <Note>预发布版小于正式版。范围支持 = &gt; &gt;= &lt; &lt;=、^、~，空格表示并且，|| 表示或者。</Note>
    </ExtraPage>
  );
};

export const PathTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("/usr/local/../bin/node");
  const [joinText, setJoinText] = useState("src\nextras\nkit.tsx");
  const [style, setStyle] = useState<PathStyle>("auto");
  const info = inspectPath(input, style);
  const joined = joinPath(
    joinText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0),
    style === "auto" ? "posix" : style,
  );
  return (
    <ExtraPage
      title="路径处理"
      toolId="path"
      onBack={onBack}
      action="parse"
      summary={info.normalized}
      detail={{ input, joinText, style }}
      active={!!input.trim()}
      extra={<CopyButton text={info.normalized} label="复制规范路径" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        setJoinText(String(d.joinText ?? ""));
        if (d.style === "auto" || d.style === "posix" || d.style === "win") setStyle(d.style);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={style}
        onChange={(v) => setStyle(v as PathStyle)}
        options={[
          { value: "auto", label: "自动" },
          { value: "posix", label: "POSIX" },
          { value: "win", label: "Windows" },
        ]}
      />
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="路径" style={{ fontFamily: "ui-monospace, monospace", marginBottom: 12 }} />
      <Rows>
        <StatRow label="规范路径" value={info.normalized} copyable />
        <StatRow label="目录" value={info.dir} copyable />
        <StatRow label="文件名" value={info.base} copyable />
        <StatRow label="主名" value={info.name} copyable />
        <StatRow label="扩展名" value={info.ext || "无"} copyable={!!info.ext} />
        <StatRow label="绝对路径" value={info.absolute ? "是" : "否"} />
      </Rows>
      <div style={{ height: 12 }} />
      <TextArea value={joinText} onChange={(e) => setJoinText(e.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} placeholder="每行一段，用来拼接" />
      <div style={{ height: 8 }} />
      <Out value={joined} />
      <Note>会折叠 . 和 ..。拼接时，遇到绝对路径会丢掉前面的部分，和常见路径库一致。</Note>
    </ExtraPage>
  );
};

export const DotenvTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState('# 数据库\nexport HOST=127.0.0.1\nNAME="Fat Tools"\n');
  const [dir, setDir] = useState<"toJson" | "toEnv">("toJson");
  const parsed = parseDotenv(input);
  let output = "";
  let error = parsed.error;
  if (!error && dir === "toJson") output = JSON.stringify(dotenvToObject(parsed.entries), null, 2);
  if (dir === "toEnv") {
    try {
      const value = JSON.parse(input);
      if (!value || typeof value !== "object" || Array.isArray(value)) error = "JSON 需要是对象";
      else {
        output = stringifyDotenv(Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item == null ? "" : String(item) })));
        error = undefined;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "JSON 无效";
    }
  }
  return (
    <ExtraPage
      title=".env 解析"
      toolId="dotenv"
      onBack={onBack}
      action={dir}
      summary={output ? dir : ""}
      detail={{ input, dir }}
      active={!!output}
      extra={<CopyButton text={output} label="复制结果" />}
      onRestore={(d) => {
        setInput(String(d.input ?? ""));
        if (d.dir === "toJson" || d.dir === "toEnv") setDir(d.dir);
      }}
    >
      <Segmented
        size="small"
        style={{ marginBottom: 12 }}
        value={dir}
        onChange={(v) => setDir(v as "toJson" | "toEnv")}
        options={[
          { value: "toJson", label: ".env → JSON" },
          { value: "toEnv", label: "JSON → .env" },
        ]}
      />
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 5, maxRows: 12 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 8 }} />
      <Out value={output} />
      <Err text={error} />
      <Note>支持 export、# 注释、单引号原文和双引号转义。同名变量保留最后一次。</Note>
    </ExtraPage>
  );
};

export const CurlTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState(`curl -X POST https://api.example.com/v1 -H "Content-Type: application/json" -d '{"a":1}'`);
  CURL_SEARCH_FEED.useFeedValue(setInput);
  const result = useMemo(() => parseCurl(input), [input]);
  const rebuilt = result.ok ? buildCurl(result.request) : "";
  return (
    <ExtraPage
      title="cURL 解析"
      toolId="curl"
      onBack={onBack}
      action="parse"
      summary={result.ok ? `${result.request.method} ${result.request.url}` : ""}
      detail={{ input }}
      active={result.ok}
      extra={<CopyButton text={rebuilt} label="复制重建命令" />}
      onRestore={(d) => setInput(String(d.input ?? ""))}
    >
      <TextArea value={input} onChange={(e) => setInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} style={{ fontFamily: "ui-monospace, monospace" }} />
      <div style={{ height: 12 }} />
      {result.ok ? (
        <Rows>
          <StatRow label="方法" value={result.request.method} copyable />
          <StatRow label="URL" value={result.request.url} copyable />
          <StatRow label="请求体" value={result.request.body || "无"} copyable={!!result.request.body} />
          <StatRow label="用户" value={result.request.user || "无"} />
          <StatRow label="选项" value={[result.request.follow ? "跟随跳转" : "", result.request.insecure ? "跳过证书" : ""].filter(Boolean).join("、") || "无"} />
          {result.request.headers.map((header) => (
            <StatRow key={`${header.name}:${header.value}`} label={header.name} value={header.value} copyable />
          ))}
        </Rows>
      ) : (
        <Err text={input.trim() ? result.error : undefined} />
      )}
      {rebuilt ? (
        <>
          <div style={{ height: 8 }} />
          <Out value={rebuilt} />
        </>
      ) : null}
      <Note>识别 -X、-H、-d、--data-raw、-u、-A、-k、-L 和 -G。有请求体且没写方法时按 POST。</Note>
    </ExtraPage>
  );
};
