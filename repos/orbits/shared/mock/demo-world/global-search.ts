// R30 全局搜索的演示世界（search/DESIGN.md §8）：三个输入照 b5 #53–#59 / #71 的画板造，其余输入按关键词规则在演示世界里搜。
// 人和事只从 index.ts 取；画板上有、演示世界里没有的示例人物（高橋 亮、森 隆之 …）只出现在搜索结果里（`sample: true`），不进 index.ts。
import type { GlobalSearchAlternative, GlobalSearchConversationHit, GlobalSearchEventHit, GlobalSearchPersonHit, GlobalSearchResponse, GlobalSearchSuggestion, GlobalSearchType } from "../../contract/global-search";
import { highlightsFor } from "../../compute/search-highlight";
import { matchesAllTerms, splitSearchTerms } from "../../compute/search-normalize";
import { DEMO_EVENTS, DEMO_PEOPLE, DEMO_PLAN } from "./index";

export type GlobalSearchPlatform = "web" | "app";
export const DEMO_SEARCHED_PEOPLE = 286;
export const DEMO_SEARCH_EXAMPLES = ["投資家", "製造業の決裁者", "先月会った人", "紹介してくれそうな人", "3か月 連絡していない人"] as const;
export const DEMO_SEARCH_KEYWORD_EXAMPLES = ["投資家", "製造業の決裁者"] as const;

const contactHref = (platform: GlobalSearchPlatform, id: string) => (platform === "app" ? `/contacts/${id}` : `/app/contacts/${id}`);
const eventHref = (platform: GlobalSearchPlatform, id: string) => (platform === "app" ? `/events/${id}` : `/app/events/${id}`);
const contactsIndustryHref = (platform: GlobalSearchPlatform, id: string) => (platform === "app" ? `/contacts?industry=${id}` : `/app/contacts?industry=${id}`);
const discoverHref = (platform: GlobalSearchPlatform, q: string) => (platform === "app" ? `/events?tab=discover&q=${encodeURIComponent(q)}` : `/app/events?tab=discover&q=${encodeURIComponent(q)}`);
const initialOf = (name: string) => Array.from(name.trim())[0] ?? "?";

type Person = { id: string; name: string; org: string; role: string; status: GlobalSearchPersonHit["status"]; reason?: string; related?: boolean };

const planned = new Set<string>(DEMO_PLAN.personTypes.flatMap((type) => [...(type.personIds as readonly string[])]));
const demoPeople: Person[] = DEMO_PEOPLE.map((person) => ({ id: person.id, name: person.name, org: person.company, role: person.role, status: planned.has(person.id) ? "in_progress" : "acquaintance" }));

function personHit(platform: GlobalSearchPlatform, person: Person, terms: readonly string[], semantic = false): GlobalSearchPersonHit {
  const subtitle = `${person.org} · ${person.role}`;
  return {
    contactId: person.id, name: person.name, initial: initialOf(person.name), org: person.org, role: person.role,
    status: semantic ? null : person.status, reason: person.reason ?? null, ...(person.related ? { related: true } : {}),
    highlights: semantic ? [] : highlightsFor(person.name, subtitle, terms), href: contactHref(platform, person.id),
  };
}

const TAKAHASHI_RYO: Person = { id: "demo-person-takahashi-ryo", name: "高橋 亮", org: "東亜精機", role: "生産技術部 課長", status: "acquaintance" };

function takahashi(platform: GlobalSearchPlatform, terms: readonly string[]) {
  const misaki = demoPeople.find((person) => person.id === "demo-person-takahashi")!;
  const people: GlobalSearchPersonHit[] = [personHit(platform, { ...misaki, status: "in_progress" }, terms), personHit(platform, TAKAHASHI_RYO, terms)];
  const eventTitle = "Japan SaaS Summit 2026 秋";
  const note = "高橋さんも参加予定 · 10/16";
  const events: GlobalSearchEventHit[] = [{ emoji: "🎤", eventId: "demo-event-saas-summit", href: eventHref(platform, "demo-event-saas-summit"), highlights: highlightsFor(eventTitle, note, terms), note, startsAt: "2026-10-16T10:00:00+09:00", title: eventTitle, via: null }];
  const conversations: GlobalSearchConversationHit[] = [
    { highlights: highlightsFor("高橋さんへのお礼の下書き", "10/7 · iOrbit との会話", terms), href: platform === "app" ? "/ai?session=demo-session-takahashi" : "/app/agent?session=demo-session-takahashi", id: "demo-session-takahashi", kind: "iorbit", subtitle: "10/7 · iOrbit との会話", title: "高橋さんへのお礼の下書き" },
    { highlights: highlightsFor("Re: 事業計画書 v3 のご送付", "高橋 美咲 · 受信箱 · 今日", terms), href: platform === "app" ? "/inbox/demo-mail-plan-v3" : "/app/inbox/demo-mail-plan-v3", id: "demo-mail-plan-v3", kind: "inbox", subtitle: "高橋 美咲 · 受信箱 · 今日", title: "Re: 事業計画書 v3 のご送付" },
  ];
  return { conversations, events, people };
}

const INVESTOR_PEOPLE: Person[] = [
  { id: "demo-person-takahashi", name: "高橋 美咲", org: "青葉ベンチャーズ", role: "パートナー", status: null, reason: "役職「パートナー」· VC" },
  { id: "demo-person-yamamoto", name: "山本 彩", org: "東都キャピタル", role: "シニアアソシエイト", status: null, reason: "会社が VC" },
  { id: "demo-person-mori-takayuki", name: "森 隆之", org: "みらい創業キャピタル", role: "代表パートナー", status: null, reason: "役職「代表パートナー」" },
  { id: "demo-person-ito", name: "伊藤 直子", org: "株式会社ハルモニア", role: "CFO", status: null, reason: "メモ「VC 4社と面識」", related: true },
  { id: "demo-person-watanabe", name: "渡辺 翔", org: "Nexa Robotics", role: "代表取締役", status: null, reason: "「投資家を紹介できる」", related: true },
  { id: "demo-person-nakamura-yuki", name: "中村 由紀", org: "光が丘法律事務所", role: "弁護士", status: null, reason: "投資契約に強い（関連）", related: true },
];

function investors(platform: GlobalSearchPlatform, terms: readonly string[]) {
  const people = INVESTOR_PEOPLE.map((person) => personHit(platform, person, terms, true));
  const title = "CFO Night Tokyo vol.18";
  const note = "VC 3名が参加予定 · 今夜";
  const events: GlobalSearchEventHit[] = [{ emoji: "🥂", eventId: "demo-event-cfo-night", href: eventHref(platform, "demo-event-cfo-night"), highlights: [], note, startsAt: DEMO_EVENTS[0].startsAt, title, via: "attendees" }];
  return { events, people };
}

function semiconductorTrade(platform: GlobalSearchPlatform, query: string): { suggestions: GlobalSearchSuggestion[]; alternatives: GlobalSearchAlternative[] } {
  return {
    alternatives: [
      { detail: `「${query.replace(/\s+/gu, "")}の人に会うには？」`, emoji: "✨", href: "#ask", kind: "ask_iorbit", label: "iOrbit に紹介ルートを聞く" },
      { detail: "製造業 DX カンファレンス 大阪 · 出展 12社", emoji: "🎟️", href: discoverHref(platform, query), kind: "events", label: "イベントで探す" },
    ],
    suggestions: [
      { count: 12, emoji: "🏭", href: contactsIndustryHref(platform, "manufacturing_supply_chain.electronics"), kind: "industry", label: "製造業 › 電子部品" },
      { count: 35, emoji: "📦", href: contactsIndustryHref(platform, "trade_logistics"), kind: "industry", label: "商社・流通" },
    ],
  };
}

export interface DemoGlobalSearchInput {
  query: string;
  limit: number;
  semantic: boolean;
  types?: readonly GlobalSearchType[];
  platform: GlobalSearchPlatform;
  /** The demo world can answer with the semantic variant (the boards #58 / #55 / #71); live says false until authorised. */
  semanticAvailable?: boolean;
}

/** The demo world's answer; always `sample: true`. */
export function demoGlobalSearch(input: DemoGlobalSearchInput): GlobalSearchResponse {
  const semanticAvailable = input.semanticAvailable ?? true;
  const query = input.query.trim();
  const terms = splitSearchTerms(query);
  const folded = terms.join(" ");
  const allTypes: GlobalSearchType[] = ["people", "events", "conversations"];
  const wanted = new Set<GlobalSearchType>(input.types?.length ? input.types : allTypes);
  const base = {
    alternatives: [] as GlobalSearchAlternative[], conversations: { items: [] as GlobalSearchConversationHit[], total: 0 }, events: { items: [] as GlobalSearchEventHit[], total: 0 },
    examples: semanticAvailable ? [...DEMO_SEARCH_EXAMPLES] : [...DEMO_SEARCH_KEYWORD_EXAMPLES], people: { items: [] as GlobalSearchPersonHit[], total: 0 },
    query, sample: true as const, searchedPeople: DEMO_SEARCHED_PEOPLE, semantic: { available: semanticAvailable, enabled: false }, suggestions: [] as GlobalSearchSuggestion[], types: allTypes,
  };
  if (!terms.length) return base;
  const cap = <T>(items: readonly T[]) => items.slice(0, input.limit);
  if (folded === "高橋") {
    const hit = takahashi(input.platform, terms);
    return {
      ...base,
      conversations: wanted.has("conversations") ? { items: cap(hit.conversations), total: hit.conversations.length } : { items: [], total: 0 },
      events: wanted.has("events") ? { items: cap(hit.events), total: hit.events.length } : { items: [], total: 0 },
      people: wanted.has("people") ? { items: cap(hit.people), total: hit.people.length } : { items: [], total: 0 },
    };
  }
  if (folded === "投資家" && input.semantic && semanticAvailable) {
    const hit = investors(input.platform, terms);
    return {
      ...base,
      events: wanted.has("events") ? { items: cap(hit.events), total: 2 } : { items: [], total: 0 },
      people: wanted.has("people") ? { items: cap(hit.people), order: "relevance", total: 23 } : { items: [], total: 0 },
      semantic: { available: true, enabled: true, matched: 9, related: 14 },
    };
  }
  // 单类型（A5）：没选「人」时不出业界建议（建议是按人筛的），与 live（features/search/global/core.ts）同一口径。
  if (terms.includes("半導体") && terms.includes("商社")) return { ...base, ...semiconductorTrade(input.platform, query), ...(wanted.has("people") ? {} : { suggestions: [] }) };
  // Anything else: keyword rules over the demo world.
  const people = demoPeople.filter((person) => matchesAllTerms([person.name, person.org, person.role], terms)).map((person) => personHit(input.platform, person, terms));
  const events = DEMO_EVENTS.filter((event) => matchesAllTerms([event.title, event.venue, event.organizer], terms)).map((event): GlobalSearchEventHit => {
    const note = `${event.startsAt.slice(5, 7).replace(/^0/u, "")}/${event.startsAt.slice(8, 10).replace(/^0/u, "")} · ${event.venue}`;
    return { emoji: "🎪", eventId: event.id, href: eventHref(input.platform, event.id), highlights: highlightsFor(event.title, note, terms), note, startsAt: event.startsAt, title: event.title, via: null };
  });
  const empty = wanted.has("people") ? !people.length : !events.length;
  return {
    ...base,
    alternatives: empty ? [
      { detail: `「${query.replace(/\s+/gu, "")}の人に会うには？」`, emoji: "✨", href: "#ask", kind: "ask_iorbit", label: "iOrbit に紹介ルートを聞く" },
      { detail: "探すで条件を変えて探す", emoji: "🎟️", href: discoverHref(input.platform, query), kind: "events", label: "イベントで探す" },
    ] : [],
    events: wanted.has("events") && !empty ? { items: cap(events), total: events.length } : { items: [], total: 0 },
    people: wanted.has("people") ? { items: cap(people), total: people.length } : { items: [], total: 0 },
  };
}
