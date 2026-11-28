/**
 * Rule-based event matching (2026-11-28). The program decides who meets whom and writes why; no model picks people.
 *
 * Per person the rules derive (deterministically, from the registration answers and the account profile):
 *   identity   — founder / investor / finance advisor / corporate / channel / professional / student / other;
 *   categories — what their business is (shared/domain/business-categories.ts), and through it who their customers are;
 *   goals      — what they came for (their「这次最想得到」first);
 *   wants      — the kinds of people they asked to meet (many ticks each count for less).
 * A meeting is worth, for the reader: their goal answered (most) > a buyer / supplier relation > the kind of person they
 * asked for > an offer answering a need > a shared topic; plus 0.35 × what it is worth to the other side.
 * Reasons are built from the rule that fired and name the facts on both sides, so attendees see what to talk about.
 */
import {
  type BusinessCategory,
  businessCategory,
  categoriesInText,
  categoryIndustry,
  keywordPositions,
  sellsTo,
} from "../../../shared/domain/business-categories";
import { INDUSTRY_CATALOG } from "../../../shared/domain/industries";
import type {
  EventOperationsI18n,
  EventOperationsParticipant,
  EventOperationsRecommendationText,
  EventOperationsTextLanguage,
} from "./contract";
import { needConcept, offerAnswersNeed, offerConcept, tagInLanguage, tagKey, topicsShare } from "./match-concepts";

type Lang = EventOperationsTextLanguage;
type Text = Record<Lang, string>;

// ---------------------------------------------------------------- catalogs

export type Identity = "founder" | "investor" | "finance_advisor" | "corporate" | "channel" | "professional" | "student" | "other";
const IDENTITY_LABEL: Record<Identity, Text> = {
  channel: { en: "a sales / channel / trade business", ja: "販売・代理店・貿易の事業者", zh: "销售、渠道或贸易方" },
  corporate: { en: "someone running business at a company", ja: "事業会社の担当者", zh: "企业里负责业务的人" },
  finance_advisor: { en: "a fundraising / M&A adviser", ja: "資金調達・M&Aのアドバイザー", zh: "融资或并购顾问" },
  founder: { en: "a founder / business owner", ja: "起業家・経営者", zh: "创业者或经营者" },
  investor: { en: "an investor", ja: "投資家", zh: "投资人" },
  other: { en: "an attendee", ja: "参加者", zh: "参加者" },
  professional: { en: "a professional adviser", ja: "専門家", zh: "专业人士" },
  student: { en: "a student", ja: "学生", zh: "学生" },
};

export type Goal = "find_investment" | "find_deals" | "ma" | "find_customers" | "find_channel" | "find_partner" | "co_founder"
  | "find_supplier" | "find_talent" | "learn" | "network";
const GOAL_LABEL: Record<Goal, Text> = {
  co_founder: { en: "find a co-founder", ja: "共同創業者を探すこと", zh: "找联合创始人" },
  find_channel: { en: "find sales channels", ja: "販路・代理店を見つけること", zh: "找渠道、打开销路" },
  find_customers: { en: "find customers", ja: "顧客を見つけること", zh: "找客户" },
  find_deals: { en: "find companies to invest in", ja: "投資先を見つけること", zh: "找值得投资的项目" },
  find_investment: { en: "raise funding", ja: "資金調達", zh: "找投资" },
  find_partner: { en: "find business partners", ja: "提携先を見つけること", zh: "找合作伙伴" },
  find_supplier: { en: "find suppliers", ja: "仕入れ先・委託先を見つけること", zh: "找供应商" },
  find_talent: { en: "find people to hire", ja: "人材を見つけること", zh: "找人才" },
  learn: { en: "learn about the industry", ja: "業界の情報収集", zh: "了解行业动向" },
  ma: { en: "M&A", ja: "M&A", zh: "并购" },
  network: { en: "grow your network", ja: "人脈づくり", zh: "拓展人脉" },
};

export type Want = "founder" | "investor" | "corporate" | "sales" | "marketing" | "professional" | "researcher" | "designer"
  | "engineer" | "same_industry" | "other_industry" | "media" | "organizer" | "mentor";
const WANT_LABEL: Record<Want, Text> = {
  corporate: { en: "people running business at companies", ja: "事業会社の担当者", zh: "企业业务负责人" },
  designer: { en: "designers", ja: "デザイナー", zh: "设计师" },
  engineer: { en: "engineers", ja: "エンジニア", zh: "工程师" },
  founder: { en: "founders and business owners", ja: "起業家・経営者", zh: "创业者、经营者" },
  investor: { en: "investors", ja: "投資家", zh: "投资人" },
  marketing: { en: "marketers", ja: "マーケター", zh: "市场人员" },
  media: { en: "media and influencers", ja: "メディア・インフルエンサー", zh: "媒体与 KOL" },
  mentor: { en: "industry mentors", ja: "業界のメンター", zh: "行业前辈" },
  organizer: { en: "event and community organisers", ja: "イベント・コミュニティの主催者", zh: "活动和社群主办方" },
  other_industry: { en: "people from other industries", ja: "異業種の人", zh: "不同行业的人" },
  professional: { en: "professional advisers", ja: "専門家（士業・コンサル）", zh: "专业人士" },
  researcher: { en: "researchers", ja: "研究者", zh: "研究人员" },
  sales: { en: "sales and business-development people", ja: "営業・事業開発の人", zh: "销售、业务拓展人员" },
  same_industry: { en: "people in your industry", ja: "同じ業界の人", zh: "同行业的人" },
};
const WANT_PATTERNS: readonly [Want, RegExp][] = [
  ["investor", /投资人|投資家|investor|エンジェル/iu],
  ["founder", /创业者|经营者|起業家|経営者|founder|executive|社長/iu],
  ["corporate", /企业业务负责人|事業会社|企業の|企业决策|大企業|enterprise|established compan/iu],
  ["sales", /销售|业务拓展|営業|事業開発|sales|business development|代理店|渠道/iu],
  ["marketing", /市场人员|マーケター|marketer|营销/iu],
  ["professional", /专业人士|専門家|士業|コンサル|advisor|consultant|律师|会计/iu],
  ["researcher", /研究/iu],
  ["designer", /设计师|デザイナー|designer/iu],
  ["engineer", /工程师|エンジニア|engineer|技术人才|技術人材/iu],
  ["same_industry", /同行业|同じ業界|同業|同行|my industry|業界の人脈/iu],
  ["other_industry", /不同行业|異業種|異業界|other industr|outside my industry/iu],
  ["media", /メディア|kol|媒体|influencer|インフルエンサー/iu],
  ["organizer", /主催|主办|社群运营|コミュニティ運営|organi[sz]er|community builder/iu],
  ["mentor", /メンター|导师|行业专家|業界専門家|mentor|industry expert/iu],
];

const GOAL_PATTERNS: readonly [Goal, RegExp][] = [
  ["co_founder", /联合创始人|共同創業|co-?founder/iu],
  ["ma", /并购|m&a|套现|卖公司|買収|事業承継|事業売却/iu],
  ["find_investment", /投资|融资|資金調達|投資家|investor|funding|fundrais|出资|资金/iu],
  ["find_channel", /渠道|代理|販路|販売パートナー|channel|进入.{0,6}市场|出海|海外展開|进军/iu],
  ["find_customers", /客户|顧客|customer|销路|新規開拓|获客|お客/iu],
  ["find_supplier", /供应商|サプライヤー|supplier|外包|委託先|仕入/iu],
  ["find_talent", /招聘|採用|人才|talent|hire|hiring/iu],
  ["find_partner", /合作|提携|パートナー|伙伴|partner|协作|協業|对接/iu],
  ["learn", /趋势|学习|情報収集|ヒント|心得|经验|trend|learn|勉強|知识|知見|insight/iu],
  ["network", /人脉|人脈|拓展|広げ|network|新朋友|交流/iu],
];

// ---------------------------------------------------------------- per-person attributes

export interface MatchAttributes {
  categories: readonly BusinessCategory[];
  goals: readonly { goal: Goal; weight: number }[];
  identity: Identity;
  industryId: string | null;
  wants: readonly { want: Want; weight: number }[];
  /** The person's own customer industries from their profile (overrides the category defaults); null = use defaults. */
  customers: readonly string[] | null;
  /** They sell only to individuals: no business buyer relations. */
  consumerOnly: boolean;
}

const IDENTITIES = new Set<string>(["founder", "investor", "finance_advisor", "corporate", "channel", "professional", "student", "other"]);
const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US");
const INDUSTRY_BY_LABEL = new Map(INDUSTRY_CATALOG.flatMap((industry) => Object.values(industry.labels).map((label) => [fold(label), industry.id] as const)));
const OWNER_ROLE = /社長|代表|ceo|founder|创始|創業|董事长|会长|会長|総経理|总经理|経営者|经营者|役員|执行役员|執行役員|owner|本部长|理事长|理事長|オーナー/iu;
const STUDENT = /学生|在读|大学生|留学生|student|求职|就活/iu;
const PROFESSIONAL = /律师|弁護士|会计|会計|税理士|税务师|コンサル|顾问|咨询师|consult|lawyer|accountant|行政書士|行政书士|社労士|弁理士|四大|big ?4/iu;
const ANGEL_OFFER = /エンジェル投資|天使投资|angel invest|出資・投資|个人出资/iu;
const INVESTOR_TEXT = /投资人|投資家として|出资|出資|vc|风投|ベンチャーキャピタル|基金合伙人|investor/iu;

const cache = new WeakMap<EventOperationsParticipant, MatchAttributes>();

function splitTerms(values: readonly string[] | undefined): string[] {
  return (values ?? []).flatMap((value) => value.split(/\s+·\s+/u)).map((value) => value.trim()).filter(Boolean);
}

export function matchAttributes(participant: EventOperationsParticipant): MatchAttributes {
  const cached = cache.get(participant);
  if (cached) return cached;
  const about = participant.about ?? "";
  const role = participant.role ?? "";
  const industryId = participant.industry ? INDUSTRY_BY_LABEL.get(fold(participant.industry.trim())) ?? null : null;

  // Categories: keywords in what they wrote about themselves; the earliest-mentioned first, same-industry first on ties.
  const text = [participant.company ?? "", role, about].join(" / ");
  const folded = fold(text);
  // A field they are only interested in (「生成AIに関心」「关注中国市场」) is not their business.
  const interestOnly = (at: number, keyword: string) =>
    /^.{0,3}(に関心|に興味|への関心|の情報交換|感兴趣|的兴趣|interest)/u.test(folded.slice(at + keyword.length)) || /(关注|关心|興味|関心|交流|希望|interested in)[^/／。、，,]{0,4}$/u.test(folded.slice(Math.max(0, at - 8), at));
  // A word inside a clause about who they want to meet, or about experience they have, is not their business
  // (「メディア関係者とつながりたい」「具备游戏玩法与系统策划经验」).
  const clauseOf = (at: number) => {
    const start = Math.max(...["。", "，", ",", "、", "/", "／", "！", "!", "；", ";", "\n"].map((mark) => folded.lastIndexOf(mark, at)));
    const ends = ["。", "，", ",", "/", "／", "！", "!", "；", ";", "\n"].map((mark) => folded.indexOf(mark, at)).filter((end) => end >= 0);
    return folded.slice(start + 1, ends.length ? Math.min(...ends) : folded.length);
  };
  const notTheirBusiness = (at: number) => /想认识|希望认识|想结识|つながりたい|知り合いたい|出会いたい|want to meet|具备|经验|経験|スキル|experience in|个人网站|個人サイト|趣味|副业|副業|hobby|side project/u.test(clauseOf(at));
  // Per category, its earliest mention that is not an interest-only mention.
  const rawHits = categoriesInText(text).flatMap(({ category }) => {
    const first = keywordPositions(folded, category).filter((hit) => !interestOnly(hit.at, hit.keyword) && !notTheirBusiness(hit.at)).sort((a, b) => a.at - b.at)[0];
    return first ? [{ at: first.at, category, keyword: first.keyword }] : [];
  });
  // Two keywords from the same place: the longer one says what it is (「古玩城招商」 is property leasing, not antiques).
  const hits = rawHits.filter((hit) => !rawHits.some((other) => other !== hit && other.at <= hit.at && other.at + other.keyword.length >= hit.at + hit.keyword.length && other.keyword.length > hit.keyword.length));
  hits.sort((a, b) => (a.at - b.at) || (Number(categoryIndustry(b.category) === industryId) - Number(categoryIndustry(a.category) === industryId)));
  // Profile fields first (confirmed or inferred, 2026-11-28), then what the free text says.
  const fields = participant.matchFields;
  const categories: BusinessCategory[] = [];
  for (const id of fields?.businessCategoryIds ?? []) {
    const category = businessCategory(id);
    if (category && !categories.includes(category)) categories.push(category);
  }
  for (const hit of hits) if (!categories.includes(hit.category) && categories.length < 4) categories.push(hit.category);
  const fieldIdentity = IDENTITIES.has(fields?.identity ?? "") ? (fields!.identity as Identity) : null;

  // Goals: the event goal (desiredOutcome) in its order, then the remaining needs.
  const goalTerms = participant.goals?.length ? participant.goals : [];
  const goals: { goal: Goal; weight: number }[] = [];
  const addGoal = (goal: Goal, weight: number) => {
    const existing = goals.find((entry) => entry.goal === goal);
    if (existing) existing.weight = Math.max(existing.weight, weight);
    else goals.push({ goal, weight });
  };
  const offersText = participant.offers.join(" / ");
  const isInvestor = fieldIdentity ? fieldIdentity === "investor" : ANGEL_OFFER.test(offersText) || (INVESTOR_TEXT.test(about + role) && participant.offers.some((offer) => offerConcept(offer) === "investor_intro"))
    || categories.some((category) => ["angel_investing", "vc_fund", "cvc"].includes(category.id));
  const isFinanceAdvisor = fieldIdentity ? fieldIdentity === "finance_advisor" : !isInvestor && (categories.some((category) => ["ma_advisory", "fundraising_advisory"].includes(category.id))
    || !OWNER_ROLE.test(role) && participant.offers.some((offer) => /VCの紹介|投資家の紹介|投融资资源|investor intro|M&A・事業売却支援/iu.test(offer)));
  const dealSide = isInvestor || isFinanceAdvisor;
  if (isInvestor && !categories.some((category) => ["angel_investing", "vc_fund", "cvc", "pe_buyout"].includes(category.id))) {
    const angel = businessCategory(ANGEL_OFFER.test(offersText) ? "angel_investing" : "vc_fund");
    if (angel) categories.unshift(angel);
    if (categories.length > 4) categories.length = 4;
  }
  goalTerms.forEach((term, index) => {
    for (const [goal, pattern] of GOAL_PATTERNS) {
      if (!pattern.test(term)) continue;
      // An investor "looking for founders who need funding" is looking for deals.
      addGoal(dealSide && goal === "find_investment" ? "find_deals" : goal, index === 0 ? 1 : index === 1 ? 0.8 : 0.6);
      if (goal !== "ma") break;
    }
  });
  for (const need of participant.needs) {
    const concept = needConcept(need);
    const goal: Goal | null = concept === "funding" ? (dealSide ? "find_deals" : "find_investment")
      : concept === "customers" || concept === "enterprise" ? "find_customers"
        : concept === "channel" || concept === "overseas" ? "find_channel"
          : concept === "partner" ? (/共同創業|联合创始人|co-?founder/iu.test(need) ? "co_founder" : "find_partner")
            : concept === "supplier" ? "find_supplier"
              : concept === "hiring_eng" || concept === "hiring_biz" ? "find_talent"
                : concept === "ma" ? "ma" : null;
    if (goal && !(dealSide && goal === "find_investment")) addGoal(goal, 0.4);
  }
  // What they wrote about themselves: 「正在寻找投资」「希望找到联合创始人」 is a goal even when the event answer is vaguer.
  if (!dealSide && /(寻找|找|募集|希望获得|获得)(投资|融资)|資金調達を(目指|検討|予定)|fundrais|raising (money|funds)/iu.test(about)) addGoal("find_investment", 0.8);
  if (/联合创始人|共同創業者を|co-?founder/iu.test(about)) addGoal("co_founder", 0.6);
  if (isFinanceAdvisor && categories.some((category) => category.id === "ma_advisory")) addGoal("ma", 0.6);
  if (isInvestor && /并购|m&a|買収|套现|卖公司/iu.test(goalTerms.join(" ") + about)) addGoal("ma", 0.8);

  const seniorityOwner = Boolean(participant.seniority && /founder|c_level|owner/iu.test(participant.seniority));
  const hasGoal = (goal: Goal) => goals.some((entry) => entry.goal === goal);
  const identity: Identity = fieldIdentity ?? (isInvestor ? "investor"
    : STUDENT.test(role) || (!role && STUDENT.test(about.slice(0, 20))) ? "student"
      : OWNER_ROLE.test(role) || seniorityOwner ? "founder"
        : categories.some((category) => ["ma_advisory", "fundraising_advisory"].includes(category.id))
          || isFinanceAdvisor && !hasGoal("find_investment") ? "finance_advisor"
          : PROFESSIONAL.test(role + about.slice(0, 60)) ? "professional"
            : goals.some((entry) => (entry.goal === "find_investment" || entry.goal === "co_founder") && entry.weight >= 0.6) ? "founder"
              : categories[0] && ["trade_logistics"].includes(categoryIndustry(categories[0])) || categories.some((category) => ["wholesale_distribution", "building_materials_trade", "import_export", "ec_seller"].includes(category.id)) ? "channel"
                : categories.length || role ? "corporate" : "other");

  // Wants: who they ticked; many ticks each count for less (4 or fewer count fully).
  const wantSet = new Map<Want, number>();
  const wantTerms = splitTerms(participant.wants?.length ? participant.wants : participant.needs.filter((need) => WANT_PATTERNS.some(([, pattern]) => pattern.test(need))));
  for (const term of wantTerms) for (const [want, pattern] of WANT_PATTERNS) if (pattern.test(term) && !wantSet.has(want)) wantSet.set(want, 1);
  const wantWeight = Math.min(1, 4 / Math.max(1, wantSet.size));
  const wants = [...wantSet.keys()].map((want) => ({ want, weight: wantWeight }));

  const consumerOnly = fields?.sellsTo === "consumer";
  const customers = fields?.customerIndustryIds?.length && !consumerOnly ? fields.customerIndustryIds : null;
  const result: MatchAttributes = { categories, consumerOnly, customers, goals, identity, industryId, wants };
  cache.set(participant, result);
  return result;
}

// ---------------------------------------------------------------- pair value

type Finding =
  | { kind: "investor"; goal: Goal }
  | { kind: "finance_advisor"; goal: Goal }
  | { kind: "deal"; goal: Goal }
  | { kind: "ma"; goal: Goal }
  | { kind: "buyer"; goal: Goal | null; mine: BusinessCategory; theirs: BusinessCategory }
  | { kind: "supplier"; goal: Goal | null; mine: BusinessCategory; theirs: BusinessCategory }
  | { kind: "channel"; goal: Goal }
  | { kind: "maybe_buyer"; goal: Goal; mine: BusinessCategory }
  | { kind: "market_entry"; theirs: BusinessCategory }
  | { kind: "entry_client"; mine: BusinessCategory }
  | { kind: "offer"; goal: Goal | null; offer: string; need: string }
  | { kind: "peer"; goal: Goal | null; category: BusinessCategory | null }
  | { kind: "want"; want: Want }
  | { kind: "talent"; goal: Goal };

export interface RuleMatch {
  findings: readonly { finding: Finding; value: number }[];
  /** Value to the reader alone. */
  own: number;
  /** own + 0.35 × the other side's own value; 0 for colleagues. */
  value: number;
}

const ENTRY_TEXT = /日本市场|日本落地|进入日本|日本進出|日本市場|出海|海外展開|中国市场|中国進出|对接中日|中日资源|japan market|going global/iu;
const ENTRY_CATEGORIES = new Set(["overseas_entry_consulting", "cross_border_services"]);
/** Someone with a business taking it into Japan / China: said in a goal or need, or in what they do (not in what they only follow). */
function needsEntry(participant: EventOperationsParticipant, attributes: MatchAttributes): boolean {
  if (attributes.identity === "student" || !attributes.categories.length) return false;
  const about = (participant.about ?? "").replace(/(关注|关心|興味|関心)[^，,。、/／]*/gu, "");
  return ENTRY_TEXT.test(`${about} ${(participant.goals ?? []).join(" ")} ${participant.needs.join(" ")}`);
}
const GENERIC_OFFERS = new Set(["mentoring", "alliance", "events", "new_business"]);
const SALES_OFFERS = new Set(["channel", "enterprise_intro", "overseas_market", "japan_market", "china_market", "alliance"]);

const sameCompany = (a: EventOperationsParticipant, b: EventOperationsParticipant) =>
  Boolean(a.company && b.company && a.company.trim().toLocaleLowerCase("en") === b.company.trim().toLocaleLowerCase("en"));

/**
 * The first seller → buyer relation between two people's categories; primary when both are among their two main lines
 * of business. The seller's own customer industries (profile) replace the category defaults; consumer-only sellers have
 * no business buyers.
 */
function firstPair(seller: MatchAttributes, buyer: MatchAttributes) {
  if (seller.consumerOnly) return null;
  for (const [i, mine] of seller.categories.entries()) for (const [j, theirs] of buyer.categories.entries()) {
    if (mine.id === theirs.id) continue;
    const ok = seller.customers
      ? seller.customers.some((customer) => customer === theirs.id || customer === theirs.parent || customer === categoryIndustry(theirs))
      : sellsTo(mine, theirs);
    if (ok) return { buyer: theirs, primary: i <= 1 && j <= 1, seller: mine };
  }
  return null;
}

function wantMatch(want: Want, reader: MatchAttributes, other: EventOperationsParticipant, them: MatchAttributes): number {
  const roleAbout = `${other.role ?? ""} ${other.about ?? ""}`;
  switch (want) {
    case "founder": return them.identity === "founder" ? 1 : 0;
    case "investor": return them.identity === "investor" ? 1 : them.identity === "finance_advisor" ? 0.5 : 0;
    case "corporate": return them.identity === "corporate" ? 1 : 0;
    case "sales": return them.identity === "channel" ? 1 : other.offers.some((offer) => SALES_OFFERS.has(offerConcept(offer) ?? "") && offerConcept(offer) !== "alliance") ? 0.7 : 0;
    case "marketing": return /营销|マーケ|marketing|市场|ブランド|品牌/iu.test(roleAbout) || them.categories.some((category) => category.parent === "media_creative.advertising_marketing") ? 1 : 0;
    case "professional": return them.identity === "professional" ? 1 : them.identity === "finance_advisor" ? 0.6 : 0;
    case "researcher": return /研究|博士|教授|research|phd/iu.test(roleAbout) ? 1 : 0;
    case "designer": return them.categories.some((category) => ["design_studio", "architecture_interior"].includes(category.id)) || /设计师|デザイナー|designer/iu.test(roleAbout) ? 1 : 0;
    case "engineer": return /engineer|工程师|エンジニア|cto|开发|開発/iu.test(other.role ?? "") ? 1 : 0;
    case "same_industry": return reader.industryId && reader.industryId === them.industryId && reader.industryId !== "other" ? 1 : 0;
    case "other_industry": return reader.industryId && them.industryId && reader.industryId !== them.industryId ? 0.3 : 0;
    case "media": return them.categories.some((category) => category.parent.startsWith("media_creative")) ? 1 : 0;
    case "organizer": return them.categories.some((category) => ["community_operator", "chamber_association", "event_production"].includes(category.id)) || other.offers.some((offer) => offerConcept(offer) === "events") ? 1 : 0;
    case "mentor": return (them.identity === "founder" || them.identity === "investor") && reader.industryId === them.industryId ? 0.7 : 0;
  }
}

/** What `reader` gains from meeting `other`, with the facts that make it so. */
export function ruleOwnValue(reader: EventOperationsParticipant, other: EventOperationsParticipant): { findings: { finding: Finding; value: number }[]; own: number } {
  const me = matchAttributes(reader);
  const them = matchAttributes(other);
  const findings: { finding: Finding; value: number }[] = [];
  const theyBuy = firstPair(me, them); // they may buy from me
  const iBuy = firstPair(them, me); // I may buy from them
  const theirGoal = (goal: Goal, min = 0) => them.goals.some((entry) => entry.goal === goal && entry.weight >= min);

  // 1. What they came for.
  for (const { goal, weight } of me.goals) {
    let best: { finding: Finding; value: number } | null = null;
    const consider = (finding: Finding, value: number) => { if (!best || value > best.value) best = { finding, value }; };
    switch (goal) {
      case "find_investment":
        if (them.identity === "investor") consider({ goal, kind: "investor" }, 1);
        else if (them.identity === "finance_advisor") consider({ goal, kind: "finance_advisor" }, 0.5);
        break;
      case "find_deals":
        if (them.identity !== "investor" && theirGoal("find_investment", 0.8)) consider({ goal, kind: "deal" }, 1);
        if (theirGoal("ma")) consider({ goal, kind: "ma" }, 0.7);
        break;
      case "ma":
        if (them.identity === "investor" || them.identity === "finance_advisor" || theirGoal("ma")) consider({ goal, kind: "ma" }, 0.8);
        break;
      case "find_customers":
        if (theyBuy) consider({ goal, kind: "buyer", mine: theyBuy.seller, theirs: theyBuy.buyer }, theyBuy.primary ? 1 : 0.7);
        if (them.identity === "channel") consider({ goal, kind: "channel" }, 0.6);
        // Selling to any business (SaaS, AI tools): every company here is a possible user, a weak reason on its own.
        if (!theyBuy && me.categories[0]?.customers.includes("*") && me.identity !== "investor" && me.identity !== "finance_advisor"
          && !them.categories.some((category) => category.id === me.categories[0]!.id) && (them.identity === "corporate" || them.identity === "founder" || them.identity === "channel") && them.categories.length) {
          consider({ goal, kind: "maybe_buyer", mine: me.categories[0] }, 0.35);
        }
        break;
      case "find_channel":
        if (them.identity === "channel") consider({ goal, kind: "channel" }, theyBuy ? 1 : 0.8);
        else if (theyBuy) consider({ goal, kind: "buyer", mine: theyBuy.seller, theirs: theyBuy.buyer }, theyBuy.primary ? 0.7 : 0.5);
        break;
      case "find_partner":
      case "co_founder":
        if (theyBuy) consider({ goal, kind: "buyer", mine: theyBuy.seller, theirs: theyBuy.buyer }, theyBuy.primary ? 0.9 : 0.6);
        if (iBuy) consider({ goal, kind: "supplier", mine: iBuy.buyer, theirs: iBuy.seller }, iBuy.primary ? 0.9 : 0.6);
        if (them.identity === "channel") consider({ goal, kind: "channel" }, 0.5);
        break;
      case "find_supplier":
        if (iBuy) consider({ goal, kind: "supplier", mine: iBuy.buyer, theirs: iBuy.seller }, iBuy.primary ? 1 : 0.7);
        break;
      case "find_talent":
        if (them.identity === "student" || other.offers.some((offer) => offerConcept(offer) === "hiring")) consider({ goal, kind: "talent" }, 0.6);
        break;
      case "learn": {
        const shared = me.categories.find((category) => them.categories.some((theirs) => theirs.id === category.id)) ?? null;
        if (shared) consider({ category: shared, goal, kind: "peer" }, 0.6);
        else if (me.industryId && me.industryId === them.industryId && me.industryId !== "other") consider({ category: null, goal, kind: "peer" }, 0.4);
        break;
      }
      case "network":
        break;
    }
    if (best) findings.push({ finding: (best as { finding: Finding }).finding, value: 3 * weight * (best as { value: number }).value });
  }
  // 2. A buyer / supplier relation they did not name as a goal is still a reason to talk.
  if (theyBuy && !findings.some((entry) => entry.finding.kind === "buyer")) findings.push({ finding: { goal: null, kind: "buyer", mine: theyBuy.seller, theirs: theyBuy.buyer }, value: theyBuy.primary ? 1.2 : 0.7 });
  if (iBuy && !findings.some((entry) => entry.finding.kind === "supplier")) findings.push({ finding: { goal: null, kind: "supplier", mine: iBuy.buyer, theirs: iBuy.seller }, value: iBuy.primary ? 1 : 0.6 });
  // 2b. Taking a business into Japan / China, and someone whose work is helping companies do exactly that.
  const entry = them.categories.find((category) => ENTRY_CATEGORIES.has(category.id));
  if (entry && !me.categories.some((category) => ENTRY_CATEGORIES.has(category.id)) && needsEntry(reader, me)) {
    findings.push({ finding: { kind: "market_entry", theirs: entry }, value: 1.5 });
  }
  const myEntry = me.categories.find((category) => ENTRY_CATEGORIES.has(category.id));
  if (myEntry && !them.categories.some((category) => ENTRY_CATEGORIES.has(category.id)) && needsEntry(other, them)) {
    findings.push({ finding: { kind: "entry_client", mine: myEntry }, value: 1.2 });
  }
  // 3. The kind of person they asked for.
  let wantTotal = 0;
  for (const { want, weight } of me.wants) {
    const value = wantMatch(want, me, other, them) * weight;
    if (value > 0) { wantTotal += value; findings.push({ finding: { kind: "want", want }, value }); }
  }
  if (wantTotal > 1.5) for (const entry of findings) if (entry.finding.kind === "want") entry.value *= 1.5 / wantTotal;
  // 4. An offer that answers a need (specific offers count fully, generic ones less).
  let offerBest: { finding: Finding; value: number } | null = null;
  for (const need of reader.needs) {
    for (const offer of other.offers) {
      if (!offerAnswersNeed(need, offer)) continue;
      const concept = offerConcept(offer);
      // "Funding" from someone who neither invests nor advises on raising is a conversation, not a source of money.
      if (needConcept(need) === "funding" && them.identity !== "investor" && them.identity !== "finance_advisor") continue;
      const value = concept && GENERIC_OFFERS.has(concept) ? 0.3 : 0.8;
      if (!offerBest || value > offerBest.value) offerBest = { finding: { goal: null, kind: "offer", need, offer }, value };
    }
  }
  const NEED_GOAL: Record<string, Goal> = { channel: "find_channel", customers: "find_customers", enterprise: "find_customers", funding: "find_investment", ma: "ma", partner: "find_partner", supplier: "find_supplier" };
  const offerNeedGoal = offerBest && offerBest.finding.kind === "offer" ? NEED_GOAL[needConcept(offerBest.finding.need) ?? ""] : undefined;
  const repeats = offerNeedGoal && findings.some((entry) => "goal" in entry.finding && entry.finding.goal === offerNeedGoal);
  if (offerBest && !repeats) findings.push(offerBest);
  // 5. A shared topic.
  const topics = reader.topics.filter((topic) => other.topics.some((theirs) => topicsShare(topic, theirs))).length;
  const own = findings.reduce((sum, entry) => sum + entry.value, 0) + Math.min(0.4, 0.2 * topics);
  findings.sort((a, b) => b.value - a.value);
  return { findings, own };
}

export function ruleMatch(reader: EventOperationsParticipant, other: EventOperationsParticipant): RuleMatch {
  if (reader.participantId === other.participantId || sameCompany(reader, other)) return { findings: [], own: 0, value: 0 };
  const mine = ruleOwnValue(reader, other);
  const theirs = ruleOwnValue(other, reader);
  return { findings: mine.findings, own: mine.own, value: mine.own + 0.35 * theirs.own };
}

// ---------------------------------------------------------------- choosing recommendations

/**
 * Each person's ranked picks, with a cap on how many people one person is recommended to (about a third of the room,
 * at least 3), so one broadly useful person does not take everyone's first slot. Picks are filled rank by rank across
 * everyone, so the cap moves later ranks first. Deterministic.
 */
export function chooseRecommendations(participants: readonly EventOperationsParticipant[], count: number): Map<string, { target: EventOperationsParticipant; match: RuleMatch }[]> {
  const ordered = [...participants].sort((a, b) => a.participantId.localeCompare(b.participantId));
  const cap = Math.max(3, Math.ceil(ordered.length / 3));
  const proposals = ordered.flatMap((source) => ordered
    .filter((target) => target.participantId !== source.participantId)
    .map((target) => ({ match: ruleMatch(source, target), source, target }))
    .filter((entry) => entry.match.value > 0));
  // Best introductions first, room-wide: a capped person goes to the people who gain most from meeting them.
  proposals.sort((a, b) => b.match.value - a.match.value || a.source.participantId.localeCompare(b.source.participantId) || a.target.participantId.localeCompare(b.target.participantId));
  const exposure = new Map<string, number>();
  const picks = new Map(ordered.map((source) => [source.participantId, [] as { target: EventOperationsParticipant; match: RuleMatch }[]]));
  const take = (entry: (typeof proposals)[number], capped: boolean) => {
    const chosen = picks.get(entry.source.participantId)!;
    if (chosen.length >= count || chosen.some((pick) => pick.target.participantId === entry.target.participantId)) return;
    if (capped && (exposure.get(entry.target.participantId) ?? 0) >= cap) return;
    chosen.push({ match: entry.match, target: entry.target });
    exposure.set(entry.target.participantId, (exposure.get(entry.target.participantId) ?? 0) + 1);
  };
  for (const entry of proposals) take(entry, true);
  // Rebalance a capped person (2026-11-28): if someone without them would gain clearly more than one of their current
  // holders loses (that holder's next-best unused option), hand the slot over. Bounded passes, deterministic.
  const valueOf = new Map(proposals.map((entry) => [`${entry.source.participantId}\u0000${entry.target.participantId}`, entry]));
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const [sourceId, chosen] of picks) {
      if (chosen.length < count) continue;
      const weakest = chosen.reduce((low, pick) => (pick.match.value < low.match.value ? pick : low), chosen[0]!);
      for (const entry of proposals) {
        if (entry.source.participantId !== sourceId || chosen.some((pick) => pick.target.participantId === entry.target.participantId)) continue;
        if (entry.match.value <= weakest.match.value + 1) break;
        const holders = [...picks.entries()].filter(([holder, list]) => holder !== sourceId && list.some((pick) => pick.target.participantId === entry.target.participantId));
        let bestSwap: { holder: string; loss: number; replacement: (typeof proposals)[number] } | null = null;
        for (const [holder, list] of holders) {
          const replacement = proposals.find((option) => option.source.participantId === holder && !list.some((pick) => pick.target.participantId === option.target.participantId)
            && option.target.participantId !== entry.target.participantId && (exposure.get(option.target.participantId) ?? 0) < cap);
          if (!replacement) continue;
          const held = valueOf.get(`${holder}\u0000${entry.target.participantId}`)!.match.value;
          const loss = held - replacement.match.value;
          if (!bestSwap || loss < bestSwap.loss) bestSwap = { holder, loss, replacement };
        }
        const gain = entry.match.value - weakest.match.value;
        if (!bestSwap || gain <= bestSwap.loss + 0.5) continue;
        const holderList = picks.get(bestSwap.holder)!;
        holderList.splice(holderList.findIndex((pick) => pick.target.participantId === entry.target.participantId), 1, { match: bestSwap.replacement.match, target: bestSwap.replacement.target });
        exposure.set(bestSwap.replacement.target.participantId, (exposure.get(bestSwap.replacement.target.participantId) ?? 0) + 1);
        chosen.splice(chosen.indexOf(weakest), 1, { match: entry.match, target: entry.target });
        exposure.set(weakest.target.participantId, (exposure.get(weakest.target.participantId) ?? 0) - 1);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  // Anyone still short (a small room) is filled past the cap rather than left with fewer people.
  for (const entry of proposals) take(entry, false);
  for (const chosen of picks.values()) chosen.sort((a, b) => b.match.value - a.match.value);
  return picks;
}

// ---------------------------------------------------------------- text

const LANGS: readonly Lang[] = ["ja", "zh", "en"];
const label = (category: BusinessCategory, lang: Lang) => category.labels[lang];
const nameOf = (participant: EventOperationsParticipant, lang: Lang) => (lang === "ja" ? `${participant.displayName}さん` : participant.displayName);
const offerLabel = (offer: string) => offer.replace(/\s+/gu, " ").trim();

function categoryPhrase(them: MatchAttributes, lang: Lang): string {
  const category = them.categories[0];
  return category ? label(category, lang) : "";
}

function reasonFor(finding: Finding, reader: EventOperationsParticipant, other: EventOperationsParticipant, lang: Lang): string {
  const me = matchAttributes(reader);
  const them = matchAttributes(other);
  const T = nameOf(other, lang);
  const what = categoryPhrase(them, lang);
  const goalText = (goal: Goal | null) => (goal ? GOAL_LABEL[goal][lang] : "");
  switch (finding.kind) {
    case "investor":
      return {
        en: `You came to ${goalText(finding.goal)}; ${T} is an investor${what ? ` (${what})` : ""}. Walk them through your business and where you are in raising.`,
        ja: `今回は${goalText(finding.goal)}が目的ですね。${T}は投資家${what ? `（${what}）` : ""}です。事業の概要と調達の状況を直接話せます。`,
        zh: `你这次想${goalText(finding.goal)}；${T}是投资人${what ? `（${what}）` : ""}，可以直接聊你的项目和融资进度。`,
      }[lang];
    case "finance_advisor":
      return {
        en: `You came to ${goalText(finding.goal)}; ${T} works in ${what || "fundraising and M&A"} and can introduce investors or advise on the round.`,
        ja: `今回は${goalText(finding.goal)}が目的ですね。${T}は${what || "資金調達・M&A"}に携わっていて、投資家の紹介や調達の進め方を相談できます。`,
        zh: `你这次想${goalText(finding.goal)}；${T}做${what || "融资和并购"}，可以请对方介绍投资人，或一起理一理融资怎么做。`,
      }[lang];
    case "deal":
      return {
        en: `You are looking for companies to invest in; ${T} is raising money${what ? ` for a business in ${what}` : ""}. Ask about the business and the round.`,
        ja: `投資先を探していますね。${T}は${what ? `${what}の事業で` : ""}資金調達を考えています。事業内容と調達計画を聞いてみてください。`,
        zh: `你在找值得投资的项目；${T}正在找投资${what ? `，做的是${what}` : ""}，可以聊聊对方的项目和融资计划。`,
      }[lang];
    case "ma":
      return {
        en: `You are interested in M&A; ${T} ${them.identity === "investor" || them.identity === "finance_advisor" ? "buys and brokers companies" : "is also thinking about M&A"}. Compare what each of you is looking for.`,
        ja: `M&Aに関心がありますね。${T}は${them.identity === "investor" || them.identity === "finance_advisor" ? "会社の売買・仲介に携わっています" : "M&Aを検討しています"}。お互いの条件を話せます。`,
        zh: `你对并购感兴趣；${T}${them.identity === "investor" || them.identity === "finance_advisor" ? "在做公司买卖和并购" : "也在考虑并购"}，可以对一对彼此的条件。`,
      }[lang];
    case "buyer":
      return {
        en: `${T} is in ${label(finding.theirs, lang)} — the kind of business that buys from ${label(finding.mine, lang)}. Ask what they buy today and how they choose suppliers.`,
        ja: `${T}は${label(finding.theirs, lang)}の事業者で、${label(finding.mine, lang)}の取引先になり得ます。今の仕入れ方や選定基準を聞いてみてください。`,
        zh: `${T}做${label(finding.theirs, lang)}，正是${label(finding.mine, lang)}的客户行业；可以问问对方现在怎么采购、看重什么。`,
      }[lang];
    case "supplier":
      return {
        en: `${T} is in ${label(finding.theirs, lang)}, which supplies businesses like yours (${label(finding.mine, lang)}). Talk about what you source and on what terms.`,
        ja: `${T}は${label(finding.theirs, lang)}の事業者で、${label(finding.mine, lang)}の仕入れ先・協力先になり得ます。調達したいものや条件を話せます。`,
        zh: `${T}做${label(finding.theirs, lang)}，是${label(finding.mine, lang)}的上游供应方；可以聊你需要的产品、价格和合作方式。`,
      }[lang];
    case "channel":
      return {
        en: `You want to ${goalText(finding.goal)}; ${T} sells through ${what || "sales and distribution"} and could carry your product to their customers.`,
        ja: `${goalText(finding.goal)}が目的ですね。${T}は${what || "販売・流通"}に携わっていて、あなたの商品を取引先に届ける販路になり得ます。`,
        zh: `你想${goalText(finding.goal)}；${T}做${what || "销售和流通"}，手里有客户，可以聊代理或分销你的产品。`,
      }[lang];
    case "market_entry":
      return {
        en: `You are taking your business across the China–Japan border; ${T} works in ${label(finding.theirs, lang)}. Ask about the route in: partners, channels and paperwork.`,
        ja: `日中をまたいで事業を広げようとしていますね。${T}は${label(finding.theirs, lang)}に携わっています。進出の進め方や現地の販路・手続きを相談できます。`,
        zh: `你在做中日之间的市场拓展；${T}做${label(finding.theirs, lang)}，可以聊落地路径、本地渠道和手续。`,
      }[lang];
    case "entry_client":
      return {
        en: `${T} is taking ${what ? `a business in ${what}` : "their business"} across the China–Japan border — exactly what your ${label(finding.mine, lang)} work helps with. Ask where they are stuck.`,
        ja: `${T}は${what ? `${what}の事業を` : "事業を"}日中をまたいで広げようとしています。あなたの${label(finding.mine, lang)}の仕事がそのまま役立ちます。どこで詰まっているか聞いてみてください。`,
        zh: `${T}正在把${what ? `${what}的业务` : "业务"}做到中日之间，正好用得上你做的${label(finding.mine, lang)}；可以问问对方卡在哪一步。`,
      }[lang];
    case "maybe_buyer":
      return {
        en: `${T} runs a business in ${what}; ${label(finding.mine, lang)} serves companies like theirs. Ask where it could help their work.`,
        ja: `${T}は${what}の事業をしています。${label(finding.mine, lang)}が役立つ場面がないか、業務の課題を聞いてみてください。`,
        zh: `${T}在做${what}；可以问问对方业务里有没有用得上${label(finding.mine, lang)}的地方。`,
      }[lang];
    case "offer": {
      const need = offerLabel(tagInLanguage("need", finding.need, lang));
      const offer = offerLabel(tagInLanguage("offer", finding.offer, lang));
      return {
        en: `You are looking for "${need}"; ${T} offers "${offer}". Ask for specifics.`,
        ja: `「${need}」を求めていますね。${T}は「${offer}」を提供できます。具体的に相談してみてください。`,
        zh: `你在找「${need}」；${T}能提供「${offer}」，可以具体问问。`,
      }[lang];
    }
    case "peer":
      return finding.category
        ? {
          en: `You both work in ${label(finding.category, lang)}. Compare what is working and where the market is going.`,
          ja: `お二人とも${label(finding.category, lang)}の分野です。うまくいっている施策や市場の動きを交換できます。`,
          zh: `你们都在做${label(finding.category, lang)}，可以交流各自的打法和市场动向。`,
        }[lang]
        : {
          en: `${T} is in the same industry${what ? ` (${what})` : ""}. Trade notes on the market.`,
          ja: `${T}は同じ業界${what ? `（${what}）` : ""}の方です。業界の動きを情報交換できます。`,
          zh: `${T}和你同行业${what ? `（${what}）` : ""}，可以交流行业动向。`,
        }[lang];
    case "talent":
      return {
        en: `You are looking for people to hire; ${T} ${them.identity === "student" ? "is a student looking at where to work" : "can refer candidates"}.`,
        ja: `人材を探していますね。${T}は${them.identity === "student" ? "就職先を考えている学生です" : "人材の紹介ができます"}。`,
        zh: `你在找人才；${T}${them.identity === "student" ? "是在读学生，正在考虑去向" : "能推荐人才"}。`,
      }[lang];
    case "want": {
      const who = WANT_LABEL[finding.want][lang];
      const identity = IDENTITY_LABEL[them.identity][lang];
      const industry = INDUSTRY_CATALOG.find((entry) => entry.id === them.industryId)?.labels[lang] ?? "";
      if (finding.want === "same_industry" || finding.want === "other_industry") {
        const same = finding.want === "same_industry";
        return {
          en: `You said you want to meet ${who}; ${T} is ${same ? "also " : ""}in ${industry}${what ? ` (${what})` : ""}.`,
          ja: `会いたい人に「${who}」を選んでいましたね。${T}は${same ? "同じ" : ""}${industry}${what ? `（${what}）` : ""}の方です。`,
          zh: `你想认识「${who}」；${T}${same ? "也在" : "来自"}${industry}${what ? `，做${what}` : ""}。`,
        }[lang];
      }
      void me;
      if ((finding.want === "engineer" || finding.want === "designer" || finding.want === "researcher" || finding.want === "marketing") && other.role) {
        return {
          en: `You said you want to meet ${who}; ${T} works as ${other.role}${what ? ` in ${what}` : ""}.`,
          ja: `会いたい人に「${who}」を選んでいましたね。${T}は${what ? `${what}の` : ""}${other.role}です。`,
          zh: `你想认识「${who}」；${T}的职位是${other.role}${what ? `，做${what}` : ""}。`,
        }[lang];
      }
      return {
        en: `You said you want to meet ${who}; ${T} is ${identity}${what ? ` working in ${what}` : ""}.`,
        ja: `会いたい人に「${who}」を選んでいましたね。${T}は${identity}${what ? `で、${what}に携わっています` : "です"}。`,
        zh: `你想认识「${who}」；${T}是${identity}${what ? `，做${what}` : ""}。`,
      }[lang];
    }
  }
}

function icebreakersFor(finding: Finding | undefined, other: EventOperationsParticipant, lang: Lang): [string, string] {
  const them = matchAttributes(other);
  const what = categoryPhrase(them, lang);
  switch (finding?.kind) {
    case "investor": return ({ en: ["What stage and sectors do you invest in?", "What do you look for in a team?"], ja: ["どのステージ・分野に投資していますか？", "チームのどこを見て判断しますか？"], zh: ["您主要投哪个阶段、哪些领域？", "您看项目最看重什么？"] } as const)[lang] as unknown as [string, string];
    case "finance_advisor": return ({ en: ["Which investors fit a business like mine?", "How would you prepare the round?"], ja: ["私の事業に合う投資家はどんな方ですか？", "調達の準備は何から始めるべきですか？"], zh: ["像我这样的项目适合找哪类投资人？", "融资准备应该从哪里入手？"] } as const)[lang] as unknown as [string, string];
    case "deal": return ({ en: ["What are you building, and for whom?", "How much are you raising, and for what?"], ja: ["どんな事業を、誰に向けてやっていますか？", "いくら、何のために調達したいですか？"], zh: ["你在做什么、卖给谁？", "这轮想融多少、钱用在哪？"] } as const)[lang] as unknown as [string, string];
    case "buyer": return ({ en: ["How do you choose suppliers today?", "What would make you switch?"], ja: ["今はどうやって仕入れ先を選んでいますか？", "取引先を変えるならどんな条件ですか？"], zh: ["你们现在怎么选供应商？", "什么条件下会考虑换一家？"] } as const)[lang] as unknown as [string, string];
    case "supplier": return ({ en: ["What do you supply, and to whom?", "What order sizes and terms work for you?"], ja: ["どんな商品を、どこに卸していますか？", "ロットや条件はどのくらいですか？"], zh: ["你们主要供什么货、给哪些客户？", "起订量和合作条件大概怎样？"] } as const)[lang] as unknown as [string, string];
    case "channel": return ({ en: ["Which customers do you sell to?", "How do you take on a new product?"], ja: ["主な販売先はどこですか？", "新しい商品を扱うときの条件は？"], zh: ["你们主要卖给哪些客户？", "接一个新产品一般怎么合作？"] } as const)[lang] as unknown as [string, string];
    case "ma": return ({ en: ["What kind of company are you looking for?", "What size and timing?"], ja: ["どんな会社を探していますか？", "規模や時期のイメージは？"], zh: ["您想找什么样的公司？", "规模和时间上有什么考虑？"] } as const)[lang] as unknown as [string, string];
    default:
      return {
        en: [what ? `What are you working on in ${what} right now?` : "What are you working on right now?", "Who would be useful for you to meet here?"],
        ja: [what ? `今、${what}でどんなことに取り組んでいますか？` : "今どんなことに取り組んでいますか？", "今日はどんな人と会えるとうれしいですか？"],
        zh: [what ? `你现在在${what}这块主要做什么？` : "你现在主要在做什么？", "今天最想认识什么样的人？"],
      }[lang] as [string, string];
  }
}

function memberHintFor(other: EventOperationsParticipant, lang: Lang): string {
  const them = matchAttributes(other);
  return [IDENTITY_LABEL[them.identity][lang], categoryPhrase(them, lang)].filter(Boolean).join(" · ");
}

/** The participant-facing text of one recommendation, in ja / zh / en. */
export function recommendationText(reader: EventOperationsParticipant, other: EventOperationsParticipant, match: RuleMatch): EventOperationsI18n<EventOperationsRecommendationText> {
  // Up to three reasons: the strongest finding, the strongest of another kind, and the "who you asked for" match.
  const chosen: Finding[] = [];
  for (const { finding } of match.findings) {
    if (chosen.length >= 3) break;
    if (chosen.some((existing) => existing.kind === finding.kind)) continue;
    if (finding.kind === "want" && chosen.some((existing) => existing.kind === "want")) continue;
    chosen.push(finding);
  }
  const want = match.findings.find((entry) => entry.finding.kind === "want")?.finding;
  if (want && !chosen.includes(want)) chosen.splice(Math.min(1, chosen.length), 0, want);
  const reasons = chosen.slice(0, 3);
  const lead = reasons.find((finding) => finding.kind !== "want");
  return Object.fromEntries(LANGS.map((lang) => {
    const texts = reasons.map((finding) => reasonFor(finding, reader, other, lang));
    const fallback = {
      en: `${nameOf(other, lang)} works in ${categoryPhrase(matchAttributes(other), lang) || "a different field"}; worth a first conversation.`,
      ja: `${nameOf(other, lang)}は${categoryPhrase(matchAttributes(other), lang) || "別の分野"}の方です。まずは話してみる価値があります。`,
      zh: `${nameOf(other, lang)}做${categoryPhrase(matchAttributes(other), lang) || "不同领域"}，值得先聊一聊。`,
    }[lang];
    return [lang, {
      icebreakers: icebreakersFor(lead, other, lang),
      memberHint: memberHintFor(other, lang),
      reasons: (texts.length ? texts : [fallback]) as [string, ...string[]],
    }];
  })) as unknown as EventOperationsI18n<EventOperationsRecommendationText>;
}

/** Short trilingual labels for grouping features (host-facing). */
export function participantSummary(participant: EventOperationsParticipant, lang: Lang = "zh"): { primary: string; secondary: string } {
  const attributes = matchAttributes(participant);
  return {
    primary: memberHintFor(participant, lang) || IDENTITY_LABEL[attributes.identity][lang],
    secondary: attributes.goals[0] ? GOAL_LABEL[attributes.goals[0].goal][lang] : GOAL_LABEL.network[lang],
  };
}

export const __matchRulesTestExports = { businessCategory, tagKey };
