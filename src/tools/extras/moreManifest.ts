/*
 * 第二批新增 13 个工具的清单。
 *
 * 与 registry 中原有工具、第一批 40 个工具逐一核对过功能边界：
 * - JWT 只有「解析」，这里补「签发」；cURL 解析命令，这里解析原始 HTTP 报文
 * - 科学计算器已有描述统计，故不再做数列统计；格式转换已有图片换格式，故只做缩放压缩
 * - 进制转换只换表示，位运算算结果；颜色转换/对比度是针对单/双色，这里是配色方案生成
 */
export const MORE_TOOLS = [
  { id: "sql-format", title: "SQL 格式化", desc: "SQL 美化 / 压缩 / 关键字大小写，注释与字符串安全保留", category: "开发" },
  { id: "jwt-sign", title: "JWT 生成", desc: "填写 header / payload 与密钥，本地 HMAC 签发 HS256/384/512 Token", category: "开发" },
  { id: "http-message", title: "HTTP 报文解析", desc: "解析原始请求 / 响应报文为状态行、头表和正文，也可反向生成", category: "开发" },
  { id: "bitwise", title: "位运算", desc: "AND / OR / XOR / 取反 / 移位，32 位二进制与十六进制对照", category: "开发" },
  { id: "palette", title: "配色方案", desc: "由主色生成互补、邻近、三角、四分与明暗阶梯，导出 CSS 变量", category: "编码" },
  { id: "image-compress", title: "图片压缩", desc: "按最大宽高等比缩放并调节 JPEG / WebP 质量，本地处理可下载", category: "文件" },
  { id: "fake-data", title: "测试数据生成", desc: "批量生成姓名 / 手机 / 邮箱 / 公司等结构化假数据，导出 JSON / CSV / SQL", category: "生成" },
  { id: "lorem", title: "占位文本", desc: "生成中文或 Lorem ipsum 占位段落、句子与词，支持固定种子", category: "生成" },
  { id: "random-group", title: "随机分组", desc: "把名单随机且均衡地分成 N 组或每组 N 人，可固定种子复现", category: "生成" },
  { id: "timezone", title: "世界时区换算", desc: "把某一时刻换算到多个城市，显示当地时间与 UTC 偏移（自动处理夏令时）", category: "时间" },
  { id: "due-date", title: "预产期计算", desc: "按末次月经或受孕日推算预产期、孕周、孕期节点与当前进度", category: "生活" },
  { id: "fraction", title: "分数计算", desc: "分数四则运算精确约分，小数转最简分数与带分数", category: "数值" },
  { id: "combination", title: "排列组合", desc: "阶乘 / 排列 / 组合 / 可重复组合，以及二项分布与至少一次概率", category: "数值" },
] as const;

export type MoreToolId = (typeof MORE_TOOLS)[number]["id"];
