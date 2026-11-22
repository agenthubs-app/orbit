/**
 * 引导期示例人物的人脉（W0005，RW-03 人脉部分）。
 *
 * 与 W0004 `demo-persona.ts` 是同一位示例人物：东京做 AI 会议纪要 SaaS 出海的创始人。
 * 30 位联系人，其中 8 位有完整详情（认识经过、互动时间线、共同话题、我能提供、对方需求、
 * 下一步）；王砚／北辰精工、佐藤美咲／丸和工业、林志远／Cloudia、铃木健、高桥由美、
 * JETRO 的山田太郎、商工会议所的中村惠、陈思远都与首页示例的故事对得上。
 * 来源：已确认的 iOrbit 计划原型里的 `PEOPLE`／`RICH`。
 *
 * 规则：
 *   - 只在前端，不写库、不进入任何接口请求；人脉页的真实组件（所有人脉、概览、关系管线、
 *     详情弹窗）直接渲染这里的数据，形状就是 `OrbitContactsViewModel`／`OrbitContactView`／
 *     `ContactsAnalysisView`，不为示例另写一份 UI；
 *   - id 统一带 `demo:` 前缀；写接口（`PATCH /api/contacts/[id]`）见到这个前缀直接拒绝，
 *     联系人详情路由在不处于示例时对它返回 404；
 *   - 日期按「东京的今天」相对生成（与首页示例同一天：王砚「昨天」通话、铃木／高桥「昨晚」
 *     导入、林志远「六周前」、JETRO 交流会在 11 天后）。
 */
import type { ContactsAnalysisView, AnalysisAction, AnalysisBucket } from "../contacts/analysis/contacts-analysis-view-model";
import type {
  OrbitContactNoteView,
  OrbitContactPipelineStatus,
  OrbitContactSource,
  OrbitContactStrength,
  OrbitContactView,
  OrbitContactsViewModel,
} from "../orbit-contacts-route-view-model";
import { DEMO_CONTACT_ID_PREFIX, isDemoContactId } from "../../../../shared/domain/guide-demo-contact";
import type { RelationshipStrength, RelationshipTier } from "../../../../shared/contract/relationship-strength";
import type { NetworkTierBoardView, NetworkTierGroup } from "../contacts/network-0918/network-model";
import type { OverviewCockpitParts } from "../contacts/network-0918/network-overview-cockpit-model";
import type { RelationshipTimelineItem } from "../../../../shared/contract/relationship-timeline";

type Lang = "en" | "ja" | "zh";
type Copy = { ja: string; zh: string; en: string };

// 示例联系人 id 规则与写接口共用（shared/domain/guide-demo-contact.ts）。
export { DEMO_CONTACT_ID_PREFIX, isDemoContactId };

/** 1 待了解 · 2 保持联系 · 3 正在推进 · 4 已归档（原型的状态编号）。 */
type DemoStatus = 1 | 2 | 3 | 4;

interface DemoSeed {
  slug: string;
  name: Copy;
  initial: Copy;
  company: Copy;
  title: Copy;
  /** 「大类 › 小类」。 */
  industry: Copy;
  source: OrbitContactSource;
  status: DemoStatus;
  /** 最近一次互动距今天几天（东京日）。 */
  daysAgo: number;
  /** 下一步；null = 原型里的「—」。`{jetro}` 会换成 JETRO 交流会的日期（今天 + 11 天）。 */
  next: Copy | null;
  location: Copy;
}

const TOKYO: Copy = { ja: "東京", zh: "东京", en: "Tokyo" };

// [原型 PEOPLE 的 30 行] 名字、公司、职位、行业、来源、状态、最近互动、下一步。
const SEEDS: readonly DemoSeed[] = [
  { slug: "wang-yan", name: { ja: "王 硯", zh: "王砚", en: "Wang Yan" }, initial: { ja: "王", zh: "王", en: "W" }, company: { ja: "北辰精工", zh: "北辰精工", en: "Hokushin Seiko" }, title: { ja: "購買部長", zh: "采购部长", en: "Head of Procurement" }, industry: { ja: "製造 › 産業機器", zh: "制造 › 工业设备", en: "Manufacturing › Industrial equipment" }, source: "event", status: 3, daysAgo: 1, next: { ja: "今日14:00に面会。IT の決裁者を紹介してもらう", zh: "今天 14:00 见面，请他介绍 IT 决策人", en: "Meet today at 14:00; ask for the IT decision-maker" }, location: TOKYO },
  { slug: "sato-misaki", name: { ja: "佐藤 美咲", zh: "佐藤美咲", en: "Sato Misaki" }, initial: { ja: "佐", zh: "佐", en: "S" }, company: { ja: "丸和工業", zh: "丸和工业", en: "Maruwa Industries" }, title: { ja: "情報システム課長", zh: "情报系统课长", en: "IT Systems Manager" }, industry: { ja: "情報通信 › 企業 IT", zh: "信息通信 › 企业 IT", en: "ICT › Enterprise IT" }, source: "scan", status: 3, daysAgo: 2, next: { ja: "20分ほど時間をもらい、トライアルの話をする", zh: "约 20 分钟，聊试用", en: "Book 20 minutes to talk about a trial" }, location: { ja: "横浜", zh: "横滨", en: "Yokohama" } },
  { slug: "lin-zhiyuan", name: { ja: "林 志遠", zh: "林志远", en: "Lin Zhiyuan" }, initial: { ja: "林", zh: "林", en: "L" }, company: { ja: "Cloudia", zh: "Cloudia", en: "Cloudia" }, title: { ja: "パートナー営業", zh: "合作伙伴营业", en: "Partner Sales" }, industry: { ja: "情報通信 › ソフトウェア販売", zh: "信息通信 › 软件分销", en: "ICT › Software distribution" }, source: "referral", status: 2, daysAgo: 45, next: { ja: "近況を聞き、代理店向けの価格を確認する", zh: "问候，问渠道定价", en: "Check in and ask about channel pricing" }, location: TOKYO },
  { slug: "suzuki-ken", name: { ja: "鈴木 健", zh: "铃木健", en: "Suzuki Ken" }, initial: { ja: "鈴", zh: "铃", en: "S" }, company: { ja: "丸和工業", zh: "丸和工业", en: "Maruwa Industries" }, title: { ja: "情報システム部 部長", zh: "情报系统部 部长", en: "Head of IT Systems" }, industry: { ja: "製造 › 産業機器", zh: "制造 › 工业设备", en: "Manufacturing › Industrial equipment" }, source: "scan", status: 1, daysAgo: 1, next: { ja: "プランで探している IT 担当者に当たるか確認する", zh: "确认是否对应计划里的 IT 负责人", en: "Check whether he is the IT lead the plan needs" }, location: { ja: "横浜", zh: "横滨", en: "Yokohama" } },
  { slug: "takahashi-yumi", name: { ja: "高橋 由美", zh: "高桥由美", en: "Takahashi Yumi" }, initial: { ja: "高", zh: "高", en: "T" }, company: { ja: "Cloudia 株式会社", zh: "Cloudia 株式会社", en: "Cloudia K.K." }, title: { ja: "パートナー営業", zh: "合作伙伴营业", en: "Partner Sales" }, industry: { ja: "情報通信 › ソフトウェア販売", zh: "信息通信 › 软件分销", en: "ICT › Software distribution" }, source: "scan", status: 1, daysAgo: 1, next: { ja: "プランで探している販売代理店に当たるか確認する", zh: "确认是否对应计划里的渠道代理商", en: "Check whether she is the channel reseller the plan needs" }, location: TOKYO },
  { slug: "yamada-taro", name: { ja: "山田 太郎", zh: "山田太郎", en: "Yamada Taro" }, initial: { ja: "山", zh: "山", en: "Y" }, company: { ja: "JETRO 東京", zh: "JETRO 东京", en: "JETRO Tokyo" }, title: { ja: "投資アドバイザー", zh: "投资咨询顾问", en: "Investment Advisor" }, industry: { ja: "公共 › 貿易振興", zh: "公共服务 › 贸易促进", en: "Public sector › Trade promotion" }, source: "event", status: 2, daysAgo: 15, next: { ja: "{jetro} の交流会でもう一度会う", zh: "{jetro} 交流会上再见一次", en: "See him again at the {jetro} mixer" }, location: TOKYO },
  { slug: "chen-siyuan", name: { ja: "陳 思遠", zh: "陈思远", en: "Chen Siyuan" }, initial: { ja: "陳", zh: "陈", en: "C" }, company: { ja: "星橋キャピタル", zh: "星桥资本", en: "Starbridge Capital" }, title: { ja: "投資マネージャー", zh: "投资经理", en: "Investment Manager" }, industry: { ja: "金融 › ベンチャーキャピタル", zh: "金融 › 风险投资", en: "Finance › Venture capital" }, source: "referral", status: 2, daysAgo: 24, next: { ja: "12月までにトライアルの進捗を共有する", zh: "12 月前同步一次试用进展", en: "Share trial progress before December" }, location: TOKYO },
  { slug: "nakamura-megumi", name: { ja: "中村 恵", zh: "中村惠", en: "Nakamura Megumi" }, initial: { ja: "中", zh: "中", en: "N" }, company: { ja: "東京商工会議所", zh: "东京商工会议所", en: "Tokyo Chamber of Commerce" }, title: { ja: "中小企業支援課", zh: "中小企业支援课", en: "SME Support" }, industry: { ja: "公共 › 商工会議所", zh: "公共服务 › 商会", en: "Public sector › Chamber of commerce" }, source: "event", status: 3, daysAgo: 9, next: { ja: "試してくれそうな会員企業を3社紹介してもらう", zh: "请她推荐 3 家愿意试点的会员企业", en: "Ask her for 3 member companies willing to pilot" }, location: TOKYO },
  { slug: "kobayashi-sho", name: { ja: "小林 翔", zh: "小林翔", en: "Kobayashi Sho" }, initial: { ja: "小", zh: "小", en: "K" }, company: { ja: "Sakura Foods", zh: "Sakura Foods", en: "Sakura Foods" }, title: { ja: "総務部長", zh: "总务部长", en: "General Affairs Director" }, industry: { ja: "飲食 › チェーン", zh: "餐饮 › 连锁", en: "Food service › Chains" }, source: "event", status: 1, daysAgo: 7, next: { ja: "会議の頻度を聞く", zh: "了解会议频率", en: "Learn how often they meet" }, location: { ja: "大阪", zh: "大阪", en: "Osaka" } },
  { slug: "ito-naoko", name: { ja: "伊藤 直子", zh: "伊藤直子", en: "Ito Naoko" }, initial: { ja: "伊", zh: "伊", en: "I" }, company: { ja: "Nexa 会計事務所", zh: "Nexa 会计事务所", en: "Nexa Accounting" }, title: { ja: "パートナー", zh: "合伙人", en: "Partner" }, industry: { ja: "専門サービス › 会計", zh: "专业服务 › 会计", en: "Professional services › Accounting" }, source: "contact", status: 2, daysAgo: 28, next: { ja: "顧客を紹介してもらう", zh: "请她介绍客户", en: "Ask her to introduce clients" }, location: TOKYO },
  { slug: "kato-ryo", name: { ja: "加藤 亮", zh: "加藤亮", en: "Kato Ryo" }, initial: { ja: "加", zh: "加", en: "K" }, company: { ja: "Kato Design", zh: "Kato Design", en: "Kato Design" }, title: { ja: "創業者", zh: "创始人", en: "Founder" }, industry: { ja: "クリエイティブ › デザイン", zh: "创意 › 设计", en: "Creative › Design" }, source: "contact", status: 2, daysAgo: 67, next: null, location: TOKYO },
  { slug: "yoshida-yu", name: { ja: "吉田 優", zh: "吉田优", en: "Yoshida Yu" }, initial: { ja: "吉", zh: "吉", en: "Y" }, company: { ja: "Mirai Logistics", zh: "Mirai Logistics", en: "Mirai Logistics" }, title: { ja: "IT 担当", zh: "IT 担当", en: "IT Coordinator" }, industry: { ja: "物流 › 倉庫", zh: "物流 › 仓储", en: "Logistics › Warehousing" }, source: "scan", status: 1, daysAgo: 5, next: { ja: "デモ動画を送る", zh: "发演示视频", en: "Send the demo video" }, location: { ja: "川崎", zh: "川崎", en: "Kawasaki" } },
  { slug: "watanabe-kenji", name: { ja: "渡辺 健二", zh: "渡边健二", en: "Watanabe Kenji" }, initial: { ja: "渡", zh: "渡", en: "W" }, company: { ja: "Watanabe Robotics", zh: "Watanabe Robotics", en: "Watanabe Robotics" }, title: { ja: "CEO", zh: "CEO", en: "CEO" }, industry: { ja: "製造 › ロボット", zh: "制造 › 机器人", en: "Manufacturing › Robotics" }, source: "event", status: 2, daysAgo: 17, next: null, location: { ja: "名古屋", zh: "名古屋", en: "Nagoya" } },
  { slug: "matsumoto-aya", name: { ja: "松本 彩", zh: "松本彩", en: "Matsumoto Aya" }, initial: { ja: "松", zh: "松", en: "M" }, company: { ja: "LinkBridge", zh: "LinkBridge", en: "LinkBridge" }, title: { ja: "事業開発マネージャー", zh: "BD 经理", en: "BD Manager" }, industry: { ja: "情報通信 › SaaS", zh: "信息通信 › SaaS", en: "ICT › SaaS" }, source: "referral", status: 3, daysAgo: 3, next: { ja: "販路の情報を交換する", zh: "交换渠道资源", en: "Swap channel contacts" }, location: TOKYO },
  { slug: "inoue-daisuke", name: { ja: "井上 大輔", zh: "井上大辅", en: "Inoue Daisuke" }, initial: { ja: "井", zh: "井", en: "I" }, company: { ja: "井上建設", zh: "Inoue 建设", en: "Inoue Construction" }, title: { ja: "経営企画", zh: "经营企划", en: "Corporate Planning" }, industry: { ja: "建設 › エンジニアリング", zh: "建筑 › 工程", en: "Construction › Engineering" }, source: "scan", status: 1, daysAgo: 5, next: { ja: "会議の進め方を聞く", zh: "了解会议流程", en: "Learn how their meetings run" }, location: { ja: "埼玉", zh: "埼玉", en: "Saitama" } },
  { slug: "kimura-mari", name: { ja: "木村 真理", zh: "木村真理", en: "Kimura Mari" }, initial: { ja: "木", zh: "木", en: "K" }, company: { ja: "Kimura Clinic", zh: "Kimura Clinic", en: "Kimura Clinic" }, title: { ja: "事務長", zh: "事务长", en: "Office Manager" }, industry: { ja: "医療 › クリニック", zh: "医疗 › 诊所", en: "Healthcare › Clinics" }, source: "contact", status: 4, daysAgo: 148, next: null, location: TOKYO },
  { slug: "lin-meiling", name: { ja: "林 美玲", zh: "林美玲", en: "Lin Meiling" }, initial: { ja: "林", zh: "林", en: "L" }, company: { ja: "ブルーオーシャン海外進出コンサルティング", zh: "蓝海出海咨询", en: "Blue Ocean Advisory" }, title: { ja: "パートナー", zh: "合伙人", en: "Partner" }, industry: { ja: "専門サービス › コンサルティング", zh: "专业服务 › 咨询", en: "Professional services › Consulting" }, source: "referral", status: 2, daysAgo: 26, next: { ja: "日本での価格設定について相談する", zh: "请教日本定价", en: "Ask about pricing in Japan" }, location: TOKYO },
  { slug: "zhang-hao", name: { ja: "張 浩", zh: "张浩", en: "Zhang Hao" }, initial: { ja: "張", zh: "张", en: "Z" }, company: { ja: "雲帆テック", zh: "云帆科技", en: "Yunfan Tech" }, title: { ja: "CTO", zh: "CTO", en: "CTO" }, industry: { ja: "情報通信 › 企業向けソフトウェア", zh: "信息通信 › 企业软件", en: "ICT › Enterprise software" }, source: "contact", status: 2, daysAgo: 40, next: null, location: { ja: "上海", zh: "上海", en: "Shanghai" } },
  { slug: "saito-hikaru", name: { ja: "斎藤 光", zh: "斋藤光", en: "Saito Hikaru" }, initial: { ja: "斎", zh: "斋", en: "S" }, company: { ja: "Saito Printing", zh: "Saito Printing", en: "Saito Printing" }, title: { ja: "社長", zh: "社长", en: "President" }, industry: { ja: "製造 › 印刷", zh: "制造 › 印刷", en: "Manufacturing › Printing" }, source: "event", status: 1, daysAgo: 7, next: { ja: "来週の電話を約束する", zh: "约下周电话", en: "Set up a call next week" }, location: TOKYO },
  { slug: "shimizu-nana", name: { ja: "清水 奈々", zh: "清水奈奈", en: "Shimizu Nana" }, initial: { ja: "清", zh: "清", en: "S" }, company: { ja: "Shimizu HR", zh: "Shimizu HR", en: "Shimizu HR" }, title: { ja: "人事コンサルタント", zh: "HR 顾问", en: "HR Consultant" }, industry: { ja: "専門サービス › 人材", zh: "专业服务 › 人力", en: "Professional services › HR" }, source: "manual", status: 2, daysAgo: 53, next: null, location: TOKYO },
  { slug: "yamaguchi-takashi", name: { ja: "山口 隆", zh: "山口隆", en: "Yamaguchi Takashi" }, initial: { ja: "山", zh: "山", en: "Y" }, company: { ja: "山口商事", zh: "Yamaguchi 商事", en: "Yamaguchi Trading" }, title: { ja: "IT 担当者", zh: "IT 负责人", en: "IT Lead" }, industry: { ja: "商社 › 卸売", zh: "贸易 › 批发", en: "Trade › Wholesale" }, source: "scan", status: 3, daysAgo: 4, next: { ja: "トライアルの案内を送る", zh: "发试用邀请", en: "Send a trial invitation" }, location: TOKYO },
  { slug: "morita-ai", name: { ja: "森田 愛", zh: "森田爱", en: "Morita Ai" }, initial: { ja: "森", zh: "森", en: "M" }, company: { ja: "森田食品", zh: "Morita 食品", en: "Morita Foods" }, title: { ja: "総務課長", zh: "总务课长", en: "General Affairs Manager" }, industry: { ja: "食品 › 加工", zh: "食品 › 加工", en: "Food › Processing" }, source: "event", status: 1, daysAgo: 7, next: { ja: "議事録の取り方を聞く", zh: "了解会议记录方式", en: "Learn how they take meeting notes" }, location: { ja: "千葉", zh: "千叶", en: "Chiba" } },
  { slug: "ikeda-wataru", name: { ja: "池田 航", zh: "池田航", en: "Ikeda Wataru" }, initial: { ja: "池", zh: "池", en: "I" }, company: { ja: "Ikeda Partners", zh: "Ikeda Partners", en: "Ikeda Partners" }, title: { ja: "弁護士", zh: "律师", en: "Lawyer" }, industry: { ja: "専門サービス › 法律", zh: "专业服务 › 法律", en: "Professional services › Legal" }, source: "referral", status: 2, daysAgo: 74, next: null, location: TOKYO },
  { slug: "hashimoto-sa", name: { ja: "橋本 紗", zh: "桥本纱", en: "Hashimoto Sa" }, initial: { ja: "橋", zh: "桥", en: "H" }, company: { ja: "Hashimoto Travel", zh: "Hashimoto Travel", en: "Hashimoto Travel" }, title: { ja: "マーケティング部", zh: "市场部", en: "Marketing" }, industry: { ja: "観光 › 旅行", zh: "文旅 › 旅行", en: "Travel › Tourism" }, source: "manual", status: 4, daysAgo: 169, next: null, location: { ja: "京都", zh: "京都", en: "Kyoto" } },
  { slug: "fujita-makoto", name: { ja: "藤田 誠", zh: "藤田诚", en: "Fujita Makoto" }, initial: { ja: "藤", zh: "藤", en: "F" }, company: { ja: "藤田電機", zh: "Fujita 电机", en: "Fujita Electric" }, title: { ja: "情報システム課", zh: "情报系统课", en: "IT Systems" }, industry: { ja: "製造 › 電子機器", zh: "制造 › 电子", en: "Manufacturing › Electronics" }, source: "scan", status: 1, daysAgo: 5, next: { ja: "デモ動画を送る", zh: "发演示视频", en: "Send the demo video" }, location: TOKYO },
  { slug: "okada-hitomi", name: { ja: "岡田 瞳", zh: "冈田瞳", en: "Okada Hitomi" }, initial: { ja: "岡", zh: "冈", en: "O" }, company: { ja: "岡田不動産", zh: "Okada 不动产", en: "Okada Real Estate" }, title: { ja: "経営企画", zh: "经营企划", en: "Corporate Planning" }, industry: { ja: "不動産 › 仲介", zh: "房地产 › 中介", en: "Real estate › Brokerage" }, source: "event", status: 2, daysAgo: 30, next: null, location: TOKYO },
  { slug: "zhou-ning", name: { ja: "周 寧", zh: "周宁", en: "Zhou Ning" }, initial: { ja: "周", zh: "周", en: "Z" }, company: { ja: "東京華人起業家の会", zh: "东京华人创业会", en: "Tokyo Chinese Founders Club" }, title: { ja: "事務局長", zh: "秘书长", en: "Secretary General" }, industry: { ja: "コミュニティ › スタートアップ", zh: "社群 › 创业", en: "Community › Startups" }, source: "event", status: 2, daysAgo: 13, next: { ja: "次のイベントを共催する", zh: "下次活动一起办", en: "Co-host the next event" }, location: TOKYO },
  { slug: "maeda-yu", name: { ja: "前田 悠", zh: "前田悠", en: "Maeda Yu" }, initial: { ja: "前", zh: "前", en: "M" }, company: { ja: "Maeda Tech", zh: "Maeda Tech", en: "Maeda Tech" }, title: { ja: "エンジニアリングマネージャー", zh: "工程经理", en: "Engineering Manager" }, industry: { ja: "情報通信 › 企業 IT", zh: "信息通信 › 企业 IT", en: "ICT › Enterprise IT" }, source: "contact", status: 2, daysAgo: 49, next: null, location: TOKYO },
  { slug: "ishikawa-riko", name: { ja: "石川 莉子", zh: "石川莉子", en: "Ishikawa Riko" }, initial: { ja: "石", zh: "石", en: "I" }, company: { ja: "石川酒造", zh: "Ishikawa 酒造", en: "Ishikawa Brewery" }, title: { ja: "専務", zh: "专务", en: "Senior Managing Director" }, industry: { ja: "食品 › 酒類", zh: "食品 › 酒类", en: "Food › Sake & spirits" }, source: "manual", status: 4, daysAgo: 191, next: null, location: { ja: "新潟", zh: "新潟", en: "Niigata" } },
  { slug: "hasegawa-jin", name: { ja: "長谷川 仁", zh: "长谷川仁", en: "Hasegawa Jin" }, initial: { ja: "長", zh: "长", en: "H" }, company: { ja: "長谷川物産", zh: "Hasegawa 物产", en: "Hasegawa Bussan" }, title: { ja: "IT 推進室", zh: "IT 推进室", en: "IT Promotion Office" }, industry: { ja: "商社 › 卸売", zh: "贸易 › 批发", en: "Trade › Wholesale" }, source: "scan", status: 1, daysAgo: 5, next: { ja: "会議の進め方を聞く", zh: "了解会议流程", en: "Learn how their meetings run" }, location: TOKYO },
];

interface DemoRich {
  met: Copy;
  /** [距今天几天, 钟点, 内容]，新的在前。 */
  interactions: readonly (readonly [number, string, Copy])[];
  topics: readonly Copy[];
  offer: readonly Copy[];
  need: readonly Copy[];
  /** 第一条是下一步，第二条（若有）是它的补充。 */
  next: readonly Copy[];
}

// [原型 RICH 的 8 位] 完整详情。
const RICH: Readonly<Record<string, DemoRich>> = {
  "wang-yan": {
    met: { ja: "札幌の産業展示会", zh: "札幌工业展会", en: "Sapporo industrial expo" },
    interactions: [
      [1, "17:30", { ja: "電話：システム購入の決裁者は IT 部門の鈴木さんだと聞いた", zh: "电话：他说 IT 部门的铃木是系统采购的决策人", en: "Call: he said Suzuki in IT is the one who decides on system purchases" }],
      [5, "15:30", { ja: "札幌の展示会ブースで15分話した。日本語の議事録に関心あり", zh: "札幌展会展位聊了 15 分钟，对日语会议纪要感兴趣", en: "Talked for 15 minutes at the Sapporo expo booth; interested in Japanese meeting notes" }],
    ],
    topics: [{ ja: "製造業のデジタル化", zh: "制造业数字化", en: "Manufacturing digitalisation" }, { ja: "日本語での会議", zh: "日语会议", en: "Meetings in Japanese" }],
    offer: [{ ja: "トライアル枠", zh: "试用名额", en: "A trial seat" }, { ja: "日本語の議事録づくり", zh: "日语会议纪要整理", en: "Japanese meeting-note write-ups" }],
    need: [{ ja: "議事録にかける時間を減らしたい", zh: "减少会议记录时间", en: "Spend less time on meeting notes" }, { ja: "現場の会議を記録に残したい", zh: "现场会议留痕", en: "A record of shop-floor meetings" }],
    next: [{ ja: "今日会うときに鈴木さんを紹介してもらう", zh: "今天见面时请他引荐铃木", en: "Ask him to introduce Suzuki when you meet today" }, { ja: "面会後に1分のデモ動画を送る", zh: "会后发 1 分钟演示视频", en: "Send the 1-minute demo video afterwards" }],
  },
  "sato-misaki": {
    met: { ja: "名刺の取り込み", zh: "名片导入", en: "Business card import" },
    interactions: [[2, "10:20", { ja: "メール：いまは Word で手書きメモを取り、会議のたびに30分かけて整理しているとのこと", zh: "邮件：她说现在用 Word 手记，每次会后 30 分钟整理", en: "Email: they take notes by hand in Word and spend 30 minutes after every meeting" }]],
    topics: [{ ja: "会議の効率", zh: "会议效率", en: "Meeting efficiency" }, { ja: "IT 予算", zh: "IT 预算", en: "IT budget" }],
    offer: [{ ja: "無料トライアル", zh: "免费试用", en: "A free trial" }, { ja: "導入サポート", zh: "导入支持", en: "Onboarding support" }],
    need: [{ ja: "整理の手間を減らしたい", zh: "省整理时间", en: "Less time tidying notes" }, { ja: "簡単に使い始めたい", zh: "简单好上手", en: "Easy to pick up" }],
    next: [{ ja: "20分のオンライン面談を設定する", zh: "约 20 分钟线上聊", en: "Book a 20-minute online call" }, { ja: "トライアルの提案を持っていく", zh: "带上试用方案", en: "Bring the trial offer" }],
  },
  "lin-zhiyuan": {
    met: { ja: "知人の紹介 · 陳 思遠", zh: "朋友引荐 · 陈思远", en: "Referred by Chen Siyuan" },
    interactions: [[45, "10:00", { ja: "メール：日本の SaaS 代理店のレベニューシェアについて話した", zh: "邮件：聊了日本 SaaS 渠道的分成方式", en: "Email: talked about revenue share for SaaS channels in Japan" }]],
    topics: [{ ja: "SaaS の販路", zh: "SaaS 渠道", en: "SaaS channels" }, { ja: "価格設定", zh: "定价", en: "Pricing" }],
    offer: [{ ja: "製品ライセンス", zh: "产品授权", en: "Product licensing" }, { ja: "共同マーケティング", zh: "联合营销", en: "Joint marketing" }],
    need: [{ ja: "新しい商材", zh: "新产品线", en: "New product lines" }],
    next: [{ ja: "近況を聞き、代理店向けの価格を確認する（1週間延期済み）", zh: "发问候，问渠道定价（已延后 1 周）", en: "Check in and ask about channel pricing (postponed a week)" }],
  },
  "suzuki-ken": {
    met: { ja: "名刺の取り込み · 昨夜", zh: "名片导入 · 昨晚", en: "Business card import · last night" },
    interactions: [],
    topics: [{ ja: "システムの購入", zh: "系统采购", en: "System purchasing" }],
    offer: [{ ja: "トライアル", zh: "试用", en: "A trial" }],
    need: [{ ja: "これから確認", zh: "待了解", en: "To find out" }],
    next: [{ ja: "プランの「中小企業の IT 担当者」に当たるか確認する", zh: "确认是否对应计划里的『中小企业 IT 负责人』", en: "Check whether he matches the plan's “SME IT lead”" }],
  },
  "takahashi-yumi": {
    met: { ja: "名刺の取り込み · 昨夜", zh: "名片导入 · 昨晚", en: "Business card import · last night" },
    interactions: [],
    topics: [{ ja: "販路での協業", zh: "渠道合作", en: "Channel partnerships" }],
    offer: [{ ja: "代理店のレベニューシェア", zh: "渠道分成", en: "Channel revenue share" }],
    need: [{ ja: "これから確認", zh: "待了解", en: "To find out" }],
    next: [{ ja: "プランの「SaaS 販売代理店」に当たるか確認する", zh: "确认是否对应计划里的『SaaS 渠道代理商』", en: "Check whether she matches the plan's “SaaS channel reseller”" }],
  },
  "yamada-taro": {
    met: { ja: "JETRO 説明会", zh: "JETRO 说明会", en: "JETRO briefing" },
    interactions: [[15, "16:00", { ja: "説明会のあと名刺交換。外資系企業の窓口を担当", zh: "说明会后交换名片，他负责外资企业对接", en: "Swapped cards after the briefing; he looks after foreign companies" }]],
    topics: [{ ja: "日本での拠点設立", zh: "在日设立", en: "Setting up in Japan" }, { ja: "企業の紹介", zh: "企业介绍", en: "Company introductions" }],
    offer: [{ ja: "製品デモ", zh: "产品演示", en: "A product demo" }],
    need: [{ ja: "有望な海外企業", zh: "有潜力的海外企业", en: "Promising overseas companies" }],
    next: [{ ja: "{jetro} の交流会でもう一度会う", zh: "{jetro} 交流会上再见一次", en: "See him again at the {jetro} mixer" }],
  },
  "chen-siyuan": {
    met: { ja: "知人の紹介", zh: "朋友引荐", en: "Referral" },
    interactions: [[24, "09:30", { ja: "お茶：AI アプリの海外展開に注目していて、日本でのトライアルデータを見たいとのこと", zh: "咖啡：他关注 AI 应用出海，想看日本试用数据", en: "Coffee: he follows AI apps going abroad and wants to see Japan trial data" }]],
    topics: [{ ja: "AI アプリ", zh: "AI 应用", en: "AI applications" }, { ja: "海外展開", zh: "出海", en: "Going global" }],
    offer: [{ ja: "進捗の共有", zh: "进展同步", en: "Progress updates" }],
    need: [{ ja: "トライアルのデータ", zh: "试用数据", en: "Trial data" }],
    next: [{ ja: "12月までにトライアルの進捗を共有する", zh: "12 月前同步一次试用进展", en: "Share trial progress before December" }],
  },
  "nakamura-megumi": {
    met: { ja: "商工会議所のセミナー", zh: "商工会议所研讨会", en: "Chamber of commerce seminar" },
    interactions: [[9, "17:00", { ja: "セミナーのあと、会員企業のデジタル化ニーズについて話した", zh: "研讨会后聊了会员企业的数字化需求", en: "After the seminar we talked about members' digitalisation needs" }]],
    topics: [{ ja: "中小企業の DX", zh: "中小企业 DX", en: "SME DX" }],
    offer: [{ ja: "会員企業での試験導入", zh: "会员企业试点", en: "Pilots with member companies" }],
    need: [{ ja: "会員にすすめられるツール", zh: "可推荐给会员的工具", en: "Tools she can recommend to members" }],
    next: [{ ja: "試してくれそうな会員企業を3社紹介してもらう", zh: "请她推荐 3 家愿意试点的会员企业", en: "Ask her for 3 member companies willing to pilot" }],
  },
};

/** 示例联系人总数（原型 `PEOPLE` 的行数）。 */
export const DEMO_NETWORK_SIZE = SEEDS.length;
/** 有完整详情的示例联系人。 */
export const DEMO_RICH_CONTACT_IDS: readonly string[] = Object.keys(RICH).map((slug) => `${DEMO_CONTACT_ID_PREFIX}${slug}`);

const SOURCE_COPY: Record<OrbitContactSource, Copy> = {
  contact: { ja: "連絡先", zh: "通讯录", en: "Address book" },
  event: { ja: "イベントで知り合った", zh: "活动认识", en: "Met at an event" },
  exchange: { ja: "その他", zh: "其他来源", en: "Other" },
  manual: { ja: "その他", zh: "其他来源", en: "Other" },
  qr: { ja: "その他", zh: "其他来源", en: "Other" },
  referral: { ja: "知人の紹介", zh: "朋友引荐", en: "Referral" },
  scan: { ja: "名刺の取り込み", zh: "名片导入", en: "Business card import" },
};

const STATUS: Record<DemoStatus, {
  pipeline: OrbitContactPipelineStatus;
  relationship: NonNullable<OrbitContactView["relationshipStatus"]>;
  stage: Copy;
  strength: OrbitContactStrength;
  /** W0047：示例的静态档位（不计算、不读任何来源）。 */
  tier: RelationshipTier;
  dormant: boolean;
}> = {
  1: { pipeline: "to_contact", relationship: "needs_follow_up", stage: { ja: "これから確認", zh: "待了解", en: "Explore" }, strength: "weak", tier: "new", dormant: false },
  2: { pipeline: "in_progress", relationship: "nurture", stage: { ja: "つながりを保つ", zh: "保持联系", en: "Keep in touch" }, strength: "medium", tier: "active", dormant: false },
  3: { pipeline: "in_progress", relationship: "active", stage: { ja: "進行中", zh: "正在推进", en: "Advancing" }, strength: "strong", tier: "core", dormant: false },
  4: { pipeline: "archived", relationship: "archived", stage: { ja: "アーカイブ済み", zh: "已归档", en: "Archived" }, strength: "dormant", tier: "active", dormant: true },
};

function demoTierGroup(status: DemoStatus): NetworkTierGroup {
  return STATUS[status].dormant ? "dormant" : STATUS[status].tier;
}

/* ── 日期（东京日） ─────────────────────────────────────────────────── */

/** 东京的 `YYYY-MM-DD`（与 iOrbit 概览同一切日口径）。 */
function tokyoDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric" }).format(date);
}

function shiftDay(dayKey: string, days: number): string {
  const noon = new Date(`${dayKey}T12:00:00+09:00`);
  return tokyoDayKey(new Date(noon.getTime() + days * 86_400_000));
}

function monthDay(dayKey: string): string {
  const [, month, day] = dayKey.split("-").map(Number);
  return `${month}/${day}`;
}

interface DemoContext {
  lang: Lang;
  today: string;
}

function context(real: Date, lang: Lang): DemoContext {
  return { lang, today: tokyoDayKey(real) };
}

function say(ctx: DemoContext, copy: Copy): string {
  return copy[ctx.lang].replaceAll("{jetro}", monthDay(shiftDay(ctx.today, 11)));
}

/**
 * 时间线条目的标题槽是 `{ zh, en }`（共享契约，没有 ja）。示例按当前语言单语生成，
 * 两个槽放同一句，日文界面因此也显示日文。
 */
function timelineTitle(ctx: DemoContext, copy: Copy): { zh: string; en: string } {
  const text = say(ctx, copy);
  return { zh: text, en: text };
}

/** 列表「最近互动」列：今天／昨天／M/D。 */
function lastLabel(ctx: DemoContext, daysAgo: number): string {
  if (daysAgo === 0) return say(ctx, { ja: "今日", zh: "今天", en: "Today" });
  if (daysAgo === 1) return say(ctx, { ja: "昨日", zh: "昨天", en: "Yesterday" });
  return monthDay(shiftDay(ctx.today, -daysAgo));
}

/**
 * 时间线时间戳。详情弹窗按 UTC 分量显示（`formatNoteTime`，保证服务端与客户端一致），
 * 所以这里把东京的「那天 + 钟点」直接写成 UTC 分量，弹窗里看到的就是东京的钟点。
 */
function noteAt(ctx: DemoContext, daysAgo: number, time: string): string {
  return `${shiftDay(ctx.today, -daysAgo)}T${time}:00.000Z`;
}

/* ── 视图数据 ───────────────────────────────────────────────────────── */

function baseContact(ctx: DemoContext, seed: DemoSeed): OrbitContactView {
  const status = STATUS[seed.status];
  const next = seed.next ? say(ctx, seed.next) : "";
  return {
    company: say(ctx, seed.company),
    dormant: seed.status === 4,
    displayName: say(ctx, seed.name),
    email: "",
    encounters: [],
    g: "g-violet",
    id: `${DEMO_CONTACT_ID_PREFIX}${seed.slug}`,
    industry: say(ctx, seed.industry),
    initial: say(ctx, seed.initial),
    lastEventId: "",
    lastInteraction: lastLabel(ctx, seed.daysAgo),
    lineId: "",
    location: say(ctx, seed.location),
    met: say(ctx, RICH[seed.slug]?.met ?? SOURCE_COPY[seed.source]),
    nextAction: next ? { reason: "", text: next } : null,
    note: "",
    notes: [],
    offering: "",
    phone: "",
    pipelineStatus: status.pipeline,
    relationshipStatus: status.relationship,
    seeking: "",
    source: seed.source,
    stage: say(ctx, status.stage),
    strength: status.strength,
    title: say(ctx, seed.title),
    valueTags: (RICH[seed.slug]?.topics ?? []).map((topic) => say(ctx, topic)),
    wechat: "",
  };
}

/** 「所有人脉」／概览／关系管线用的列表数据（30 位）。 */
export function buildDemoNetworkViewModel(real: Date, lang: Lang): OrbitContactsViewModel {
  const ctx = context(real, lang);
  return { connections: SEEDS.map((seed) => baseContact(ctx, seed)), events: [], intros: [], pipelineStatuses: [] };
}

/**
 * W0047：示例管线看板（静态档位，前端数据，0 请求）。列头人数统计全部示例联系人，卡片按最近往来倒序至多 30。
 */
export function buildDemoNetworkTierBoard(): NetworkTierBoardView {
  const counts: Record<NetworkTierGroup, number> = { new: 0, active: 0, core: 0, dormant: 0 };
  const columns: Record<NetworkTierGroup, string[]> = { new: [], active: [], core: [], dormant: [] };
  for (const seed of [...SEEDS].sort((a, b) => a.daysAgo - b.daysAgo)) {
    const group = demoTierGroup(seed.status);
    counts[group] += 1;
    if (columns[group].length < 30) columns[group].push(`${DEMO_CONTACT_ID_PREFIX}${seed.slug}`);
  }
  return { counts, columns };
}

/**
 * 详情弹窗数据：8 位完整（时间线、话题、我能提供、对方需求、下一步），其余是简版
 * （一条上次互动、行业小类作话题、需求「待了解」），与原型 `personModal` 一致。
 * 不认识的 id 返回 null。
 */
export function buildDemoNetworkDetail(id: string, real: Date, lang: Lang): OrbitContactView | null {
  if (!isDemoContactId(id)) return null;
  const seed = SEEDS.find((item) => `${DEMO_CONTACT_ID_PREFIX}${item.slug}` === id);
  if (!seed) return null;
  const ctx = context(real, lang);
  const base = baseContact(ctx, seed);
  const rich = RICH[seed.slug];
  const industryLeaf = say(ctx, seed.industry).split(" › ").at(-1) ?? base.industry;
  const interactions: readonly (readonly [number, string, Copy])[] = rich
    ? rich.interactions
    : [[seed.daysAgo, "10:00", { ja: "前回のやりとり（サンプルの簡易版）", zh: "上次互动（示例简版详情）", en: "Last interaction (short demo detail)" }]];
  const notes: OrbitContactNoteView[] = interactions.map(([daysAgo, time, body], index) => ({
    body: say(ctx, body),
    createdAt: noteAt(ctx, daysAgo, time),
    id: `${id}:note-${index + 1}`,
    privacy: "private",
  }));
  const nextSteps = rich ? rich.next.map((step) => say(ctx, step)) : base.nextAction ? [base.nextAction.text] : [];
  const latest = notes[0];
  return {
    ...base,
    encounters: [
      {
        context: {
          metAt: base.met,
          publicProfile: {
            bio: "",
            conversationPrompts: [],
            industry: base.industry,
            intro: "",
            offering: rich ? rich.offer.map((item) => say(ctx, item)) : [],
            seeking: rich ? rich.need.map((item) => say(ctx, item)) : [say(ctx, { ja: "これから確認", zh: "待了解", en: "To find out" })],
            topics: rich ? rich.topics.map((item) => say(ctx, item)) : [industryLeaf],
          },
          reason: "",
          score: 0,
          tableNo: 0,
        },
        createdAt: latest?.createdAt ?? noteAt(ctx, seed.daysAgo, "10:00"),
        eventId: "",
        id: `${id}:encounter`,
      },
    ],
    // 真实详情里 lastInteraction 是最近一次互动的摘要，时间在 editableInteraction 里。
    editableInteraction: latest ? { channel: "manual_note", occurredAt: latest.createdAt, summary: latest.body } : undefined,
    lastInteraction: latest?.body ?? "",
    nextAction: nextSteps[0] ? { reason: nextSteps[1] ?? "", text: nextSteps[0] } : null,
    notes,
    // W0046：示例时间线是前端静态数据（memo 由示例互动生成，外加「建立联系」一条），不读任何来源。
    timeline: {
      items: [
        ...notes.map((note) => ({
          id: `memo:${note.id}`,
          source: "memo" as const,
          contactId: id,
          occurredAt: note.createdAt,
          occurredAtPrecision: "instant" as const,
          title: timelineTitle(ctx, { ja: "メモを書いた", zh: "写了 memo", en: "Wrote a memo" }),
          excerpt: note.body,
          ref: { store: "contact_detail_states" as const, recordId: `demo:${id}`, subId: note.id },
        })),
        {
          id: `capture:${id}`,
          source: "capture" as const,
          contactId: id,
          occurredAt: noteAt(ctx, seed.daysAgo + 30, "10:00"),
          occurredAtPrecision: "instant" as const,
          title: timelineTitle(ctx, { ja: "イベントで名刺交換", zh: "在活动中交换名片", en: "Exchanged cards at an event" }),
          ref: { store: "contacts" as const, recordId: id },
          detail: { captureMethod: "event_exchange" as const },
        },
      ].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0)),
      unavailableSources: [],
    },
    relationshipStrength: demoStrength(id, seed, notes),
  };
}

/** W0047：示例详情的静态强度——档位来自示例状态，依据 = 示例互动（memo）与建立联系，不显示分数。 */
function demoStrength(id: string, seed: DemoSeed, notes: readonly OrbitContactNoteView[]): RelationshipStrength {
  const status = STATUS[seed.status];
  return {
    contactId: id,
    tier: status.tier,
    dormant: status.dormant,
    score: 0,
    peakScore: 0,
    lastSignalAt: notes[0]?.createdAt ?? null,
    signals: notes.slice(0, 12).map((note) => ({ timelineItemId: `memo:${note.id}`, source: "memo" as const, occurredAt: note.createdAt, basePoints: 15, points: 15 })),
    computedAt: notes[0]?.createdAt ?? "",
    rulesVersion: "demo",
  };
}

/* ── 概览／关系管线的分析数据 ───────────────────────────────────────── */

/** 计数分桶：前 `limit` 个按人数从多到少，其余并成「其他」。 */
function buckets(dimension: string, labels: readonly string[], otherLabel: string, limit = 6): AnalysisBucket[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, [, n]) => sum + n, 0);
  const rows = rest > 0 ? [...head, [otherLabel, rest] as const] : head;
  return rows.map(([label, count], index) => ({
    count,
    href: `/app/contacts/analysis/${dimension}/demo-${index}`,
    id: `demo-${dimension}-${index}`,
    label,
    missingData: false,
    percentage: Math.round((count / labels.length) * 100),
  }));
}

function demoAction(ctx: DemoContext, input: { id: string; slug: string; title: Copy; judgment: Copy; due: Copy }): AnalysisAction {
  const seed = SEEDS.find((item) => item.slug === input.slug);
  return {
    contactName: seed ? say(ctx, seed.name) : "",
    dueLabel: say(ctx, input.due),
    id: input.id,
    judgment: say(ctx, input.judgment),
    primary: {
      href: `/app/contacts/${encodeURIComponent(`${DEMO_CONTACT_ID_PREFIX}${input.slug}`)}`,
      label: say(ctx, { ja: "連絡先を見る", zh: "查看联系人", en: "View contact" }),
    },
    title: say(ctx, input.title),
  };
}

/**
 * 概览（人脉分布、AI 人脉驾驶舱、最近动态）与关系管线（AI 人脉建议）用的分析数据，
 * 数字都从上面 30 位示例联系人算出来。目标／覆盖度／报告不在这两屏上，标为 unavailable。
 */
export function buildDemoNetworkAnalysis(real: Date, lang: Lang): ContactsAnalysisView {
  const ctx = context(real, lang);
  const other = say(ctx, { ja: "その他", zh: "其他", en: "Other" });
  const live = SEEDS.filter((seed) => seed.status !== 4);
  const count = (predicate: (seed: DemoSeed) => boolean) => SEEDS.filter(predicate).length;
  // W0047：关系健康 = 静态档位分布（与示例管线同一口径）。
  const health = (["core", "active", "new", "dormant"] as const).map((id) => {
    const n = SEEDS.filter((seed) => demoTierGroup(seed.status) === id).length;
    return { count: n, id, percentage: Math.round((n / SEEDS.length) * 100) };
  }).filter((row) => row.count > 0);
  const at = (daysAgo: number, time: string) => new Date(`${shiftDay(ctx.today, -daysAgo)}T${time}:00+09:00`).toISOString();

  return {
    // 名字单独放在 contactName（概览给它挂「示例」角标），label 里不再嵌人名。
    activity: [
      { contactName: say(ctx, { ja: "鈴木 健", zh: "铃木健", en: "Suzuki Ken" }), id: "demo-activity-suzuki", label: say(ctx, { ja: "名刺を取り込んだ", zh: "导入名片", en: "Business card imported" }), occurredAt: at(1, "22:14"), source: say(ctx, { ja: "名刺の取り込み", zh: "名片导入", en: "Business card import" }) },
      { contactName: say(ctx, { ja: "高橋 由美", zh: "高桥由美", en: "Takahashi Yumi" }), id: "demo-activity-takahashi", label: say(ctx, { ja: "名刺を取り込んだ", zh: "导入名片", en: "Business card imported" }), occurredAt: at(1, "22:14"), source: say(ctx, { ja: "名刺の取り込み", zh: "名片导入", en: "Business card import" }) },
      { contactName: say(ctx, { ja: "王 硯", zh: "王砚", en: "Wang Yan" }), id: "demo-activity-wang", label: say(ctx, { ja: "電話：IT 部門のシステム購入の決裁者がわかった", zh: "电话：确认了 IT 部门的系统采购决策人", en: "Call: found out who in IT decides on systems" }), occurredAt: at(1, "17:30"), source: say(ctx, { ja: "進捗メモ", zh: "进展记录", en: "Progress log" }) },
      { contactName: say(ctx, { ja: "佐藤 美咲", zh: "佐藤美咲", en: "Sato Misaki" }), id: "demo-activity-sato", label: say(ctx, { ja: "返信：会議後の整理に30分かかっている", zh: "回邮件：会后要花 30 分钟整理", en: "Replied: 30 minutes of notes after each meeting" }), occurredAt: at(2, "10:20"), source: say(ctx, { ja: "メール", zh: "邮件", en: "Email" }) },
    ],
    analysis: { state: "unavailable" },
    coverage: { state: "unavailable" },
    generatedAt: real.toISOString(),
    goal: { state: "unavailable" },
    metrics: {
      contacts: SEEDS.length,
      dormant: count((seed) => seed.status !== 4 && seed.daysAgo >= 60),
      highValue: count((seed) => seed.status === 3),
      newContacts: count((seed) => seed.status === 1 && seed.daysAgo <= 7),
      pendingFollowups: count((seed) => seed.status !== 4 && seed.next !== null),
    },
    opportunities: {
      data: {
        // 人名在 contactName（管线给它挂「示例」角标），标题与判断里不再嵌人名。
        actions: [
          demoAction(ctx, { due: { ja: "今日", zh: "今天", en: "Today" }, id: "demo-opp-wang", judgment: { ja: "プランの第1段階では中小企業の IT 担当者に会う必要があります。前回の電話で、システム購入を決めるのは IT 部門だと聞きました。", zh: "计划第 1 阶段要认识中小企业 IT 负责人；上次通话他提到 IT 部门才是系统采购的决策方。", en: "Phase 1 needs an SME IT lead; on the last call he said IT decides on systems." }, slug: "wang-yan", title: { ja: "14:00に面会し、IT の決裁者を紹介してもらう", zh: "14:00 见面，请他引荐 IT 决策人", en: "Meet at 14:00 and ask for an intro to the IT decision-maker" } }),
          demoAction(ctx, { due: { ja: "今週", zh: "本周", en: "This week" }, id: "demo-opp-sato", judgment: { ja: "いまは Word で手書きメモを取り、会議のたびに30分かけて整理している。まさにトライアルで解決できることです。", zh: "她们现在用 Word 手记，每次会后花 30 分钟整理，正是试用要解决的事。", en: "They take notes by hand and spend 30 minutes after each meeting — exactly what the trial fixes." }, slug: "sato-misaki", title: { ja: "20分ほど時間をもらい、トライアルの話をする", zh: "约 20 分钟，聊试用", en: "Book 20 minutes to talk about a trial" } }),
          demoAction(ctx, { due: { ja: "今日", zh: "今天", en: "Today" }, id: "demo-opp-suzuki", judgment: { ja: "昨夜取り込んだ名刺。役職がプランで探している「中小企業の IT 担当者」に合っています。", zh: "昨晚导入的名片，职位和计划里要找的「中小企业 IT 负责人」对得上。", en: "Imported last night; the role matches the plan's “SME IT lead”." }, slug: "suzuki-ken", title: { ja: "プランで探している IT 担当者に当たるか確認する", zh: "确认是否对应计划里的 IT 负责人", en: "Check whether he is the IT lead the plan needs" } }),
          demoAction(ctx, { due: { ja: "今週", zh: "本周", en: "This week" }, id: "demo-opp-nakamura", judgment: { ja: "商工会議所には、デジタルツールを試したい会員企業があります。", zh: "商工会议所有愿意尝试数字化工具的会员企业。", en: "The chamber has member companies open to trying digital tools." }, slug: "nakamura-megumi", title: { ja: "試験導入の会員企業を3社紹介してもらう", zh: "请她推荐 3 家试点会员企业", en: "Ask her for 3 pilot member companies" } }),
          demoAction(ctx, { due: { ja: "1週間延期済み", zh: "已延后 1 周", en: "Postponed a week" }, id: "demo-opp-lin", judgment: { ja: "日本の SaaS 代理店のレベニューシェアについて話したのは6週間前です。", zh: "上次聊日本 SaaS 渠道分成是六周前。", en: "You last talked about channel revenue share six weeks ago." }, slug: "lin-zhiyuan", title: { ja: "近況を聞き、代理店向けの価格を確認する", zh: "问候，问渠道定价", en: "Check in and ask about channel pricing" } }),
          demoAction(ctx, { due: { ja: "12月まで", zh: "12 月前", en: "Before December" }, id: "demo-opp-chen", judgment: { ja: "AI アプリの海外展開に注目していて、日本でのトライアルデータを見たがっています。", zh: "他关注 AI 应用出海，想看日本的试用数据。", en: "He follows AI apps going abroad and wants Japan trial data." }, slug: "chen-siyuan", title: { ja: "トライアルの進捗を共有する", zh: "同步一次试用进展", en: "Share trial progress" } }),
        ],
        dormant: SEEDS.filter((seed) => seed.status !== 4 && seed.daysAgo >= 60).map((seed) => ({
          action: say(ctx, { ja: "ひとこと近況を送る", zh: "发一条问候", en: "Send a quick hello" }),
          href: `/app/contacts/${encodeURIComponent(`${DEMO_CONTACT_ID_PREFIX}${seed.slug}`)}`,
          id: `${DEMO_CONTACT_ID_PREFIX}${seed.slug}`,
          name: say(ctx, seed.name),
          reason: say(ctx, { ja: "2か月以上連絡していません", zh: "两个多月没联系了", en: "Quiet for over two months" }),
        })),
        summary: "",
      },
      state: "ready",
    },
    state: "ready",
    structure: {
      data: {
        dimensions: {
          industry: buckets("industry", SEEDS.map((seed) => say(ctx, seed.industry).split(" › ")[0] ?? ""), other),
          location: buckets("location", SEEDS.map((seed) => say(ctx, seed.location)), other),
          relationship: [],
          role: [],
        },
        health,
        summary: "",
      },
      state: "ready",
    },
    summary: "",
  };
}

/* ── 概览驾驶舱（W0052） ───────────────────────────────────────────── */

/** 示例联系人来源 → 联系人列表来源分面值（与真实 `facet_sources` 同一口径）。 */
const DEMO_SOURCE_FACET: Record<OrbitContactSource, string> = {
  contact: "external_contacts",
  event: "event_import",
  exchange: "manual",
  manual: "manual",
  qr: "qr_scan",
  referral: "referral",
  scan: "business_card_ocr",
};

/**
 * W0052：示例期概览的驾驶舱、档位与最近动态（前端数据，0 请求；快照、时间线、计划都不读）。
 * W0054：`snapshot` 由页面换成示例静态快照（`buildDemoNetworkSnapshotView`）后 4 卡带句子；这里默认仍是 none。档位与动态是双语示例数据，
 * 人名与 30 位示例联系人一致。交给 `buildNetworkOverviewData` 按真实同一规则组装。
 */
export function buildDemoNetworkOverviewParts(real: Date, lang: Lang): OverviewCockpitParts {
  const ctx = context(real, lang);
  const idOf = (slug: string) => `${DEMO_CONTACT_ID_PREFIX}${slug}`;
  const at = (daysAgo: number, time: string) => new Date(`${shiftDay(ctx.today, -daysAgo)}T${time}:00+09:00`).toISOString();
  const need = (needId: string, title: Copy, have: number, target: number) => ({
    criteria: null, have, linkedContactIds: [], missing: Math.max(0, target - have), needId, phaseKey: "p1", phaseTitle: say(ctx, { ja: "第1段階", zh: "第 1 阶段", en: "Phase 1" }), target, title: say(ctx, title),
  });
  const timeline: RelationshipTimelineItem[] = [
    { contactId: idOf("suzuki-ken"), id: "capture:demo-suzuki", occurredAt: at(1, "22:14"), occurredAtPrecision: "instant", ref: { recordId: idOf("suzuki-ken"), store: "contacts" }, source: "capture", title: timelineTitle(ctx, { ja: "名刺から追加", zh: "扫描名片，建立联系", en: "Added from a business card" }), detail: { captureMethod: "business_card" } },
    { contactId: idOf("takahashi-yumi"), id: "capture:demo-takahashi", occurredAt: at(1, "22:13"), occurredAtPrecision: "instant", ref: { recordId: idOf("takahashi-yumi"), store: "contacts" }, source: "capture", title: timelineTitle(ctx, { ja: "名刺から追加", zh: "扫描名片，建立联系", en: "Added from a business card" }), detail: { captureMethod: "business_card" } },
    { contactId: idOf("wang-yan"), excerpt: say(ctx, { ja: "電話：IT 部門のシステム購入の決裁者がわかった", zh: "电话：确认了 IT 部门的系统采购决策人", en: "Call: found out who in IT decides on systems" }), id: "memo:demo-wang", occurredAt: at(1, "17:30"), occurredAtPrecision: "instant", ref: { recordId: idOf("wang-yan"), store: "contact_detail_states" }, source: "memo", title: timelineTitle(ctx, { ja: "メモを書いた", zh: "写了 memo", en: "Wrote a memo" }) },
    { contactId: idOf("sato-misaki"), excerpt: say(ctx, { ja: "返信：会議後の整理に30分かかっている", zh: "回邮件：会后要花 30 分钟整理", en: "Replied: 30 minutes of notes after each meeting" }), id: "memo:demo-sato", occurredAt: at(2, "10:20"), occurredAtPrecision: "instant", ref: { recordId: idOf("sato-misaki"), store: "contact_detail_states" }, source: "memo", title: timelineTitle(ctx, { ja: "メモを書いた", zh: "写了 memo", en: "Wrote a memo" }) },
    { contactId: idOf("nakamura-megumi"), eventId: "demo-event-chamber-mixer", id: "encounter:demo-nakamura", occurredAt: at(9, "19:00"), occurredAtPrecision: "instant", ref: { recordId: "demo-encounter-nakamura", store: "human_encounters" }, source: "encounter", title: timelineTitle(ctx, { ja: "イベントで会った", zh: "在活动上见面", en: "Met at an event" }) },
  ];
  const column = (group: NetworkTierGroup) => [...SEEDS]
    .filter((seed) => demoTierGroup(seed.status) === group)
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .slice(0, 2)
    .map((seed) => ({ contactId: idOf(seed.slug), lastSignalAt: at(seed.daysAgo, "12:00") }));
  const sourceFacets: Record<string, number> = {};
  for (const seed of SEEDS) sourceFacets[DEMO_SOURCE_FACET[seed.source]] = (sourceFacets[DEMO_SOURCE_FACET[seed.source]] ?? 0) + 1;
  return {
    board: { active: column("active"), core: column("core") },
    names: new Map(SEEDS.map((seed) => [idOf(seed.slug), { contactId: idOf(seed.slug), name: say(ctx, seed.name) }])),
    pendingMatches: 2,
    plan: {
      eventItems: [],
      goal: "",
      linkedContactIds: [],
      needs: [
        need("demo-need-it", { ja: "中小企業の IT 担当者", zh: "中小企业 IT 负责人", en: "SME IT leads" }, 2, 3),
        need("demo-need-channel", { ja: "販売代理店", zh: "渠道代理商", en: "Channel resellers" }, 1, 3),
        need("demo-need-chamber", { ja: "商工会議所・協会の窓口", zh: "商会／协会对接人", en: "Chamber and association contacts" }, 0, 2),
      ],
      percent: 38,
      planId: "demo-plan",
      weekActions: [
        { id: "demo-action-wang", title: say(ctx, { ja: "14:00に面会し、IT の決裁者を紹介してもらう", zh: "14:00 见面，请他引荐 IT 决策人", en: "Meet at 14:00 and ask for an intro to the IT decision-maker" }), weeksOverdue: 0 },
        { id: "demo-action-sato", title: say(ctx, { ja: "20分ほど時間をもらい、トライアルの話をする", zh: "约 20 分钟，聊试用", en: "Book 20 minutes to talk about a trial" }), weeksOverdue: 0 },
        { id: "demo-action-nakamura", title: say(ctx, { ja: "試験導入の会員企業を3社紹介してもらう", zh: "请她推荐 3 家试点会员企业", en: "Ask her for 3 pilot member companies" }), weeksOverdue: 0 },
        { id: "demo-action-lin", title: say(ctx, { ja: "近況を聞き、代理店向けの価格を確認する", zh: "问候，问渠道定价", en: "Check in and ask about channel pricing" }), weeksOverdue: 1 },
      ],
    },
    snapshot: { blocks: [], contactCount: 0, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: null, state: "none" },
    sourceFacets,
    timeline: { items: timeline, unavailable: false },
  };
}

/* ── W0054：示例完整快照用的只读种子视图 ─────────────────────────── */

/** 一位示例联系人（已按界面语言取值）；W0054 的示例分析快照（`demo-network-analysis.ts`）只从这里取人。 */
export interface DemoContactSeed {
  id: string;
  slug: string;
  name: string;
  company: string;
  title: string;
  /** 「大类 › 小类」原文（中文，作行业映射键）。 */
  industryKey: string;
  location: string;
  /** 中文地名（作地区映射键）。 */
  locationKey: string;
  source: OrbitContactSource;
  tier: NetworkTierGroup;
  daysAgo: number;
  next: string | null;
  rich: boolean;
  /** 公司与职位的中英原值（W0054 review P3-3：示例洞察按 slug 同时构造两种语言，不用已按界面语言投影的值）。 */
  companyCopy: Copy;
  titleCopy: Copy;
}

export function demoContactSeeds(real: Date, lang: Lang): DemoContactSeed[] {
  const ctx = context(real, lang);
  return SEEDS.map((seed) => ({
    company: say(ctx, seed.company),
    companyCopy: seed.company,
    daysAgo: seed.daysAgo,
    id: `${DEMO_CONTACT_ID_PREFIX}${seed.slug}`,
    industryKey: seed.industry.zh,
    location: say(ctx, seed.location),
    locationKey: seed.location.zh,
    name: say(ctx, seed.name),
    next: seed.next ? say(ctx, seed.next) : null,
    rich: Boolean(RICH[seed.slug]),
    slug: seed.slug,
    source: seed.source,
    tier: demoTierGroup(seed.status),
    title: say(ctx, seed.title),
    titleCopy: seed.title,
  }));
}

/** 东京「今天 − daysAgo」那天的某个钟点（ISO）。 */
export function demoTokyoAt(real: Date, daysAgo: number, time: string): string {
  return new Date(`${shiftDay(tokyoDayKey(real), -daysAgo)}T${time}:00+09:00`).toISOString();
}

/** 从 `/app/contacts/<encoded id>` 取出示例联系人 id；不是示例联系人返回 null。 */
export function demoContactIdFromHref(href: string): string | null {
  const match = /^\/app\/contacts\/([^/?#]+)$/.exec(href);
  if (!match?.[1]) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return SEEDS.some((seed) => `${DEMO_CONTACT_ID_PREFIX}${seed.slug}` === id) ? id : null;
}
