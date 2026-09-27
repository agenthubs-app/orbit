import type { RelationshipUnreadSummaryDTO } from "../../shared/contract/relationship-communication";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { relationshipUnreadSummarySchema } from "../../shared/api-schema/relationship-unread-summary";

export type { RelationshipUnreadSummaryDTO } from "../../shared/contract/relationship-communication";

/**
 * Sprint 0109: the badge is the sum of the caller's own member rows' unread
 * counts (maintained by every send and read), over active conversations only.
 * One index range on (workspace, account); no message or other account's row is read.
 */
export async function readRelationshipUnreadSummary(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  actorId: string;
  now?: () => string;
}): Promise<RelationshipUnreadSummaryDTO> {
  if (!input.actorId.trim() || !input.workspaceId.trim()) throw new Error("Unread summary scope is required");
  const result = await input.client.query<{ unread_total: string }>(`
    select coalesce(sum(me.unread_count), 0)::text as unread_total
    from relationship_conversation_members me
    join relationship_conversations c on c.workspace_id=me.workspace_id
      and c.conversation_id=me.conversation_id and c.status='active'
    where me.workspace_id=$1 and me.account_id=$2 and me.state='active'
  `, [input.workspaceId, input.actorId]);
  return relationshipUnreadSummarySchema.parse({
    actorId: input.actorId,
    unreadTotal: Number(result.rows[0]?.unread_total),
    refreshedAt: (input.now ?? (() => new Date().toISOString()))(),
  });
}
