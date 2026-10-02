/**
 * W0054（RN-12，取代 RW-03「示例里没有 AI 人脉分析」）：示例期「AI 人脉分析」结构／机会／洞察三标签与
 * 概览驾驶舱的静态完整快照。
 *
 * 规则：
 *   - 只在前端：纯数据与纯函数，不 import 任何读取器、存储或 provider；示例期页面直接把这里的视图交给
 *     真实组件（`NetworkAnalysis`／`NetworkOverview`），不为示例另写 UI；
 *   - 所有人物都来自 `demo-network.ts` 的 30 位示例联系人（`demoContactSeeds`），依据 id 都是 `demo:` 前缀，
 *     点开去示例联系人详情；快照叙述只写关系判断，不写统计数字（数字一律由分布实时算，与真实快照同一约定）；
 *   - 中英双语；点分组、重新分析、起草邮件由组件走 `guardWrite`（W54-6）。
 */
import type { NetworkSnapshotView, NetworkSnapshotViewBlock } from "../../../../features/network-analysis/contract";
import type { ContactInsightEvidence, ContactInsightText } from "../../../../shared/contract/contact-insight";
import type { RelationshipTimelineSource } from "../../../../shared/contract/relationship-timeline";
import { CONTACT_INSIGHTS_TAB_PAGE_SIZE } from "../../../../features/contacts/insights/tab-reader";
import type { ContactInsightView } from "../../../../features/contacts/insights/view";
import { industryLabel, isIndustryIdCode } from "../../../../shared/domain/industries";
import { regionFromLocationText } from "../../../../shared/domain/regions";
import type { AnalysisBucket, ContactsAnalysisView } from "../contacts/analysis/contacts-analysis-view-model";
import { buildInsightsTabView, insightsTabOptions, parseInsightsTabQuery, type InsightsTabRow, type InsightsTabView } from "../contacts/analysis/insights-tab";
import { structureBucketLabel } from "../contacts/analysis/network-copy";
import { buildOpportunitiesTabView, type DormantCandidate, type OpportunitiesTabView } from "../contacts/analysis/opportunities-view-model";
import { structureSnapshotView, type StructureTabExtras } from "../contacts/analysis/structure-tab-model";
import type { NetworkTierGroup } from "../contacts/network-0918/network-model";
import type { EvidenceContactName } from "../../../../features/network-analysis/evidence-contacts";
import {
  buildDemoNetworkAnalysis,
  buildDemoNetworkOverviewParts,
  DEMO_CONTACT_ID_PREFIX,
  demoContactSeeds,
  demoTokyoAt,
  type DemoContactSeed,
} from "./demo-network";

type Lang = "en" | "zh";
type Copy = { en: string; zh: string };
const c = (zh: string, en: string): Copy => ({ en, zh });
const idOf = (slug: string) => `${DEMO_CONTACT_ID_PREFIX}${slug}`;

/** 示例人物的关系目标（与首页示例同一个故事）。 */
export const DEMO_RELATIONSHIP_GOAL = c(
  "三个月内在日本找到 3 家愿意试用 AI 会议纪要的中小企业，并谈下 1 家渠道代理。",
  "Within three months, find 3 Japanese SMEs willing to trial AI meeting notes and sign 1 channel reseller.",
);

/* ── 示例联系人的行业、地区、层级（结构标签的四维） ─────────────────── */

/** 「大类 › 小类」原文 → 行业二级 id（一级 = 前缀）。 */
const INDUSTRY_BY_KEY: Readonly<Record<string, string>> = {
  "制造 › 工业设备": "manufacturing_supply_chain.industrial_equipment",
  "信息通信 › 企业 IT": "technology_internet.enterprise_software",
  "信息通信 › 软件分销": "technology_internet.other",
  "信息通信 › SaaS": "technology_internet.enterprise_software",
  "信息通信 › 企业软件": "technology_internet.enterprise_software",
  "公共服务 › 贸易促进": "government_public_affairs.economic_development",
  "公共服务 › 商会": "community_nonprofit.industry_associations",
  "金融 › 风险投资": "finance_investment.venture_capital",
  "餐饮 › 连锁": "food_hospitality.restaurants",
  "专业服务 › 会计": "professional_services.tax_accounting",
  "创意 › 设计": "media_creative.design_creative",
  "物流 › 仓储": "trade_logistics.warehousing",
  "制造 › 机器人": "manufacturing_supply_chain.robotics",
  "建筑 › 工程": "real_estate_construction.construction",
  "医疗 › 诊所": "healthcare_life_sciences.medical_services",
  "专业服务 › 咨询": "professional_services.management_consulting",
  "制造 › 印刷": "manufacturing_supply_chain.other",
  "专业服务 › 人力": "professional_services.human_resources",
  "贸易 › 批发": "trade_logistics.import_export",
  "食品 › 加工": "food_hospitality.food_production",
  "专业服务 › 法律": "professional_services.legal",
  "文旅 › 旅行": "food_hospitality.hotels_tourism",
  "制造 › 电子": "manufacturing_supply_chain.electronics",
  "房地产 › 中介": "real_estate_construction.real_estate_services",
  "社群 › 创业": "community_nonprofit.community_operations",
  "食品 › 酒类": "food_hospitality.food_production",
};

function industryOf(seed: DemoContactSeed): { primary: string; secondary: string } {
  const secondary = INDUSTRY_BY_KEY[seed.industryKey] ?? "other.other";
  return { primary: secondary.split(".")[0]!, secondary };
}

const DECISION = new Set(["wang-yan", "suzuki-ken", "watanabe-kenji", "zhang-hao", "saito-hikaru", "kato-ryo", "ito-naoko", "lin-meiling", "ishikawa-riko", "zhou-ning", "kobayashi-sho"]);
const MANAGER = new Set(["sato-misaki", "morita-ai", "matsumoto-aya", "maeda-yu", "yamaguchi-takashi", "chen-siyuan", "kimura-mari"]);
const OTHER_SENIORITY = new Set(["ikeda-wataru"]);

function seniorityOf(seed: DemoContactSeed): "decision" | "manager" | "staff" | "other" {
  if (DECISION.has(seed.slug)) return "decision";
  if (MANAGER.has(seed.slug)) return "manager";
  if (OTHER_SENIORITY.has(seed.slug)) return "other";
  return "staff";
}

function regionIdOf(seed: DemoContactSeed): { id: string; country: string } {
  const region = regionFromLocationText(seed.locationKey);
  if (region?.city) return { country: region.countryCode, id: `region_${region.countryCode}_${encodeURIComponent(region.city)}` };
  // 别名表里没有的城市（千叶、埼玉、川崎、新潟）按国家归组。
  return { country: region?.countryCode ?? "JP", id: `region_${region?.countryCode ?? "JP"}` };
}

/* ── 示例快照（叙述 + 依据） ─────────────────────────────────────── */

function block(lang: Lang, key: string, kind: NetworkSnapshotViewBlock["kind"], text: Copy, slugs: readonly string[], needId?: string): NetworkSnapshotViewBlock {
  return { evidence: { contactIds: slugs.map(idOf), recordIds: [] }, key, kind, text: text[lang], ...(needId ? { needId } : {}) };
}

const NEED_IT = "demo-need-it";
const NEED_CHANNEL = "demo-need-channel";
const NEED_CHAMBER = "demo-need-chamber";

/**
 * 示例静态快照（W0048a 视图形状，state ready）：1 条诊断、3 条结构洞察、每条计划需求 1 条缺口补法、1 条本周计划句。
 * 依据全部是 30 位示例联系人。
 */
export function buildDemoNetworkSnapshotView(real: Date, lang: Lang): NetworkSnapshotView {
  return {
    blocks: [
      block(lang, "diagnosis", "diagnosis", c(
        "能直接推进试用的 IT 负责人只有铃木健和佐藤美咲两位，渠道代理和商会这两类关键人脉还很薄。",
        "Only Suzuki Ken and Sato Misaki can move a trial forward directly; channel resellers and chamber contacts are still thin.",
      ), ["suzuki-ken", "sato-misaki", "lin-zhiyuan", "nakamura-megumi"]),
      block(lang, "insight-manufacturing", "insight", c(
        "制造业联系人占比最高，但多是采购和管理岗；请王砚这样的部长向 IT 部门引荐，是找到决策人的最快路径。",
        "Manufacturing is your largest group, but mostly procurement and management roles; asking a department head like Wang Yan for an IT intro is the fastest route to decision-makers.",
      ), ["wang-yan", "watanabe-kenji", "fujita-makoto"]),
      block(lang, "insight-channel", "insight", c(
        "渠道方向有林志远、高桥由美两位 Cloudia 的伙伴营业，但和林志远已经六周没有往来，这条线在变冷。",
        "Lin Zhiyuan and Takahashi Yumi at Cloudia cover the channel side, but you haven't talked to Lin in six weeks — that line is cooling.",
      ), ["lin-zhiyuan", "takahashi-yumi"]),
      block(lang, "insight-chamber", "insight", c(
        "商会与公共机构的联系人能一次接触很多中小企业，中村惠和山田太郎值得优先维护。",
        "Chamber and public-sector contacts reach many SMEs at once; Nakamura Megumi and Yamada Taro are worth keeping close.",
      ), ["nakamura-megumi", "yamada-taro"]),
      block(lang, "gap-it", "gap", c(
        "铃木健、佐藤美咲已经对上；还差一位，可以请王砚引荐北辰精工的 IT 决策人。",
        "Suzuki Ken and Sato Misaki already fit; for one more, ask Wang Yan to introduce Hokushin Seiko's IT decision-maker.",
      ), ["wang-yan", "suzuki-ken", "sato-misaki"], NEED_IT),
      block(lang, "gap-channel", "gap", c(
        "Cloudia 已有两位伙伴营业；松本彩能帮你交换其他渠道的联系人。",
        "Cloudia already gives you two partner-sales contacts; Matsumoto Aya can swap introductions to other channels.",
      ), ["takahashi-yumi", "lin-zhiyuan", "matsumoto-aya"], NEED_CHANNEL),
      block(lang, "gap-chamber", "gap", c(
        "还没有确认的对接人；中村惠所在的东京商工会议所和周宁的华人创业会是最近的入口。",
        "No confirmed contact yet; Nakamura Megumi's Tokyo Chamber of Commerce and Zhou Ning's founders club are the closest way in.",
      ), ["nakamura-megumi", "zhou-ning"], NEED_CHAMBER),
      block(lang, "plan", "plan", c(
        "本周先见王砚、约佐藤美咲聊试用，再请中村惠推荐试点企业。",
        "This week: meet Wang Yan, book Sato Misaki for a trial chat, then ask Nakamura Megumi for pilot companies.",
      ), ["wang-yan", "sato-misaki", "nakamura-megumi"]),
    ],
    contactCount: demoContactSeeds(real, lang).length,
    freshness: { job: "none", newContactCount: 0, stale: false },
    generatedAt: demoTokyoAt(real, 0, "10:00"),
    quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } },
    state: "ready",
  };
}

/** 依据 id → 示例姓名（与真实「本人范围内解析」同一形状）。 */
export function demoEvidenceNames(real: Date, lang: Lang): Map<string, EvidenceContactName> {
  return new Map(demoContactSeeds(real, lang).map((seed) => [seed.id, { contactId: seed.id, name: seed.name }]));
}

/* ── 结构标签 ───────────────────────────────────────────────────── */

function countBuckets(
  rows: readonly { id: string; label: string }[],
  hrefDimension: string,
  total: number,
): AnalysisBucket[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows) counts.set(row.id, { count: (counts.get(row.id)?.count ?? 0) + 1, label: row.label });
  return [...counts.entries()].map(([id, value]) => ({
    count: value.count,
    href: `/app/contacts/analysis/${hrefDimension}/${encodeURIComponent(id)}`,
    id,
    label: value.label,
    missingData: false,
    percentage: total > 0 ? Math.round((value.count / total) * 100) : 0,
  }));
}

const TIER_ORDER: readonly NetworkTierGroup[] = ["new", "active", "core", "dormant"];

/**
 * 示例期分析三标签用的 `ContactsAnalysisView`：概览口径的示例分析 + 结构标签的四维（行业两级、地区、
 * 角色层级、关系强度档），全部从 30 位示例联系人算出；关系目标为示例人物的目标（只读，不可编辑）。
 */
export function buildDemoAnalysisForTabs(real: Date, lang: Lang): ContactsAnalysisView {
  const base = buildDemoNetworkAnalysis(real, lang);
  if (base.state !== "ready" || base.structure.state !== "ready") return base;
  const seeds = demoContactSeeds(real, lang);
  const total = seeds.length;
  const industryRows = seeds.map((seed) => industryOf(seed));
  const industry = countBuckets(
    industryRows.map((row) => ({ id: row.primary, label: isIndustryIdCode(row.primary) ? industryLabel(row.primary, lang) : row.primary })),
    "industry",
    total,
  ).map((bucket) => {
    const children = industryRows.filter((row) => row.primary === bucket.id);
    return {
      ...bucket,
      children: countBuckets(
        children.map((row) => ({ id: row.secondary, label: structureBucketLabel("industry_secondary", row.secondary, row.secondary, lang) })),
        "industry_secondary",
        children.length,
      ),
    };
  });
  const region = countBuckets(
    seeds.map((seed) => { const { id } = regionIdOf(seed); return { id, label: structureBucketLabel("region", id, seed.location, lang) }; }),
    "region",
    total,
  );
  const seniority = countBuckets(
    seeds.map((seed) => { const id = `seniority_${seniorityOf(seed)}`; return { id, label: structureBucketLabel("seniority", id, id, lang) }; }),
    "seniority",
    total,
  );
  const tier = TIER_ORDER.map((id) => {
    const count = seeds.filter((seed) => seed.tier === id).length;
    return { count, href: `/app/contacts/analysis/tier/${id}`, id, label: structureBucketLabel("tier", id, id, lang), missingData: false, percentage: Math.round((count / total) * 100) };
  }).filter((bucket) => bucket.count > 0);
  return {
    ...base,
    goal: { data: { canEdit: false, id: null, text: DEMO_RELATIONSHIP_GOAL[lang], updatedAt: "" }, state: "ready" },
    structure: {
      data: { ...base.structure.data, dimensions: { ...base.structure.data.dimensions, industry, region, seniority, tier } },
      state: "ready",
    },
  };
}

/** 结构标签的附加数据：示例快照的诊断与洞察（依据可点开）、计划需求高亮、较 30 天前的档位变化。 */
export function buildDemoStructureExtras(real: Date, lang: Lang): StructureTabExtras {
  const seeds = demoContactSeeds(real, lang);
  const now = seeds.reduce((acc, seed) => ({ ...acc, [seed.tier]: (acc[seed.tier] ?? 0) + 1 }), {} as Record<NetworkTierGroup, number>);
  // 30 天前：最近一个月认识的 5 位当时还不在；2 位当时是「有往来」、现在成了「核心」；1 位当时还有往来、现在待唤醒。
  const counts = {
    active: (now.active ?? 0) + 3,
    core: Math.max(0, (now.core ?? 0) - 2),
    dormant: Math.max(0, (now.dormant ?? 0) - 1),
    new: Math.max(0, (now.new ?? 0) - 5),
  };
  return {
    gate: null,
    highlights: {
      primary: ["community_nonprofit", "technology_internet"],
      secondary: ["community_nonprofit.industry_associations", "technology_internet.enterprise_software"],
    },
    snapshot: structureSnapshotView(buildDemoNetworkSnapshotView(real, lang), demoEvidenceNames(real, lang)),
    tierHistory: {
      earliestCaptureAt: demoTokyoAt(real, 400, "10:00"),
      tierCountsAt30d: { asOf: demoTokyoAt(real, 30, "00:00"), contactCount: counts.active + counts.core + counts.dormant + counts.new, counts },
    },
  };
}

/* ── 机会标签 ───────────────────────────────────────────────────── */

/** 待唤醒里与计划需求相关的示例联系人（诊所事务长、酒造专务都管自家的 IT 采购）。 */
const DORMANT_NEED_LINKS: Readonly<Record<string, string>> = { "ishikawa-riko": NEED_IT, "kimura-mari": NEED_IT };

function timelineSourceOf(seed: DemoContactSeed): RelationshipTimelineSource {
  if (seed.rich) return "memo";
  return seed.source === "event" ? "encounter" : "capture";
}

/** 机会标签：示例计划的覆盖度与补法、本周建议、待唤醒（规则拼句带依据）、报告卡（示例快照）。 */
export function buildDemoOpportunitiesView(real: Date, lang: Lang): OpportunitiesTabView {
  const parts = buildDemoNetworkOverviewParts(real, lang);
  const seeds = demoContactSeeds(real, lang);
  const plan = parts.plan
    ? {
      ...parts.plan,
      goal: DEMO_RELATIONSHIP_GOAL[lang],
      needs: parts.plan.needs.map((need) => ({
        ...need,
        linkedContactIds: Object.entries(DORMANT_NEED_LINKS).filter(([, needId]) => needId === need.needId).map(([slug]) => idOf(slug)),
      })),
    }
    : null;
  const dormant: DormantCandidate[] = seeds.filter((seed) => seed.tier === "dormant").map((seed) => ({
    contactId: seed.id,
    dormant: true,
    lastSignal: { occurredAt: demoTokyoAt(real, seed.daysAgo, "12:00"), recordId: `${timelineSourceOf(seed)}:demo-${seed.slug}`, source: timelineSourceOf(seed) },
    linkId: seed.id,
    name: seed.name,
    organization: seed.company,
    primaryIndustryId: industryOf(seed).primary,
    role: seed.title,
  }));
  return {
    ...buildOpportunitiesTabView(
      { bookable: [], dormant, gapNames: demoEvidenceNames(real, lang), goal: DEMO_RELATIONSHIP_GOAL[lang], pending: null, plan, report: buildDemoNetworkSnapshotView(real, lang) },
      { language: lang, now: real },
    ),
    gate: null,
  };
}

/* ── 洞察标签 ───────────────────────────────────────────────────── */

type InsightCopy = { relation: Copy; next: Copy; relevance: number; need?: string };

/** 8 位有完整详情的示例联系人：逐条写。 */
const RICH_INSIGHTS: Readonly<Record<string, InsightCopy>> = {
  "wang-yan": { need: NEED_IT, next: c("今天 14:00 见面时，请他引荐 IT 部门的系统采购决策人。", "At today's 14:00 meeting, ask him to introduce the IT decision-maker."), relation: c("北辰精工的采购部长，上次通话确认了 IT 部门才是系统采购的决策方，是找到 IT 负责人的桥梁。", "Head of procurement at Hokushin Seiko; on the last call he confirmed IT owns system purchases — your bridge to the IT lead."), relevance: 92 },
  "sato-misaki": { need: NEED_IT, next: c("约 20 分钟聊试用，带上会后整理时间的对比。", "Book 20 minutes for a trial chat and bring a before/after on note-taking time."), relation: c("丸和工业的情报系统课长，她们会后要花 30 分钟手写整理，正是试用要解决的问题。", "IT systems manager at Maruwa; her team spends 30 minutes writing up each meeting — exactly what the trial fixes."), relevance: 95 },
  "suzuki-ken": { need: NEED_IT, next: c("确认他是不是计划里要找的 IT 负责人，再约一次演示。", "Confirm he is the IT lead the plan needs, then book a demo."), relation: c("丸和工业的情报系统部部长，昨晚导入的名片，职位和「中小企业 IT 负责人」对得上。", "Head of IT at Maruwa, imported last night; the role matches “SME IT lead”."), relevance: 90 },
  "lin-zhiyuan": { need: NEED_CHANNEL, next: c("发一条问候，顺便问渠道分成和定价。", "Send a quick hello and ask about channel revenue share and pricing."), relation: c("Cloudia 的合作伙伴营业，六周前聊过日本 SaaS 渠道分成，是渠道代理最直接的人选。", "Partner sales at Cloudia; six weeks ago you discussed SaaS channel revenue share in Japan — your most direct reseller lead."), relevance: 88 },
  "takahashi-yumi": { need: NEED_CHANNEL, next: c("确认她是否负责新产品的渠道引入。", "Check whether she handles onboarding new products into the channel."), relation: c("Cloudia 株式会社的合作伙伴营业，和林志远同一家渠道商，可以两条线一起推进。", "Partner sales at Cloudia K.K., same reseller as Lin Zhiyuan — you can work both lines together."), relevance: 84 },
  "yamada-taro": { need: NEED_CHAMBER, next: c("在 JETRO 交流会上再见一次，请他介绍对 AI 工具感兴趣的企业。", "See him again at the JETRO mixer and ask for companies interested in AI tools."), relation: c("JETRO 东京的投资咨询顾问，接触大量想进入日本的企业，也认识本地商会的人。", "Investment advisor at JETRO Tokyo; meets many companies entering Japan and knows local chamber people."), relevance: 78 },
  "chen-siyuan": { next: c("12 月前同步一次试用进展和数据。", "Share trial progress and numbers before December."), relation: c("星桥资本的投资经理，关注 AI 应用出海，想看日本市场的试用数据。", "Investment manager at Starbridge Capital; follows AI apps going abroad and wants Japan trial data."), relevance: 62 },
  "nakamura-megumi": { need: NEED_CHAMBER, next: c("请她推荐 3 家愿意试点的会员企业。", "Ask her for 3 member companies willing to pilot."), relation: c("东京商工会议所中小企业支援课，手上有一批愿意尝试数字化工具的会员企业。", "SME support at the Tokyo Chamber of Commerce, with member companies open to digital tools."), relevance: 93 },
};

const IT_LEADS = new Set(["yamaguchi-takashi", "yoshida-yu", "fujita-makoto", "hasegawa-jin", "maeda-yu"]);
const CHANNEL = new Set(["matsumoto-aya", "zhang-hao"]);
const COMMUNITY = new Set(["zhou-ning"]);
const ADVISORS = new Set(["ito-naoko", "lin-meiling", "ikeda-wataru", "shimizu-nana", "kato-ryo"]);

function insightCopyFor(seed: DemoContactSeed, lang: Lang): InsightCopy {
  const rich = RICH_INSIGHTS[seed.slug];
  if (rich) return rich;
  const who = c(`${seed.company}的${seed.title}`, `${seed.title} at ${seed.company}`);
  // 模板句里的公司与职位已是界面语言（seed 已按语言取值），两种语言都用同一个 who。
  const at = (zh: string, en: string): Copy => c(zh.replace("{who}", who.zh), en.replace("{who}", who.en));
  const next = seed.next ? c(seed.next, seed.next) : null;
  if (IT_LEADS.has(seed.slug)) {
    return { need: NEED_IT, next: next ?? c("约 20 分钟聊试用。", "Book 20 minutes for a trial chat."), relation: at("{who}，管公司的 IT 系统，对应计划里的「中小企业 IT 负责人」。", "{who}; runs the company's IT systems — matches the plan's “SME IT lead”."), relevance: 80 };
  }
  if (CHANNEL.has(seed.slug)) {
    return { need: NEED_CHANNEL, next: next ?? c("问一句他们是否代理海外 SaaS。", "Ask whether they resell overseas SaaS."), relation: at("{who}，熟悉日本的软件渠道，可能帮你对接代理商。", "{who}; knows Japan's software channels and may connect you with resellers."), relevance: 72 };
  }
  if (COMMUNITY.has(seed.slug)) {
    return { need: NEED_CHAMBER, next: next ?? c("下次活动一起办。", "Co-host the next event."), relation: at("{who}，社群里有很多在日本创业的中小企业主。", "{who}; the community includes many SME founders in Japan."), relevance: 70 };
  }
  if (ADVISORS.has(seed.slug)) {
    return { next: next ?? c("请教一次，顺便问能否介绍客户。", "Ask for advice and whether they can introduce clients."), relation: at("{who}，专业服务圈的人，能给出海建议、也可能介绍客户。", "{who}; a professional-services contact who can advise on entering Japan and may refer clients."), relevance: 48 };
  }
  if (seed.tier === "dormant") {
    return { next: c("发一条问候，看看对方最近的情况。", "Send a quick hello to see how things are."), relation: at("{who}，曾经有往来，最近很久没联系，可以重新激活。", "{who}; you were in touch before but it has gone quiet — worth reviving."), relevance: 35 };
  }
  return { next: next ?? c("了解他们开会和记录的方式。", "Learn how they run and record meetings."), relation: at("{who}，公司会议多、记录靠手写，是潜在的试用客户。", "{who}; lots of meetings recorded by hand — a potential trial customer."), relevance: 58 };
}

function evidenceFor(seed: DemoContactSeed, copy: InsightCopy): ContactInsightEvidence[] {
  const timeline: ContactInsightEvidence = { id: `${timelineSourceOf(seed)}:demo-${seed.slug}`, source: timelineSourceOf(seed) };
  return copy.need ? [timeline, { id: copy.need, source: "plan_need" }] : [timeline];
}

function demoInsightRow(seed: DemoContactSeed, lang: Lang, generatedAt: string): InsightsTabRow & { daysAgo: number; countryCode: string; primaryIndustryId: string } {
  const copy = insightCopyFor(seed, lang);
  const insight: ContactInsightView = {
    canRegenerate: false,
    contactId: seed.id,
    deferredUntil: null,
    evidence: evidenceFor(seed, copy),
    generatedAt,
    goalRelation: copy.relation as ContactInsightText,
    goalUpdated: false,
    inProgress: false,
    nextStep: copy.next as ContactInsightText,
    relevance: copy.relevance,
    stale: false,
    state: "ready",
  };
  const { primary } = industryOf(seed);
  return {
    contactId: seed.id,
    countryCode: regionIdOf(seed).country,
    daysAgo: seed.daysAgo,
    href: `/app/contacts/${encodeURIComponent(seed.id)}`,
    industry: isIndustryIdCode(primary) ? { en: industryLabel(primary, "en"), zh: industryLabel(primary, "zh") } : null,
    insight,
    name: seed.name,
    primaryIndustryId: primary,
    subtitle: [seed.company, seed.title].filter(Boolean).join(" · "),
    tier: seed.tier,
  };
}

const TIER_RANK: Readonly<Record<NetworkTierGroup, number>> = { active: 1, core: 0, dormant: 3, new: 2 };

/**
 * 洞察标签：30 位示例联系人每人一条（和目标的关系、依据、下一步、强度档），与真实标签同一套 URL 查询——
 * 排序 相关度／强度档／最近往来，筛选 行业／地区／强度档，30 条一页。纯函数，不读任何来源。
 */
export function buildDemoInsightsView(real: Date, lang: Lang, search: Record<string, string | string[] | undefined>): InsightsTabView {
  const query = parseInsightsTabQuery(search);
  const generatedAt = demoTokyoAt(real, 0, "10:00");
  const rows = demoContactSeeds(real, lang)
    .map((seed) => demoInsightRow(seed, lang, generatedAt))
    .filter((row) => (!query.industry || row.primaryIndustryId === query.industry || row.primaryIndustryId === query.industry.split(".")[0])
      && (!query.country || row.countryCode === query.country)
      && (!query.tier || row.tier === query.tier));
  const sorted = [...rows].sort((left, right) => {
    if (query.sort === "tier") return TIER_RANK[left.tier!] - TIER_RANK[right.tier!] || (right.insight.relevance ?? 0) - (left.insight.relevance ?? 0) || left.contactId.localeCompare(right.contactId);
    if (query.sort === "recent") return left.daysAgo - right.daysAgo || left.contactId.localeCompare(right.contactId);
    return (right.insight.relevance ?? 0) - (left.insight.relevance ?? 0) || left.contactId.localeCompare(right.contactId);
  });
  const lastPage = Math.max(1, Math.ceil(sorted.length / CONTACT_INSIGHTS_TAB_PAGE_SIZE));
  const page = Math.min(query.page, lastPage);
  const slice = sorted.slice((page - 1) * CONTACT_INSIGHTS_TAB_PAGE_SIZE, page * CONTACT_INSIGHTS_TAB_PAGE_SIZE);
  const view = buildInsightsTabView({ goal: DEMO_RELATIONSHIP_GOAL[lang], now: real, page: null, query: { ...query, page } });
  return {
    ...view,
    hasNext: page < lastPage,
    options: insightsTabOptions(),
    rows: slice.map(({ daysAgo: _days, countryCode: _country, primaryIndustryId: _industry, ...row }) => row),
    state: "ready",
    total: sorted.length,
  };
}
