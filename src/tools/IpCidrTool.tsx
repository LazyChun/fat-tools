/*
 * IPv4 / CIDR 子网计算：网段、掩码、可用主机、包含判断
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Input, Space, Tag, Typography } from "antd";
import { CIDR_PRESETS, intToBinary, intToDotted, ipInCidr, parseCidr, parseIpv4 } from "./ipCidr";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const IpCidrTool: React.FC<Props> = ({ onBack }) => {
  const [cidr, setCidr] = useState("192.168.1.0/24");
  const [checkIp, setCheckIp] = useState("192.168.1.100");

  const parsed = useMemo(() => parseCidr(cidr), [cidr]);
  const check = useMemo(() => {
    if (!checkIp.trim() || !parsed.ok) return null;
    return ipInCidr(checkIp, parsed.input);
  }, [checkIp, parsed]);

  const ipOnly = useMemo(() => {
    // 仅输入 IP 时也展示二进制
    const left = cidr.split("/")[0]?.trim() || "";
    return parseIpv4(left);
  }, [cidr]);

  useEffect(() => {
    recordUsageDebounced("ip-cidr", () => {
      if (!parsed.ok) return null;
      return {
        toolId: "ip-cidr",
        toolTitle: "IP / CIDR 计算",
        action: "calc",
        summary: `${parsed.input} → ${intToDotted(parsed.network)} ~ ${intToDotted(parsed.broadcast)}`,
        detail: { cidr: parsed.input, checkIp: checkIp.trim() },
      };
    });
  }, [parsed, checkIp]);

  const summaryText = parsed.ok
    ? [
        `CIDR: ${parsed.input}`,
        `网络: ${intToDotted(parsed.network)}`,
        `广播: ${intToDotted(parsed.broadcast)}`,
        `掩码: ${intToDotted(parsed.mask)}`,
        `可用主机: ${parsed.hostCount}`,
      ].join("\n")
    : "";

  return (
    <ToolShell
      title="IP / CIDR 计算"
      onBack={onBack}
      extra={parsed.ok ? <CopyButton text={() => summaryText} label="复制结果" /> : null}
    >
      <Space size={8} wrap style={{ marginBottom: 10, width: "100%" }}>
        <Input
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          placeholder="如 192.168.1.0/24"
          allowClear
          style={{ width: 260, fontFamily: "monospace" }}
          status={cidr.trim() && !parsed.ok ? "error" : undefined}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          支持 a.b.c.d/前缀
        </Text>
      </Space>

      <Space size={6} wrap style={{ marginBottom: 14 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          常用前缀：
        </Text>
        {CIDR_PRESETS.map((p) => (
          <Tag
            key={p.prefix}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
            onClick={() => {
              const left = (cidr.split("/")[0] || "192.168.1.0").trim() || "192.168.1.0";
              setCidr(`${left}/${p.prefix}`);
            }}
          >
            {p.label}
          </Tag>
        ))}
      </Space>

      {!cidr.trim() ? (
        <Text type="secondary">输入 CIDR 后显示网段信息</Text>
      ) : !parsed.ok ? (
        <Alert type="error" showIcon message={parsed.error} />
      ) : (
        <>
          <div style={{ display: "grid", gap: 6, maxWidth: 560, marginBottom: 16 }}>
            <StatRow label="规范化" value={parsed.input} copyable />
            <StatRow label="网络地址" value={intToDotted(parsed.network)} copyable />
            <StatRow label="广播地址" value={intToDotted(parsed.broadcast)} copyable />
            <StatRow label="子网掩码" value={intToDotted(parsed.mask)} copyable />
            <StatRow label="反掩码" value={intToDotted(parsed.wildcard)} copyable />
            <StatRow
              label="可用主机"
              value={
                parsed.usableFirst !== null && parsed.usableLast !== null
                  ? `${parsed.hostCount}（${intToDotted(parsed.usableFirst)} ~ ${intToDotted(parsed.usableLast)}）`
                  : String(parsed.hostCount)
              }
            />
            <StatRow
              label="二进制"
              value={ipOnly.ok ? ipOnly.binary : intToBinary(parsed.ip)}
              copyable
            />
          </div>

          <Space size={8} wrap style={{ marginBottom: 8 }}>
            <Text type="secondary">判断 IP 是否在网段内</Text>
            <Input
              value={checkIp}
              onChange={(e) => setCheckIp(e.target.value)}
              placeholder="如 192.168.1.100"
              style={{ width: 180, fontFamily: "monospace" }}
              allowClear
            />
            {check && check.ok ? (
              <Tag color={check.inside ? "success" : "default"}>
                {check.inside ? "在网段内" : "不在网段内"}
              </Tag>
            ) : check && !check.ok ? (
              <Tag color="error">{check.error}</Tag>
            ) : null}
          </Space>
        </>
      )}

      <ToolHistoryPanel
        toolId="ip-cidr"
        toolTitle="IP / CIDR 计算"
        onRestore={(d) => {
          suppressNextRecord("ip-cidr");
          if (typeof d.cidr === "string") setCidr(d.cidr);
          if (typeof d.checkIp === "string") setCheckIp(d.checkIp);
        }}
      />
    </ToolShell>
  );
};

export default IpCidrTool;
