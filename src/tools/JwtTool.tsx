/*
 * JWT 解析：解码 header / payload（不校验签名），并高亮时间声明
 */
import React, { useMemo, useState } from "react";
import { Input, Tag, Typography } from "antd";
import { decodeJwt, JWT_TIME_CLAIMS } from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

function formatTs(sec: number): string {
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return "非法时间";
  return d.toLocaleString();
}

/** 把对象编码为 Base64URL 段（用于从历史还原 JWT 字符串） */
function toBase64Url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

const JwtTool: React.FC<Props> = ({ onBack }) => {
  const [token, setToken] = useState("");

  const decoded = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { ...decodeJwt(token), error: "" };
    } catch (e) {
      return { header: null, payload: null, signature: "", error: (e as Error).message };
    }
  }, [token]);

  const headerText = decoded?.header ? JSON.stringify(decoded.header, null, 2) : "";
  const payloadText = decoded?.payload ? JSON.stringify(decoded.payload, null, 2) : "";

  const now = Math.floor(Date.now() / 1000);
  const exp = decoded?.payload?.exp;

  React.useEffect(() => {
    recordUsageDebounced(
      "jwt",
      () =>
        decoded && !decoded.error
          ? {
              toolId: "jwt",
              toolTitle: "JWT 解析",
              action: "decode",
              summary: `解析 JWT（alg=${String(decoded.header?.alg ?? "?")}）`,
              detail: { header: decoded.header, payload: decoded.payload },
            }
          : null,
      2000,
    );
  }, [decoded]);

  return (
    <ToolShell title="JWT 解析" onBack={onBack}>
      <Input.TextArea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 6 }}
        placeholder="粘贴 JWT（形如 xxxxx.yyyyy.zzzzz）"
        style={{ fontFamily: "monospace", marginBottom: 10 }}
      />

      {decoded?.error ? (
        <div style={{ color: "#cf1322", marginBottom: 10 }}>{decoded.error}</div>
      ) : null}

      {decoded && !decoded.error ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              状态：
            </Text>
            {typeof exp === "number" ? (
              exp * 1000 > Date.now() ? (
                <Tag color="green">未过期（{formatTs(exp)} 到期）</Tag>
              ) : (
                <Tag color="red">已过期（{formatTs(exp)}）</Tag>
              )
            ) : (
              <Tag>无 exp 声明</Tag>
            )}
            <Tag color="blue">签名段 {decoded.signature ? "存在" : "缺失"}</Tag>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px", minWidth: 260 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12 }}>
                  HEADER
                </Text>
                <CopyButton text={headerText} />
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 10,
                  borderRadius: 6,
                  maxHeight: 260,
                  overflow: "auto",
                  background: "rgba(128,128,128,0.1)",
                  fontSize: 12,
                }}
              >
                {headerText}
              </pre>
            </div>

            <div style={{ flex: "1 1 320px", minWidth: 260 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12 }}>
                  PAYLOAD
                </Text>
                <CopyButton text={payloadText} />
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 10,
                  borderRadius: 6,
                  maxHeight: 260,
                  overflow: "auto",
                  background: "rgba(128,128,128,0.1)",
                  fontSize: 12,
                }}
              >
                {payloadText}
              </pre>
            </div>
          </div>

          {decoded.payload ? (
            <div style={{ marginTop: 10 }}>
              {JWT_TIME_CLAIMS.filter(
                (c) => typeof decoded.payload![c] === "number",
              ).map((c) => (
                <div key={c} style={{ fontSize: 12 }}>
                  <Text type="secondary">
                    {c} = {String(decoded.payload![c])} → {formatTs(Number(decoded.payload![c]))}
                  </Text>
                  {c === "exp" ? (
                    <Text type="secondary">
                      {" "}
                      （{Number(decoded.payload![c]) > now ? "剩余" : "已超时"}{" "}
                      {Math.abs(Math.round((Number(decoded.payload![c]) - now) / 60))} 分钟）
                    </Text>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : !token.trim() ? (
        <Text type="secondary">粘贴 JWT 后自动解码（仅解析，不校验签名）</Text>
      ) : null}

      <ToolHistoryPanel
        toolId="jwt"
        toolTitle="JWT 解析"
        onRestore={(d) => {
          // 历史中保存的是解析后的对象，这里重新拼回 JWT 字符串
          if (d.header && d.payload) {
            suppressNextRecord("jwt");
            setToken(`${toBase64Url(d.header)}.${toBase64Url(d.payload)}.`);
          }
        }}
      />
    </ToolShell>
  );
};

export default JwtTool;
