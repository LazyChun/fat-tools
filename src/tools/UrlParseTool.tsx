/*
 * URL 解析：拆解 URL 各组成部分，并以表格展示查询参数
 */
import React, { useMemo, useState } from "react";
import { Input, Table, Typography } from "antd";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

const { Text } = Typography;

// URL 解析的全局搜索直达：匹配 http/https 开头的完整 URL
export const URL_PARSE_SEARCH_FEED = createToolSearchFeed(/^https?:\/\/\S+$/);

interface Props {
  onBack?: () => void;
}

interface ParamRow {
  key: string;
  name: string;
  value: string;
}

interface Parsed {
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  hash: string;
  origin: string;
  params: ParamRow[];
  error: string;
}

function parseUrl(input: string): Parsed {
  const empty: Parsed = {
    protocol: "",
    host: "",
    hostname: "",
    port: "",
    pathname: "",
    hash: "",
    origin: "",
    params: [],
    error: "",
  };
  const raw = input.trim();
  if (!raw) return empty;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(`http://${raw}`);
    } catch (e) {
      return { ...empty, error: `无法解析 URL：${(e as Error).message}` };
    }
  }
  const params: ParamRow[] = [];
  url.searchParams.forEach((value, name) => {
    params.push({ key: `${name}-${params.length}`, name, value });
  });
  return {
    protocol: url.protocol.replace(/:$/, ""),
    host: url.host,
    hostname: url.hostname,
    port: url.port || "(默认)",
    pathname: url.pathname,
    hash: url.hash,
    origin: url.origin,
    params,
    error: "",
  };
}

const UrlParseTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState(
    "https://example.com:8443/a/b?name=%E5%BC%A0%E4%B8%89&age=20#top",
  );

  // 全局搜索直达：命中输入模式后自动填入
  URL_PARSE_SEARCH_FEED.useFeedValue(setInput);

  const parsed = useMemo(() => parseUrl(input), [input]);

  React.useEffect(() => {
    recordUsageDebounced(
      "url-parse",
      () =>
        !parsed.error && input.trim()
          ? {
              toolId: "url-parse",
              toolTitle: "URL 解析",
              action: "parse",
              summary: `${parsed.host}${parsed.pathname}（${parsed.params.length} 个参数）`,
              detail: { input },
            }
          : null,
      2000,
    );
  }, [input, parsed]);

  return (
    <ToolShell title="URL 解析" onBack={onBack}>
      <Input.TextArea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder="粘贴 URL，例如 https://example.com/a?x=1"
        style={{ fontFamily: "monospace", marginBottom: 12, marginRight: 0 }}
      />

      {parsed.error ? (
        <div style={{ color: "#cf1322" }}>{parsed.error}</div>
      ) : !input.trim() ? (
        <Text type="secondary">输入 URL 后自动解析</Text>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 6,
              marginBottom: 12,
            }}
          >
            <StatRow label="协议" value={parsed.protocol} copyable />
            <StatRow label="主机" value={parsed.host} copyable />
            <StatRow label="域名" value={parsed.hostname} copyable />
            <StatRow label="端口" value={parsed.port} copyable />
            <StatRow label="路径" value={parsed.pathname} copyable />
            <StatRow
              label="Hash"
              value={parsed.hash || "—"}
              copyable={!!parsed.hash}
            />
            <StatRow label="Origin" value={parsed.origin} copyable />
          </div>

          <Text type="secondary" style={{ fontSize: 12 }}>
            查询参数（已解码，共 {parsed.params.length} 个）
          </Text>
          <Table<ParamRow>
            size="small"
            rowKey="key"
            pagination={false}
            style={{ marginTop: 6 }}
            dataSource={parsed.params}
            locale={{ emptyText: "无查询参数" }}
            columns={[
              {
                title: "参数名",
                dataIndex: "name",
                width: 200,
                render: (v: string) => <Text code>{v}</Text>,
              },
              {
                title: "值",
                dataIndex: "value",
                render: (v: string) => (
                  <Text style={{ wordBreak: "break-all" }}>
                    {v === "" ? "(空)" : v}
                  </Text>
                ),
              },
              {
                title: "",
                width: 80,
                render: (_: unknown, row: ParamRow) => (
                  <CopyButton text={`${row.name}=${row.value}`} />
                ),
              },
            ]}
          />
        </>
      )}

      <ToolHistoryPanel
        toolId="url-parse"
        toolTitle="URL 解析"
        onRestore={(d) => {
          if (typeof d.input === "string") {
            suppressNextRecord("url-parse");
            setInput(d.input);
          }
        }}
      />
    </ToolShell>
  );
};

export default UrlParseTool;
