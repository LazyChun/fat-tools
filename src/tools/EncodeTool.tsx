/*
 * Base64 / URL 编解码工具（UTF-8 安全）
 */
import React, { useState } from "react";
import { Alert, Button, Input, Space } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { base64Decode, base64Encode } from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";
import { createToolSearchFeed } from "./searchFeed";

// URL 编解码的全局搜索直达：匹配含 %XX 转义序列的 URL 编码文本
export const URL_SEARCH_FEED = createToolSearchFeed(/%[0-9a-f]{2}/);

// Base64 编解码的全局搜索直达：匹配 12 字符以上、总长为 4 的倍数的 Base64 编码串
// （排除纯数字时间戳与含 / 的类路径文本等误命中）
export const BASE64_SEARCH_FEED = createToolSearchFeed(
  /^(?=[a-z0-9+/=]{12,}$)(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=|[a-z0-9+/]{4})+$/,
);

const { TextArea } = Input;

interface Props {
  onBack?: () => void;
  mode: "base64" | "url";
}

const EncodeTool: React.FC<Props> = ({ onBack, mode }) => {
  const isBase64 = mode === "base64";
  const [plain, setPlain] = useState("");
  const [encoded, setEncoded] = useState("");
  const [error, setError] = useState("");

  // 全局搜索直达：命中输入模式后自动填入（两种 mode 共用输入 state，两个 feed 均指向编码侧输入框）
  URL_SEARCH_FEED.useFeedValue(setEncoded);
  BASE64_SEARCH_FEED.useFeedValue(setEncoded);

  const encode = () => {
    setError("");
    try {
      const out = isBase64 ? base64Encode(plain) : encodeURIComponent(plain);
      setEncoded(out);
      recordUsage({
        toolId: isBase64 ? "base64" : "url",
        toolTitle: isBase64 ? "Base64 编解码" : "URL 编解码",
        action: "encode",
        summary: `编码 ${plain.length} 字符 → ${out.length} 字符`,
        detail: {
          inputLen: plain.length,
          outputLen: out.length,
          plain,
          encoded: out,
        },
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const decode = () => {
    setError("");
    try {
      const out = isBase64
        ? base64Decode(encoded)
        : decodeURIComponent(encoded.replace(/\+/g, "%20"));
      setPlain(out);
      recordUsage({
        toolId: isBase64 ? "base64" : "url",
        toolTitle: isBase64 ? "Base64 编解码" : "URL 编解码",
        action: "decode",
        summary: `解码 ${encoded.length} 字符 → ${out.length} 字符`,
        detail: {
          inputLen: encoded.length,
          outputLen: out.length,
          plain: out,
          encoded,
        },
      });
    } catch (e) {
      setError(
        isBase64 ? "Base64 格式不合法，无法解码" : "URL 编码不合法，无法解码",
      );
    }
  };

  const swap = () => {
    setPlain(encoded);
    setEncoded(plain);
    setError("");
  };

  return (
    <ToolShell
      title={isBase64 ? "Base64 编解码" : "URL 编解码"}
      onBack={onBack}
      extra={
        <Space size={8}>
          <Button size="small" icon={<SwapOutlined />} onClick={swap}>
            交换
          </Button>
          <Button size="small" type="primary" onClick={encode}>
            {isBase64 ? "编码 →" : "编码 →"}
          </Button>
          <Button size="small" onClick={decode}>
            ← 解码
          </Button>
        </Space>
      }
    >
      {error ? (
        <Alert type="error" message={error} style={{ marginBottom: 12 }} />
      ) : null}
      <div style={{ marginBottom: 8 }}>
        <Space size={8}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>明文</span>
          <CopyButton text={plain} />
        </Space>
      </div>
      <TextArea
        value={plain}
        onChange={(e) => setPlain(e.target.value)}
        placeholder="输入要编码的文本…"
        autoSize={{ minRows: 4, maxRows: 8 }}
        style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
      />
      <div style={{ marginBottom: 8 }}>
        <Space size={8}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {isBase64 ? "Base64" : "编码后"}
          </span>
          <CopyButton text={encoded} />
        </Space>
      </div>
      <TextArea
        value={encoded}
        onChange={(e) => setEncoded(e.target.value)}
        placeholder={
          isBase64
            ? "输入 Base64 字符串进行解码…"
            : "输入 URL 编码字符串进行解码…"
        }
        autoSize={{ minRows: 4, maxRows: 8 }}
        style={{ fontFamily: "monospace", fontSize: 12 }}
      />

      <ToolHistoryPanel
        toolId={isBase64 ? "base64" : "url"}
        toolTitle={isBase64 ? "Base64 编解码" : "URL 编解码"}
        onRestore={(d) => {
          setPlain(String(d.plain ?? ""));
          setEncoded(String(d.encoded ?? ""));
          setError("");
        }}
      />
    </ToolShell>
  );
};

export default EncodeTool;
