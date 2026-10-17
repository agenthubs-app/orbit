// R30 全局搜索的编排核心（search/DESIGN.md §3–§4）：拿到各数据源的候选后做分组、排序、截断、命中位置、空结果建议。
// 纯函数（数据源由 service.ts / live.ts 取），便于测试；不读时钟（now 由调用方传）。
import type { EventSearchResponse } from "../../../shared/contract/event-search";
import type { GlobalSearchAlternative, GlobalSearchConversationHit, GlobalSearchEventHit, GlobalSearchPersonHit, GlobalSearchResponse, GlobalSearchSuggestion, GlobalSearchType } from "../../../shared/contract/global-search";
import { highlightsFor } from "../../../shared/compute/search-highlight";
import { normalizeSearchText } from "../../../shared/compute/search-normalize";
import { comparePeople, personRank } from "../../../shared/compute/search-rank";
import { INDUSTRY_CATALOG, SECONDARY_INDUSTRY_CATALOG } from "../../../shared/domain/industries";

export type SearchPlatform = "web" | "app";
export type SearchLanguage = "ja" | "zh" | "en";

export interface PersonCandidate {
  id: string;
  name: string;
  org: string | null;
  role: string | null;
  /** Other searched fields (location, memo-like); only used for ranking. */
  other: readonly (string | null | undefined)[];
  lastInteractionAt: string | null;
}

export interface ConversationCandidate extends GlobalSearchConversationHit {}

export interface IndustryCount {
  /** `IndustryIdCode` or `SecondaryIndustryIdCode`. */
  id: string;
  count: number;
}

export interface GlobalSearchCoreInput {
  query: string;
  terms: readonly string[];
  limit: number;
  types: readonly GlobalSearchType[];
  wanted?: readonly GlobalSearchType[];
  platform: SearchPlatform;
  language: SearchLanguage;
  now: Date;
  people: readonly PersonCandidate[];
  /** How many of my contacts match in all (the source may return fewer rows than that); defaults to `people.length`. */
  peopleTotal?: number;
  /** Contacts in the current plan (推進中); null = the account has no plan → no status chip at all. */
  planLinked: ReadonlySet<string> | null;
  searchedPeople: number;
  events: EventSearchResponse | null;
  conversations: readonly ConversationCandidate[] | null;
  industryCounts: readonly IndustryCount[];
  semanticAvailable: boolean;
  examples: readonly string[];
}

const COPY = {
  ja: { askLabel: "iOrbit に紹介ルートを聞く", askDetail: (q: string) => `「${q}の人に会うには？」`, eventsLabel: "イベントで探す", eventsFallback: "探すで条件を変えて探す", narrow: "業界で絞り込む", registered: "参加予定", countPeople: (n: number) => `${n}人` },
  zh: { askLabel: "问 iOrbit 介绍路径", askDetail: (q: string) => `「怎样认识${q}的人？」`, eventsLabel: "在活动里找", eventsFallback: "到「发现」换个条件找", narrow: "按行业筛选", registered: "计划参加", countPeople: (n: number) => `${n}人` },
  en: { askLabel: "Ask iOrbit for an intro route", askDetail: (q: string) => `“How can I meet people in ${q}?”`, eventsLabel: "Look at events", eventsFallback: "Change the filters in Discover", narrow: "Filter by industry", registered: "Going", countPeople: (n: number) => `${n} people` },
} as const;

const INDUSTRY_EMOJI: Record<string, string> = {
  food_hospitality: "🍽️", technology_internet: "💻", finance_investment: "💰", professional_services: "🧑‍💼", manufacturing_supply_chain: "🏭", retail_consumer: "🛍️",
  trade_logistics: "📦", real_estate_construction: "🏗️", healthcare_life_sciences: "🏥", education_research: "🎓", media_creative: "🎨", community_nonprofit: "🤝", government_public_affairs: "🏛️", other: "🏷️",
};

/** Query words → industries (labels in three languages + a few common Japanese aliases), DESIGN §4.4. */
const INDUSTRY_ALIASES: Record<string, string[]> = {
  "半導体": ["manufacturing_supply_chain.semiconductors"], "電子": ["manufacturing_supply_chain.electronics"], "電子部品": ["manufacturing_supply_chain.electronics"],
  "製造": ["manufacturing_supply_chain"], "製造業": ["manufacturing_supply_chain"], "メーカー": ["manufacturing_supply_chain"], "商社": ["trade_logistics"], "物流": ["trade_logistics"],
  "投資家": ["finance_investment.venture_capital"], "vc": ["finance_investment.venture_capital"], "ベンチャーキャピタル": ["finance_investment.venture_capital"], "銀行": ["finance_investment.banking"],
  "弁護士": ["professional_services.legal"], "法律": ["professional_services.legal"], "会計": ["professional_services.tax_accounting"], "税理士": ["professional_services.tax_accounting"],
  "ai": ["technology_internet.ai_data"], "saas": ["technology_internet.enterprise_software"], "不動産": ["real_estate_construction"], "医療": ["healthcare_life_sciences"], "病院": ["healthcare_life_sciences"],
  "大学": ["education_research"], "教育": ["education_research"], "メディア": ["media_creative"], "飲食": ["food_hospitality"], "小売": ["retail_consumer"],
};

export function industriesForTerms(terms: readonly string[]): string[] {
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  for (const term of terms) {
    for (const id of INDUSTRY_ALIASES[term] ?? []) add(id);
    for (const industry of SECONDARY_INDUSTRY_CATALOG) {
      if (Object.values(industry.labels).some((label) => { const folded = normalizeSearchText(label); return folded.includes(term) || (term.length >= 2 && folded.length >= 2 && term.includes(folded)); })) add(industry.id);
    }
    for (const industry of INDUSTRY_CATALOG) {
      if (Object.values(industry.labels).some((label) => { const folded = normalizeSearchText(label); return folded.includes(term) || (term.length >= 2 && folded.length >= 2 && term.includes(folded)); })) add(industry.id);
    }
  }
  return out;
}

function industryLabelFor(id: string, language: SearchLanguage): { label: string; emoji: string } | null {
  const secondary = SECONDARY_INDUSTRY_CATALOG.find((item) => item.id === id);
  if (secondary) {
    const parent = INDUSTRY_CATALOG.find((item) => item.id === secondary.parentId);
    return { emoji: INDUSTRY_EMOJI[secondary.parentId] ?? "🏷️", label: parent ? `${parent.labels[language]} › ${secondary.labels[language]}` : secondary.labels[language] };
  }
  const primary = INDUSTRY_CATALOG.find((item) => item.id === id);
  return primary ? { emoji: INDUSTRY_EMOJI[primary.id] ?? "🏷️", label: primary.labels[language] } : null;
}

const contactsIndustryHref = (platform: SearchPlatform, id: string) => (platform === "app" ? `/contacts?industry=${encodeURIComponent(id)}` : `/app/contacts?industry=${encodeURIComponent(id)}`);
const discoverHref = (platform: SearchPlatform, q: string) => (platform === "app" ? `/events?tab=discover&q=${encodeURIComponent(q)}` : `/app/events?tab=discover&q=${encodeURIComponent(q)}`);
const contactHref = (platform: SearchPlatform, id: string) => (platform === "app" ? `/contacts/${encodeURIComponent(id)}` : `/app/contacts/${encodeURIComponent(id)}`);

export function suggestionsFor(input: Pick<GlobalSearchCoreInput, "terms" | "industryCounts" | "language" | "platform">): GlobalSearchSuggestion[] {
  const counts = new Map(input.industryCounts.map((item) => [item.id, item.count]));
  const out: GlobalSearchSuggestion[] = [];
  for (const id of industriesForTerms(input.terms)) {
    const count = counts.get(id) ?? 0;
    const label = industryLabelFor(id, input.language);
    if (count <= 0 || !label) continue;
    out.push({ count, emoji: label.emoji, href: contactsIndustryHref(input.platform, id), kind: "industry", label: label.label });
    if (out.length === 2) break;
  }
  return out;
}

function monthDay(startsAt: string, now: Date, language: SearchLanguage): string {
  const time = Date.parse(startsAt);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time + 9 * 3_600_000);
  const today = new Date(now.getTime() + 9 * 3_600_000);
  if (date.getUTCFullYear() === today.getUTCFullYear() && date.getUTCMonth() === today.getUTCMonth() && date.getUTCDate() === today.getUTCDate()) return language === "ja" ? "今夜" : language === "zh" ? "今天" : "today";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function alternativesFor(input: Pick<GlobalSearchCoreInput, "query" | "events" | "language" | "platform" | "now">): GlobalSearchAlternative[] {
  const copy = COPY[input.language];
  const compact = input.query.replace(/\s+/gu, "");
  const first = input.events?.events[0];
  return [
    { detail: copy.askDetail(compact), emoji: "✨", href: "#ask", kind: "ask_iorbit", label: copy.askLabel },
    { detail: first ? `${first.title} · ${monthDay(first.startsAt, input.now, input.language)}` : copy.eventsFallback, emoji: "🎟️", href: discoverHref(input.platform, input.query), kind: "events", label: copy.eventsLabel },
  ];
}

export function buildGlobalSearch(input: GlobalSearchCoreInput): GlobalSearchResponse {
  const copy = COPY[input.language];
  const wanted = new Set<GlobalSearchType>(input.wanted?.length ? input.wanted.filter((type) => input.types.includes(type)) : input.types);
  const base: GlobalSearchResponse = {
    alternatives: [], events: { items: [], total: 0 }, examples: input.examples, people: { items: [], total: 0 }, query: input.query,
    searchedPeople: input.searchedPeople, semantic: { available: input.semanticAvailable, enabled: false }, suggestions: [], types: input.types,
    ...(input.types.includes("conversations") ? { conversations: { items: [], total: 0 } } : {}),
  };
  if (!input.terms.length) return base;

  // 人：按 rank → 最終接点 → 名前；rank 4（来源命中了我们不显示的字段）排最后但仍保留。
  const people = wanted.has("people")
    ? [...input.people].filter((person) => personRank(person, input.terms) <= 4).sort(comparePeople(input.terms)).map((person): GlobalSearchPersonHit => {
      const subtitle = [person.org, person.role].filter(Boolean).join(" · ");
      return {
        contactId: person.id, name: person.name, initial: Array.from(person.name.trim())[0] ?? "?", org: person.org, role: person.role,
        status: input.planLinked === null ? null : input.planLinked.has(person.id) ? "in_progress" : "acquaintance", reason: null,
        highlights: highlightsFor(person.name, subtitle, input.terms), href: contactHref(input.platform, person.id),
      };
    })
    : [];
  const events = wanted.has("events") && input.events
    ? input.events.events.map((hit): GlobalSearchEventHit => {
      const when = monthDay(hit.startsAt, input.now, input.language);
      const note = hit.myStatus === "registered" || hit.myStatus === "attended" ? `${copy.registered} · ${when}` : [when, hit.venue ?? ""].filter(Boolean).join(" · ");
      return { emoji: hit.emoji, eventId: hit.eventId, href: hit.href, highlights: highlightsFor(hit.title, note, input.terms), note, startsAt: hit.startsAt, title: hit.title, via: null };
    })
    : [];
  const conversations = wanted.has("conversations") && input.conversations ? input.conversations : null;
  const peopleTotal = Math.max(input.peopleTotal ?? 0, people.length);
  const eventsTotal = input.events ? Math.max(input.events.eventsTotal, events.length) : 0;
  // 空结果的口径（b5 #59 / #56）：没有「人」（也没有会話）就是「一致する人はいません」，活动命中只作为「イベントで探す」的去处。
  // 单类型（A5）：只选「イベント」/「会話」时，那一组没有命中才算空；不出业界建议（建议是按人筛的）。
  const peopleScoped = wanted.has("people");
  const empty = peopleScoped ? !people.length && !(conversations?.length) : !events.length && !(conversations?.length);
  return {
    ...base,
    alternatives: empty ? alternativesFor(input) : [],
    ...(input.types.includes("conversations") ? { conversations: { items: (conversations ?? []).slice(0, input.limit), total: conversations?.length ?? 0 } } : {}),
    events: empty ? { items: [], total: 0 } : { items: events.slice(0, input.limit), total: wanted.has("events") ? eventsTotal : 0 },
    people: { items: people.slice(0, input.limit), total: peopleTotal },
    suggestions: empty && peopleScoped ? suggestionsFor(input) : [],
  };
}
