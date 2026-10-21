// LF11: the R30 global search on the device. People are recalled from the device's contacts with the server's own
// contact search rule (each term on its own, AND by id — features/search/global/live.ts) and lite's extra words;
// grouping, ranking and the empty-result rules are the server's (shared/compute/global-search.ts). Events come from the
// server's answer when it can be reached; conversations too (it also searches message bodies), otherwise the device's
// AI session list (titles and previews).
import type { AiSessionSummaryItemContract } from "../../api/contract/ai-session-page";
import type { ContactSyncPayload } from "../../api/contract/contact-local-directory";
import type { GlobalSearchResponse, GlobalSearchType } from "../../api/contract/global-search";
import { localContactDirectory } from "../../api/schema/contact-local-directory";
import { buildGlobalSearch, conversationHitsFromSessions, globalSearchExamples, type IndustryCount, type PersonCandidate, type SearchLanguage } from "../../api/compute/global-search";
import { splitSearchTerms } from "../../api/compute/search-normalize";
import { liteCanExpand, liteRecallWords } from "../../api/compute/search-synonyms";
import type { SearchFilter } from "./search-model";

/** The server's limits (features/search/global/handlers.ts, live.ts): terms searched, lite's extra words, people per term. */
const MAX_TERMS = 4;
const LITE_MAX_RECALL_WORDS = 12;
const PEOPLE_RECALL = 50;
const TYPES: readonly GlobalSearchType[] = ["people", "events", "conversations"];

function personOf(row: ContactSyncPayload): PersonCandidate | null {
  const card = row.card;
  if (!card) return null;
  return { id: card.id, name: card.displayName, org: card.organization || null, role: card.role || null, other: [card.region?.city, card.nextActionPreview], lastInteractionAt: card.lastInteractionAt ?? null };
}

function recall(rows: readonly ContactSyncPayload[], term: string): PersonCandidate[] {
  return localContactDirectory(rows, { query: term }).slice(0, PEOPLE_RECALL).flatMap((row) => { const person = personOf(row); return person ? [person] : []; });
}

function industryCounts(rows: readonly ContactSyncPayload[]): IndustryCount[] {
  const counts = new Map<string, number>();
  for (const row of localContactDirectory(rows, {})) {
    for (const id of [row.card?.primaryIndustryId, row.card?.secondaryIndustryId]) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({ id, count }));
}

export interface LocalGlobalSearchInput {
  query: string;
  filter: SearchFilter;
  semantic?: boolean | undefined;
  limit?: number | undefined;
  language: SearchLanguage;
  now: Date;
  contacts: readonly ContactSyncPayload[];
  /** The cached plan-related contact ids (推進中), as the 人脈 list merges them. */
  goalIds: readonly string[];
  sessions: readonly AiSessionSummaryItemContract[];
  /** The server's answer for events (and conversations); null when it could not be reached. */
  server: GlobalSearchResponse | null;
}

export function localGlobalSearch(input: LocalGlobalSearchInput): GlobalSearchResponse {
  const terms = splitSearchTerms(input.query);
  const listed = localContactDirectory(input.contacts, {});
  const common = {
    examples: globalSearchExamples(input.language, true), industryCounts: industryCounts(input.contacts), language: input.language,
    limit: input.limit ?? 6, now: input.now, platform: "app" as const, query: input.query, searchedPeople: listed.length, semanticAvailable: true, terms, types: TYPES,
  };
  if (!terms.length) return buildGlobalSearch({ ...common, conversations: null, events: null, people: [], planLinked: null });
  const wanted: readonly GlobalSearchType[] = input.filter === "all" ? TYPES : [input.filter];
  const semantic = Boolean(input.semantic && wanted.includes("people") && liteCanExpand(terms));
  let people: PersonCandidate[] = [];
  let peopleTotal = 0;
  if (wanted.includes("people")) {
    const lists = terms.slice(0, MAX_TERMS).map((term) => recall(input.contacts, term));
    const others = lists.slice(1).map((list) => new Set(list.map((person) => person.id)));
    const byId = new Map((lists[0] ?? []).filter((person) => others.every((ids) => ids.has(person.id))).map((person) => [person.id, person]));
    if (semantic) {
      for (const word of liteRecallWords(terms).filter((word) => !terms.includes(word)).slice(0, LITE_MAX_RECALL_WORDS)) {
        for (const person of recall(input.contacts, word)) if (!byId.has(person.id)) byId.set(person.id, person);
      }
    }
    people = [...byId.values()];
    // One term keeps the reader's own total (it may exceed the recall); several count the intersection (as the server).
    peopleTotal = lists.length === 1 && !semantic ? localContactDirectory(input.contacts, { query: terms[0]! }).length : people.length;
  }
  const conversations = !wanted.includes("conversations") ? null
    : input.server ? input.server.conversations?.items ?? null
      : conversationHitsFromSessions(input.sessions, input.query, 20);
  return buildGlobalSearch({
    ...common, people, peopleTotal, planLinked: wanted.includes("people") ? new Set(input.goalIds) : null, semantic,
    events: null, eventHits: input.server && wanted.includes("events") ? input.server.events : null, conversations,
    ...(input.filter === "all" ? {} : { wanted: [input.filter] }),
  });
}
