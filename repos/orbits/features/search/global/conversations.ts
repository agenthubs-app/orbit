// R21: one actor-scoped, server-paged iOrbit history read for the R30 会話 chip.
// The inbox branch is supplied by B once it exposes a read-only search service.
import { highlightsFor } from "../../../shared/compute/search-highlight";
import { splitSearchTerms } from "../../../shared/compute/search-normalize";
import type { AiSessionSummaryItemContract } from "../../../shared/contract/ai-session-page";
import type { GlobalSearchConversationHit } from "../../../shared/contract/global-search";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";

type Summary = Pick<AiSessionSummaryItemContract, "id" | "organization" | "title" | "updatedAt">;
type SessionReader = { listSessionSummariesPage(query: { q: string; limit: number }): Promise<{ items: readonly Summary[] }> };

const tokyoDate = new Intl.DateTimeFormat("ja-JP", { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" });

export function createConversationSearch(deps: { sessionForActor(actorId: string): SessionReader | null }) {
  return async (actorId: string, q: string, limit: number): Promise<GlobalSearchConversationHit[]> => {
    const query = q.trim();
    if (!actorId.trim() || !query || !Number.isSafeInteger(limit) || limit < 1) return [];
    const reader = deps.sessionForActor(actorId);
    if (!reader) return [];
    const cap = Math.min(limit, 20);
    const page = await reader.listSessionSummariesPage({ q: query, limit: cap });
    const terms = splitSearchTerms(query);
    return page.items.slice(0, cap).map((item) => {
      const title = item.organization.customTitle || item.title;
      const subtitle = `${tokyoDate.format(new Date(item.updatedAt))} · iOrbit との会話`;
      return {
        highlights: highlightsFor(title, subtitle, terms),
        href: `/app/agent?session=${encodeURIComponent(item.id)}`,
        id: item.id,
        kind: "iorbit" as const,
        subtitle,
        title,
      };
    });
  };
}

export const searchConversations = createConversationSearch({
  sessionForActor: (actorId) => createOrbitAgentChatSessionProvider("live", actorId),
});
