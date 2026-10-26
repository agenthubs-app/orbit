// R21: one actor-scoped, server-paged iOrbit history read for the R30 会話 chip.
// The inbox branch is supplied by B once it exposes a read-only search service.
import { highlightsFor } from "../../../shared/compute/search-highlight";
import { splitSearchTerms } from "../../../shared/compute/search-normalize";
import { conversationSubtitle, type SearchLanguage } from "../../../shared/compute/global-search";
import { relationshipMessageHits, type RelationshipMessageSearchRow } from "../../../shared/compute/relationship-message-search";
import type { AiSessionSummaryItemContract } from "../../../shared/contract/ai-session-page";
import type { GlobalSearchConversationHit } from "../../../shared/contract/global-search";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import { searchRelationshipMessages } from "../../relationship-communication/message-search";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";

type Summary = Pick<AiSessionSummaryItemContract, "id" | "organization" | "title" | "updatedAt">;
type SessionReader = { listSessionSummariesPage(query: { q: string; limit: number }): Promise<{ items: readonly Summary[] }> };
/** QA-C4: messages exchanged with people (newest match per conversation). */
type MessageSearch = (actorId: string, terms: readonly string[], limit: number) => Promise<RelationshipMessageSearchRow[]>;

const tokyoDate = new Intl.DateTimeFormat("ja-JP", { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" });

export function createConversationSearch(deps: { sessionForActor(actorId: string): SessionReader | null; messages?: MessageSearch | null }) {
  return async (actorId: string, q: string, limit: number, language: SearchLanguage = "ja"): Promise<GlobalSearchConversationHit[]> => {
    const query = q.trim();
    if (!actorId.trim() || !query || !Number.isSafeInteger(limit) || limit < 1) return [];
    const reader = deps.sessionForActor(actorId);
    const cap = Math.min(limit, 20);
    const terms = splitSearchTerms(query);
    // A failing message read leaves the iOrbit part (and the reverse); neither fails the search.
    const [page, messageRows] = await Promise.all([
      reader ? reader.listSessionSummariesPage({ q: query, limit: cap }) : Promise.resolve({ items: [] as Summary[] }),
      deps.messages ? deps.messages(actorId, terms, cap).catch(() => [] as RelationshipMessageSearchRow[]) : Promise.resolve([] as RelationshipMessageSearchRow[]),
    ]);
    const messageHits = relationshipMessageHits(messageRows, query, cap);
    return [...messageHits, ...page.items.slice(0, cap).map((item) => {
      const title = item.organization.customTitle || item.title;
      const subtitle = conversationSubtitle(tokyoDate.format(new Date(item.updatedAt)), language);
      return {
        highlights: highlightsFor(title, subtitle, terms),
        href: `/app/agent?session=${encodeURIComponent(item.id)}`,
        id: item.id,
        kind: "iorbit" as const,
        subtitle,
        title,
      };
    })].slice(0, cap);
  };
}

export const searchConversations = createConversationSearch({
  sessionForActor: (actorId) => createOrbitAgentChatSessionProvider("live", actorId),
  messages: async (actorId, terms, limit) => {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    return runtime ? searchRelationshipMessages(runtime.client, { actorId, limit, terms, workspaceId: runtime.workspaceId }) : [];
  },
});
