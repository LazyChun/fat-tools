/*
 * 血型图谱：ABO × Rh 遗传推导与可视化
 *
 * 1) 正向推导：父母血型 → 子女可能血型及概率（含基因型分布）
 * 2) 反向推导：孩子血型 + 一方家长 → 另一方可能的血型
 * 3) 亲子判定：给定三口人血型，判断能否构成亲子关系
 * 4) 输血兼容：受血者 / 供血者匹配（ABO + Rh 简化口径）
 *
 * 遗传计算全部收敛在 utils.ts（childBloodTypes / possibleParentTypes /
 * canBeParents / bloodCompatibility），本组件只做交互与展示。
 */
import React, { useMemo, useState } from "react";
import { Alert, Radio, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import {
  ABO_PHENOTYPES,
  RH_PHENOTYPES,
  bloodCompatibility,
  bloodTypeLabel,
  canBeParents,
  childBloodTypes,
  genotypesOfType,
  possibleParentTypes,
  type BloodType,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

/** 血型 → 稳定配色（用于图谱卡片） */
const TYPE_COLOR: Record<string, string> = {
  A: "#1677ff",
  B: "#52c41a",
  AB: "#722ed1",
  O: "#fa541c",
};

const HINT_BLOOD = "本工具为遗传学教学演示，不构成医学诊断依据；临床以医院检测为准。";

const BloodTypeTool: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<"forward" | "reverse" | "test">("forward");

  // 正向：父母血型
  const [father, setFather] = useState<BloodType>({ abo: "A", rh: "+" });
  const [mother, setMother] = useState<BloodType>({ abo: "B", rh: "+" });

  // 反向：孩子 + 已知家长
  const [child, setChild] = useState<BloodType>({ abo: "O", rh: "-" });
  const [knownAbc, setKnownAbc] = useState<"father" | "mother">("father");
  const [known, setKnown] = useState<BloodType>({ abo: "A", rh: "+" });

  // 亲子判定
  const [tF, setTF] = useState<BloodType>({ abo: "A", rh: "+" });
  const [tM, setTM] = useState<BloodType>({ abo: "B", rh: "+" });
  const [tC, setTC] = useState<BloodType>({ abo: "O", rh: "+" });

  const forward = useMemo(() => childBloodTypes(father, mother), [father, mother]);
  const reverse = useMemo(() => possibleParentTypes(child, known), [child, known]);
  const parentCheck = useMemo(() => canBeParents(tF, tM, tC), [tF, tM, tC]);

  // 兼容性（以「自己」选定的血型为例，展示通用表格）
  const compat = useMemo(() => {
    const rows = ABO_PHENOTYPES.map((abo) => {
      const c = bloodCompatibility({ abo, rh: "+" });
      return { abo, donateTo: c.donateTo, receiveFrom: c.receiveFrom };
    });
    return rows;
  }, []);

  React.useEffect(() => {
    recordUsageDebounced(
      "bloodtype",
      () => ({
        toolId: "bloodtype",
        toolTitle: "血型图谱",
        action: "calc",
        summary:
          `父母 ${bloodTypeLabel(father)} × ${bloodTypeLabel(mother)} → ` +
          forward.children
            .slice(0, 3)
            .map((c) => `${bloodTypeLabel(c.type)} ${(c.probability * 100).toFixed(1)}%`)
            .join(" / "),
        detail: { father, mother, tab },
      }),
      2500,
    );
  }, [father, mother, tab, forward.children]);

  return (
    <ToolShell
      title="血型图谱"
      onBack={onBack}
      extra={
        <Segmented
          size="small"
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: "forward", label: "父母→子女" },
            { value: "reverse", label: "子女→父母" },
            { value: "test", label: "亲子判定" },
          ]}
        />
      }
    >
      {tab === "forward" ? (
        <>
          <Space size={10} wrap style={{ marginBottom: 12 }}>
            <BloodPicker label="父亲" value={father} onChange={setFather} color="#1677ff" />
            <BloodPicker label="母亲" value={mother} onChange={setMother} color="#eb2f96" />
          </Space>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(128,128,128,0.08)",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TeamOutlined style={{ opacity: 0.7 }} />
              <Text strong style={{ fontSize: 13 }}>
                子女可能血型（共 {forward.children.length} 种）
              </Text>
              <div style={{ flex: 1 }} />
              <CopyButton
                text={() =>
                  forward.children
                    .map((c) => `${bloodTypeLabel(c.type)} ${(c.probability * 100).toFixed(2)}%`)
                    .join("\n")
                }
                label="复制分布"
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 6,
              }}
            >
              {forward.children.map((c) => (
                <div
                  key={bloodTypeLabel(c.type)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(22,119,255,0.08)",
                    borderLeft: `3px solid ${TYPE_COLOR[c.type.abo]}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <Text strong style={{ fontSize: 16 }}>
                      {bloodTypeLabel(c.type)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {c.type.abo} 型 · Rh{c.type.rh === "+" ? "阳性" : "阴性"}
                    </Text>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      height: 4,
                      borderRadius: 2,
                      background: "rgba(128,128,128,0.2)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(c.probability * 100).toFixed(1)}%`,
                        height: "100%",
                        background: TYPE_COLOR[c.type.abo],
                      }}
                    />
                  </div>
                  <Text strong style={{ fontSize: 12, color: TYPE_COLOR[c.type.abo] }}>
                    {(c.probability * 100).toFixed(2)}%
                  </Text>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <GenotypePanel
              title={`父亲（${bloodTypeLabel(father)}）可能的基因型`}
              type={father}
            />
            <GenotypePanel
              title={`母亲（${bloodTypeLabel(mother)}）可能的基因型`}
              type={mother}
            />
          </div>
        </>
      ) : null}

      {tab === "reverse" ? (
        <>
          <Space size={10} wrap style={{ marginBottom: 12 }}>
            <BloodPicker label="孩子" value={child} onChange={setChild} color="#fa541c" />
            <Radio.Group
              size="small"
              value={knownAbc}
              onChange={(e) => setKnownAbc(e.target.value)}
              optionType="button"
              options={[
                { label: "已知父亲", value: "father" },
                { label: "已知母亲", value: "mother" },
              ]}
            />
            <BloodPicker
              label={knownAbc === "father" ? "父亲" : "母亲"}
              value={known}
              onChange={setKnown}
              color="#722ed1"
            />
          </Space>

          {reverse.length === 0 ? (
            <Alert
              type="error"
              showIcon
              message="无可行解"
              description={`血型为 ${bloodTypeLabel(child)} 的孩子，其另一方家长不可能是任何已知血型（${bloodTypeLabel(known)} 家长的基因无法产生该组合）。`}
            />
          ) : (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(128,128,128,0.08)",
              }}
            >
              <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
                另一方家长可能为以下 {reverse.length} 种血型
              </Text>
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => bloodTypeLabel(r.type)}
                dataSource={reverse}
                columns={[
                  {
                    title: "血型",
                    dataIndex: "type",
                    render: (t: BloodType) => (
                      <Tag color={TYPE_COLOR[t.abo]} style={{ marginInlineEnd: 0 }}>
                        {bloodTypeLabel(t)}
                      </Tag>
                    ),
                  },
                  {
                    title: "生育该孩子的概率",
                    dataIndex: "probability",
                    render: (p: number) => `${(p * 100).toFixed(2)}%`,
                  },
                  {
                    title: "占比条",
                    dataIndex: "probability",
                    render: (p: number) => (
                      <div
                        style={{
                          width: 120,
                          height: 6,
                          borderRadius: 3,
                          background: "rgba(128,128,128,0.2)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, p * 100)}%`,
                            height: "100%",
                            background: "#1677ff",
                          }}
                        />
                      </div>
                    ),
                  },
                ]}
              />
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                概率按「另一方家长各可能基因型等概率」估算，仅表示可能性，不代表实际人群频率。
              </Text>
            </div>
          )}
        </>
      ) : null}

      {tab === "test" ? (
        <>
          <Space size={10} wrap style={{ marginBottom: 12 }}>
            <BloodPicker label="父亲" value={tF} onChange={setTF} color="#1677ff" />
            <BloodPicker label="母亲" value={tM} onChange={setTM} color="#eb2f96" />
            <BloodPicker label="孩子" value={tC} onChange={setTC} color="#fa541c" />
          </Space>

          <Alert
            type={parentCheck ? "success" : "error"}
            showIcon
            message={
              parentCheck
                ? "可以构成亲子关系"
                : "不能构成亲子关系（血型排除）"
            }
            description={
              parentCheck
                ? `${bloodTypeLabel(tF)} 与 ${bloodTypeLabel(tM)} 有可能生育 ${bloodTypeLabel(tC)} 血型的孩子。`
                : `${bloodTypeLabel(tF)} 与 ${bloodTypeLabel(tM)} 在遗传学上不可能生育 ${bloodTypeLabel(tC)} 血型的孩子。`
            }
            style={{ marginBottom: 12 }}
          />

          <div style={{ display: "grid", gap: 6 }}>
            <StatRow
              label="该组合下子女可能血型"
              value={childBloodTypes(tF, tM)
                .children.map((c) => `${bloodTypeLabel(c.type)} ${(c.probability * 100).toFixed(1)}%`)
                .join(" · ")}
            />
            <StatRow
              label="孩子血型是否在可能集内"
              value={parentCheck ? "是" : "否"}
            />
          </div>

          <Alert type="info" showIcon message={HINT_BLOOD} style={{ marginTop: 12 }} />
        </>
      ) : null}

      {/* 输血兼容表（通用知识，恒定展示） */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
          输血兼容速查（Rh 阳性受血者）
        </Text>
        <Table
          size="small"
          pagination={false}
          rowKey="abo"
          dataSource={compat}
          columns={[
            {
              title: "血型",
              dataIndex: "abo",
              width: 80,
              render: (abo: string) => (
                <Tag color={TYPE_COLOR[abo]} style={{ marginInlineEnd: 0 }}>
                  {abo} 型
                </Tag>
              ),
            },
            {
              title: "可捐给（供血者 →）",
              dataIndex: "donateTo",
              render: (list: BloodType[]) =>
                list.map((t) => (
                  <Tag key={bloodTypeLabel(t)} style={{ marginInlineEnd: 4 }}>
                    {bloodTypeLabel(t)}
                  </Tag>
                )),
            },
            {
              title: "可接受（← 受血者）",
              dataIndex: "receiveFrom",
              render: (list: BloodType[]) =>
                list.map((t) => (
                  <Tag key={bloodTypeLabel(t)} style={{ marginInlineEnd: 4 }}>
                    {bloodTypeLabel(t)}
                  </Tag>
                )),
            },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
          注：Rh 阴性的输血限制更严格（阴性受血者不应接受阳性血）；临床输血还须交叉配血，
          此处仅为 ABO/Rh 抗原层面的简化说明。
        </Text>
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>
        遗传规则：ABO 中 A / B 为共显性、O 为隐性；Rh 中 D 为显性（DD 或 Dd 均为阳性，dd 为阴性）。
        表型未知时按各可能基因型等概率计算，结果为「可能性」而非人群发生概率。
      </Text>

      <ToolHistoryPanel
        toolId="bloodtype"
        toolTitle="血型图谱"
        reloadKey={tab === "forward" ? forward.children.length : 0}
        onRestore={(d) => {
          suppressNextRecord("bloodtype");
          if (d.father) setFather(d.father as BloodType);
          if (d.mother) setMother(d.mother as BloodType);
          if (typeof d.tab === "string") setTab(d.tab as typeof tab);
        }}
      />
    </ToolShell>
  );
};

/* ── 血型选择器 ───────────────────────────────────────────── */

const BloodPicker: React.FC<{
  label: string;
  value: BloodType;
  onChange: (v: BloodType) => void;
  color: string;
}> = ({ label, value, onChange, color }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 8,
      border: `1px solid ${color}55`,
      background: `${color}11`,
    }}
  >
    <Text strong style={{ fontSize: 12, color }}>
      {label}
    </Text>
    <Select
      size="small"
      value={value.abo}
      onChange={(abo) => onChange({ ...value, abo })}
      style={{ width: 66 }}
      options={ABO_PHENOTYPES.map((a) => ({ value: a, label: `${a} 型` }))}
    />
    <Select
      size="small"
      value={value.rh}
      onChange={(rh) => onChange({ ...value, rh })}
      style={{ width: 74 }}
      options={RH_PHENOTYPES.map((r) => ({
        value: r,
        label: r === "+" ? "Rh+" : "Rh-",
      }))}
    />
  </div>
);

/* ── 基因型面板 ───────────────────────────────────────────── */

const GenotypePanel: React.FC<{ title: string; type: BloodType }> = ({ title, type }) => {
  const genos = genotypesOfType(type.abo, type.rh);
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(128,128,128,0.06)",
        border: "1px solid rgba(128,128,128,0.2)",
      }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        {title}
      </Text>
      <Space size={6} wrap style={{ marginTop: 4 }}>
        {genos.map((g) => (
          <Tag
            key={`${g.abo.join("")}${g.rh.join("")}`}
            style={{ marginInlineEnd: 0, fontFamily: "monospace" }}
          >
            {[...g.abo].sort().join("")} / {[...g.rh].sort().join("")}
          </Tag>
        ))}
      </Space>
    </div>
  );
};

export default BloodTypeTool;
