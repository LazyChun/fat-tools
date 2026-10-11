/*
 * 工具注册表：所有工具在此集中登记（id、标题、描述、图标、组件、分类）
 */
import React from "react";
import {
  BgColorsOutlined,
  CodeOutlined,
  CalculatorOutlined,
  ExportOutlined,
  DiffOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  KeyOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";

import TextDiffTool from "./TextDiffTool";
import WordCountTool from "./WordCountTool";
import CalculatorTool from "./CalculatorTool";
import JsonTool from "./JsonTool";
import EncodeTool from "./EncodeTool";
import HashTool from "./HashTool";
import RegexTool from "./RegexTool";
import TimestampTool from "./TimestampTool";
import UuidTool from "./UuidTool";
import RadixTool from "./RadixTool";
import ColorTool from "./ColorTool";
import HistoryTool from "./HistoryTool";

export type ToolCategory = "文本" | "编码" | "开发" | "数值" | "记录";

export interface ToolDef {
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  category: ToolCategory;
  component: React.ComponentType<{ onBack?: () => void }>;
}

export const TOOLS: ToolDef[] = [
  {
    id: "text-diff",
    title: "文本对比",
    desc: "两段文本行级差异对比，左右对照",
    icon: DiffOutlined,
    category: "文本",
    component: TextDiffTool,
  },
  {
    id: "word-count",
    title: "字数统计",
    desc: "字符 / 词数 / 行数 / 段落 / 字节数",
    icon: FontSizeOutlined,
    category: "文本",
    component: WordCountTool,
  },
  {
    id: "regex",
    title: "正则测试",
    desc: "实时匹配高亮、分组捕获、命名分组",
    icon: FileSearchOutlined,
    category: "文本",
    component: RegexTool,
  },
  {
    id: "calculator",
    title: "计算器",
    desc: "表达式计算，支持函数与隐式乘法",
    icon: CalculatorOutlined,
    category: "数值",
    component: CalculatorTool,
  },
  {
    id: "radix",
    title: "进制转换",
    desc: "2/8/10/16/36 进制整数互转",
    icon: SwapOutlined,
    category: "数值",
    component: RadixTool,
  },
  {
    id: "json",
    title: "JSON 工具",
    desc: "格式化 / 压缩 / 校验并定位错误",
    icon: CodeOutlined,
    category: "开发",
    component: JsonTool,
  },
  {
    id: "hash",
    title: "哈希计算",
    desc: "MD5 与 SHA-1/256/384/512",
    icon: SafetyCertificateOutlined,
    category: "开发",
    component: HashTool,
  },
  {
    id: "uuid",
    title: "UUID 生成器",
    desc: "批量生成 UUID v4，复制便捷",
    icon: KeyOutlined,
    category: "开发",
    component: UuidTool,
  },
  {
    id: "timestamp",
    title: "时间戳转换",
    desc: "时间戳与日期双向转换，实时当前值",
    icon: ClockCircleOutlined,
    category: "开发",
    component: TimestampTool,
  },
  {
    id: "base64",
    title: "Base64",
    desc: "UTF-8 安全的 Base64 编解码",
    icon: ExportOutlined,
    category: "编码",
    component: (props) => <EncodeTool {...props} mode="base64" />,
  },
  {
    id: "url",
    title: "URL 编解码",
    desc: "URL 百分号编码与解码",
    icon: LinkOutlined,
    category: "编码",
    component: (props) => <EncodeTool {...props} mode="url" />,
  },
  {
    id: "color",
    title: "颜色转换",
    desc: "HEX / RGB / HSL 互转与取色",
    icon: BgColorsOutlined,
    category: "编码",
    component: ColorTool,
  },
  {
    id: "history",
    title: "操作记录",
    desc: "查看所有工具的操作历史（SQLite 落库）",
    icon: FieldTimeOutlined,
    category: "记录",
    component: HistoryTool,
  },
];

export const TOOL_IDS = TOOLS.map((t) => t.id);
export const DEFAULT_TOOL = TOOLS[0];
