/*
 * Unix 文件权限：数字 ↔ 符号互转，勾选读写执行与特殊位
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Checkbox, Input, Space, Tag, Typography } from "antd";
import {
  CHMOD_PRESETS,
  fromBits,
  parseChmod,
  type ChmodBits,
  type ChmodTriad,
} from "./chmod";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const EMPTY_BITS: ChmodBits = {
  special: { setuid: false, setgid: false, sticky: false },
  owner: { r: true, w: true, x: true },
  group: { r: true, w: false, x: true },
  other: { r: true, w: false, x: true },
};

type Role = "owner" | "group" | "other";

const ChmodTool: React.FC<Props> = ({ onBack }) => {
  const [input, setInput] = useState("755");
  const [bits, setBits] = useState<ChmodBits>(EMPTY_BITS);
  const [syncFromInput, setSyncFromInput] = useState(true);

  const parsed = useMemo(() => parseChmod(input), [input]);

  // 输入合法时同步勾选框
  useEffect(() => {
    if (parsed.ok && syncFromInput) setBits(parsed.bits);
  }, [parsed, syncFromInput]);

  const fromUi = useMemo(() => fromBits(bits), [bits]);

  useEffect(() => {
    recordUsageDebounced("chmod", () => {
      if (!fromUi.ok) return null;
      return {
        toolId: "chmod",
        toolTitle: "Unix 权限",
        action: "convert",
        summary: `${fromUi.octal} ↔ ${fromUi.symbolic}`,
        detail: { octal: fromUi.octal, symbolic: fromUi.symbolic },
      };
    });
  }, [fromUi]);

  const setTriad = (role: Role, key: keyof ChmodTriad, checked: boolean) => {
    setSyncFromInput(false);
    setBits((prev) => {
      const next = {
        ...prev,
        [role]: { ...prev[role], [key]: checked },
      };
      const r = fromBits(next);
      if (r.ok) setInput(r.octal);
      return next;
    });
  };

  const setSpecial = (key: keyof ChmodBits["special"], checked: boolean) => {
    setSyncFromInput(false);
    setBits((prev) => {
      const next = { ...prev, special: { ...prev.special, [key]: checked } };
      const r = fromBits(next);
      if (r.ok) setInput(r.octal);
      return next;
    });
  };

  const applyOctal = (octal: string) => {
    setSyncFromInput(true);
    setInput(octal);
    const r = parseChmod(octal);
    if (r.ok) setBits(r.bits);
  };

  const roleRow = (label: string, role: Role) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Text style={{ width: 56 }}>{label}</Text>
      <Checkbox checked={bits[role].r} onChange={(e) => setTriad(role, "r", e.target.checked)}>
        读 (r)
      </Checkbox>
      <Checkbox checked={bits[role].w} onChange={(e) => setTriad(role, "w", e.target.checked)}>
        写 (w)
      </Checkbox>
      <Checkbox checked={bits[role].x} onChange={(e) => setTriad(role, "x", e.target.checked)}>
        执行 (x)
      </Checkbox>
    </div>
  );

  return (
    <ToolShell
      title="Unix 权限"
      onBack={onBack}
      extra={
        fromUi.ok ? (
          <Space size={6}>
            <CopyButton text={() => fromUi.octal} label="复制数字" />
            <CopyButton text={() => fromUi.symbolic} label="复制符号" />
          </Space>
        ) : null
      }
    >
      <Space size={8} wrap style={{ marginBottom: 10, width: "100%" }}>
        <Input
          value={input}
          onChange={(e) => {
            setSyncFromInput(true);
            setInput(e.target.value);
          }}
          placeholder="755 或 rwxr-xr-x"
          allowClear
          style={{ width: 220, fontFamily: "monospace" }}
          status={input.trim() && !parsed.ok ? "error" : undefined}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          数字与符号互转，可勾选下方权限位
        </Text>
      </Space>

      <Space size={6} wrap style={{ marginBottom: 14 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          常用：
        </Text>
        {CHMOD_PRESETS.map((p) => (
          <Tag
            key={p.octal}
            title={p.desc}
            style={{ cursor: "pointer", marginInlineEnd: 0 }}
            color={input.trim() === p.octal ? "blue" : undefined}
            onClick={() => applyOctal(p.octal)}
          >
            {p.label}
          </Tag>
        ))}
      </Space>

      {input.trim() && !parsed.ok ? (
        <Alert type="error" showIcon message={parsed.error} style={{ marginBottom: 12 }} />
      ) : null}

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {roleRow("所有者", "owner")}
        {roleRow("所属组", "group")}
        {roleRow("其他人", "other")}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ width: 56 }}>特殊</Text>
          <Checkbox
            checked={bits.special.setuid}
            onChange={(e) => setSpecial("setuid", e.target.checked)}
          >
            setuid
          </Checkbox>
          <Checkbox
            checked={bits.special.setgid}
            onChange={(e) => setSpecial("setgid", e.target.checked)}
          >
            setgid
          </Checkbox>
          <Checkbox
            checked={bits.special.sticky}
            onChange={(e) => setSpecial("sticky", e.target.checked)}
          >
            sticky
          </Checkbox>
        </div>
      </div>

      {fromUi.ok ? (
        <div style={{ display: "grid", gap: 6, maxWidth: 420 }}>
          <StatRow label="八进制" value={fromUi.octal} copyable />
          <StatRow label="符号" value={fromUi.symbolic} copyable />
          <StatRow label="chmod 命令" value={`chmod ${fromUi.octal}`} copyable />
        </div>
      ) : null}

      <ToolHistoryPanel
        toolId="chmod"
        toolTitle="Unix 权限"
        onRestore={(d) => {
          suppressNextRecord("chmod");
          if (typeof d.octal === "string") applyOctal(d.octal);
          else if (typeof d.symbolic === "string") {
            setSyncFromInput(true);
            setInput(d.symbolic);
            const r = parseChmod(d.symbolic);
            if (r.ok) setBits(r.bits);
          }
        }}
      />
    </ToolShell>
  );
};

export default ChmodTool;
