/**
 * 从一句目标里读出「要认识哪类人」的信号（W0008，RW-08）。
 *
 * 输入裁剪（`input-selector.ts`「与目标相关」）和 mock 生成器（人脉需求的行业条件、文案）
 * 共用同一张规则表，保证「选进来的联系人」和「计划里写的人脉需求」说的是同一类人。
 *
 * 规则是确定性的关键词匹配（中英文），行业 id 全部来自 `shared/domain/industries.ts`，
 * 一二级都经 `validateIndustrySelection` 校验过（见测试）。匹配不到时退回「关键决策者」，
 * 行业留给调用方按联系人的常见行业补。
 */
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";

export type PlanCopy = { en: string; zh: string };

export interface GoalArchetype {
  key: string;
  /** 目标里出现任一模式即命中（不区分大小写）。 */
  patterns: readonly RegExp[];
  /** 最想认识的那类人（人脉需求标题 / 「还缺」chip）。 */
  target: PlanCopy;
  /** 简短称呼，用在一句话回答和关键数字里。 */
  short: PlanCopy;
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  /** 职位关键词：人脉需求的匹配条件，也用来判断联系人是否「与目标相关」。 */
  titleKeywords: readonly string[];
  /** 第 1 阶段要搞清楚的两个问题。 */
  questions: readonly [PlanCopy, PlanCopy];
}

export const GOAL_ARCHETYPES: readonly GoalArchetype[] = [
  {
    key: "investor",
    patterns: [/投资人|融资|天使轮|VC|investor|fundrais|funding/i],
    primaryIndustryId: "finance_investment",
    questions: [
      { en: "Which funds are actively investing in your space this year?", zh: "今年哪些基金在积极投你这个赛道？" },
      { en: "What traction do they expect before a first meeting?", zh: "他们见面前希望看到什么数据？" },
    ],
    secondaryIndustryId: "finance_investment.venture_capital",
    short: { en: "investors", zh: "投资人" },
    target: { en: "Investors who follow your space", zh: "关注你赛道的投资人" },
    titleKeywords: ["投资", "合伙人", "Partner", "VC", "Investor"],
  },
  {
    key: "channel",
    patterns: [/渠道|代理商|经销|channel|reseller|distribut/i],
    primaryIndustryId: "trade_logistics",
    questions: [
      { en: "How do local channel partners usually get paid?", zh: "当地渠道伙伴一般怎么分成？" },
      { en: "Which partners already sell to your target customers?", zh: "哪些伙伴已经在卖给你的目标客户？" },
    ],
    secondaryIndustryId: "trade_logistics.cross_border_services",
    short: { en: "channel partners", zh: "渠道伙伴" },
    target: { en: "Channel partners in your target market", zh: "目标市场的渠道伙伴" },
    titleKeywords: ["渠道", "BD", "Partner", "代理", "営業"],
  },
  {
    key: "cofounder",
    patterns: [/合伙人|联合创始|CTO|技术负责人|co-?founder|technical partner/i],
    primaryIndustryId: "technology_internet",
    questions: [
      { en: "What would make a strong engineer leave a stable job for you?", zh: "什么条件能让一位好工程师离开稳定工作来加入？" },
      { en: "How much equity and salary is normal at your stage?", zh: "你这个阶段，股权和薪资一般怎么给？" },
    ],
    secondaryIndustryId: null,
    short: { en: "technical partners", zh: "技术合伙人" },
    target: { en: "Senior engineers open to co-founding", zh: "愿意一起创业的资深工程师" },
    titleKeywords: ["CTO", "工程师", "Engineer", "技术", "开发"],
  },
  {
    key: "hire",
    patterns: [/招到|招聘|招一位|hire|recruit/i],
    primaryIndustryId: "professional_services",
    questions: [
      { en: "What salary range does this role command locally?", zh: "这个岗位在当地的薪资范围是多少？" },
      { en: "Where do good candidates for this role hang out?", zh: "合适的候选人平时在哪些圈子里？" },
    ],
    secondaryIndustryId: "professional_services.human_resources",
    short: { en: "candidates", zh: "候选人" },
    target: { en: "Candidates and recruiters for the role", zh: "合适的候选人和招聘顾问" },
    titleKeywords: ["HR", "人事", "Recruit", "招聘", "猎头"],
  },
  {
    key: "supplier",
    patterns: [/供应商|供货|采购|supplier|sourcing|procure/i],
    primaryIndustryId: "manufacturing_supply_chain",
    questions: [
      { en: "What minimum order sizes are normal in this category?", zh: "这个品类一般的起订量是多少？" },
      { en: "How do buyers usually vet a new supplier?", zh: "采购方一般怎么考察新供应商？" },
    ],
    secondaryIndustryId: null,
    short: { en: "suppliers", zh: "供应商" },
    target: { en: "Reliable suppliers", zh: "稳定可靠的供应商" },
    titleKeywords: ["采购", "供应", "Supply", "工厂", "営業"],
  },
  {
    key: "store",
    patterns: [/门店|开店|店铺|store|shop|retail/i],
    primaryIndustryId: "real_estate_construction",
    questions: [
      { en: "Which neighbourhoods fit your customers and budget?", zh: "哪些街区适合你的客群和预算？" },
      { en: "What does it take to sign a first lease as a newcomer?", zh: "新来的人签第一份租约需要准备什么？" },
    ],
    secondaryIndustryId: "real_estate_construction.real_estate_services",
    short: { en: "retail property agents", zh: "店铺中介" },
    target: { en: "Retail property agents and landlords", zh: "商铺中介与业主" },
    titleKeywords: ["不动产", "中介", "店长", "Store", "Property"],
  },
  {
    key: "mentor",
    patterns: [/导师|前辈|mentor|advisor/i],
    primaryIndustryId: "professional_services",
    questions: [
      { en: "What do you most want a mentor to help with?", zh: "你最希望导师帮你解决什么问题？" },
      { en: "Who in your network has walked this path before?", zh: "你的人脉里谁走过这条路？" },
    ],
    secondaryIndustryId: "professional_services.management_consulting",
    short: { en: "mentors", zh: "行业导师" },
    target: { en: "An experienced mentor in your industry", zh: "有经验的行业导师" },
    titleKeywords: ["顾问", "Advisor", "社长", "CEO", "Founder"],
  },
  {
    key: "customer",
    patterns: [/客户|试用|订单|签约|决策者|customer|client|trial|pilot|sales|decision/i],
    primaryIndustryId: null,
    questions: [
      { en: "How do target customers handle this problem today?", zh: "目标客户现在怎么解决这个问题？" },
      { en: "Who signs off on a trial, and how long does it take?", zh: "试用需要谁点头？流程要多久？" },
    ],
    secondaryIndustryId: null,
    short: { en: "decision makers", zh: "企业决策人" },
    target: { en: "Decision makers at target customers", zh: "目标客户里能拍板的人" },
    titleKeywords: ["部长", "负责人", "Manager", "Director", "社长"],
  },
];

/** 匹配不到任何规则时的兜底。 */
export const DEFAULT_GOAL_ARCHETYPE: GoalArchetype = {
  key: "general",
  patterns: [],
  primaryIndustryId: null,
  questions: [
    { en: "Who has already achieved something like this goal?", zh: "谁已经做成过类似的事？" },
    { en: "What is the one thing blocking you right now?", zh: "现在最卡你的一件事是什么？" },
  ],
  secondaryIndustryId: null,
  short: { en: "key people", zh: "关键人" },
  target: { en: "Key people who can move your goal forward", zh: "能帮你推进目标的关键人" },
  titleKeywords: ["社长", "负责人", "Director", "Founder"],
};

export function goalArchetype(goalText: string): GoalArchetype {
  return GOAL_ARCHETYPES.find((entry) => entry.patterns.some((pattern) => pattern.test(goalText))) ?? DEFAULT_GOAL_ARCHETYPE;
}

/** 期限／时间表达：先去掉，免得「3 个月内」「within 3 months」被当成目标数字。 */
const TIME_EXPRESSIONS: readonly RegExp[] = [
  /\d+\s*(?:个)?\s*(?:天|日|周|星期|个月|月|季度|年)(?:内|以内|之内|后)?/g,
  /(?:一|两|三|四|五|六|七|八|九|十|半)\s*(?:个)?\s*(?:天|周|星期|个月|月|季度|年)(?:内|以内|之内|后)?/g,
  /(?:本月|本周|本季度|今年|年内|年底前|月底前)/g,
  /从\s*\d+\s*到\s*\d+/g,
  /\b(?:within|in|over|for|during|the next|next)\s+(?:the\s+)?(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?|months?|quarters?|years?)\b/gi,
  /\b(?:this|next|per|a|every|each|once a)\s+(?:week|month|quarter|year)\b/gi,
  /\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?(?:week|month|quarter|year)\b/gi,
  /\bfrom\s+\d+\s+to\s+\d+\b/gi,
];

/** 中文的业务结果量词（「个」只在后面跟着具体结果时才算）。 */
const ZH_OUTCOME = /(\d{1,4})\s*(家|位|名|人|场|笔|个(?=\s*(?:客户|伙伴|合作伙伴|渠道|项目|订单|供应商|门店|试用|投资人|候选人)))/;
const ZH_UNIT_EN: Record<string, string> = { 人: "people", 位: "people", 名: "people", 场: "events", 家: "companies", 个: "", 笔: "deals" };

/** 英文的业务结果名词 → 中文量词。 */
const EN_OUTCOMES: Record<string, string> = {
  businesses: "家", candidates: "位", candidate: "位", clients: "家", client: "家",
  companies: "家", company: "家", contacts: "位", contact: "位", customers: "家", customer: "家",
  deals: "笔", deal: "笔", "decision-makers": "位", "decision-maker": "位", events: "场", event: "场",
  hires: "位", hire: "位", introductions: "次", introduction: "次", investors: "位", investor: "位",
  leads: "个", lead: "个", meetings: "次", meeting: "次", mentors: "位", mentor: "位",
  partners: "位", partner: "位", people: "位", pilots: "家", pilot: "家", shops: "家", shop: "家",
  stores: "家", store: "家", suppliers: "家", supplier: "家", trials: "家", trial: "家", users: "位", user: "位",
};
const EN_OUTCOME = new RegExp(
  `(\\d{1,4})\\s+(?:[a-z][a-z-]*\\s+){0,2}?(${Object.keys(EN_OUTCOMES).sort((a, b) => b.length - a.length).join("|")})\\b`,
  "i",
);

/**
 * 目标里可衡量的业务结果，例如「10 家」「3 位」「10 enterprise customers」。
 * 先去掉期限和时间表达，只认业务结果的量词／名词；读不到可靠的结果返回 null（不编数字）。
 */
export function goalTarget(goalText: string): { value: number; unit: PlanCopy } | null {
  const text = TIME_EXPRESSIONS.reduce((current, pattern) => current.replace(pattern, " "), goalText);
  const zh = text.match(ZH_OUTCOME);
  if (zh) {
    const unit = zh[2]!;
    return { unit: { en: ZH_UNIT_EN[unit] ?? "", zh: unit }, value: Number(zh[1]) };
  }
  const en = text.match(EN_OUTCOME);
  if (en) {
    const noun = en[2]!.toLowerCase();
    return { unit: { en: noun, zh: EN_OUTCOMES[noun] ?? "" }, value: Number(en[1]) };
  }
  return null;
}

export interface GoalSignalContact {
  organization: string | null;
  role: string | null;
  primaryIndustryId: IndustryIdCode | null;
}

/** 联系人是否「与目标相关」：行业与规则表一致，或职位 / 公司里有规则的职位关键词。 */
export function isGoalRelatedContact(contact: GoalSignalContact, archetype: GoalArchetype): boolean {
  if (archetype.primaryIndustryId && contact.primaryIndustryId === archetype.primaryIndustryId) return true;
  const haystack = `${contact.role ?? ""} ${contact.organization ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  return archetype.titleKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}
