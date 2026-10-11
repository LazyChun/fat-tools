/*
 * 随机字符生成：按所选字符集批量生成随机字符串（加密安全随机数），
 * 支持长度 / 数量 / 自定义字符 / 排除易混字符 / 前后缀 / 去重。
 */
import React, { useMemo, useState } from "react";
import { Button, Checkbox, Input, InputNumber, Space, Typography } from "antd";
import { CopyOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  generateRandomString,
  generateRandomStrings,
  RANDOM_CHARSETS,
  type RandomCharClass,
  type RandomStringOptions,
} from "../utils";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const CLASS_LABELS: { key: RandomCharClass; label: string }[] = [
  { key: "digits", label: "数字 0-9" },
  { key: "lower", label: "小写 a-z" },
  { key: "upper", label: "大写 A-Z" },
  { key: "symbols", label: "符号 !@#$…" },
  { key: "cjk", label: "常用汉字" },
];

const RandomStringTool: React.FC<Props> = ({ onBack }) => {
  const [length, setLength] = useState(16);
  const [count, setCount] = useState(10);
  const [classes, setClasses] = useState<RandomCharClass[]>(["digits", "lower", "upper"]);
  const [excludeSimilar, setExcludeSimilar] = useState(false);
  const [custom, setCustom] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [unique, setUnique] = useState(false);
  const [list, setList] = useState<string[]>([]);
  const [error, setError] = useState("");

  const options: RandomStringOptions = useMemo(
    () => ({ length, classes, excludeSimilar, custom, prefix, suffix }),
    [length, classes, excludeSimilar, custom, prefix, suffix],
  );

  const toggleClass = (key: RandomCharClass, checked: boolean) => {
    setClasses((prev) => (checked ? [...new Set([...prev, key])] : prev.filter((c) => c !== key)));
  };

  const generate = () => {
    try {
      const out = generateRandomStrings(options, count, unique);
      setList(out);
      setError("");
      recordUsage({
        toolId: "random-string",
        toolTitle: "随机字符生成",
        action: "generate",
        summary: `生成 ${out.length} 条长度 ${length} 的随机字符串${unique ? "（去重）" : ""}`,
        detail: { length, count: out.length, classes, excludeSimilar, custom, prefix, suffix, unique },
      });
    } catch (e) {
      setList([]);
      setError((e as Error).message);
    }
  };

  const preview = useMemo(() => {
    try {
      return generateRandomString(options);
    } catch {
      return "";
    }
  }, [options]);

  return (
    <ToolShell
      title="随机字符生成"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Text type="secondary">数量</Text>
          <InputNumber size="small" min={1} max={1000} value={count} onChange={(v) => setCount(v || 1)} />
          <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={generate}>
            生成
          </Button>
          {list.length > 0 ? (
            <CopyButton text={() => list.join("\n")} label="复制全部" />
          ) : (
            <Button size="small" icon={<CopyOutlined />} disabled>
              复制全部
            </Button>
          )}
        </Space>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 14,
          marginBottom: 12,
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            单条长度：{length}
          </Text>
          <InputNumber
            size="small"
            min={1}
            max={4096}
            value={length}
            onChange={(v) => setLength(Math.max(1, Math.min(4096, v || 1)))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
        <Space direction="vertical" size={2}>
          {CLASS_LABELS.slice(0, 3).map((c) => (
            <Checkbox
              key={c.key}
              checked={classes.includes(c.key)}
              onChange={(e) => toggleClass(c.key, e.target.checked)}
            >
              {c.label}
            </Checkbox>
          ))}
        </Space>
        <Space direction="vertical" size={2}>
          {CLASS_LABELS.slice(3).map((c) => (
            <Checkbox
              key={c.key}
              checked={classes.includes(c.key)}
              onChange={(e) => toggleClass(c.key, e.target.checked)}
            >
              {c.label}
            </Checkbox>
          ))}
        </Space>
        <Space direction="vertical" size={2}>
          <Checkbox checked={excludeSimilar} onChange={(e) => setExcludeSimilar(e.target.checked)}>
            排除易混字符 (I l 1 O 0 o …)
          </Checkbox>
          <Checkbox checked={unique} onChange={(e) => setUnique(e.target.checked)}>
            结果去重
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12 }}>
            勾选「常用汉字」可生成含中文的随机字符串
          </Text>
        </Space>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            自定义字符（追加到字符集）
          </Text>
          <Input
            size="small"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="如 -_.@"
            style={{ marginTop: 4 }}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            前缀
          </Text>
          <Input size="small" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="可选" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            后缀
          </Text>
          <Input size="small" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="可选" style={{ marginTop: 4 }} />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          background: "rgba(128,128,128,0.08)",
          marginBottom: 12,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
          示例
        </Text>
        <Text code style={{ flex: 1, wordBreak: "break-all" }}>
          {preview || "（请至少选择一种字符类型）"}
        </Text>
        {preview ? <CopyButton text={preview} /> : null}
      </div>

      {error ? <div style={{ color: "#cf1322", marginBottom: 12 }}>{error}</div> : null}

      {list.length === 0 ? (
        <Text type="secondary">点击右上角「生成」批量产生随机字符串（使用 crypto 安全随机数）</Text>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {list.map((s, i) => (
            <div
              key={`${i}-${s}`}
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
                {s}
              </Text>
              <CopyButton text={s} />
            </div>
          ))}
        </div>
      )}

      <ToolHistoryPanel
        toolId="random-string"
        toolTitle="随机字符生成"
        onRestore={(d) => {
          if (typeof d.length === "number") setLength(d.length);
          if (typeof d.count === "number") setCount(d.count);
          if (Array.isArray(d.classes)) {
            setClasses((d.classes as string[]).filter((c): c is RandomCharClass => c in RANDOM_CHARSETS));
          }
          setExcludeSimilar(d.excludeSimilar === true);
          setUnique(d.unique === true);
          setCustom(typeof d.custom === "string" ? d.custom : "");
          setPrefix(typeof d.prefix === "string" ? d.prefix : "");
          setSuffix(typeof d.suffix === "string" ? d.suffix : "");
        }}
      />
    </ToolShell>
  );
};

export default RandomStringTool;
