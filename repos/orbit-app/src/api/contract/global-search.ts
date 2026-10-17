// R30 — global search: one endpoint behind the Web ⌘K panel and the App /search page
// (search/DESIGN.md §3.1). Owner: 甲 (R30). Used by: Web orbit-2026/search, App src/screens/search.
// It orchestrates the existing sources (contacts list search, R27 event-search, R21 conversations
// once they exist) and adds grouping, ranking, hit ranges and the empty-state suggestions.

export type GlobalSearchType = "people" | "events" | "conversations";

/** A hit range in code points of the field's text; the clients only render it. */
export interface SearchHighlight {
  field: "title" | "subtitle";
  start: number;
  end: number;
}

export interface GlobalSearchPersonHit {
  contactId: string;
  name: string;
  initial: string;
  org?: string | null;
  role?: string | null;
  /** Right-hand chip: 推進中 (in the current plan) / 知り合い (everyone else); null = no plan → no chip. */
  status?: "in_progress" | "acquaintance" | null;
  /** Semantic search only: why this person matched (役職「パートナー」· VC). Drawn instead of the status chip. */
  reason?: string | null;
  /** Semantic search: 関連 (not a literal hit). */
  related?: boolean;
  highlights: readonly SearchHighlight[];
  href: string;
}

export interface GlobalSearchEventHit {
  eventId: string;
  title: string;
  emoji: string;
  startsAt: string;
  /** 「高橋 さんも参加予定 · 10/16」「VC 3名が参加予定 · 今夜」— built on the server (dictionary), not by the client. */
  note: string;
  /** Hit came from the attendee list → the client draws the 「参加者から」 pill (b5 #58 / #55). */
  via?: "attendees" | null;
  highlights: readonly SearchHighlight[];
  href: string;
}

export interface GlobalSearchConversationHit {
  id: string;
  kind: "iorbit" | "inbox";
  title: string;
  subtitle: string;
  highlights: readonly SearchHighlight[];
  href: string;
}

export interface GlobalSearchGroup<T> {
  total: number;
  items: readonly T[];
  order?: "relevance";
}

/** 近い条件なら: an industry the query words map to, with my contact count. */
export interface GlobalSearchSuggestion {
  kind: "industry";
  emoji: string;
  label: string;
  count: number;
  href: string;
}

/** ほかの方法: always two rows on an empty result. */
export interface GlobalSearchAlternative {
  kind: "ask_iorbit" | "events";
  emoji: string;
  label: string;
  detail: string;
  href: string;
}

export interface GlobalSearchSemantic {
  /** An embedding provider is configured (R30: false until the user authorises it). */
  available: boolean;
  /** This answer was a semantic search. */
  enabled: boolean;
  matched?: number;
  related?: number;
}

/**
 * `GET /api/search/global?q=&types=&limit=&semantic=` — `q` may be empty: then nothing is searched and only the
 * capability part (`types`, `semantic`, `searchedPeople`, `examples`) is answered, which draws the initial screen.
 */
export interface GlobalSearchResponse {
  query: string;
  /** The groups this account can search right now (live: no `conversations` until R21 ships its service). */
  types: readonly GlobalSearchType[];
  people: GlobalSearchGroup<GlobalSearchPersonHit>;
  events: GlobalSearchGroup<GlobalSearchEventHit>;
  conversations?: GlobalSearchGroup<GlobalSearchConversationHit>;
  semantic: GlobalSearchSemantic;
  /** 「286人の名前・会社・役職・メモを探しました」 */
  searchedPeople: number;
  /** 「こんな検索もできます」 (empty query only; filtered to keyword-capable ones while semantic is unavailable). */
  examples: readonly string[];
  suggestions: readonly GlobalSearchSuggestion[];
  alternatives: readonly GlobalSearchAlternative[];
  sample?: true;
}

export interface GlobalSearchQuery {
  q: string;
  types?: readonly GlobalSearchType[];
  limit: number;
  semantic: boolean;
}
