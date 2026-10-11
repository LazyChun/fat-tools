/*
 * 亲友关系图谱：中文称谓计算器 + 关系图谱可视化
 *
 * 1) 正向推导：从「自己」出发，逐层添加一步关系（父/母/夫/妻/子/女/兄/弟/姐/妹），
 *    实时算出称谓，并以图谱形式展示整条关系链。
 * 2) 反向查询：输入称谓（如「岳父」「堂哥」）反查可能的关系链。
 * 3) 关系换算：把当前关系链「取反」，得到以对方为参照的称谓。
 *
 * 计算逻辑全部收敛在 utils.ts（resolveKinship / kinshipByTerm / invertKinshipChain），
 * 本组件只负责交互与 SVG 渲染。
 */
import React, { useMemo, useState } from "react";
import {
  Button,
  Empty,
  Input,
  List,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  DeleteOutlined,
  SwapOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  KIN_STEPS,
  allKinshipTerms,
  invertKinshipChain,
  kinStepLabel,
  kinshipByTerm,
  kinshipChainLabel,
  resolveKinship,
  type KinStep,
} from "../utils";
import { CopyButton, StatRow, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { recordUsage, recordUsageDebounced, suppressNextRecord } from "../historyClient";

const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const KinshipTool: React.FC<Props> = ({ onBack }) => {
  const [chain, setChain] = useState<KinStep[]>([]);
  const [termInput, setTermInput] = useState("");

  const result = useMemo(() => resolveKinship(chain), [chain]);

  // 以对方为参照的称谓（把关系链取反）
  const inverseChain = useMemo(() => invertKinshipChain(chain), [chain]);
  const inverseResult = useMemo(() => resolveKinship(inverseChain), [inverseChain]);

  const push = (step: KinStep) => {
    setChain((prev) => [...prev, step]);
    recordUsage({
      toolId: "kinship",
      toolTitle: "亲友关系图谱",
      action: "extend",
      summary: `添加「${kinStepLabel(step)}」→ ${resolveKinship([...chain, step]).term}`,
      detail: { chain: [...chain, step] },
    });
  };

  const pop = () => setChain((prev) => prev.slice(0, -1));
  const reset = () => setChain([]);

  // 防抖记录当前关系链
  useMemo(() => {
    recordUsageDebounced(
      "kinship",
      () =>
        chain.length
          ? {
              toolId: "kinship",
              toolTitle: "亲友关系图谱",
              action: "resolve",
              summary: `${kinshipChainLabel(chain)} = ${result.term}`,
              detail: { chain },
            }
          : null,
      2000,
    );
    return null;
  }, [chain, result.term]);

  // 反向查询
  const matches = useMemo(() => {
    const q = termInput.trim();
    if (!q) return [];
    return kinshipByTerm(q).map((c) => ({
      chain: c,
      label: kinshipChainLabel(c),
      term: resolveKinship(c).term,
    }));
  }, [termInput]);

  const termSuggestions = useMemo(
    () => allKinshipTerms().map((t) => ({ value: t.term, label: t.term })),
    [],
  );

  return (
    <ToolShell
      title="亲友关系图谱"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Button size="small" icon={<SwapOutlined />} onClick={pop} disabled={!chain.length}>
            退一步
          </Button>
          <Button size="small" icon={<DeleteOutlined />} onClick={reset} disabled={!chain.length}>
            重置
          </Button>
        </Space>
      }
    >
      {/* ── 当前称谓 ─────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: "rgba(22,119,255,0.08)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            称谓
          </Text>
          <Text strong style={{ fontSize: 22 }}>
            {result.term}
          </Text>
          {!result.known && result.term !== "自己" ? (
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              推定
            </Tag>
          ) : null}
        </div>
        <div style={{ flex: 1 }} />
        <Text type="secondary" style={{ fontSize: 12, fontFamily: "monospace" }}>
          {kinshipChainLabel(chain)}
        </Text>
        {result.term ? <CopyButton text={result.term} label="复制称谓" /> : null}
      </div>

      {/* ── 关系图谱（SVG） ──────────────────────────────── */}
      <KinshipGraph chain={chain} term={result.term} />

      {/* ── 添加一步关系 ─────────────────────────────────── */}
      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
          在当前关系上再走一步（点击即追加）
        </Text>
        <Space size={6} wrap>
          {KIN_STEPS.map((s) => (
            <Button key={s.step} size="small" onClick={() => push(s.step)}>
              + {s.label}
            </Button>
          ))}
        </Space>
      </div>

      {/* ── 关系链 + 换算 ────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        <div>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
            关系链（{chain.length} 步）
          </Text>
          {chain.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前为「自己」。点击上方按钮添加关系，例如：父亲 → 母亲 = 奶奶。
            </Text>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {chain.map((s, i) => (
                <div
                  key={`${s}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px",
                    borderRadius: 6,
                    background: i % 2 === 0 ? "rgba(128,128,128,0.08)" : "transparent",
                  }}
                >
                  <Tag color="geekblue" style={{ marginInlineEnd: 0, minWidth: 44, textAlign: "center" }}>
                    {i + 1}
                  </Tag>
                  <Text style={{ fontSize: 13 }}>{kinStepLabel(s)}</Text>
                  <div style={{ flex: 1 }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    累计：{resolveKinship(chain.slice(0, i + 1)).term}
                  </Text>
                </div>
              ))}
            </div>
          )}

          {chain.length > 0 ? (
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <StatRow label="对方对我的称谓" value={inverseResult.term} copyable />
              <StatRow label="对方视角关系链" value={kinshipChainLabel(inverseChain)} />
              <StatRow label="步数" value={`${chain.length} 步`} />
            </div>
          ) : null}
        </div>

        <div>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
            反向查询（称谓 → 关系）
          </Text>
          <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
            <Select
              showSearch
              allowClear
              value={undefined}
              onChange={(v) => v && setTermInput(v)}
              placeholder="选择常见称谓"
              options={termSuggestions}
              style={{ width: 140 }}
            />
            <Input
              value={termInput}
              onChange={(e) => setTermInput(e.target.value)}
              placeholder="输入称谓，如：岳父 / 表姐 / 叔叔"
              allowClear
            />
          </Space.Compact>
          {termInput.trim() === "" ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              输入称谓后显示对应的关系路径。
            </Text>
          ) : matches.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未收录该称谓" />
          ) : (
            <List
              size="small"
              dataSource={matches}
              renderItem={(m) => (
                <List.Item
                  style={{ padding: "4px 0", cursor: "pointer" }}
                  onClick={() => {
                    suppressNextRecord("kinship");
                    setChain(m.chain);
                  }}
                  actions={[
                    <Button
                      key="use"
                      size="small"
                      type="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        suppressNextRecord("kinship");
                        setChain(m.chain);
                      }}
                    >
                      应用
                    </Button>,
                  ]}
                >
                  <Space size={6}>
                    <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                      {m.term}
                    </Tag>
                    <Text style={{ fontSize: 12, fontFamily: "monospace" }}>
                      {m.label}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}

          <div style={{ marginTop: 12 }}>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              常见称谓速查
            </Text>
            <Space size={4} wrap>
              {["爷爷", "奶奶", "外公", "外婆", "伯父", "叔叔", "姑姑", "舅舅", "姨妈", "岳父", "岳母", "婆婆", "儿媳", "女婿", "嫂子", "姐夫", "堂哥", "表姐"].map(
                (t) => (
                  <Tag
                    key={t}
                    onClick={() => setTermInput(t)}
                    style={{ cursor: "pointer", marginInlineEnd: 0 }}
                  >
                    {t}
                  </Tag>
                ),
              )}
            </Space>
          </div>
        </div>
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>
        称谓按普通话通用口径（不含地域差异）；「堂 / 表」按父系兄弟之子女为堂、其余为表。
        未收录的长链条会用「推定」标注，按逐级关系拼接给出可读描述。
      </Text>

      <ToolHistoryPanel
        toolId="kinship"
        toolTitle="亲友关系图谱"
        reloadKey={chain.length}
        onRestore={(d) => {
          suppressNextRecord("kinship");
          if (Array.isArray(d.chain)) {
            const valid = d.chain.filter((s): s is KinStep =>
              KIN_STEPS.some((k) => k.step === s),
            );
            setChain(valid);
          }
        }}
      />
    </ToolShell>
  );
};

/* ── 关系图谱（SVG 横向链路 + 分支说明） ──────────────────── */

const NODE_W = 76;
const NODE_H = 40;
const GAP_X = 42;

const KinshipGraph: React.FC<{ chain: KinStep[]; term: string }> = ({ chain, term }) => {
  const nodes = useMemo(() => {
    const list: { label: string; sub: string }[] = [{ label: "自己", sub: "起点" }];
    chain.forEach((s, i) => {
      list.push({
        label: kinStepLabel(s),
        sub: i === chain.length - 1 ? term : "",
      });
    });
    return list;
  }, [chain, term]);

  const width = nodes.length * NODE_W + (nodes.length - 1) * GAP_X;
  const height = NODE_H + 28;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <ApartmentOutlined style={{ fontSize: 14, opacity: 0.7 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          关系图谱（从左到右，每一步 +1 层）
        </Text>
      </div>
      <svg
        width={Math.max(width, 260)}
        height={height}
        viewBox={`0 0 ${Math.max(width, 260)} ${height}`}
        style={{ display: "block" }}
      >
        {chain.map((s, i) => {
          const x = i * (NODE_W + GAP_X) + NODE_W;
          const y = height / 2;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={x}
                y1={y}
                x2={x + GAP_X}
                y2={y}
                stroke="rgba(128,128,128,0.6)"
                strokeWidth={1.5}
                markerEnd="url(#kinArrow)"
              />
              <text
                x={x + GAP_X / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(128,128,128,0.95)"
              >
                {kinStepLabel(s)}
              </text>
            </g>
          );
        })}
        <defs>
          <marker
            id="kinArrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(128,128,128,0.8)" />
          </marker>
        </defs>
        {nodes.map((n, i) => {
          const x = i * (NODE_W + GAP_X);
          const y = (height - NODE_H) / 2;
          const isStart = i === 0;
          const isLast = i === nodes.length - 1 && i > 0;
          return (
            <g key={`node-${i}`}>
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={isStart ? "rgba(22,119,255,0.14)" : isLast ? "rgba(114,46,209,0.16)" : "rgba(128,128,128,0.12)"}
                stroke={isStart ? "rgba(22,119,255,0.6)" : isLast ? "rgba(114,46,209,0.6)" : "rgba(128,128,128,0.35)"}
                strokeWidth={1.2}
              />
              <text
                x={x + NODE_W / 2}
                y={y + NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="currentColor"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Tooltip title="起点：以本人为参照">
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
            <TeamOutlined /> 自己
          </Tag>
        </Tooltip>
        {nodes.length > 1 ? (
          <Tag color="purple" style={{ marginInlineEnd: 0 }}>
            目标：{term}
          </Tag>
        ) : null}
      </div>
    </div>
  );
};

export default KinshipTool;
