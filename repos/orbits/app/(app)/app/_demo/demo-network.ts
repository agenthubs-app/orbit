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

type Lang = "en" | "zh";
type Copy = { en: string; zh: string };

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

const c = (zh: string, en: string): Copy => ({ en, zh });
const TOKYO = c("东京", "Tokyo");

// [原型 PEOPLE 的 30 行] 名字、公司、职位、行业、来源、状态、最近互动、下一步。
const SEEDS: readonly DemoSeed[] = [
  { slug: "wang-yan", name: c("王砚", "Wang Yan"), initial: c("王", "W"), company: c("北辰精工", "Hokushin Seiko"), title: c("采购部长", "Head of Procurement"), industry: c("制造 › 工业设备", "Manufacturing › Industrial equipment"), source: "event", status: 3, daysAgo: 1, next: c("今天 14:00 见面，请他介绍 IT 决策人", "Meet today at 14:00; ask for the IT decision-maker"), location: TOKYO },
  { slug: "sato-misaki", name: c("佐藤美咲", "Sato Misaki"), initial: c("佐", "S"), company: c("丸和工业", "Maruwa Industries"), title: c("情报系统课长", "IT Systems Manager"), industry: c("信息通信 › 企业 IT", "ICT › Enterprise IT"), source: "scan", status: 3, daysAgo: 2, next: c("约 20 分钟，聊试用", "Book 20 minutes to talk about a trial"), location: c("横滨", "Yokohama") },
  { slug: "lin-zhiyuan", name: c("林志远", "Lin Zhiyuan"), initial: c("林", "L"), company: c("Cloudia", "Cloudia"), title: c("合作伙伴营业", "Partner Sales"), industry: c("信息通信 › 软件分销", "ICT › Software distribution"), source: "referral", status: 2, daysAgo: 45, next: c("问候，问渠道定价", "Check in and ask about channel pricing"), location: TOKYO },
  { slug: "suzuki-ken", name: c("铃木健", "Suzuki Ken"), initial: c("铃", "S"), company: c("丸和工业", "Maruwa Industries"), title: c("情报系统部 部长", "Head of IT Systems"), industry: c("制造 › 工业设备", "Manufacturing › Industrial equipment"), source: "scan", status: 1, daysAgo: 1, next: c("确认是否对应计划里的 IT 负责人", "Check whether he is the IT lead the plan needs"), location: c("横滨", "Yokohama") },
  { slug: "takahashi-yumi", name: c("高桥由美", "Takahashi Yumi"), initial: c("高", "T"), company: c("Cloudia 株式会社", "Cloudia K.K."), title: c("合作伙伴营业", "Partner Sales"), industry: c("信息通信 › 软件分销", "ICT › Software distribution"), source: "scan", status: 1, daysAgo: 1, next: c("确认是否对应计划里的渠道代理商", "Check whether she is the channel reseller the plan needs"), location: TOKYO },
  { slug: "yamada-taro", name: c("山田太郎", "Yamada Taro"), initial: c("山", "Y"), company: c("JETRO 东京", "JETRO Tokyo"), title: c("投资咨询顾问", "Investment Advisor"), industry: c("公共服务 › 贸易促进", "Public sector › Trade promotion"), source: "event", status: 2, daysAgo: 15, next: c("{jetro} 交流会上再见一次", "See him again at the {jetro} mixer"), location: TOKYO },
  { slug: "chen-siyuan", name: c("陈思远", "Chen Siyuan"), initial: c("陈", "C"), company: c("星桥资本", "Starbridge Capital"), title: c("投资经理", "Investment Manager"), industry: c("金融 › 风险投资", "Finance › Venture capital"), source: "referral", status: 2, daysAgo: 24, next: c("12 月前同步一次试用进展", "Share trial progress before December"), location: TOKYO },
  { slug: "nakamura-megumi", name: c("中村惠", "Nakamura Megumi"), initial: c("中", "N"), company: c("东京商工会议所", "Tokyo Chamber of Commerce"), title: c("中小企业支援课", "SME Support"), industry: c("公共服务 › 商会", "Public sector › Chamber of commerce"), source: "event", status: 3, daysAgo: 9, next: c("请她推荐 3 家愿意试点的会员企业", "Ask her for 3 member companies willing to pilot"), location: TOKYO },
  { slug: "kobayashi-sho", name: c("小林翔", "Kobayashi Sho"), initial: c("小", "K"), company: c("Sakura Foods", "Sakura Foods"), title: c("总务部长", "General Affairs Director"), industry: c("餐饮 › 连锁", "Food service › Chains"), source: "event", status: 1, daysAgo: 7, next: c("了解会议频率", "Learn how often they meet"), location: c("大阪", "Osaka") },
  { slug: "ito-naoko", name: c("伊藤直子", "Ito Naoko"), initial: c("伊", "I"), company: c("Nexa 会计事务所", "Nexa Accounting"), title: c("合伙人", "Partner"), industry: c("专业服务 › 会计", "Professional services › Accounting"), source: "contact", status: 2, daysAgo: 28, next: c("请她介绍客户", "Ask her to introduce clients"), location: TOKYO },
  { slug: "kato-ryo", name: c("加藤亮", "Kato Ryo"), initial: c("加", "K"), company: c("Kato Design", "Kato Design"), title: c("创始人", "Founder"), industry: c("创意 › 设计", "Creative › Design"), source: "contact", status: 2, daysAgo: 67, next: null, location: TOKYO },
  { slug: "yoshida-yu", name: c("吉田优", "Yoshida Yu"), initial: c("吉", "Y"), company: c("Mirai Logistics", "Mirai Logistics"), title: c("IT 担当", "IT Coordinator"), industry: c("物流 › 仓储", "Logistics › Warehousing"), source: "scan", status: 1, daysAgo: 5, next: c("发演示视频", "Send the demo video"), location: c("川崎", "Kawasaki") },
  { slug: "watanabe-kenji", name: c("渡边健二", "Watanabe Kenji"), initial: c("渡", "W"), company: c("Watanabe Robotics", "Watanabe Robotics"), title: c("CEO", "CEO"), industry: c("制造 › 机器人", "Manufacturing › Robotics"), source: "event", status: 2, daysAgo: 17, next: null, location: c("名古屋", "Nagoya") },
  { slug: "matsumoto-aya", name: c("松本彩", "Matsumoto Aya"), initial: c("松", "M"), company: c("LinkBridge", "LinkBridge"), title: c("BD 经理", "BD Manager"), industry: c("信息通信 › SaaS", "ICT › SaaS"), source: "referral", status: 3, daysAgo: 3, next: c("交换渠道资源", "Swap channel contacts"), location: TOKYO },
  { slug: "inoue-daisuke", name: c("井上大辅", "Inoue Daisuke"), initial: c("井", "I"), company: c("Inoue 建设", "Inoue Construction"), title: c("经营企划", "Corporate Planning"), industry: c("建筑 › 工程", "Construction › Engineering"), source: "scan", status: 1, daysAgo: 5, next: c("了解会议流程", "Learn how their meetings run"), location: c("埼玉", "Saitama") },
  { slug: "kimura-mari", name: c("木村真理", "Kimura Mari"), initial: c("木", "K"), company: c("Kimura Clinic", "Kimura Clinic"), title: c("事务长", "Office Manager"), industry: c("医疗 › 诊所", "Healthcare › Clinics"), source: "contact", status: 4, daysAgo: 148, next: null, location: TOKYO },
  { slug: "lin-meiling", name: c("林美玲", "Lin Meiling"), initial: c("林", "L"), company: c("蓝海出海咨询", "Blue Ocean Advisory"), title: c("合伙人", "Partner"), industry: c("专业服务 › 咨询", "Professional services › Consulting"), source: "referral", status: 2, daysAgo: 26, next: c("请教日本定价", "Ask about pricing in Japan"), location: TOKYO },
  { slug: "zhang-hao", name: c("张浩", "Zhang Hao"), initial: c("张", "Z"), company: c("云帆科技", "Yunfan Tech"), title: c("CTO", "CTO"), industry: c("信息通信 › 企业软件", "ICT › Enterprise software"), source: "contact", status: 2, daysAgo: 40, next: null, location: c("上海", "Shanghai") },
  { slug: "saito-hikaru", name: c("斋藤光", "Saito Hikaru"), initial: c("斋", "S"), company: c("Saito Printing", "Saito Printing"), title: c("社长", "President"), industry: c("制造 › 印刷", "Manufacturing › Printing"), source: "event", status: 1, daysAgo: 7, next: c("约下周电话", "Set up a call next week"), location: TOKYO },
  { slug: "shimizu-nana", name: c("清水奈奈", "Shimizu Nana"), initial: c("清", "S"), company: c("Shimizu HR", "Shimizu HR"), title: c("HR 顾问", "HR Consultant"), industry: c("专业服务 › 人力", "Professional services › HR"), source: "manual", status: 2, daysAgo: 53, next: null, location: TOKYO },
  { slug: "yamaguchi-takashi", name: c("山口隆", "Yamaguchi Takashi"), initial: c("山", "Y"), company: c("Yamaguchi 商事", "Yamaguchi Trading"), title: c("IT 负责人", "IT Lead"), industry: c("贸易 › 批发", "Trade › Wholesale"), source: "scan", status: 3, daysAgo: 4, next: c("发试用邀请", "Send a trial invitation"), location: TOKYO },
  { slug: "morita-ai", name: c("森田爱", "Morita Ai"), initial: c("森", "M"), company: c("Morita 食品", "Morita Foods"), title: c("总务课长", "General Affairs Manager"), industry: c("食品 › 加工", "Food › Processing"), source: "event", status: 1, daysAgo: 7, next: c("了解会议记录方式", "Learn how they take meeting notes"), location: c("千叶", "Chiba") },
  { slug: "ikeda-wataru", name: c("池田航", "Ikeda Wataru"), initial: c("池", "I"), company: c("Ikeda Partners", "Ikeda Partners"), title: c("律师", "Lawyer"), industry: c("专业服务 › 法律", "Professional services › Legal"), source: "referral", status: 2, daysAgo: 74, next: null, location: TOKYO },
  { slug: "hashimoto-sa", name: c("桥本纱", "Hashimoto Sa"), initial: c("桥", "H"), company: c("Hashimoto Travel", "Hashimoto Travel"), title: c("市场部", "Marketing"), industry: c("文旅 › 旅行", "Travel › Tourism"), source: "manual", status: 4, daysAgo: 169, next: null, location: c("京都", "Kyoto") },
  { slug: "fujita-makoto", name: c("藤田诚", "Fujita Makoto"), initial: c("藤", "F"), company: c("Fujita 电机", "Fujita Electric"), title: c("情报系统课", "IT Systems"), industry: c("制造 › 电子", "Manufacturing › Electronics"), source: "scan", status: 1, daysAgo: 5, next: c("发演示视频", "Send the demo video"), location: TOKYO },
  { slug: "okada-hitomi", name: c("冈田瞳", "Okada Hitomi"), initial: c("冈", "O"), company: c("Okada 不动产", "Okada Real Estate"), title: c("经营企划", "Corporate Planning"), industry: c("房地产 › 中介", "Real estate › Brokerage"), source: "event", status: 2, daysAgo: 30, next: null, location: TOKYO },
  { slug: "zhou-ning", name: c("周宁", "Zhou Ning"), initial: c("周", "Z"), company: c("东京华人创业会", "Tokyo Chinese Founders Club"), title: c("秘书长", "Secretary General"), industry: c("社群 › 创业", "Community › Startups"), source: "event", status: 2, daysAgo: 13, next: c("下次活动一起办", "Co-host the next event"), location: TOKYO },
  { slug: "maeda-yu", name: c("前田悠", "Maeda Yu"), initial: c("前", "M"), company: c("Maeda Tech", "Maeda Tech"), title: c("工程经理", "Engineering Manager"), industry: c("信息通信 › 企业 IT", "ICT › Enterprise IT"), source: "contact", status: 2, daysAgo: 49, next: null, location: TOKYO },
  { slug: "ishikawa-riko", name: c("石川莉子", "Ishikawa Riko"), initial: c("石", "I"), company: c("Ishikawa 酒造", "Ishikawa Brewery"), title: c("专务", "Senior Managing Director"), industry: c("食品 › 酒类", "Food › Sake & spirits"), source: "manual", status: 4, daysAgo: 191, next: null, location: c("新潟", "Niigata") },
  { slug: "hasegawa-jin", name: c("长谷川仁", "Hasegawa Jin"), initial: c("长", "H"), company: c("Hasegawa 物产", "Hasegawa Bussan"), title: c("IT 推进室", "IT Promotion Office"), industry: c("贸易 › 批发", "Trade › Wholesale"), source: "scan", status: 1, daysAgo: 5, next: c("了解会议流程", "Learn how their meetings run"), location: TOKYO },
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
    met: c("札幌工业展会", "Sapporo industrial expo"),
    interactions: [
      [1, "17:30", c("电话：他说 IT 部门的铃木是系统采购的决策人", "Call: he said Suzuki in IT is the one who decides on system purchases")],
      [5, "15:30", c("札幌展会展位聊了 15 分钟，对日语会议纪要感兴趣", "Talked for 15 minutes at the Sapporo expo booth; interested in Japanese meeting notes")],
    ],
    topics: [c("制造业数字化", "Manufacturing digitalisation"), c("日语会议", "Meetings in Japanese")],
    offer: [c("试用名额", "A trial seat"), c("日语会议纪要整理", "Japanese meeting-note write-ups")],
    need: [c("减少会议记录时间", "Spend less time on meeting notes"), c("现场会议留痕", "A record of shop-floor meetings")],
    next: [c("今天见面时请他引荐铃木", "Ask him to introduce Suzuki when you meet today"), c("会后发 1 分钟演示视频", "Send the 1-minute demo video afterwards")],
  },
  "sato-misaki": {
    met: c("名片导入", "Business card import"),
    interactions: [[2, "10:20", c("邮件：她说现在用 Word 手记，每次会后 30 分钟整理", "Email: they take notes by hand in Word and spend 30 minutes after every meeting")]],
    topics: [c("会议效率", "Meeting efficiency"), c("IT 预算", "IT budget")],
    offer: [c("免费试用", "A free trial"), c("导入支持", "Onboarding support")],
    need: [c("省整理时间", "Less time tidying notes"), c("简单好上手", "Easy to pick up")],
    next: [c("约 20 分钟线上聊", "Book a 20-minute online call"), c("带上试用方案", "Bring the trial offer")],
  },
  "lin-zhiyuan": {
    met: c("朋友引荐 · 陈思远", "Referred by Chen Siyuan"),
    interactions: [[45, "10:00", c("邮件：聊了日本 SaaS 渠道的分成方式", "Email: talked about revenue share for SaaS channels in Japan")]],
    topics: [c("SaaS 渠道", "SaaS channels"), c("定价", "Pricing")],
    offer: [c("产品授权", "Product licensing"), c("联合营销", "Joint marketing")],
    need: [c("新产品线", "New product lines")],
    next: [c("发问候，问渠道定价（已延后 1 周）", "Check in and ask about channel pricing (postponed a week)")],
  },
  "suzuki-ken": {
    met: c("名片导入 · 昨晚", "Business card import · last night"),
    interactions: [],
    topics: [c("系统采购", "System purchasing")],
    offer: [c("试用", "A trial")],
    need: [c("待了解", "To find out")],
    next: [c("确认是否对应计划里的『中小企业 IT 负责人』", "Check whether he matches the plan's “SME IT lead”")],
  },
  "takahashi-yumi": {
    met: c("名片导入 · 昨晚", "Business card import · last night"),
    interactions: [],
    topics: [c("渠道合作", "Channel partnerships")],
    offer: [c("渠道分成", "Channel revenue share")],
    need: [c("待了解", "To find out")],
    next: [c("确认是否对应计划里的『SaaS 渠道代理商』", "Check whether she matches the plan's “SaaS channel reseller”")],
  },
  "yamada-taro": {
    met: c("JETRO 说明会", "JETRO briefing"),
    interactions: [[15, "16:00", c("说明会后交换名片，他负责外资企业对接", "Swapped cards after the briefing; he looks after foreign companies")]],
    topics: [c("在日设立", "Setting up in Japan"), c("企业介绍", "Company introductions")],
    offer: [c("产品演示", "A product demo")],
    need: [c("有潜力的海外企业", "Promising overseas companies")],
    next: [c("{jetro} 交流会上再见一次", "See him again at the {jetro} mixer")],
  },
  "chen-siyuan": {
    met: c("朋友引荐", "Referral"),
    interactions: [[24, "09:30", c("咖啡：他关注 AI 应用出海，想看日本试用数据", "Coffee: he follows AI apps going abroad and wants to see Japan trial data")]],
    topics: [c("AI 应用", "AI applications"), c("出海", "Going global")],
    offer: [c("进展同步", "Progress updates")],
    need: [c("试用数据", "Trial data")],
    next: [c("12 月前同步一次试用进展", "Share trial progress before December")],
  },
  "nakamura-megumi": {
    met: c("商工会议所研讨会", "Chamber of commerce seminar"),
    interactions: [[9, "17:00", c("研讨会后聊了会员企业的数字化需求", "After the seminar we talked about members' digitalisation needs")]],
    topics: [c("中小企业 DX", "SME DX")],
    offer: [c("会员企业试点", "Pilots with member companies")],
    need: [c("可推荐给会员的工具", "Tools she can recommend to members")],
    next: [c("请她推荐 3 家愿意试点的会员企业", "Ask her for 3 member companies willing to pilot")],
  },
};

/** 示例联系人总数（原型 `PEOPLE` 的行数）。 */
export const DEMO_NETWORK_SIZE = SEEDS.length;
/** 有完整详情的示例联系人。 */
export const DEMO_RICH_CONTACT_IDS: readonly string[] = Object.keys(RICH).map((slug) => `${DEMO_CONTACT_ID_PREFIX}${slug}`);

const SOURCE_COPY: Record<OrbitContactSource, Copy> = {
  contact: c("通讯录", "Address book"),
  event: c("活动认识", "Met at an event"),
  exchange: c("其他来源", "Other"),
  manual: c("其他来源", "Other"),
  qr: c("其他来源", "Other"),
  referral: c("朋友引荐", "Referral"),
  scan: c("名片导入", "Business card import"),
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
  1: { pipeline: "to_contact", relationship: "needs_follow_up", stage: c("待了解", "Explore"), strength: "weak", tier: "new", dormant: false },
  2: { pipeline: "in_progress", relationship: "nurture", stage: c("保持联系", "Keep in touch"), strength: "medium", tier: "active", dormant: false },
  3: { pipeline: "in_progress", relationship: "active", stage: c("正在推进", "Advancing"), strength: "strong", tier: "core", dormant: false },
  4: { pipeline: "archived", relationship: "archived", stage: c("已归档", "Archived"), strength: "dormant", tier: "active", dormant: true },
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

/** 列表「最近互动」列：今天／昨天／M/D。 */
function lastLabel(ctx: DemoContext, daysAgo: number): string {
  if (daysAgo === 0) return ctx.lang === "en" ? "Today" : "今天";
  if (daysAgo === 1) return ctx.lang === "en" ? "Yesterday" : "昨天";
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
    : [[seed.daysAgo, "10:00", c("上次互动（示例简版详情）", "Last interaction (short demo detail)")]];
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
            seeking: rich ? rich.need.map((item) => say(ctx, item)) : [say(ctx, c("待了解", "To find out"))],
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
          // 示例按当前语言单语生成（与示例其余文案一致），两个语言槽放同一句。
          title: { zh: say(ctx, c("写了 memo", "Wrote a memo")), en: say(ctx, c("写了 memo", "Wrote a memo")) },
          excerpt: note.body,
          ref: { store: "contact_detail_states" as const, recordId: `demo:${id}`, subId: note.id },
        })),
        {
          id: `capture:${id}`,
          source: "capture" as const,
          contactId: id,
          occurredAt: noteAt(ctx, seed.daysAgo + 30, "10:00"),
          occurredAtPrecision: "instant" as const,
          title: { zh: say(ctx, c("在活动中交换名片", "Exchanged cards at an event")), en: say(ctx, c("在活动中交换名片", "Exchanged cards at an event")) },
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
      label: say(ctx, c("查看联系人", "View contact")),
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
  const other = say(ctx, c("其他", "Other"));
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
      { contactName: say(ctx, c("铃木健", "Suzuki Ken")), id: "demo-activity-suzuki", label: say(ctx, c("导入名片", "Business card imported")), occurredAt: at(1, "22:14"), source: say(ctx, c("名片导入", "Business card import")) },
      { contactName: say(ctx, c("高桥由美", "Takahashi Yumi")), id: "demo-activity-takahashi", label: say(ctx, c("导入名片", "Business card imported")), occurredAt: at(1, "22:14"), source: say(ctx, c("名片导入", "Business card import")) },
      { contactName: say(ctx, c("王砚", "Wang Yan")), id: "demo-activity-wang", label: say(ctx, c("电话：确认了 IT 部门的系统采购决策人", "Call: found out who in IT decides on systems")), occurredAt: at(1, "17:30"), source: say(ctx, c("进展记录", "Progress log")) },
      { contactName: say(ctx, c("佐藤美咲", "Sato Misaki")), id: "demo-activity-sato", label: say(ctx, c("回邮件：会后要花 30 分钟整理", "Replied: 30 minutes of notes after each meeting")), occurredAt: at(2, "10:20"), source: say(ctx, c("邮件", "Email")) },
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
          demoAction(ctx, { due: c("今天", "Today"), id: "demo-opp-wang", judgment: c("计划第 1 阶段要认识中小企业 IT 负责人；上次通话他提到 IT 部门才是系统采购的决策方。", "Phase 1 needs an SME IT lead; on the last call he said IT decides on systems."), slug: "wang-yan", title: c("14:00 见面，请他引荐 IT 决策人", "Meet at 14:00 and ask for an intro to the IT decision-maker") }),
          demoAction(ctx, { due: c("本周", "This week"), id: "demo-opp-sato", judgment: c("她们现在用 Word 手记，每次会后花 30 分钟整理，正是试用要解决的事。", "They take notes by hand and spend 30 minutes after each meeting — exactly what the trial fixes."), slug: "sato-misaki", title: c("约 20 分钟，聊试用", "Book 20 minutes to talk about a trial") }),
          demoAction(ctx, { due: c("今天", "Today"), id: "demo-opp-suzuki", judgment: c("昨晚导入的名片，职位和计划里要找的「中小企业 IT 负责人」对得上。", "Imported last night; the role matches the plan's “SME IT lead”."), slug: "suzuki-ken", title: c("确认是否对应计划里的 IT 负责人", "Check whether he is the IT lead the plan needs") }),
          demoAction(ctx, { due: c("本周", "This week"), id: "demo-opp-nakamura", judgment: c("商工会议所有愿意尝试数字化工具的会员企业。", "The chamber has member companies open to trying digital tools."), slug: "nakamura-megumi", title: c("请她推荐 3 家试点会员企业", "Ask her for 3 pilot member companies") }),
          demoAction(ctx, { due: c("已延后 1 周", "Postponed a week"), id: "demo-opp-lin", judgment: c("上次聊日本 SaaS 渠道分成是六周前。", "You last talked about channel revenue share six weeks ago."), slug: "lin-zhiyuan", title: c("问候，问渠道定价", "Check in and ask about channel pricing") }),
          demoAction(ctx, { due: c("12 月前", "Before December"), id: "demo-opp-chen", judgment: c("他关注 AI 应用出海，想看日本的试用数据。", "He follows AI apps going abroad and wants Japan trial data."), slug: "chen-siyuan", title: c("同步一次试用进展", "Share trial progress") }),
        ],
        dormant: SEEDS.filter((seed) => seed.status !== 4 && seed.daysAgo >= 60).map((seed) => ({
          action: say(ctx, c("发一条问候", "Send a quick hello")),
          href: `/app/contacts/${encodeURIComponent(`${DEMO_CONTACT_ID_PREFIX}${seed.slug}`)}`,
          id: `${DEMO_CONTACT_ID_PREFIX}${seed.slug}`,
          name: say(ctx, seed.name),
          reason: say(ctx, c("两个多月没联系了", "Quiet for over two months")),
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
 * 没有快照（示例静态快照是 W0054），所以 4 卡只有示例数字、没有句子；档位与动态是双语示例数据，
 * 人名与 30 位示例联系人一致。交给 `buildNetworkOverviewData` 按真实同一规则组装。
 */
export function buildDemoNetworkOverviewParts(real: Date, lang: Lang): OverviewCockpitParts {
  const ctx = context(real, lang);
  const idOf = (slug: string) => `${DEMO_CONTACT_ID_PREFIX}${slug}`;
  const at = (daysAgo: number, time: string) => new Date(`${shiftDay(ctx.today, -daysAgo)}T${time}:00+09:00`).toISOString();
  const need = (needId: string, title: Copy, have: number, target: number) => ({
    criteria: null, have, linkedContactIds: [], missing: Math.max(0, target - have), needId, phaseKey: "p1", phaseTitle: say(ctx, c("第 1 阶段", "Phase 1")), target, title: say(ctx, title),
  });
  const timeline: RelationshipTimelineItem[] = [
    { contactId: idOf("suzuki-ken"), id: "capture:demo-suzuki", occurredAt: at(1, "22:14"), occurredAtPrecision: "instant", ref: { recordId: idOf("suzuki-ken"), store: "contacts" }, source: "capture", title: { en: "Added from a business card", zh: "扫描名片，建立联系" } },
    { contactId: idOf("takahashi-yumi"), id: "capture:demo-takahashi", occurredAt: at(1, "22:13"), occurredAtPrecision: "instant", ref: { recordId: idOf("takahashi-yumi"), store: "contacts" }, source: "capture", title: { en: "Added from a business card", zh: "扫描名片，建立联系" } },
    { contactId: idOf("wang-yan"), excerpt: say(ctx, c("电话：确认了 IT 部门的系统采购决策人", "Call: found out who in IT decides on systems")), id: "memo:demo-wang", occurredAt: at(1, "17:30"), occurredAtPrecision: "instant", ref: { recordId: idOf("wang-yan"), store: "contact_detail_states" }, source: "memo", title: { en: "Wrote a memo", zh: "写了 memo" } },
    { contactId: idOf("sato-misaki"), excerpt: say(ctx, c("回邮件：会后要花 30 分钟整理", "Replied: 30 minutes of notes after each meeting")), id: "memo:demo-sato", occurredAt: at(2, "10:20"), occurredAtPrecision: "instant", ref: { recordId: idOf("sato-misaki"), store: "contact_detail_states" }, source: "memo", title: { en: "Wrote a memo", zh: "写了 memo" } },
    { contactId: idOf("nakamura-megumi"), id: "encounter:demo-nakamura", occurredAt: at(9, "19:00"), occurredAtPrecision: "instant", ref: { recordId: "demo-encounter-nakamura", store: "human_encounters" }, source: "encounter", title: { en: "Met at an event", zh: "在活动上见面" } },
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
        need("demo-need-it", c("中小企业 IT 负责人", "SME IT leads"), 2, 3),
        need("demo-need-channel", c("渠道代理商", "Channel resellers"), 1, 3),
        need("demo-need-chamber", c("商会／协会对接人", "Chamber and association contacts"), 0, 2),
      ],
      percent: 38,
      planId: "demo-plan",
      weekActions: [
        { id: "demo-action-wang", title: say(ctx, c("14:00 见面，请他引荐 IT 决策人", "Meet at 14:00 and ask for an intro to the IT decision-maker")), weeksOverdue: 0 },
        { id: "demo-action-sato", title: say(ctx, c("约 20 分钟，聊试用", "Book 20 minutes to talk about a trial")), weeksOverdue: 0 },
        { id: "demo-action-nakamura", title: say(ctx, c("请她推荐 3 家试点会员企业", "Ask her for 3 pilot member companies")), weeksOverdue: 0 },
        { id: "demo-action-lin", title: say(ctx, c("问候，问渠道定价", "Check in and ask about channel pricing")), weeksOverdue: 1 },
      ],
    },
    snapshot: { blocks: [], contactCount: 0, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: null, state: "none" },
    sourceFacets,
    timeline: { items: timeline, unavailable: false },
  };
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
