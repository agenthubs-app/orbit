// QA-C4: messages exchanged with people in the global search's conversations group. One hit per conversation (its
// newest matching message): the other person's name as the title and a short piece of the message around the first
// matched term as the subtitle. The server builds it from its SQL rows (features/search/global/conversations.ts) and
// the App from the device's message mirror, so both read the same. Pure.
import type { GlobalSearchConversationHit } from "../contract/global-search";
import { highlightsFor } from "./search-highlight";
import { normalizeSearchText, splitSearchTerms } from "./search-normalize";

export interface RelationshipMessageSearchRow {
  conversationId: string;
  /** The other person's name as the reader knows them. */
  title: string;
  body: string;
  sentAt: string;
}

const SNIPPET = 80;
const LEAD = 20;

/** Every query term appears in the message (folded: NFKC, lower case, no whitespace). */
export function relationshipMessageMatches(body: string, terms: readonly string[]): boolean {
  if (!terms.length) return false;
  const folded = normalizeSearchText(body);
  return terms.every((term) => folded.includes(term));
}

/** A one-line piece of the message that starts a little before the first term found. */
export function relationshipMessageSnippet(body: string, terms: readonly string[]): string {
  const chars = Array.from(body.replace(/\s+/gu, " ").trim());
  const lower = chars.map((char) => normalizeSearchText(char) || " ");
  let first = -1;
  for (const term of terms) {
    const head = Array.from(term)[0];
    if (!head) continue;
    for (let index = 0; index < lower.length; index += 1) {
      if (lower[index] === head && lower.slice(index).join("").startsWith(term)) { if (first < 0 || index < first) first = index; break; }
    }
  }
  const start = first > LEAD ? first - LEAD : 0;
  const piece = chars.slice(start, start + SNIPPET).join("");
  return `${start > 0 ? "…" : ""}${piece}${start + SNIPPET < chars.length ? "…" : ""}`;
}

/** Hits for the rows (newest message first per conversation), at most `limit`, newest conversation first. */
export function relationshipMessageHits(rows: readonly RelationshipMessageSearchRow[], query: string, limit: number): GlobalSearchConversationHit[] {
  const terms = splitSearchTerms(query);
  if (!terms.length || limit < 1) return [];
  const newest = new Map<string, RelationshipMessageSearchRow>();
  for (const row of rows) {
    if (!row.conversationId || !relationshipMessageMatches(row.body, terms)) continue;
    const kept = newest.get(row.conversationId);
    if (!kept || kept.sentAt < row.sentAt) newest.set(row.conversationId, row);
  }
  return [...newest.values()]
    .sort((left, right) => (left.sentAt < right.sentAt ? 1 : left.sentAt > right.sentAt ? -1 : 0))
    .slice(0, limit)
    .map((row) => {
      const subtitle = relationshipMessageSnippet(row.body, terms);
      return {
        highlights: highlightsFor(row.title, subtitle, terms),
        href: `/inbox/${encodeURIComponent(row.conversationId)}`,
        id: row.conversationId,
        kind: "inbox" as const,
        subtitle,
        title: row.title,
      };
    });
}
