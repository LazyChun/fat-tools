/*
 * 工具注册表：所有工具在此集中登记（id、标题、描述、图标、组件、分类）
 */
import React from "react";
import {
  BarcodeOutlined,
  BgColorsOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  CalculatorOutlined,
  DashboardOutlined,
  ExportOutlined,
  DiffOutlined,
  ExperimentOutlined,
  FieldTimeOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FileSearchOutlined,
  FontColorsOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  HighlightOutlined,
  HourglassOutlined,
  IdcardOutlined,
  KeyOutlined,
  LinkOutlined,
  LockOutlined,
  MergeCellsOutlined,
  OrderedListOutlined,
  SafetyCertificateOutlined,
  ScissorOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  AimOutlined,
  GiftOutlined,
  ApartmentOutlined,
  ApiOutlined,
  AppstoreOutlined,
  MedicineBoxOutlined,
  DollarOutlined,
  MoonOutlined,
  CloudServerOutlined,
  BlockOutlined,
  CompassOutlined,
  FunctionOutlined,
  ReadOutlined,
  RobotOutlined,
  TableOutlined,
  CameraOutlined,
  SnippetsOutlined,
  SmileOutlined,
  FileSyncOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MoneyCollectOutlined,
  QrcodeOutlined,
  ScheduleOutlined,
  TransactionOutlined,
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
import BarcodeTool from "./BarcodeTool";
import WheelTool from "./WheelTool";
import PeriodicTableTool from "./PeriodicTableTool";
import RandomStringTool from "./RandomStringTool";
import HolidayTool from "./HolidayTool";
import KinshipTool from "./KinshipTool";
import BloodTypeTool from "./BloodTypeTool";
import CurrencyTool from "./CurrencyTool";
import LunarTool from "./LunarTool";
import DnsTool from "./DnsTool";
import ChineseCharTool from "./ChineseCharTool";
import ZodiacTool from "./ZodiacTool";
import SciCalcTool from "./SciCalcTool";
import YijingTool from "./YijingTool";
import PdfTool from "./PdfTool";
import XmlTool from "./XmlTool";
import SmartNameTool from "./SmartNameTool";
import NavTool from "./NavTool";
import DynastyTool from "./DynastyTool";
import GridSplitTool from "./GridSplitTool";
import GridMergeTool from "./GridMergeTool";
import MemeTool from "./MemeTool";
import ScreenshotTool from "./ScreenshotTool";
import ConvertTool from "./ConvertTool";
import InvoiceTool from "./InvoiceTool";
import QrCodeTool from "./QrCodeTool";
import DataConvertTool from "./DataConvertTool";
import MoneyUpperTool from "./MoneyUpperTool";
import CronTool from "./CronTool";

export type ToolCategory =
  | "文本"
  | "编码"
  | "开发"
  | "数值"
  | "绘图"
  | "生成"
  | "时间"
  | "生活"
  | "文件"
  | "记录"
  | "历史";

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
    desc: "文本与文件哈希：MD5 / SHA-1/2/3 / SM3 / CRC-32",
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
    id: "barcode",
    title: "条形码生成",
    desc: "文本转 Code128 条形码，导出 SVG / PNG",
    icon: BarcodeOutlined,
    category: "生成",
    component: BarcodeTool,
  },
  {
    id: "qrcode",
    title: "二维码工具",
    desc: "生成二维码（可调纠错/尺寸/颜色，导出 PNG / SVG）并识别图片中的二维码",
    icon: QrcodeOutlined,
    category: "生成",
    component: QrCodeTool,
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
    id: "meme",
    title: "表情包制作",
    desc: "模板/上传底图，顶底文字描边，自动适配字号，导出 PNG",
    icon: SmileOutlined,
    category: "绘图",
    component: MemeTool,
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
    id: "random-string",
    title: "随机字符生成",
    desc: "可自定义字符集，批量生成随机字符串",
    icon: AimOutlined,
    category: "生成",
    component: RandomStringTool,
  },
  {
    id: "wheel",
    title: "转盘抽签",
    desc: "加权随机转盘，动画抽签并可记录结果",
    icon: GiftOutlined,
    category: "生成",
    component: WheelTool,
  },
  {
    id: "periodic",
    title: "元素周期表",
    desc: "118 种元素，搜索 / 分类高亮 / 查看详情",
    icon: ExperimentOutlined,
    category: "数值",
    component: PeriodicTableTool,
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
    id: "holiday",
    title: "假期日历",
    desc: "中国法定节假日月历、倒计时与自定义纪念日",
    icon: CalendarOutlined,
    category: "时间",
    component: HolidayTool,
  },
  {
    id: "kinship",
    title: "亲友关系图谱",
    desc: "中文称谓计算器，关系链可视化成图谱",
    icon: ApartmentOutlined,
    category: "生活",
    component: KinshipTool,
  },
  {
    id: "bloodtype",
    title: "血型图谱",
    desc: "ABO × Rh 遗传推导、亲子判定与输血兼容",
    icon: MedicineBoxOutlined,
    category: "生活",
    component: BloodTypeTool,
  },
  {
    id: "currency",
    title: "汇率计算",
    desc: "多币种汇率换算，支持在线更新与批量换算表",
    icon: DollarOutlined,
    category: "数值",
    component: CurrencyTool,
  },
  {
    id: "money-upper",
    title: "金额大写转换",
    desc: "数字金额转人民币中文大写（财务标准写法），支持角分与正负号",
    icon: MoneyCollectOutlined,
    category: "数值",
    component: MoneyUpperTool,
  },
  {
    id: "lunar",
    title: "农历转换",
    desc: "公历 ↔ 农历互转，干支生肖、二十四节气与节日",
    icon: MoonOutlined,
    category: "时间",
    component: LunarTool,
  },
  {
    id: "dns",
    title: "DNS 查询",
    desc: "DoH 在线查询 A/AAAA/CNAME/MX/TXT 等解析记录",
    icon: CloudServerOutlined,
    category: "开发",
    component: DnsTool,
  },
  {
    id: "cron",
    title: "Cron 表达式解析",
    desc: "校验 Cron 表达式，字段含义中文说明并推算未来执行时间",
    icon: ScheduleOutlined,
    category: "开发",
    component: CronTool,
  },
  {
    id: "hanzi",
    title: "汉字拆解",
    desc: "拆字部件、结构分析、拼音与笔画数",
    icon: BlockOutlined,
    category: "文本",
    component: ChineseCharTool,
  },
  {
    id: "zodiac",
    title: "星座罗盘",
    desc: "太阳/月亮/上升星座计算，黄道罗盘与星座配对",
    icon: CompassOutlined,
    category: "生活",
    component: ZodiacTool,
  },
  {
    id: "scicalc",
    title: "科学计算器",
    desc: "三角函数/对数/阶乘/统计，角度制切换",
    icon: FunctionOutlined,
    category: "数值",
    component: SciCalcTool,
  },
  {
    id: "yijing",
    title: "易经算命",
    desc: "六十四卦起卦解卦：金钱卦/时间/报数，本卦变卦与爻辞",
    icon: ReadOutlined,
    category: "生活",
    component: YijingTool,
  },
  {
    id: "pdf-merge",
    title: "PDF 合并",
    desc: "多个 PDF 按顺序合并为一份，可调整顺序",
    icon: MergeCellsOutlined,
    category: "文件",
    component: (props) => <PdfTool {...props} mode="merge" />,
  },
  {
    id: "pdf-split",
    title: "PDF 分割",
    desc: "按每页/每 N 页/自定义页码范围拆分 PDF",
    icon: ScissorOutlined,
    category: "文件",
    component: (props) => <PdfTool {...props} mode="split" />,
  },
  {
    id: "invoice",
    title: "发票工具",
    desc: "电子发票处理：智能合并、信息提取、批量重命名、自动归档",
    icon: FileTextOutlined,
    category: "文件",
    component: InvoiceTool,
  },
  {
    id: "grid-split",
    title: "格子拆图",
    desc: "按行列网格把一张图拆成多张 PNG，默认 3×3 可自定义，ZIP 打包",
    icon: TableOutlined,
    category: "文件",
    component: GridSplitTool,
  },
  {
    id: "grid-merge",
    title: "格子合图",
    desc: "多张图片按行列网格拼成一张大图，默认 3×3 可自定义",
    icon: SnippetsOutlined,
    category: "文件",
    component: GridMergeTool,
  },
  {
    id: "screenshot",
    title: "屏幕截图",
    desc: "截取整个屏幕 / 窗口 / 标签页为 PNG，复制或下载",
    icon: CameraOutlined,
    category: "文件",
    component: ScreenshotTool,
  },
  {
    id: "media-convert",
    title: "格式转换",
    desc: "批量转换图片 / 视频 / 音频格式，Word / PPT 转 PDF",
    icon: FileSyncOutlined,
    category: "文件",
    component: ConvertTool,
  },
  {
    id: "xml",
    title: "XML 工具",
    desc: "格式化 / 压缩 / 校验（行列定位）/ 转义反转义",
    icon: ApiOutlined,
    category: "开发",
    component: XmlTool,
  },
  {
    id: "data-convert",
    title: "数据格式转换",
    desc: "JSON / YAML / CSV / TSV 互转，实时预览并支持下载",
    icon: TransactionOutlined,
    category: "开发",
    component: DataConvertTool,
  },
  {
    id: "smart-name",
    title: "智能取名",
    desc: "人名/变量/项目/网名取名：算法组合 + 大模型生成",
    icon: RobotOutlined,
    category: "生成",
    component: SmartNameTool,
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
    id: "nav",
    title: "网站导航",
    desc: "自定义网址导航：多个导航页 / 分组，收藏网站一键打开",
    icon: AppstoreOutlined,
    category: "生活",
    component: NavTool,
  },
  {
    id: "dynasty",
    title: "中华朝代年鉴",
    desc: "历朝时间轴 · 疆域示意图 · 人物与大事记，支持双朝对照",
    icon: HistoryOutlined,
    category: "历史",
    component: DynastyTool,
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
