/*
 * DNS 查询工具：基于 DoH（DNS over HTTPS）实时查询域名解析记录。
 *
 * 浏览器无法直接发 UDP DNS，故走 Google / Cloudflare 的 JSON DoH 接口（纯前端、无需后端）。
 * 支持 A / AAAA / CNAME / MX / TXT / NS / SOA / SRV / CAA / PTR 记录类型。
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import { CloudServerOutlined, SearchOutlined } from "@ant-design/icons";
import {
  DNS_RCODE,
  DNS_TYPES,
  DNS_TYPE_DESC,
  isValidDomain,
  queryDns,
  type DnsAnswer,
  type DnsType,
} from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

/** 预设常用域名，一键查询 */
const PRESETS = [
  "google.com",
  "cloudflare.com",
  "github.com",
  "baidu.com",
  "qq.com",
];

const DnsTool: React.FC<Props> = ({ onBack }) => {
  const [domain, setDomain] = useState("google.com");
  const [type, setType] = useState<DnsType>("A");
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<DnsAnswer[]>([]);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState<{ domain: string; type: DnsType } | null>(null);

  const doQuery = useCallback(async () => {
    const d = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!isValidDomain(d)) {
      setError("请输入合法的域名，例如 example.com");
      setAnswers([]);
      setStatus(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await queryDns(d, type);
      setAnswers(r.answers);
      setStatus(r.status);
      setQueried({ domain: d, type });
      recordUsage({
        toolId: "dns",
        toolTitle: "DNS 查询",
        action: "query",
        summary: `${type} ${d} → ${r.answers.length} 条记录`,
        detail: { domain: d, type },
      });
    } catch (e) {
      setError((e as Error).message);
      setAnswers([]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [domain, type]);

  // 首次进入自动查一次
  useEffect(() => {
    void doQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: "类型",
      dataIndex: "type",
      width: 90,
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: "记录值",
      dataIndex: "data",
      render: (v: string) => (
        <Space size={6}>
          <Text style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{v}</Text>
          <CopyButton text={v} />
        </Space>
      ),
    },
    {
      title: "TTL",
      dataIndex: "TTL",
      width: 90,
      render: (v: number) => <Text type="secondary">{v}s</Text>,
    },
  ];

  return (
    <ToolShell
      title="DNS 查询"
      onBack={onBack}
      extra={
        <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
          DoH · 无需后端
        </Tag>
      }
    >
      <Space.Compact style={{ width: "100%", marginBottom: 10 }}>
        <Select
          value={type}
          onChange={(v) => setType(v)}
          style={{ width: 110 }}
          options={DNS_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onPressEnter={() => doQuery()}
          placeholder="输入域名，如 example.com（回车查询）"
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={doQuery}>
          查询
        </Button>
      </Space.Compact>

      <Space size={6} wrap style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          常用：
        </Text>
        {PRESETS.map((p) => (
          <Tag
            key={p}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
            onClick={() => {
              setDomain(p);
              void doQuery();
            }}
          >
            {p}
          </Tag>
        ))}
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={
          <span>
            <b>{type}</b>：{DNS_TYPE_DESC[type]}
          </span>
        }
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          message="查询失败"
          description={`${error}。浏览器无法直发 UDP，本工具通过 DoH 查询；若持续失败请检查网络或代理设置。`}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {queried ? (
        <Descriptions
          size="small"
          column={3}
          style={{ marginBottom: 10 }}
          items={[
            { key: "d", label: "域名", children: queried.domain },
            { key: "t", label: "记录类型", children: queried.type },
            {
              key: "s",
              label: "响应状态",
              children:
                status === null ? "—" : (
                  <Tag color={status === 0 ? "success" : "warning"}>
                    {DNS_RCODE[status] ?? `CODE ${status}`}
                  </Tag>
                ),
            },
          ]}
        />
      ) : null}

      <Spin spinning={loading}>
        {answers.length > 0 ? (
          <>
            <Space size={8} style={{ marginBottom: 8 }}>
              <CloudServerOutlined />
              <Text strong>解析结果（{answers.length} 条）</Text>
              <CopyButton
                text={() =>
                  answers.map((a) => `${a.name}\t${a.TTL}\t${a.type}\t${a.data}`).join("\n")
                }
                label="复制全部"
              />
            </Space>
            <Table
              rowKey={(r, i) => `${r.name}-${r.type}-${r.data}-${i}`}
              size="small"
              pagination={false}
              dataSource={answers}
              columns={columns}
            />
          </>
        ) : !loading && !error ? (
          <Text type="secondary">暂无解析结果（该类型可能未配置记录）</Text>
        ) : null}
      </Spin>

      <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
        数据来源：Google DNS / Cloudflare DNS 的 DoH JSON 接口，自动镜像兜底。
        查询在浏览器直接发起，域名不会经过本工具的服务端。
      </Text>

      <ToolHistoryPanel
        toolId="dns"
        toolTitle="DNS 查询"
        onRestore={(d) => {
          suppressNextRecord("dns");
          if (typeof d.domain === "string") setDomain(d.domain);
          if (typeof d.type === "string" && (DNS_TYPES as readonly string[]).includes(d.type)) {
            setType(d.type as DnsType);
          }
        }}
      />
    </ToolShell>
  );
};

export default DnsTool;
