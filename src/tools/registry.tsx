/*
 * 工具注册表：所有工具在此集中登记（id、标题、描述、图标、组件、分类）
 */
import React from "react";
import {
  BgColorsOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  CalculatorOutlined,
  DashboardOutlined,
  ExportOutlined,
  DiffOutlined,
  FieldTimeOutlined,
  FileMarkdownOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FontColorsOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  HighlightOutlined,
  HourglassOutlined,
  IdcardOutlined,
  KeyOutlined,
  LinkOutlined,
  LockOutlined,
  OrderedListOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
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
import DrawTool from "./DrawTool";
import PasswordTool from "./PasswordTool";
import NamingTool from "./NamingTool";
import LinesTool from "./LinesTool";
import MarkdownTool from "./MarkdownTool";
import UrlParseTool from "./UrlParseTool";
import JwtTool from "./JwtTool";
import UnitTool from "./UnitTool";
import TimerTool from "./TimerTool";
import TodoTool from "./TodoTool";
import MorseTool from "./MorseTool";
import TimeCalcTool from "./TimeCalcTool";

export type ToolCategory =
  | "文本"
  | "编码"
  | "开发"
  | "数值"
  | "绘图"
  | "生成"
  | "时间"
  | "记录";

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
    id: "morse",
    title: "摩斯电码",
    desc: "文本与摩斯电码互转，可点播电码音频",
    icon: ThunderboltOutlined,
    category: "编码",
    component: MorseTool,
  },
  {
    id: "naming",
    title: "命名转换",
    desc: "camelCase / snake_case / kebab-case 等互转",
    icon: FontColorsOutlined,
    category: "文本",
    component: NamingTool,
  },
  {
    id: "lines",
    title: "行处理",
    desc: "多行文本去重 / 排序 / 去空行 / 过滤 / 加行号",
    icon: OrderedListOutlined,
    category: "文本",
    component: LinesTool,
  },
  {
    id: "markdown",
    title: "Markdown 预览",
    desc: "实时渲染 Markdown，可复制 HTML",
    icon: FileMarkdownOutlined,
    category: "文本",
    component: MarkdownTool,
  },
  {
    id: "url-parse",
    title: "URL 解析",
    desc: "拆解 URL 组成，查询参数表格式化",
    icon: GlobalOutlined,
    category: "开发",
    component: UrlParseTool,
  },
  {
    id: "jwt",
    title: "JWT 解析",
    desc: "解码 header / payload，校验过期时间",
    icon: IdcardOutlined,
    category: "开发",
    component: JwtTool,
  },
  {
    id: "unit",
    title: "单位换算",
    desc: "长度/面积/质量/体积/数据/时间/速度/温度",
    icon: DashboardOutlined,
    category: "数值",
    component: UnitTool,
  },
  {
    id: "draw",
    title: "画板",
    desc: "手绘画笔/形状，撤销重做，导出 PNG",
    icon: HighlightOutlined,
    category: "绘图",
    component: DrawTool,
  },
  {
    id: "password",
    title: "密码生成器",
    desc: "加密安全随机密码，含强度评估与批量生成",
    icon: LockOutlined,
    category: "生成",
    component: PasswordTool,
  },
  {
    id: "timer",
    title: "秒表 / 倒计时",
    desc: "计时、计次与倒计时提醒",
    icon: HourglassOutlined,
    category: "时间",
    component: TimerTool,
  },
  {
    id: "timecalc",
    title: "时间计算器",
    desc: "两个时刻相差多少，日期加减推算",
    icon: CalendarOutlined,
    category: "时间",
    component: TimeCalcTool,
  },
  {
    id: "todo",
    title: "待办清单",
    desc: "轻量待办，本地持久化并同步操作记录",
    icon: CheckSquareOutlined,
    category: "记录",
    component: TodoTool,
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
