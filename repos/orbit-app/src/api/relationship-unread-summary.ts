import type { OrbitApiClient } from "./client";
import { relationshipCommunicationConversationsPath } from "./endpoints";
import { relationshipUnreadSummarySchema } from "./schema/relationship-unread-summary";
import { relationshipConversationListToInbox } from "./message-state";

export const RELATIONSHIP_UNREAD_SUMMARY_PATH = "/api/relationship-communication/unread-summary";

/** Owned by a hook identity/focus scope; never shared across accounts or hosts. */
export interface RelationshipUnreadCapability { legacyOnly?: boolean }

export async function readRelationshipUnreadCount(input: {
  client: OrbitApiClient;
  actorId: string;
  signal: AbortSignal;
  capability: RelationshipUnreadCapability;
}): Promise<number | undefined> {
  const { client, actorId, signal, capability } = input;
  if (!capability.legacyOnly) {
    const result = await client.get<unknown>(RELATIONSHIP_UNREAD_SUMMARY_PATH, { signal });
    if (signal.aborted) return undefined;
    if (result.status !== 404 && result.status !== 405) {
      if (!result.success || result.status < 200 || result.status >= 300) return undefined;
      const decoded = relationshipUnreadSummarySchema.safeParse(result.data);
      return decoded.success && decoded.data.actorId === actorId ? decoded.data.unreadTotal : undefined;
    }
    // Only an explicitly absent endpoint permits the old expensive read. Never
    // turn an auth/permission/server/data error into additional fallback traffic.
    capability.legacyOnly = true;
  }
  const result = await client.get<unknown>(relationshipCommunicationConversationsPath(), { signal });
  if (signal.aborted || !result.success || result.status < 200 || result.status >= 300) return undefined;
  const inbox = relationshipConversationListToInbox(result.data, actorId);
  return inbox ? inbox.unreadTotal ?? inbox.conversations.reduce((sum, item) => sum + item.unreadCount, 0) : undefined;
}
