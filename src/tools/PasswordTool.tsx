/*
 * 密码生成器：基于加密安全随机数批量生成强密码，并给出强度评估
 */
import React, { useMemo, useState } from "react";
import { Button, Checkbox, InputNumber, Progress, Space, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import {
  estimatePasswordBits,
  generatePassword,
  passwordCharsetSize,
  passwordStrengthLabel,
  type PasswordOptions,
} from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const PasswordTool: React.FC<Props> = ({ onBack }) => {
  const [length, setLength] = useState(16);
  const [count, setCount] = useState(5);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [list, setList] = useState<string[]>([]);
  const [error, setError] = useState("");

  const options: PasswordOptions = useMemo(
    () => ({ length, upper, lower, digits, symbols, excludeAmbiguous }),
    [length, upper, lower, digits, symbols, excludeAmbiguous],
  );

  const bits = estimatePasswordBits(options);
  const strength = passwordStrengthLabel(bits);

  const generate = () => {
    try {
      const n = Math.max(1, Math.min(100, count));
      const out: string[] = [];
      for (let i = 0; i < n; i++) out.push(generatePassword(options));
      setList(out);
      setError("");
      recordUsage({
        toolId: "password",
        toolTitle: "密码生成器",
        action: "generate",
        summary: `生成 ${n} 个长度 ${length} 的密码（约 ${bits} bit 熵）`,
        detail: { length, count: n, upper, lower, digits, symbols, excludeAmbiguous, bits },
      });
    } catch (e) {
      setList([]);
      setError((e as Error).message);
    }
  };

  return (
    <ToolShell
      title="密码生成器"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Text type="secondary">数量</Text>
          <InputNumber size="small" min={1} max={100} value={count} onChange={(v) => setCount(v || 1)} />
          <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={generate}>
            生成
          </Button>
          {list.length > 0 ? <CopyButton text={() => list.join("\n")} label="复制全部" /> : null}
        </Space>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            密码长度：{length}
          </Text>
          <InputNumber
            size="small"
            min={4}
            max={256}
            value={length}
            onChange={(v) => setLength(Math.max(4, Math.min(256, v || 16)))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
        <Space direction="vertical" size={2}>
          <Checkbox checked={upper} onChange={(e) => setUpper(e.target.checked)}>
            大写字母 A-Z
          </Checkbox>
          <Checkbox checked={lower} onChange={(e) => setLower(e.target.checked)}>
            小写字母 a-z
          </Checkbox>
        </Space>
        <Space direction="vertical" size={2}>
          <Checkbox checked={digits} onChange={(e) => setDigits(e.target.checked)}>
            数字 0-9
          </Checkbox>
          <Checkbox checked={symbols} onChange={(e) => setSymbols(e.target.checked)}>
            符号 !@#$…
          </Checkbox>
        </Space>
        <Space direction="vertical" size={2}>
          <Checkbox checked={excludeAmbiguous} onChange={(e) => setExcludeAmbiguous(e.target.checked)}>
            排除易混字符 (I l 1 O 0 …)
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12 }}>
            可用字符集大小：{passwordCharsetSize(options)}
          </Text>
        </Space>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(128,128,128,0.08)",
          marginBottom: 12,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
          强度评估
        </Text>
        <Progress
          percent={strength.percent}
          strokeColor={strength.color}
          showInfo={false}
          style={{ flex: 1, margin: 0 }}
        />
        <Text strong style={{ color: strength.color, flexShrink: 0 }}>
          {strength.label}（约 {bits} bit）
        </Text>
      </div>

      {error ? (
        <div style={{ color: "#cf1322", marginBottom: 12 }}>{error}</div>
      ) : null}

      {list.length === 0 ? (
        <Text type="secondary">点击右上角「生成」批量产生随机密码（使用 crypto 安全随机数）</Text>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {list.map((pw, i) => (
            <div
              key={`${i}-${pw}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "4px 10px",
                borderRadius: 6,
                background: "rgba(128,128,128,0.08)",
              }}
            >
              <Text code style={{ fontSize: 13, wordBreak: "break-all" }}>
                {pw}
              </Text>
              <CopyButton text={pw} />
            </div>
          ))}
        </div>
      )}

      <ToolHistoryPanel
        toolId="password"
        toolTitle="密码生成器"
        onRestore={(d) => {
          if (typeof d.length === "number") setLength(d.length);
          if (typeof d.count === "number") setCount(d.count);
          setUpper(d.upper !== false);
          setLower(d.lower !== false);
          setDigits(d.digits !== false);
          setSymbols(d.symbols !== false);
          setExcludeAmbiguous(d.excludeAmbiguous === true);
        }}
      />
    </ToolShell>
  );
};

export default PasswordTool;
