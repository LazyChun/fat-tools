/*
 * 中华朝代年鉴 · 数据层
 *
 * 覆盖从夏朝（约前 2070）到当代的 28 个朝代 / 时期 / 政权，
 * 每个条目包含：起止年份、都城、开国 / 末代君主、政体形态、
 * 简介、疆域描述、约略面积、代表人物（人物）与大事记（事件）。
 *
 * 说明：
 * - start / end 为整数年份，负数为公元前（如 -221 = 公元前 221 年）；
 *   endToday 为 true 表示政权延续至今（end 为当前年）。
 * - 夏商周及春秋战国的年份为学界通行的“约数”，疆域面积为约略示意，
 *   仅用于横向比较，不构成学术精确值。
 */

/** 政体 / 天下形态（用于“治乱”色带与徽标） */
export type RegimeKind = "统一" | "分封" | "割据" | "偏安" | "并立";

/** 人物角色类型 */
export type FigureRole =
  | "君主"
  | "名臣"
  | "名将"
  | "思想家"
  | "文学家"
  | "科学家"
  | "艺术家"
  | "先驱"
  | "政治家";

export interface DynastyFigure {
  name: string;
  /** 称号或身份，如 “唐·太宗” / “儒家亚圣” */
  title: string;
  role: FigureRole;
  /** 生卒或主要活动年代（展示用字符串） */
  years?: string;
  /** 一句话成就 */
  achievement: string;
}

export interface DynastyEvent {
  /** 展示用年份文本，如 “前 221 年” / “755-763 年” */
  year: string;
  /** 排序 / 定位用数值，负数表示公元前 */
  sort: number;
  text: string;
}

export interface Dynasty {
  id: string;
  name: string;
  /** 时期分组 id，见 ERAS */
  era: string;
  start: number;
  end: number;
  endToday?: boolean;
  /** 政权并立时的“正朔”主序列固定 0，插曲 / 并立政权提示车道（1 起） */
  lane?: number;
  /** 都城（可多个，先后） */
  capital: string[];
  founder: string;
  lastRuler: string;
  regime: RegimeKind;
  intro: string;
  /** 疆域文字描述 */
  territory: string;
  /** 约略面积（万平方公里），用于横向对比，约数 */
  areaKm2?: number;
  color: string;
  figures: DynastyFigure[];
  events: DynastyEvent[];
}

/** 时期分组 */
export const ERAS: { id: string; label: string }[] = [
  { id: "三代", label: "上古三代" },
  { id: "春秋战国", label: "春秋战国" },
  { id: "秦汉", label: "秦汉" },
  { id: "魏晋南北朝", label: "三国两晋南北朝" },
  { id: "隋唐五代", label: "隋唐五代" },
  { id: "宋辽金夏", label: "宋辽金夏" },
  { id: "元明", label: "元明" },
  { id: "近现代", label: "清与近现代" },
];

/** 人物角色中文名 */
export const FIGURE_ROLE_LABEL: Record<FigureRole, string> = {
  君主: "君主",
  名臣: "名臣",
  名将: "名将",
  思想家: "思想家",
  文学家: "文学家",
  科学家: "科学家",
  艺术家: "艺术家",
  先驱: "先驱",
  政治家: "政治家",
};

/** 治乱色带配色（浅色态；深色主题由 UI 统一提亮） */
export const REGIME_COLOR: Record<RegimeKind, string> = {
  统一: "#c9a227",
  分封: "#6d9b3a",
  割据: "#7f8c9b",
  偏安: "#3aa6a0",
  并立: "#8f6fc2",
};

export const DYNASTIES: Dynasty[] = [
  {
    id: "xia",
    name: "夏",
    era: "三代",
    start: -2070,
    end: -1600,
    capital: ["阳城", "斟鄩", "老丘"],
    founder: "禹",
    lastRuler: "桀",
    regime: "分封",
    intro:
      "中国史书记载的第一个世袭王朝。由治水定九州的禹开创，启继位后废“禅让”行“家天下”，华夏由此从部落联盟迈入国家形态。",
    territory:
      "活动范围以中原（今河南西部、山西南部）为中心，西起华山，东至豫东，是华夏文明的核心发源地。",
    areaKm2: 80,
    color: "#8d6e63",
    figures: [
      { name: "禹", title: "夏朝奠基者", role: "君主", years: "约前 21 世纪", achievement: "治水定九州、铸九鼎，以功受禅立夏" },
      { name: "启", title: "夏后", role: "君主", years: "约前 21 世纪", achievement: "废禅让开“家天下”，建立首个世袭王朝" },
      { name: "少康", title: "夏王", role: "君主", years: "约前 19 世纪", achievement: "少康中兴，恢复夏室" },
      { name: "桀", title: "夏末代王", role: "君主", years: "约前 17 世纪", achievement: "末代暴君，鸣条之战后夏亡" },
    ],
    events: [
      { year: "约前 2070", sort: -2070, text: "禹建立夏朝，定九州、铸九鼎" },
      { year: "约前 2000", sort: -2000, text: "启继位，“家天下”开启世袭制" },
      { year: "约前 1600", sort: -1600, text: "商汤鸣条之战灭夏" },
    ],
  },
  {
    id: "shang",
    name: "商",
    era: "三代",
    start: -1600,
    end: -1046,
    capital: ["亳", "嚣", "殷"],
    founder: "汤",
    lastRuler: "纣",
    regime: "分封",
    intro:
      "商汤灭夏而立，是中国有同时代文字（甲骨文）确证的第一个王朝。盘庚迁殷后国力复振，青铜文明达到高峰。",
    territory:
      "势力范围覆盖黄河中下游：东至大海，西达关中，南抵长江流域，殷都位于今河南安阳。",
    areaKm2: 140,
    color: "#a15c4b",
    figures: [
      { name: "汤", title: "商朝开国之君", role: "君主", years: "约前 17 世纪", achievement: "灭夏建商，施行宽政，网开三面" },
      { name: "盘庚", title: "商王", role: "君主", years: "约前 14 世纪", achievement: "迁都于殷，商朝中兴" },
      { name: "武丁", title: "商王", role: "君主", years: "约前 13 世纪", achievement: "任用傅说，征伐四方，商朝鼎盛" },
      { name: "妇好", title: "商王武丁之妻", role: "名将", years: "约前 13 世纪", achievement: "中国最早有文字记载的女将军，主持祭祀与征伐" },
      { name: "纣", title: "商末代王", role: "君主", years: "约前 11 世纪", achievement: "末代君主，牧野之战身死国亡" },
    ],
    events: [
      { year: "约前 1600", sort: -1600, text: "商汤革命，鸣条之战建商" },
      { year: "约前 1300", sort: -1300, text: "盘庚迁殷，商朝中兴" },
      { year: "约前 1200", sort: -1200, text: "武丁中兴，妇好率军征伐四方" },
      { year: "前 1046", sort: -1046, text: "牧野之战，武王灭商" },
    ],
  },
  {
    id: "xizhou",
    name: "西周",
    era: "三代",
    start: -1046,
    end: -771,
    capital: ["镐京", "洛邑"],
    founder: "姬发（周武王）",
    lastRuler: "周幽王",
    regime: "分封",
    intro:
      "武王伐纣而立，周公制礼作乐、大封诸侯，确立宗法制与礼乐文明，是中国古典制度的奠基时代。",
    territory:
      "分封七十余国：西起关中，东至海滨，北抵燕山，南达江汉，形成“普天之下莫非王土”的天下格局。",
    areaKm2: 200,
    color: "#7a6a4f",
    figures: [
      { name: "姬昌", title: "周文王", role: "君主", years: "前 12 世纪—前 11 世纪", achievement: "演《周易》、行仁政，为灭商奠基" },
      { name: "姬发", title: "周武王", role: "君主", years: "约前 1046 年", achievement: "牧野之战灭商，建立周朝" },
      { name: "周公旦", title: "周文王之子", role: "名臣", years: "前 11 世纪", achievement: "制礼作乐、辅成王东征，封建制度奠基者" },
      { name: "姜尚", title: "太公望", role: "名臣", years: "前 12 世纪—前 11 世纪", achievement: "辅佐武王伐纣，封于齐国，兵家鼻祖之一" },
      { name: "周幽王", title: "西周末代王", role: "君主", years: "？—前 771", achievement: "烽火戏诸侯，犬戎破镐京，西周灭亡" },
    ],
    events: [
      { year: "前 1046", sort: -1046, text: "牧野之战，周武王建立周朝" },
      { year: "前 1042", sort: -1042, text: "周公东征，制礼作乐、分封天下" },
      { year: "前 841", sort: -841, text: "国人暴动，共和行政（中国确切纪年之始）" },
      { year: "前 771", sort: -771, text: "犬戎攻破镐京，幽王身死，西周灭亡" },
    ],
  },
  {
    id: "chunqiu",
    name: "春秋",
    era: "春秋战国",
    start: -770,
    end: -476,
    capital: ["洛邑"],
    founder: "周平王",
    lastRuler: "周敬王",
    regime: "割据",
    intro:
      "平王东迁洛邑，周室衰微，诸侯争霸。五霸迭兴、礼崩乐坏，亦为百家争鸣与华夏认同形成的年代。",
    territory:
      "周天子仅保有洛邑王畿，齐、晋、楚、秦、吴、越等大国竞逐中原，华夏圈向四方扩展。",
    areaKm2: 180,
    color: "#9e9d24",
    figures: [
      { name: "齐桓公", title: "春秋首霸", role: "君主", years: "？—前 643", achievement: "尊王攘夷，葵丘会盟首霸诸侯" },
      { name: "管仲", title: "齐相", role: "名臣", years: "约前 723—前 645", achievement: "辅佐齐桓公改革，富国强兵，“仓廪实而知礼节”" },
      { name: "孔子", title: "至圣先师", role: "思想家", years: "前 551—前 479", achievement: "创立儒家学派，整理六经，万世师表" },
      { name: "老子", title: "道家始祖", role: "思想家", years: "约前 6 世纪", achievement: "著《道德经》，道法自然" },
      { name: "孙武", title: "兵圣", role: "名将", years: "约前 6 世纪", achievement: "著《孙子兵法》，“知己知彼百战不殆”" },
      { name: "勾践", title: "越王", role: "君主", years: "约前 520—前 465", achievement: "卧薪尝胆，灭吴称霸" },
    ],
    events: [
      { year: "前 770", sort: -770, text: "周平王东迁洛邑，春秋时代开启" },
      { year: "前 651", sort: -651, text: "齐桓公葵丘会盟，首霸诸侯" },
      { year: "前 632", sort: -632, text: "晋文公城濮之战，“退避三舍”败楚" },
      { year: "前 551", sort: -551, text: "孔子诞生，儒家思想兴起" },
      { year: "前 494—前 473", sort: -483, text: "吴越争霸，勾践卧薪尝胆灭吴" },
    ],
  },
  {
    id: "zhanguo",
    name: "战国",
    era: "春秋战国",
    start: -475,
    end: -221,
    capital: ["（七雄并列）"],
    founder: "（晋楚齐燕秦赵魏韩）",
    lastRuler: "（秦灭六国）",
    regime: "割据",
    intro:
      "三家分晋后七雄并立，变法图强成为时代主旋律。兼并战争空前惨烈，最终由商鞅变法后的秦国扫平六合。",
    territory:
      "七雄割据：秦据关中、楚据江汉、齐据山东、赵据河北、魏据中原、韩据河南、燕据幽冀，疆界犬牙交错。",
    areaKm2: 320,
    color: "#7cb342",
    figures: [
      { name: "商鞅", title: "秦国变法家", role: "名臣", years: "约前 390—前 338", achievement: "主持秦孝公变法，秦国由弱转强" },
      { name: "屈原", title: "楚辞开创者", role: "文学家", years: "约前 340—前 278", achievement: "《离骚》《九歌》，浪漫主义文学之源" },
      { name: "孟子", title: "儒家亚圣", role: "思想家", years: "约前 372—前 289", achievement: "主张仁政与性善，民贵君轻" },
      { name: "庄子", title: "道家宗师", role: "思想家", years: "约前 369—前 286", achievement: "著《庄子》，逍遥游、齐物论" },
      { name: "孙膑", title: "齐国军师", role: "名将", years: "约前 4 世纪", achievement: "围魏救赵、马陵之战，著《孙膑兵法》" },
      { name: "蔺相如", title: "赵相", role: "名臣", years: "约前 3 世纪", achievement: "完璧归赵、渑池之会，将相和" },
    ],
    events: [
      { year: "前 403", sort: -403, text: "三家分晋，战国七雄格局形成" },
      { year: "前 356", sort: -356, text: "商鞅变法，秦国崛起" },
      { year: "前 260", sort: -260, text: "长平之战，秦赵决战" },
      { year: "前 227", sort: -227, text: "荆轲刺秦，“风萧萧兮易水寒”" },
      { year: "前 221", sort: -221, text: "秦灭六国，天下归一" },
    ],
  },
  {
    id: "qin",
    name: "秦",
    era: "秦汉",
    start: -221,
    end: -206,
    capital: ["咸阳"],
    founder: "嬴政（秦始皇）",
    lastRuler: "子婴",
    regime: "统一",
    intro:
      "中国历史上第一个大一统中央集权王朝。书同文、车同轨、行郡县，奠定了此后两千余年帝国制度的基本框架，却二世而亡。",
    territory:
      "东临大海，西至陇西，北抵阴山，南达南海（岭南），是中国统一版图最早的完整轮廓。",
    areaKm2: 340,
    color: "#37474f",
    figures: [
      { name: "嬴政", title: "秦始皇", role: "君主", years: "前 259—前 210", achievement: "扫六合统一天下，首称皇帝，书同文车同轨" },
      { name: "李斯", title: "秦丞相", role: "名臣", years: "约前 280—前 208", achievement: "辅佐始皇统一文字度量衡，推行郡县制" },
      { name: "王翦", title: "秦国名将", role: "名将", years: "战国末—秦初", achievement: "率军灭赵、楚等国，统一大功臣" },
      { name: "蒙恬", title: "秦国名将", role: "名将", years: "约前 250—前 210", achievement: "北击匈奴，督修万里长城" },
      { name: "陈胜", title: "大泽乡起义领袖", role: "先驱", years: "？—前 208", achievement: "“王侯将相宁有种乎”，首举反秦大旗" },
    ],
    events: [
      { year: "前 221", sort: -221, text: "秦始皇统一六国，书同文车同轨" },
      { year: "前 214", sort: -214, text: "北击匈奴修长城，南平百越" },
      { year: "前 213", sort: -213, text: "焚书坑儒，思想统制" },
      { year: "前 209", sort: -209, text: "陈胜吴广大泽乡起义，秦末乱起" },
      { year: "前 206", sort: -206, text: "刘邦入咸阳，秦朝灭亡" },
    ],
  },
  {
    id: "xihan",
    name: "西汉",
    era: "秦汉",
    start: -202,
    end: 9,
    capital: ["长安"],
    founder: "刘邦（汉高祖）",
    lastRuler: "孺子婴",
    regime: "统一",
    intro:
      "楚汉相争后刘邦定鼎长安。文景之治休养生息，武帝时北击匈奴、凿空西域，丝绸之路贯通，汉成为影响深远的民族符号。",
    territory:
      "北控阴山，西设西域都护，东临大海，南并交趾（今越南北部），疆域空前辽阔。",
    areaKm2: 600,
    color: "#1976d2",
    figures: [
      { name: "刘邦", title: "汉高祖", role: "君主", years: "前 256—前 195", achievement: "布衣天子，楚汉相争胜出，建立汉朝" },
      { name: "刘彻", title: "汉武帝", role: "君主", years: "前 156—前 87", achievement: "北击匈奴、开疆拓土，独尊儒术" },
      { name: "张良", title: "留侯", role: "名臣", years: "约前 250—前 186", achievement: "运筹帷幄，汉初三杰" },
      { name: "韩信", title: "淮阴侯", role: "名将", years: "约前 231—前 196", achievement: "暗度陈仓、十面埋伏，兵仙" },
      { name: "卫青", title: "大将军", role: "名将", years: "？—前 106", achievement: "七击匈奴，收复河套" },
      { name: "霍去病", title: "骠骑将军", role: "名将", years: "前 140—前 117", achievement: "封狼居胥，“匈奴未灭，何以家为”" },
      { name: "张骞", title: "博望侯", role: "先驱", years: "约前 164—前 114", achievement: "凿空西域，开辟丝绸之路" },
      { name: "司马迁", title: "太史公", role: "文学家", years: "约前 145—约前 86", achievement: "著《史记》，“史家之绝唱，无韵之离骚”" },
    ],
    events: [
      { year: "前 202", sort: -202, text: "楚汉相争终局，刘邦称帝建汉" },
      { year: "前 138", sort: -138, text: "张骞出使西域，丝绸之路开辟" },
      { year: "前 133—前 119", sort: -126, text: "武帝北击匈奴，漠北决战" },
      { year: "前 33", sort: -33, text: "昭君出塞，汉匈和亲" },
      { year: "9", sort: 9, text: "王莽篡汉，建立新朝" },
    ],
  },
  {
    id: "xin",
    name: "新",
    era: "秦汉",
    start: 9,
    end: 23,
    capital: ["长安"],
    founder: "王莽",
    lastRuler: "王莽",
    regime: "统一",
    intro:
      "王莽以外戚身份代汉称帝，托古改制意图挽救危机，却因政策激进、币制混乱激起绿林赤眉起义，迅速覆灭。",
    territory: "承西汉疆域，王莽改制引发全国性动荡。",
    areaKm2: 580,
    color: "#607d8b",
    figures: [
      { name: "王莽", title: "新朝皇帝", role: "君主", years: "前 45—23", achievement: "代汉建新，托古改制，首创“王田”" },
    ],
    events: [
      { year: "9", sort: 9, text: "王莽篡汉称帝，推行改制" },
      { year: "17—23", sort: 20, text: "绿林赤眉起义，新朝覆灭" },
    ],
  },
  {
    id: "donghan",
    name: "东汉",
    era: "秦汉",
    start: 25,
    end: 220,
    capital: ["洛阳"],
    founder: "刘秀（光武帝）",
    lastRuler: "汉献帝",
    regime: "统一",
    intro:
      "光武中兴重兴汉室，定都洛阳。造纸术改进、地动仪问世，班超经营西域，但后期外戚宦官交替专权，终致黄巾之乱。",
    territory: "大体沿袭西汉，西域都护时置时废，南方开发显著加速。",
    areaKm2: 580,
    color: "#1e88e5",
    figures: [
      { name: "刘秀", title: "光武帝", role: "君主", years: "前 5—57", achievement: "昆阳之战以少胜多，光武中兴" },
      { name: "蔡伦", title: "尚方令", role: "科学家", years: "约 61—121", achievement: "改进造纸术，“蔡侯纸”名传后世" },
      { name: "张衡", title: "太史令", role: "科学家", years: "78—139", achievement: "发明地动仪、浑天仪，天文学家" },
      { name: "班超", title: "定远侯", role: "名将", years: "32—102", achievement: "投笔从戎，经营西域三十余年" },
      { name: "张仲景", title: "医圣", role: "科学家", years: "约 150—219", achievement: "著《伤寒杂病论》，辨证论治之祖" },
      { name: "华佗", title: "神医", role: "科学家", years: "约 145—208", achievement: "发明麻沸散，创五禽戏" },
    ],
    events: [
      { year: "25", sort: 25, text: "刘秀称帝，光武中兴" },
      { year: "73", sort: 73, text: "班超投笔从戎，经营西域" },
      { year: "105", sort: 105, text: "蔡伦改进造纸术" },
      { year: "184", sort: 184, text: "黄巾起义，东汉瓦解" },
      { year: "220", sort: 220, text: "曹丕代汉，东汉灭亡" },
    ],
  },
  {
    id: "sanguo",
    name: "三国",
    era: "魏晋南北朝",
    start: 220,
    end: 265, // 曹魏禅位于晋，三国鼎立告终（吴亡于 280，见大事记）
    capital: ["洛阳（魏）", "成都（蜀）", "建业（吴）"],
    founder: "曹丕 / 刘备 / 孙权",
    lastRuler: "孙皓（吴末帝）",
    regime: "割据",
    intro:
      "魏蜀吴三分天下：官渡定北方、赤壁分鼎足、夷陵折兵锋。群雄逐鹿的近五十年，也是门阀士族登上历史舞台的转折期。",
    territory:
      "魏据中原与北方，蜀据巴蜀汉中，吴据江东、荆扬与岭南，三国鼎立。",
    areaKm2: 540,
    color: "#5c6bc0",
    figures: [
      { name: "曹操", title: "魏武帝（追尊）", role: "君主", years: "155—220", achievement: "挟天子以令诸侯，统一北方，建安风骨" },
      { name: "刘备", title: "蜀汉昭烈帝", role: "君主", years: "161—223", achievement: "汉室宗亲，三顾茅庐得孔明" },
      { name: "孙权", title: "吴大帝", role: "君主", years: "182—252", achievement: "坐断东南，赤壁抗曹" },
      { name: "诸葛亮", title: "蜀汉丞相", role: "名臣", years: "181—234", achievement: "隆中对、出师表，鞠躬尽瘁死而后已" },
      { name: "关羽", title: "前将军", role: "名将", years: "约 160—220", achievement: "威震华夏，后世尊为武圣" },
      { name: "周瑜", title: "吴大都督", role: "名将", years: "175—210", achievement: "赤壁之战主帅，羽扇纶巾" },
      { name: "司马懿", title: "魏太傅", role: "名臣", years: "179—251", achievement: "高平陵之变，奠定魏晋基业" },
    ],
    events: [
      { year: "200", sort: 200, text: "官渡之战，曹操统一北方" },
      { year: "208", sort: 208, text: "赤壁之战，三分天下定局" },
      { year: "222", sort: 222, text: "夷陵之战，蜀汉元气大伤" },
      { year: "228—234", sort: 231, text: "诸葛亮五次北伐，鞠躬尽瘁" },
      { year: "280", sort: 280, text: "西晋灭吴，三家归晋" },
    ],
  },
  {
    id: "xijin",
    name: "西晋",
    era: "魏晋南北朝",
    start: 265,
    end: 316,
    capital: ["洛阳"],
    founder: "司马炎（晋武帝）",
    lastRuler: "晋愍帝",
    regime: "统一",
    intro:
      "司马氏代魏建晋，灭吴重归一统。然八王之乱耗尽国力，宗室内讧引来五胡入华，立国五十一年而亡。",
    territory: "灭吴后疆域近于东汉，但西域与边疆控制力已大减。",
    areaKm2: 540,
    color: "#26a69a",
    figures: [
      { name: "司马炎", title: "晋武帝", role: "君主", years: "236—290", achievement: "代魏建晋，灭吴统一，太康之治" },
      { name: "杜预", title: "征南大将军", role: "名将", years: "222—285", achievement: "灭吴主帅，兼注《春秋左氏经传集解》" },
      { name: "王濬", title: "龙骧将军", role: "名将", years: "206—286", achievement: "楼船下益州，率先攻入建业" },
      { name: "嵇康", title: "竹林七贤领袖", role: "文学家", years: "224—263", achievement: "《广陵散》绝响，越名教而任自然" },
    ],
    events: [
      { year: "265", sort: 265, text: "司马炎代魏建晋" },
      { year: "280", sort: 280, text: "王濬楼船下益州，灭吴统一" },
      { year: "291—306", sort: 299, text: "八王之乱，国力衰耗" },
      { year: "316", sort: 316, text: "匈奴破长安，西晋灭亡" },
    ],
  },
  {
    id: "dongjin",
    name: "东晋",
    era: "魏晋南北朝",
    start: 317,
    end: 420,
    capital: ["建康"],
    founder: "司马睿（晋元帝）",
    lastRuler: "晋恭帝",
    regime: "偏安",
    intro:
      "衣冠南渡，王导辅佐司马睿定都建康，“王与马共天下”。淝水一战以少胜多，江南文华与门阀政治达到极致。",
    territory:
      "偏安江左，据有长江以南及巴蜀部分地区，与北方十六国长期对峙。",
    areaKm2: 250,
    color: "#4db6ac",
    figures: [
      { name: "司马睿", title: "晋元帝", role: "君主", years: "276—323", achievement: "衣冠南渡，建立东晋" },
      { name: "王导", title: "东晋丞相", role: "名臣", years: "276—339", achievement: "“王与马共天下”，稳定江南政权" },
      { name: "谢安", title: "东晋太保", role: "名臣", years: "320—385", achievement: "淝水之战坐镇指挥，风流宰相" },
      { name: "谢玄", title: "车骑将军", role: "名将", years: "343—388", achievement: "淝水之战以八万北府兵破前秦百万" },
      { name: "王羲之", title: "书圣", role: "艺术家", years: "303—361", achievement: "《兰亭集序》天下第一行书" },
      { name: "陶渊明", title: "田园诗派鼻祖", role: "文学家", years: "约 365—427", achievement: "采菊东篱下，悠然见南山" },
    ],
    events: [
      { year: "317", sort: 317, text: "司马睿建康称帝，衣冠南渡" },
      { year: "383", sort: 383, text: "淝水之战，谢玄以少胜多破前秦" },
      { year: "404", sort: 404, text: "桓玄篡晋，刘裕起兵" },
      { year: "420", sort: 420, text: "刘裕代晋建宋，东晋灭亡" },
    ],
  },
  {
    id: "shiliuguo",
    name: "十六国",
    era: "魏晋南北朝",
    start: 304,
    end: 439,
    capital: ["（各国并立）"],
    founder: "刘渊（汉赵）",
    lastRuler: "（北魏统一北方）",
    regime: "割据",
    lane: 1,
    intro:
      "五胡入华，北方先后出现二十余个政权，史称十六国。前秦苻坚一度统一北方，淝水战败后再度分裂，终由北魏收拾残局。",
    territory: "北方诸国林立，前秦全盛时一度据有整个北方，与南方东晋对峙。",
    areaKm2: 330,
    color: "#9575cd",
    figures: [
      { name: "刘渊", title: "汉赵开国君主", role: "君主", years: "？—310", achievement: "匈奴人，西晋末年首举反晋大旗" },
      { name: "石勒", title: "后赵明帝", role: "君主", years: "274—333", achievement: "奴隶出身终成帝王，重视汉学" },
      { name: "苻坚", title: "前秦天王", role: "君主", years: "338—385", achievement: "一度统一北方，淝水之战兵败" },
      { name: "王猛", title: "前秦丞相", role: "名臣", years: "325—375", achievement: "辅佐苻坚整军经武，前秦强盛关键" },
    ],
    events: [
      { year: "304", sort: 304, text: "刘渊建汉，五胡入华序幕" },
      { year: "376", sort: 376, text: "前秦苻坚统一北方" },
      { year: "383", sort: 383, text: "淝水之战前秦溃败，北方再分裂" },
      { year: "439", sort: 439, text: "北魏统一北方，十六国终结" },
    ],
  },
  {
    id: "nanbeichao",
    name: "南北朝",
    era: "魏晋南北朝",
    start: 420,
    end: 589,
    capital: ["建康（南朝）", "平城→洛阳（北朝）"],
    founder: "刘裕（宋武帝）",
    lastRuler: "陈后主",
    regime: "割据",
    intro:
      "南朝宋齐梁陈更迭，北朝北魏统一后推行汉化改革。南北方文化交融、民族整合，为隋唐大一统积蓄力量。",
    territory:
      "南北对峙一百七十年：南朝据江左，北朝据黄河流域，以淮河—秦岭一线为界。",
    areaKm2: 510,
    color: "#8e24aa",
    figures: [
      { name: "刘裕", title: "宋武帝", role: "君主", years: "363—422", achievement: "刘宋代晋，南朝第一帝" },
      { name: "拓跋宏", title: "北魏孝文帝", role: "君主", years: "467—499", achievement: "迁都洛阳，全面汉化改革" },
      { name: "萧衍", title: "梁武帝", role: "君主", years: "464—549", achievement: "梁朝开国，“皇帝菩萨”，晚年遭侯景之乱" },
      { name: "祖冲之", title: "数学家", role: "科学家", years: "429—500", achievement: "圆周率精至七位小数，编《大明历》" },
      { name: "郦道元", title: "地理学家", role: "科学家", years: "约 470—527", achievement: "著《水经注》，中国古代地理名著" },
      { name: "贾思勰", title: "农学家", role: "科学家", years: "约 5—6 世纪", achievement: "著《齐民要术》，世界农学瑰宝" },
    ],
    events: [
      { year: "420", sort: 420, text: "刘宋代晋，南北朝开始" },
      { year: "494", sort: 494, text: "北魏孝文帝迁都洛阳，推行汉化" },
      { year: "548—552", sort: 550, text: "侯景之乱，南朝衰落" },
      { year: "577", sort: 577, text: "北周灭北齐，北方统一" },
      { year: "589", sort: 589, text: "隋灭陈，天下重归一统" },
    ],
  },
  {
    id: "sui",
    name: "隋",
    era: "隋唐五代",
    start: 581,
    end: 618,
    capital: ["大兴（长安）", "洛阳"],
    founder: "杨坚（隋文帝）",
    lastRuler: "隋恭帝",
    regime: "统一",
    intro:
      "杨坚代周建隋，开皇之治仓廪丰实，终结三百年分裂。创立科举、开通大运河，功业赫赫，却因急政而二世而亡。",
    territory:
      "再度统一南北，西至河西走廊，东临大海，北抵阴山，南达南海，疆域略小于汉。",
    areaKm2: 470,
    color: "#ef6c00",
    figures: [
      { name: "杨坚", title: "隋文帝", role: "君主", years: "541—604", achievement: "代周建隋，开皇之治，一统南北" },
      { name: "杨广", title: "隋炀帝", role: "君主", years: "569—618", achievement: "开大运河、创科举，急政而亡国" },
      { name: "宇文恺", title: "建筑大师", role: "科学家", years: "555—612", achievement: "营建大兴城与洛阳，古代城市规划典范" },
      { name: "李春", title: "工匠", role: "科学家", years: "约 6—7 世纪", achievement: "建造赵州桥，现存最早敞肩石拱桥" },
    ],
    events: [
      { year: "581", sort: 581, text: "杨坚代周建隋，开皇之治" },
      { year: "587", sort: 587, text: "废九品中正，开创科举制" },
      { year: "605—610", sort: 608, text: "开通大运河，南北贯通" },
      { year: "612—614", sort: 613, text: "三征高句丽，民力耗尽" },
      { year: "618", sort: 618, text: "李渊太原起兵，隋朝灭亡" },
    ],
  },
  {
    id: "tang",
    name: "唐",
    era: "隋唐五代",
    start: 618,
    end: 907,
    capital: ["长安", "洛阳"],
    founder: "李渊（唐高祖）",
    lastRuler: "唐哀帝",
    regime: "统一",
    intro:
      "中国历史上最辉煌的王朝之一：贞观之治、开元盛世，万国来朝；诗文书画登峰造极。安史之乱后藩镇割据，终至黄巢起义倾覆。",
    territory:
      "疆域极盛：西至咸海，北括漠北，东北抵外兴安岭，南达南海，是当时世界最辽阔的帝国之一。",
    areaKm2: 1200,
    color: "#c62828",
    figures: [
      { name: "李世民", title: "唐太宗", role: "君主", years: "598—649", achievement: "贞观之治，被尊为“天可汗”" },
      { name: "武则天", title: "武周皇帝", role: "君主", years: "624—705", achievement: "中国唯一女皇帝，政启开元治宏贞观" },
      { name: "李隆基", title: "唐玄宗", role: "君主", years: "685—762", achievement: "开元盛世，晚年安史之乱" },
      { name: "魏徵", title: "谏议大夫", role: "名臣", years: "580—643", achievement: "直言敢谏，“以人为镜可以明得失”" },
      { name: "郭子仪", title: "汾阳王", role: "名将", years: "697—781", achievement: "平定安史之乱，再造大唐" },
      { name: "李白", title: "诗仙", role: "文学家", years: "701—762", achievement: "浪漫主义诗歌巅峰，“笔落惊风雨”" },
      { name: "杜甫", title: "诗圣", role: "文学家", years: "712—770", achievement: "诗史传世，“安得广厦千万间”" },
      { name: "白居易", title: "新乐府诗人", role: "文学家", years: "772—846", achievement: "《长恨歌》《琵琶行》，老妪能解" },
      { name: "玄奘", title: "三藏法师", role: "先驱", years: "602—664", achievement: "西行取经，著《大唐西域记》" },
      { name: "孙思邈", title: "药王", role: "科学家", years: "约 581—682", achievement: "著《千金方》，医德典范" },
      { name: "吴道子", title: "画圣", role: "艺术家", years: "约 680—760", achievement: "吴带当风，开一代画风" },
      { name: "颜真卿", title: "颜体书法家", role: "艺术家", years: "709—785", achievement: "颜体雄浑，忠烈殉国" },
    ],
    events: [
      { year: "618", sort: 618, text: "李渊建唐，定都长安" },
      { year: "626", sort: 626, text: "玄武门之变，李世民即位，贞观之治" },
      { year: "690", sort: 690, text: "武则天称帝，改唐为周" },
      { year: "713—741", sort: 727, text: "开元盛世，万国来朝" },
      { year: "755—763", sort: 759, text: "安史之乱，盛唐转衰" },
      { year: "875—884", sort: 880, text: "黄巢起义，唐朝根基动摇" },
      { year: "907", sort: 907, text: "朱温篡唐，五代开始" },
    ],
  },
  {
    id: "wuzhou",
    name: "武周",
    era: "隋唐五代",
    start: 690,
    end: 705,
    capital: ["洛阳（神都）"],
    founder: "武则天",
    lastRuler: "武则天",
    regime: "统一",
    lane: 1,
    intro:
      "武则天改唐为周，定都洛阳，成为中国历史上唯一正式称帝的女皇帝。首创殿试与武举，十五年统治上承贞观、下启开元。",
    territory: "承唐疆域，设北庭都护府巩固西域。",
    areaKm2: 1200,
    color: "#ad1457",
    figures: [
      { name: "武则天", title: "武周皇帝", role: "君主", years: "624—705", achievement: "以周代唐，首创殿试武举" },
      { name: "狄仁杰", title: "内史", role: "名臣", years: "630—700", achievement: "断案如神，劝武后还政李唐" },
    ],
    events: [
      { year: "690", sort: 690, text: "武则天登基，中国唯一女皇" },
      { year: "705", sort: 705, text: "神龙政变，武周还政李唐" },
    ],
  },
  {
    id: "wudai",
    name: "五代十国",
    era: "隋唐五代",
    start: 907,
    end: 960,
    capital: ["开封（中原王朝）"],
    founder: "朱温（后梁太祖）",
    lastRuler: "后周恭帝",
    regime: "割据",
    intro:
      "中原梁唐晋汉周五代更迭，南方十国割据自保。周世宗柴荣改革强兵，为赵宋统一铺平道路。",
    territory:
      "中原王朝据黄河流域，南方十国（吴越、南唐、南汉等）各据一方。",
    areaKm2: 300,
    color: "#6d4c41",
    figures: [
      { name: "朱温", title: "后梁太祖", role: "君主", years: "852—912", achievement: "代唐建梁，终结唐朝" },
      { name: "柴荣", title: "周世宗", role: "君主", years: "921—959", achievement: "后周改革强兵，为北宋统一奠基" },
      { name: "钱镠", title: "吴越国王", role: "君主", years: "852—932", achievement: "保境安民，“钱王射潮”治水" },
      { name: "李煜", title: "南唐后主", role: "文学家", years: "937—978", achievement: "词帝，“问君能有几多愁”" },
      { name: "冯道", title: "长乐老", role: "名臣", years: "882—954", achievement: "历仕数朝“十朝元老”，毁誉参半" },
    ],
    events: [
      { year: "907", sort: 907, text: "朱温代唐，五代十国开启" },
      { year: "936", sort: 936, text: "石敬瑭割燕云十六州，“儿皇帝”" },
      { year: "954—959", sort: 956, text: "周世宗改革，为统一奠基" },
      { year: "960", sort: 960, text: "陈桥兵变，赵匡胤代周建宋" },
    ],
  },
  {
    id: "beisong",
    name: "北宋",
    era: "宋辽金夏",
    start: 960,
    end: 1127,
    capital: ["东京（开封）"],
    founder: "赵匡胤（宋太祖）",
    lastRuler: "宋钦宗",
    regime: "并立",
    intro:
      "陈桥兵变黄袍加身，杯酒释兵权终结武人乱政。经济繁荣、文教鼎盛，活字印刷与《资治通鉴》同辉，惜北失燕云、受制辽夏。",
    territory:
      "结束五代割据，然北失燕云十六州，西邻西夏，北有强辽，与辽夏并立。",
    areaKm2: 280,
    color: "#1565c0",
    figures: [
      { name: "赵匡胤", title: "宋太祖", role: "君主", years: "927—976", achievement: "陈桥兵变黄袍加身，杯酒释兵权" },
      { name: "王安石", title: "荆国公", role: "名臣", years: "1021—1086", achievement: "熙宁变法，“天变不足畏”" },
      { name: "苏轼", title: "东坡居士", role: "文学家", years: "1037—1101", achievement: "诗词文书画全能，豁达千古" },
      { name: "欧阳修", title: "文忠公", role: "文学家", years: "1007—1072", achievement: "文坛领袖，唐宋八大家之一" },
      { name: "司马光", title: "温国公", role: "文学家", years: "1019—1086", achievement: "著《资治通鉴》，编年史巅峰" },
      { name: "沈括", title: "梦溪丈人", role: "科学家", years: "1031—1095", achievement: "著《梦溪笔谈》，中国科学史的坐标" },
      { name: "毕昇", title: "发明家", role: "科学家", years: "约 11 世纪", achievement: "发明泥活字印刷术" },
      { name: "包拯", title: "龙图阁直学士", role: "名臣", years: "999—1062", achievement: "铁面无私，千古清官典范" },
    ],
    events: [
      { year: "960", sort: 960, text: "陈桥兵变，赵匡胤黄袍加身" },
      { year: "961", sort: 961, text: "杯酒释兵权，中央集权" },
      { year: "1005", sort: 1005, text: "澶渊之盟，宋辽和平百年" },
      { year: "1069", sort: 1069, text: "王安石变法，新旧党争" },
      { year: "1127", sort: 1127, text: "靖康之变，北宋灭亡" },
    ],
  },
  {
    id: "liao",
    name: "辽",
    era: "宋辽金夏",
    start: 916,
    end: 1125,
    capital: ["上京临潢府", "中京大定府"],
    founder: "耶律阿保机（辽太祖）",
    lastRuler: "天祚帝",
    regime: "并立",
    lane: 1,
    intro:
      "契丹族耶律阿保机建立，与北宋对峙百余年。实行“因俗而治”的南北面官制，五京并置，一度雄踞北亚。",
    territory:
      "据有燕云十六州、东北与漠北，南界与宋以白沟为界，五京并置。",
    areaKm2: 450,
    color: "#00838f",
    figures: [
      { name: "耶律阿保机", title: "辽太祖", role: "君主", years: "872—926", achievement: "统一契丹诸部，创契丹文字" },
      { name: "萧绰", title: "承天太后", role: "名臣", years: "953—1009", achievement: "摄政辽国，辽宋澶渊之盟" },
      { name: "韩延徽", title: "辽国名臣", role: "名臣", years: "882—959", achievement: "设计辽国官制，汉臣典范" },
    ],
    events: [
      { year: "916", sort: 916, text: "耶律阿保机建契丹国" },
      { year: "947", sort: 947, text: "契丹改国号为辽" },
      { year: "1005", sort: 1005, text: "澶渊之盟，宋辽和平" },
      { year: "1125", sort: 1125, text: "金灭辽，天祚帝被俘" },
    ],
  },
  {
    id: "xixia",
    name: "西夏",
    era: "宋辽金夏",
    start: 1038,
    end: 1227,
    capital: ["兴庆府（银川）"],
    founder: "李元昊（夏景宗）",
    lastRuler: "李睍",
    regime: "并立",
    lane: 1,
    intro:
      "党项族李元昊称帝建国，创制西夏文字。夹在宋辽金之间纵横捭阖近两百年，终被蒙古所灭。",
    territory:
      "据有今宁夏、甘肃大部及陕北、内蒙古西部，东据黄河，西至玉门关。",
    areaKm2: 100,
    color: "#f9a825",
    figures: [
      { name: "李元昊", title: "夏景宗", role: "君主", years: "1003—1048", achievement: "西夏开国皇帝，创西夏文字" },
      { name: "野利仁荣", title: "西夏名臣", role: "名臣", years: "？—1042", achievement: "主持创制西夏文字" },
    ],
    events: [
      { year: "1038", sort: 1038, text: "李元昊称帝，西夏立国" },
      { year: "1044", sort: 1044, text: "宋夏和议，岁赐换和平" },
      { year: "1227", sort: 1227, text: "蒙古灭西夏" },
    ],
  },
  {
    id: "nanSong",
    name: "南宋",
    era: "宋辽金夏",
    start: 1127,
    end: 1279,
    capital: ["临安（杭州）"],
    founder: "赵构（宋高宗）",
    lastRuler: "宋帝昺",
    regime: "偏安",
    intro:
      "靖康之变后赵构建炎南渡，定都临安。偏安江南而经济文教繁盛，理学集大成；岳飞精忠、文山正气，终殉于崖山。",
    territory:
      "偏安江南，以淮河—大散关为界与金对峙，后期面对蒙古铁骑。",
    areaKm2: 180,
    color: "#1e88e5",
    figures: [
      { name: "赵构", title: "宋高宗", role: "君主", years: "1107—1187", achievement: "建炎南渡，定都临安" },
      { name: "岳飞", title: "鄂王", role: "名将", years: "1103—1142", achievement: "精忠报国，直捣黄龙，冤死风波亭" },
      { name: "朱熹", title: "朱文公", role: "思想家", years: "1130—1200", achievement: "集理学大成，四书章句集注" },
      { name: "陆游", title: "放翁", role: "文学家", years: "1125—1210", achievement: "爱国诗人，“王师北定中原日”" },
      { name: "辛弃疾", title: "稼轩", role: "文学家", years: "1140—1207", achievement: "豪放词宗，金戈铁马气吞万里" },
      { name: "文天祥", title: "信国公", role: "名臣", years: "1236—1283", achievement: "“人生自古谁无死”，丹心照汗青" },
    ],
    events: [
      { year: "1127", sort: 1127, text: "赵构即位，建炎南渡" },
      { year: "1141", sort: 1141, text: "绍兴和议，岳飞被冤杀" },
      { year: "1234", sort: 1234, text: "联蒙灭金，北方直面蒙古" },
      { year: "1279", sort: 1279, text: "崖山海战，南宋灭亡" },
    ],
  },
  {
    id: "jin",
    name: "金",
    era: "宋辽金夏",
    start: 1115,
    end: 1234,
    capital: ["会宁", "中都（北京）", "汴京"],
    founder: "完颜阿骨打（金太祖）",
    lastRuler: "金哀宗",
    regime: "并立",
    lane: 1,
    intro:
      "女真族完颜部崛起白山黑水之间，十年灭辽、两年亡宋。海陵王迁都中都，金世宗大定之治，北方经济文化一度复兴。",
    territory:
      "灭辽与北宋后，据有东北、华北与中原，南界至淮河，与南宋对峙。",
    areaKm2: 360,
    color: "#d81b60",
    figures: [
      { name: "完颜阿骨打", title: "金太祖", role: "君主", years: "1068—1123", achievement: "女真英雄，灭辽建金" },
      { name: "完颜宗弼", title: "金兀术", role: "名将", years: "？—1148", achievement: "南征宋室，与岳飞对阵的名将" },
      { name: "完颜雍", title: "金世宗", role: "君主", years: "1123—1189", achievement: "大定之治，女真中兴之主" },
      { name: "元好问", title: "金末文宗", role: "文学家", years: "1190—1257", achievement: "“问世间情为何物”，编《中州集》" },
    ],
    events: [
      { year: "1115", sort: 1115, text: "完颜阿骨打建金，灭辽" },
      { year: "1127", sort: 1127, text: "靖康之变，金灭北宋" },
      { year: "1153", sort: 1153, text: "海陵王迁都中都（北京）" },
      { year: "1234", sort: 1234, text: "蒙古灭金，蔡州之战" },
    ],
  },
  {
    id: "yuan",
    name: "元",
    era: "元明",
    start: 1271,
    end: 1368,
    capital: ["大都（北京）"],
    founder: "忽必烈（元世祖）",
    lastRuler: "元顺帝",
    regime: "统一",
    intro:
      "蒙古帝国分裂后，忽必烈定国号“大元”并灭南宋。首创行省制，驿站通达四海，大都成为欧亚大陆的都会。",
    territory:
      "中国历史上疆域最辽阔的王朝之一：含漠北、西域与吐蕃，西至中亚，东临大海。",
    areaKm2: 1400,
    color: "#4e342e",
    figures: [
      { name: "铁木真", title: "成吉思汗", role: "君主", years: "1162—1227", achievement: "统一蒙古，建立横跨欧亚的蒙古帝国" },
      { name: "忽必烈", title: "元世祖", role: "君主", years: "1215—1294", achievement: "建立元朝，灭南宋统一中国" },
      { name: "郭守敬", title: "太史令", role: "科学家", years: "1231—1316", achievement: "编《授时历》，领先世界三百年" },
      { name: "黄道婆", title: "棉纺家", role: "科学家", years: "约 13 世纪", achievement: "改进棉纺织技术，“衣被天下”" },
      { name: "关汉卿", title: "元曲大家", role: "文学家", years: "约 1230—1300", achievement: "《窦娥冤》，元曲四大家之首" },
      { name: "赵孟頫", title: "松雪道人", role: "艺术家", years: "1254—1322", achievement: "书画冠绝，赵体书法" },
    ],
    events: [
      { year: "1206", sort: 1206, text: "成吉思汗统一蒙古（蒙古帝国）" },
      { year: "1271", sort: 1271, text: "忽必烈定国号“大元”" },
      { year: "1279", sort: 1279, text: "崖山海战，元朝统一中国" },
      { year: "1280", sort: 1280, text: "郭守敬编成《授时历》" },
      { year: "1351", sort: 1351, text: "红巾军起义，元末大乱" },
      { year: "1368", sort: 1368, text: "徐达攻克大都，元朝北遁" },
    ],
  },
  {
    id: "ming",
    name: "明",
    era: "元明",
    start: 1368,
    end: 1644,
    capital: ["应天（南京）", "北京"],
    founder: "朱元璋（明太祖）",
    lastRuler: "明思宗（崇祯）",
    regime: "统一",
    intro:
      "布衣天子朱元璋驱元立明。永乐迁都北京、郑和七下西洋；中后期党争与边患交困，最终亡于内忧外患。",
    territory:
      "北筑长城，东北设奴儿干都司，西抵哈密卫，南至南海，郑和船队远达非洲东海岸。",
    areaKm2: 1000,
    color: "#d32f2f",
    figures: [
      { name: "朱元璋", title: "明太祖", role: "君主", years: "1328—1398", achievement: "布衣天子，洪武之治，驱元复汉" },
      { name: "朱棣", title: "明成祖", role: "君主", years: "1360—1424", achievement: "永乐迁都北京，郑和下西洋" },
      { name: "郑和", title: "三宝太监", role: "先驱", years: "1371—1433", achievement: "七下西洋，世界航海史壮举" },
      { name: "戚继光", title: "戚家军统帅", role: "名将", years: "1528—1588", achievement: "抗倭名将，鸳鸯阵威震东南" },
      { name: "张居正", title: "万历首辅", role: "名臣", years: "1525—1582", achievement: "一条鞭法改革，万历中兴" },
      { name: "王守仁", title: "阳明先生", role: "思想家", years: "1472—1529", achievement: "心学集大成者，“知行合一”" },
      { name: "李时珍", title: "本草纲目作者", role: "科学家", years: "1518—1593", achievement: "著《本草纲目》，东方医药巨典" },
      { name: "徐光启", title: "文定公", role: "科学家", years: "1562—1633", achievement: "著《农政全书》，译《几何原本》" },
      { name: "宋应星", title: "天工开物作者", role: "科学家", years: "1587—约 1666", achievement: "著《天工开物》，17 世纪工艺百科" },
      { name: "于谦", title: "少保", role: "名臣", years: "1398—1457", achievement: "北京保卫战，“粉身碎骨浑不怕”" },
    ],
    events: [
      { year: "1368", sort: 1368, text: "朱元璋称帝，定都南京" },
      { year: "1405—1433", sort: 1419, text: "郑和七下西洋" },
      { year: "1421", sort: 1421, text: "永乐迁都北京" },
      { year: "1449", sort: 1449, text: "土木堡之变，明英宗被俘" },
      { year: "1572—1582", sort: 1577, text: "张居正改革，一条鞭法" },
      { year: "1644", sort: 1644, text: "李自成破北京，崇祯自缢，明亡" },
    ],
  },
  {
    id: "qing",
    name: "清",
    era: "近现代",
    start: 1644,
    end: 1912,
    capital: ["北京"],
    founder: "顺治帝（福临）",
    lastRuler: "宣统帝（溥仪）",
    regime: "统一",
    intro:
      "女真（满洲）入关定鼎，康雍乾三代奠定现代中国疆域基础。晚清鸦片战争后屡遭列强冲击，洋务、戊戌图强未果，终为革命所覆。",
    territory:
      "奠定现代中国疆域基础：含内外蒙古、新疆、西藏、台湾，疆域面积居历代前列。",
    areaKm2: 1300,
    color: "#283593",
    figures: [
      { name: "玄烨", title: "康熙帝", role: "君主", years: "1654—1722", achievement: "平定三藩与准噶尔，统一台湾" },
      { name: "弘历", title: "乾隆帝", role: "君主", years: "1711—1799", achievement: "十全武功，康乾盛世极盛" },
      { name: "林则徐", title: "文忠公", role: "名臣", years: "1785—1850", achievement: "虎门销烟，开眼看世界第一人" },
      { name: "曾国藩", title: "文正公", role: "名臣", years: "1811—1872", achievement: "组建湘军，中兴名臣" },
      { name: "左宗棠", title: "文襄公", role: "名将", years: "1812—1885", achievement: "抬棺出征，收复新疆" },
      { name: "曹雪芹", title: "红楼梦作者", role: "文学家", years: "约 1715—1763", achievement: "著《红楼梦》，古典小说巅峰" },
      { name: "蒲松龄", title: "聊斋作者", role: "文学家", years: "1640—1715", achievement: "著《聊斋志异》，狐鬼有深情" },
      { name: "詹天佑", title: "铁路工程师", role: "科学家", years: "1861—1919", achievement: "主持京张铁路，“中国铁路之父”" },
    ],
    events: [
      { year: "1644", sort: 1644, text: "清军入关，定鼎北京" },
      { year: "1683", sort: 1683, text: "施琅收复台湾" },
      { year: "1759", sort: 1759, text: "平定大小和卓，疆域极盛" },
      { year: "1840—1842", sort: 1841, text: "鸦片战争，签订《南京条约》" },
      { year: "1898", sort: 1898, text: "戊戌变法，百日维新" },
      { year: "1912", sort: 1912, text: "宣统退位，清朝灭亡" },
    ],
  },
  {
    id: "minguo",
    name: "中华民国",
    era: "近现代",
    start: 1912,
    end: 1949,
    capital: ["南京", "重庆（陪都）"],
    founder: "孙中山（临时大总统）",
    lastRuler: "（迁台）",
    regime: "统一",
    intro:
      "辛亥革命终结帝制，亚洲第一个共和国诞生。此后历经军阀混战、北伐、十四年抗战与内战，1949 年中华人民共和国成立。",
    territory:
      "名义上继承清季疆域，实际长期军阀割据；抗战胜利后收复台湾。",
    areaKm2: 1140,
    color: "#455a64",
    figures: [
      { name: "孙中山", title: "国父", role: "先驱", years: "1866—1925", achievement: "辛亥革命领袖，三民主义倡导者" },
      { name: "鲁迅", title: "新文化运动旗手", role: "文学家", years: "1881—1936", achievement: "《呐喊》《彷徨》，民族魂" },
      { name: "张謇", title: "状元实业家", role: "先驱", years: "1853—1926", achievement: "实业救国，创办大生纱厂" },
    ],
    events: [
      { year: "1911", sort: 1911, text: "辛亥革命，武昌起义" },
      { year: "1912", sort: 1912, text: "中华民国成立，清帝退位" },
      { year: "1937—1945", sort: 1941, text: "全民族抗日战争" },
      { year: "1949", sort: 1949, text: "中华人民共和国成立，大陆时期结束" },
    ],
  },
  {
    id: "xinzhongguo",
    name: "中华人民共和国",
    era: "近现代",
    start: 1949,
    end: 2026,
    endToday: true,
    capital: ["北京"],
    founder: "毛泽东",
    lastRuler: "—",
    regime: "统一",
    intro:
      "1949 年开国至今。改革开放以来经济腾飞，两弹一星、载人航天、高铁网络等成就举世瞩目，正迈向民族复兴。",
    territory: "陆域面积约 960 万平方公里，陆域边界基本稳定。",
    areaKm2: 960,
    color: "#c62828",
    figures: [
      { name: "毛泽东", title: "开国领袖", role: "政治家", years: "1893—1976", achievement: "领导中国人民站起来的开国领袖" },
      { name: "周恩来", title: "开国总理", role: "政治家", years: "1898—1976", achievement: "鞠躬尽瘁，新中国外交奠基人" },
      { name: "邓小平", title: "改革开放总设计师", role: "政治家", years: "1904—1997", achievement: "推动改革开放，中国经济腾飞" },
      { name: "钱学森", title: "两弹一星元勋", role: "科学家", years: "1911—2009", achievement: "中国航天之父，空气动力学家" },
      { name: "袁隆平", title: "杂交水稻之父", role: "科学家", years: "1930—2021", achievement: "培育杂交水稻，让中国人端稳饭碗" },
      { name: "邓稼先", title: "两弹元勋", role: "科学家", years: "1924—1986", achievement: "中国核武器研制奠基人" },
      { name: "屠呦呦", title: "诺贝尔奖得主", role: "科学家", years: "1930—", achievement: "发现青蒿素，首位获诺贝尔科学奖的中国本土科学家" },
    ],
    events: [
      { year: "1949", sort: 1949, text: "开国大典，中华人民共和国成立" },
      { year: "1964", sort: 1964, text: "第一颗原子弹爆炸成功" },
      { year: "1978", sort: 1978, text: "改革开放，经济腾飞" },
      { year: "1997", sort: 1997, text: "香港回归" },
      { year: "2008", sort: 2008, text: "北京奥运会成功举办" },
      { year: "2022", sort: 2022, text: "中国空间站全面建成" },
    ],
  },
];

/** id → 朝代记录（查找用，惰性构建） */
export function dynastyById(id: string): Dynasty | undefined {
  return DYNASTIES.find((d) => d.id === id);
}

/** 按时期分组（保持时期顺序与朝代顺序） */
export function dynastiesByEra(): { era: (typeof ERAS)[number]; items: Dynasty[] }[] {
  return ERAS.map((era) => ({
    era,
    items: DYNASTIES.filter((d) => d.era === era.id),
  }));
}
