import type { OrbitAgentChatOrganizationStore } from "./orbit-agent-chat-session-transactions";
import type { OrbitAgentChatSessionProvider } from "./orbit-agent-chat-session-live-record-provider";

/** One actor-scoped local maintenance pass. No scheduler registers this function. */
export async function expireOrbitAgentChatSessions(input: {
  provider: OrbitAgentChatSessionProvider;
  organization: OrbitAgentChatOrganizationStore;
  now: Date;
  maxScanned?: number;
}): Promise<{ deletedIds: string[]; scanned: number; truncated: boolean }> {
  if (!Number.isFinite(input.now.getTime())) throw new RangeError("A valid retention clock is required");
  const maxScanned = input.maxScanned ?? 5000;
  if (!Number.isSafeInteger(maxScanned) || maxScanned < 1) throw new RangeError("maxScanned must be positive");
  const deletedIds: string[] = [];
  let scanned = 0;
  let cursor: string | null = null;
  let truncated = false;
  do {
    const page = await input.provider.listSessionSummariesPage(
      { limit: Math.min(50, maxScanned - scanned), cursor },
      (sessionIds) => input.organization.listSessionOrganizations(sessionIds),
    );
    for (const item of page.items) {
      scanned += 1;
      const deleted = await input.provider.deleteExpiredSession(item.id, input.now, async () =>
        (await input.organization.getSessionOrganization(item.id)).pinned,
      );
      if (deleted) deletedIds.push(item.id);
    }
    cursor = page.nextCursor;
    if (scanned >= maxScanned && cursor) {
      truncated = true;
      break;
    }
  } while (cursor);
  return { deletedIds, scanned, truncated };
}
