/*
 * UUID 生成器：批量生成 UUID v4，支持大小写/连字符选项
 */
import React, { useState } from "react";
import { Button, Checkbox, InputNumber, Space, Typography } from "antd";
import { uuidV4 } from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const UuidTool: React.FC<Props> = ({ onBack }) => {
  const [count, setCount] = useState(5);
  const [ids, setIds] = useState<string[]>([]);
  const [upper, setUpper] = useState(false);
  const [noHyphen, setNoHyphen] = useState(false);

  const format = (id: string): string => {
    let v = id;
    if (noHyphen) v = v.replace(/-/g, "");
    if (upper) v = v.toUpperCase();
    return v;
  };

  const generate = () => {
    const generated = Array.from({ length: Math.max(1, Math.min(100, count)) }, () => uuidV4());
    setIds(generated);
    recordUsage({
      toolId: "uuid",
      toolTitle: "UUID 生成器",
      action: "generate",
      summary: `生成 ${generated.length} 个 UUID v4${upper ? "（大写）" : ""}${noHyphen ? "（无连字符）" : ""}`,
      detail: { count: generated.length, upper, noHyphen, ids: generated },
    });
  };

  return (
    <ToolShell
      title="UUID 生成器"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Text type="secondary">数量</Text>
          <InputNumber size="small" min={1} max={100} value={count} onChange={(v) => setCount(v || 1)} />
          <Button size="small" type="primary" onClick={generate}>
            生成
          </Button>
          {ids.length > 0 ? <CopyButton text={() => ids.map(format).join("\n")} label="复制全部" /> : null}
        </Space>
      }
    >
      <Space size={16} style={{ marginBottom: 12 }}>
        <Checkbox checked={upper} onChange={(e) => setUpper(e.target.checked)}>
          大写
        </Checkbox>
        <Checkbox checked={noHyphen} onChange={(e) => setNoHyphen(e.target.checked)}>
          去掉连字符
        </Checkbox>
      </Space>

      {ids.length === 0 ? (
        <Text type="secondary">点击右上角「生成」批量产生 UUID v4（基于加密安全随机数）</Text>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {ids.map((id, i) => (
            <div
              key={id}
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
              <Text code style={{ fontSize: 12 }}>
                {format(id)}
              </Text>
              <CopyButton text={format(id)} />
            </div>
          )          )}
        </div>
      )}

      <ToolHistoryPanel
        toolId="uuid"
        toolTitle="UUID 生成器"
        onRestore={(d) => {
          const restored = Array.isArray(d.ids) ? d.ids.map(String).filter(Boolean) : [];
          if (restored.length === 0) return;
          setIds(restored);
          setCount(restored.length);
          setUpper(d.upper === true);
          setNoHyphen(d.noHyphen === true);
        }}
      />
    </ToolShell>
  );
};

export default UuidTool;
