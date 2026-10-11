/*
 * 智能取名：算法模式（词库/组合规则，纯前端）+ 大模型模式（宿主 sdk.ai）
 *
 *  - 人名取名：姓氏 × 寓意字库（可按性别 / 寓意关键词筛选），默认场景
 *  - 变量命名：关键词（中英皆可）→ 词元 → 命名风格 × 语义前后缀
 *  - 项目/品牌命名：词根 × 后缀词库，多种拼写风格
 *  - 中文网名：意象词库组合，可掺入中文关键词
 *  - 大模型模式：调用 fat-notes-core 配置的大模型自由发挥，附取名理由
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import { ReloadOutlined, SendOutlined } from "@ant-design/icons";
import type { AiModelItem } from "fat-notes-sdk";
import { CopyButton, ToolShell } from "../components/Common";
import ToolHistoryPanel from "../components/ToolHistory";
import { getSdk, recordUsage } from "../historyClient";
import {
  generateSmartNames,
  type NameScene,
  type NameStyle,
  type SmartNameItem,
} from "../utils";

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  onBack?: () => void;
}

const SCENE_OPTIONS: Array<{ value: NameScene; label: string }> = [
  { value: "person", label: "人名" },
  { value: "variable", label: "变量命名" },
  { value: "project", label: "项目/品牌" },
  { value: "nickname", label: "中文网名" },
];

const STYLE_OPTIONS: Array<{ value: NameStyle; label: string }> = [
  { value: "camel", label: "camelCase" },
  { value: "snake", label: "snake_case" },
  { value: "kebab", label: "kebab-case" },
  { value: "pascal", label: "PascalCase" },
  { value: "constant", label: "CONSTANT" },
];

/** 各场景的大模型系统提示词 */
function sysPromptFor(scene: NameScene): string {
  switch (scene) {
    case "person":
      return "你是一名精通中国传统文化的起名顾问。根据用户给出的姓氏、性别与期望，产出若干中文人名候选。要求：音形义俱佳、朗朗上口，避免生僻字与不良谐音，寓意美好且不俗套。";
    case "variable":
      return "你是一名资深程序员命名顾问。根据用户给出的关键词与偏好，产出若干编程变量/函数/类名候选。要求：简洁、语义准确、符合英文命名惯例（用户指定风格时严格遵守）。";
    case "project":
      return "你是一名品牌命名顾问。根据用户给出的关键词与定位描述，产出若干项目/产品/品牌名候选。要求：好记、可注册、易发音，中英文均可，避免生僻字与负面联想。";
    default:
      return "你是一名文学功底深厚的起名顾问。根据用户给出的关键词或意境，产出若干中文网名/花名候选。要求：有画面感、不落俗套、长度 2-10 字。";
  }
}

/** 构造大模型取名的用户提示词 */
function userPromptFor(
  keywords: string,
  scene: NameScene,
  extra: string,
): string {
  const lines = [
    `关键词 / 描述：${keywords}`,
    scene === "person"
      ? "请给出 10 个左右的人名候选（含姓氏，以双字名为主，可含少量单字名）。"
      : scene === "variable"
        ? "请给出 10 个左右的变量/函数名候选。"
        : scene === "project"
          ? "请给出 10 个左右的项目/品牌名候选。"
          : "请给出 10 个左右的中文网名候选。",
    "输出格式：每行一个，格式为「名字 — 一句话理由」，不要编号、不要多余说明。",
  ];
  if (extra.trim()) lines.push(`额外要求：${extra.trim()}`);
  return lines.join("\n");
}

/** 解析大模型输出：按行拆「名字 — 理由」，容错处理编号/星号等杂符号 */
function parseLlmNames(content: string): SmartNameItem[] {
  const items: SmartNameItem[] = [];
  const seen = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^[\d]+[.、)．\]-]+\s*/, "")
      .replace(/^[*•·]+\s*/, "");
    if (!line || line.length > 60) continue;
    // 优先按 — / - / ：/ : 拆名字与理由
    const m = line.match(/^(.+?)\s*[—–\-：:]\s*(.+)$/);
    const name = (m ? m[1] : line)
      .replace(/^["'「『“]/, "")
      .replace(/["'」』”]$/, "")
      .trim();
    if (!name || name.length > 30 || seen.has(name)) continue;
    seen.add(name);
    items.push({ name, note: m ? m[2].trim() : "大模型候选" });
    if (items.length >= 20) break;
  }
  return items;
}

const SmartNameTool: React.FC<Props> = ({ onBack }) => {
  const [engine, setEngine] = useState<"algo" | "llm">("algo");
  const [keywords, setKeywords] = useState("");
  const [scene, setScene] = useState<NameScene>("person");
  const [style, setStyle] = useState<NameStyle>("camel");
  const [extra, setExtra] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmError, setLlmError] = useState("");
  const [llmItems, setLlmItems] = useState<SmartNameItem[]>([]);
  const [llmModel, setLlmModel] = useState<string>("");
  const [models, setModels] = useState<AiModelItem[] | null>(null);
  const [modelsError, setModelsError] = useState("");

  // 探测宿主大模型能力（fat-notes-core sdk.ai）
  useEffect(() => {
    let alive = true;
    const sdk = getSdk();
    if (!sdk?.ai?.getModels) {
      setModelsError("当前宿主未提供 AI 能力（需 fat-notes-core 配置大模型）");
      return;
    }
    sdk.ai
      .getModels()
      .then((list) => {
        if (!alive) return;
        const arr = list ?? [];
        setModels(arr);
        if (!arr.length) {
          setModelsError("宿主尚未配置任何大模型，可在宿主设置中添加");
          return;
        }
        setLlmModel((arr.find((m) => m.isDefault) ?? arr[0]).id);
      })
      .catch((e) => {
        if (alive)
          setModelsError(`获取大模型列表失败：${(e as Error).message}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 算法模式结果（输入即算，seed 变化时换一批）
  const algoItems = useMemo(() => {
    if (!keywords.trim()) return [];
    return generateSmartNames({ keywords, scene, style, count: 12, seed });
  }, [keywords, scene, style, seed]);

  const items = engine === "algo" ? algoItems : llmItems;

  const runAlgo = (): void => {
    if (!keywords.trim()) {
      message.warning("请先输入关键词，例如：订单 队列 / order queue");
      return;
    }
    recordUsage({
      toolId: "smart-name",
      toolTitle: "智能取名",
      action: "algo",
      summary: `算法取名（${SCENE_OPTIONS.find((s) => s.value === scene)?.label}）：${keywords} → ${algoItems.length} 个候选`,
      detail: {
        engine: "algo",
        keywords,
        scene,
        style: scene === "variable" ? style : undefined,
        count: algoItems.length,
        names: algoItems.map((i) => i.name),
        seed,
      },
    });
  };

  const runLlm = async (): Promise<void> => {
    if (!keywords.trim()) {
      message.warning("请先输入关键词或描述");
      return;
    }
    const sdk = getSdk();
    if (!sdk?.ai?.chat) {
      setLlmError("当前宿主未提供 AI 能力");
      return;
    }
    if (!llmModel) {
      setLlmError("请选择大模型");
      return;
    }
    setLlmBusy(true);
    setLlmError("");
    setLlmItems([]);
    try {
      const result = await sdk.ai.chat({
        modelId: llmModel,
        messages: [
          { role: "user", content: userPromptFor(keywords, scene, extra) },
        ],
        sysPrompt: sysPromptFor(scene),
      });
      const parsed = parseLlmNames(result.content);
      if (!parsed.length) {
        setLlmError("大模型未返回可解析的候选名单，可重试或换个描述");
      } else {
        setLlmItems(parsed);
        message.success(`大模型取名完成：${parsed.length} 个候选`);
      }
      recordUsage({
        toolId: "smart-name",
        toolTitle: "智能取名",
        action: "llm",
        summary: `大模型取名（${SCENE_OPTIONS.find((s) => s.value === scene)?.label}）：${keywords} → ${parsed.length} 个候选`,
        detail: {
          engine: "llm",
          model: llmModel,
          keywords,
          scene,
          extra: extra || undefined,
          count: parsed.length,
          names: parsed.map((i) => i.name),
        },
      });
    } catch (e) {
      setLlmError(`调用失败：${(e as Error).message}`);
    } finally {
      setLlmBusy(false);
    }
  };

  const llmDisabled = !!modelsError;

  return (
    <ToolShell
      title="智能取名"
      onBack={onBack}
      extra={
        <Space size={8}>
          <Radio.Group
            size="small"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "算法取名", value: "algo" },
              { label: "大模型取名", value: "llm" },
            ]}
          />
          {engine === "algo" ? (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => {
                setSeed(Math.floor(Math.random() * 1e9));
                void runAlgo();
              }}
            >
              换一批
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              loading={llmBusy}
              disabled={llmDisabled}
              onClick={runLlm}
            >
              开始取名
            </Button>
          )}
        </Space>
      }
    >
      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Select
          size="small"
          value={scene}
          onChange={(v) => setScene(v)}
          options={SCENE_OPTIONS}
          style={{ width: 130 }}
        />
        {scene === "variable" ? (
          <Select
            size="small"
            value={style}
            onChange={(v) => setStyle(v)}
            options={STYLE_OPTIONS}
            style={{ width: 150 }}
          />
        ) : null}
        {engine === "llm" ? (
          <Select
            size="small"
            value={llmModel || undefined}
            onChange={(v) => setLlmModel(v)}
            placeholder="选择大模型"
            disabled={llmDisabled}
            loading={models === null && !modelsError}
            options={(models ?? []).map((m) => ({
              value: m.id,
              label: m.name || m.model || m.id,
            }))}
            style={{ width: 200 }}
          />
        ) : null}
      </Space>

      <TextArea
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder={
          scene === "person"
            ? "姓氏 + 性别 + 寓意（空格分隔），例如：王 男 寓意聪慧 / 李 女 温婉 / 欧阳 男"
            : scene === "variable"
              ? "关键词（中英文均可，空格/逗号分隔），例如：订单 队列 / orderQueue"
              : scene === "project"
                ? "项目关键词或定位描述，例如：笔记 知识库 / 帮开发者沉淀知识"
                : "关键词或想要的意境，例如：山 海 晚风"
        }
        autoSize={{ minRows: 2, maxRows: 4 }}
        style={{ marginBottom: 12 }}
      />

      {engine === "llm" ? (
        <Input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="额外要求（可选），例如：偏古风 / 避免下划线 / 目标用户是儿童"
          style={{ marginBottom: 12, maxWidth: 480 }}
        />
      ) : null}

      {engine === "llm" && modelsError ? (
        <Alert
          type="info"
          message="大模型不可用"
          description={modelsError}
          style={{ marginBottom: 12 }}
          showIcon
        />
      ) : null}
      {engine === "llm" && llmError ? (
        <Alert
          type="error"
          message={llmError}
          style={{ marginBottom: 12 }}
          showIcon
          closable
        />
      ) : null}

      {llmBusy ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <Space>
            <Spin />
            <Text type="secondary">大模型构思中…</Text>
          </Space>
        </div>
      ) : items.length ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            maxWidth: 620,
          }}
        >
          {items.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 6,
                background: "rgba(128,128,128,0.08)",
              }}
            >
              <Tag
                color={engine === "llm" ? "purple" : "blue"}
                style={{ margin: 0 }}
              >
                {idx + 1}
              </Tag>
              <Text
                strong
                copyable={{ text: item.name }}
                style={{ flexShrink: 0 }}
              >
                {item.name}
              </Text>
              <Text
                type="secondary"
                style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                ellipsis={{ tooltip: item.note }}
              >
                {item.note}
              </Text>
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            <CopyButton
              text={items.map((i) => i.name).join("\n")}
              label="复制全部名字"
            />
          </div>
        </div>
      ) : !llmBusy ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            engine === "algo"
              ? "输入关键词后自动生成候选；点「换一批」可重新组合"
              : "输入关键词与要求后，点「开始取名」让大模型自由发挥"
          }
        />
      ) : null}

      <ToolHistoryPanel
        toolId="smart-name"
        toolTitle="智能取名"
        reloadKey={items.length}
        onRestore={(d) => {
          if (typeof d.keywords === "string") setKeywords(d.keywords);
          const sc = String(d.scene ?? "");
          if (
            sc === "person" ||
            sc === "variable" ||
            sc === "project" ||
            sc === "nickname"
          )
            setScene(sc);
          const st = String(d.style ?? "");
          if (["camel", "snake", "kebab", "pascal", "constant"].includes(st)) {
            setStyle(st as NameStyle);
          }
          setEngine(String(d.engine ?? "algo") === "llm" ? "llm" : "algo");
          setLlmItems([]);
          setLlmError("");
        }}
      />
    </ToolShell>
  );
};

export default SmartNameTool;
