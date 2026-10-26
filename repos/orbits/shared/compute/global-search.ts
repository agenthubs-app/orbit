// R30 全局搜索的编排核心（search/DESIGN.md §3–§4）：拿到各数据源的候选后做分组、排序、截断、命中位置、空结果建议。
// 纯函数（数据源由调用方取），不读时钟（now 由调用方传）。LF11：从 features/search/global/core.ts 移到 shared/compute，
// 服务器（live.ts 的数据源）和 App（本机联系人、本机 AI 会话；活动仍问服务器）用同一套分组、排序与空结果规则。
import type { AiSessionSummaryItemContract } from "../contract/ai-session-page";
import type { EventSearchResponse } from "../contract/event-search";
import type { GlobalSearchAlternative, GlobalSearchConversationHit, GlobalSearchEventHit, GlobalSearchPersonHit, GlobalSearchResponse, GlobalSearchSuggestion, GlobalSearchType } from "../contract/global-search";
import { isoTimestamp, parseTimestamp } from "./compute-text";
import { highlightsFor } from "./search-highlight";
import { normalizeSearchText, splitSearchTerms } from "./search-normalize";
import { comparePeople, personRank } from "./search-rank";
import { liteCanExpand, liteMatch } from "./search-synonyms";
import { INDUSTRY_CATALOG, SECONDARY_INDUSTRY_CATALOG } from "../domain/industries";

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
  /** LF11: the 「イベント」 group the server already built (the App asks the server for events only); used when `events` is null. */
  eventHits?: { items: readonly GlobalSearchEventHit[]; total: number } | null;
  conversations: readonly ConversationCandidate[] | null;
  industryCounts: readonly IndustryCount[];
  semanticAvailable: boolean;
  /** R30 意味検索 lite (§50): this request asked for semantic and lite has a concept for the query. */
  semantic?: boolean;
  examples: readonly string[];
}

const COPY = {
  ja: { askLabel: "iOrbit に紹介ルートを聞く", askDetail: (q: string) => `「${q}の人に会うには？」`, eventsLabel: "イベントで探す", eventsFallback: "探すで条件を変えて探す", narrow: "業界で絞り込む", registered: "参加予定", countPeople: (n: number) => `${n}人`, conversationWith: "iOrbit との会話" },
  zh: { askLabel: "问 iOrbit 介绍路径", askDetail: (q: string) => `「怎样认识${q}的人？」`, eventsLabel: "在活动里找", eventsFallback: "到「发现」换个条件找", narrow: "按行业筛选", registered: "计划参加", countPeople: (n: number) => `${n}人`, conversationWith: "与 iOrbit 的对话" },
  en: { askLabel: "Ask iOrbit for an intro route", askDetail: (q: string) => `“How can I meet people in ${q}?”`, eventsLabel: "Look at events", eventsFallback: "Change the filters in Discover", narrow: "Filter by industry", registered: "Going", countPeople: (n: number) => `${n} people`, conversationWith: "Conversation with iOrbit" },
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

/** `M/D` of an instant in Tokyo (JST has no daylight saving), or null when it does not parse. */
function tokyoMonthDay(instant: string): { key: string; label: string } | null {
  const local = isoTimestamp(parseTimestamp(instant) + 9 * 3_600_000);
  return local ? { key: local.slice(0, 10), label: `${Number(local.slice(5, 7))}/${Number(local.slice(8, 10))}` } : null;
}

function monthDay(startsAt: string, now: Date, language: SearchLanguage): string {
  const date = tokyoMonthDay(startsAt);
  if (!date) return "";
  const today = isoTimestamp(now.getTime() + 9 * 3_600_000)?.slice(0, 10);
  if (date.key === today) return language === "ja" ? "今夜" : language === "zh" ? "今天" : "today";
  return date.label;
}

export function alternativesFor(input: Pick<GlobalSearchCoreInput, "query" | "events" | "eventHits" | "language" | "platform" | "now">): GlobalSearchAlternative[] {
  const copy = COPY[input.language];
  // Spaces between CJK words go ("半導体 商社" → "半導体商社"); Latin word breaks stay ("Expo follow-up").
  const compact = input.query.trim().replace(/\s+/gu, " ").replace(/(?<=[^\x00-\x7F]) (?=[^\x00-\x7F])/gu, "");
  const first = input.events?.events[0] ?? input.eventHits?.items[0];
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

  // 意味検索 lite：字面全中的「一致」在前、只靠同义词命中的「関連」在后，各自按最終接点 → 名前；理由行代替状态 chip，不高亮。
  const lite = input.semantic && wanted.has("people") ? input.people.flatMap((person) => {
    const match = liteMatch(person, input.terms, input.language);
    return match ? [{ match, person }] : [];
  }) : null;
  const liteSorted = lite ? [...lite].sort((a, b) => (a.match.kind === b.match.kind ? 0 : a.match.kind === "literal" ? -1 : 1) || comparePeople([])(a.person, b.person)) : null;
  // 人：按 rank → 最終接点 → 名前；rank 4（来源命中了我们不显示的字段）排最后但仍保留。
  const people = liteSorted ? liteSorted.map(({ match, person }): GlobalSearchPersonHit => ({
    contactId: person.id, name: person.name, initial: Array.from(person.name.trim())[0] ?? "?", org: person.org, role: person.role,
    status: null, reason: match.reason, ...(match.kind === "related" ? { related: true } : {}),
    highlights: [], href: contactHref(input.platform, person.id),
  })) : wanted.has("people")
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
    : wanted.has("events") && input.eventHits ? [...input.eventHits.items] : [];
  const conversations = wanted.has("conversations") && input.conversations ? input.conversations : null;
  const peopleTotal = lite ? people.length : Math.max(input.peopleTotal ?? 0, people.length);
  const eventsTotal = input.events ? Math.max(input.events.eventsTotal, events.length) : input.eventHits ? Math.max(input.eventHits.total, events.length) : 0;
  // 空结果的口径（b5 #59 / #56）：没有「人」（也没有会話）就是「一致する人はいません」，活动命中只作为「イベントで探す」的去处。
  // 单类型（A5）：只选「イベント」/「会話」时，那一组没有命中才算空；不出业界建议（建议是按人筛的）。
  const peopleScoped = wanted.has("people");
  const empty = peopleScoped ? !people.length && !(conversations?.length) : !events.length && !(conversations?.length);
  return {
    ...base,
    alternatives: empty ? alternativesFor(input) : [],
    ...(input.types.includes("conversations") ? { conversations: { items: (conversations ?? []).slice(0, input.limit), total: conversations?.length ?? 0 } } : {}),
    events: empty ? { items: [], total: 0 } : { items: events.slice(0, input.limit), total: wanted.has("events") ? eventsTotal : 0 },
    people: { items: people.slice(0, input.limit), total: peopleTotal, ...(lite ? { order: "relevance" as const } : {}) },
    ...(lite ? { semantic: { available: input.semanticAvailable, enabled: true, matched: lite.filter((item) => item.match.kind === "literal").length, related: lite.filter((item) => item.match.kind === "related").length } } : {}),
    suggestions: empty && peopleScoped ? suggestionsFor(input) : [],
  };
}

/** 「こんな検索もできます」 per reader language (R30 DESIGN §2.3); the demo world stays Japanese. */
export const GLOBAL_SEARCH_LIVE_EXAMPLES: Record<SearchLanguage, { all: readonly string[]; keyword: readonly string[] }> = {
  ja: { all: ["投資家", "製造業の決裁者", "先月会った人", "紹介してくれそうな人", "3か月 連絡していない人"], keyword: ["投資家", "製造業の決裁者"] },
  zh: { all: ["投资人", "制造业决策者", "上个月见过的人", "可能帮忙介绍的人", "三个月没联系的人"], keyword: ["投资人", "制造业决策者"] },
  en: { all: ["investor", "manufacturing decision-maker", "met last month", "could introduce me", "no contact in 3 months"], keyword: ["investor", "manufacturing"] },
};

/** The examples offered: lite only knows the concepts in its synonym table (no time or relation reasoning). */
export function globalSearchExamples(language: SearchLanguage, semanticAvailable: boolean): string[] {
  return semanticAvailable
    ? GLOBAL_SEARCH_LIVE_EXAMPLES[language].all.filter((example) => liteCanExpand(splitSearchTerms(example)))
    : [...GLOBAL_SEARCH_LIVE_EXAMPLES[language].keyword];
}

/**
 * LF11: the 会話 group from the device's AI session list when the server cannot be reached. The server also searches
 * message bodies; the device matches what every summary carries (title, custom title, first message, last preview).
 * Subtitle, highlights and the App href follow the server's conversation search (features/search/global/conversations.ts).
 */
/** 「10/26 · iOrbit との会話」 in the reader's language (the server's conversation hits and the device fallback). */
export function conversationSubtitle(dateLabel: string, language: SearchLanguage = "ja"): string {
  return `${dateLabel} · ${COPY[language].conversationWith}`;
}

export function conversationHitsFromSessions(sessions: readonly AiSessionSummaryItemContract[], query: string, limit: number, language: SearchLanguage = "ja"): GlobalSearchConversationHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !Number.isSafeInteger(limit) || limit < 1) return [];
  const terms = splitSearchTerms(query);
  return sessions
    .filter((session) => [session.organization.customTitle ?? "", session.title, session.firstUserText, session.lastMessagePreview].some((text) => text.toLowerCase().includes(needle)))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, Math.min(limit, 20))
    .map((session) => {
      const title = session.organization.customTitle || session.title;
      const subtitle = conversationSubtitle(tokyoMonthDay(session.updatedAt)?.label ?? "", language);
      return { highlights: highlightsFor(title, subtitle, terms), href: `/ai/${encodeURIComponent(session.id)}?source=session`, id: session.id, kind: "iorbit" as const, subtitle, title };
    });
}
