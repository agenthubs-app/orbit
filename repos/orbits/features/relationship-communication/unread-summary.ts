import type { RelationshipUnreadSummaryDTO } from "../../shared/contract/relationship-communication";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { relationshipUnreadSummarySchema } from "../../shared/api-schema/relationship-unread-summary";

export type { RelationshipUnreadSummaryDTO } from "../../shared/contract/relationship-communication";

/**
 * Read-time aggregation, not a second source of truth. One SQL snapshot validates
 * the current binding and counts incoming messages after the actual read marker.
 * A missing marker means all incoming messages, matching conversationSnapshot.
 * Canonical writers use ISO UTC timestamps and sha256 message IDs (C ordering).
 */
export async function readRelationshipUnreadSummary(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  actorId: string;
  now?: () => string;
}): Promise<RelationshipUnreadSummaryDTO> {
  if (!input.actorId.trim() || !input.workspaceId.trim()) throw new Error("Unread summary scope is required");
  const result = await input.client.query<{ unread_total: string }>(`
    with eligible as (
      select c.record_id as conversation_id
      from orbit_records c
      join orbit_records b on b.workspace_id=c.workspace_id
        and b.collection_name='relationship_communication_bindings'
        and b.record_id=c.payload->>'bindingId'
        and b.lifecycle_state='active'
      where c.workspace_id=$1 and c.collection_name='relationship_communication_conversations'
        and c.lifecycle_state='active' and c.payload->>'kind'='relationship_conversation'
        and c.payload->>'conversationId'=c.record_id and c.payload->>'status'='active'
        and jsonb_typeof(c.payload->'participantAccountIds')='array'
        and case when jsonb_typeof(c.payload->'participantAccountIds')='array'
          then jsonb_array_length(c.payload->'participantAccountIds')=2 else false end
        and c.payload->'participantAccountIds' ? $2
        and b.payload->>'kind'='relationship_binding' and b.payload->>'status'='confirmed'
        and b.payload->>'inviterAccountId'<>b.payload->>'remoteAccountId'
        and b.payload->>'contactId'=c.payload->>'contactId'
        and b.payload->>'conversationId'=c.record_id
        and b.payload->>'qualificationVersion'=c.payload->>'qualificationVersion'
        and c.payload->'participantAccountIds' ? (b.payload->>'inviterAccountId')
        and c.payload->'participantAccountIds' ? (b.payload->>'remoteAccountId')
    )
    select count(*)::text as unread_total
    from eligible c
    left join orbit_records r on r.workspace_id=$1
      and r.collection_name='relationship_communication_reads'
      and r.record_id='relationship-read:' || encode(sha256(convert_to(c.conversation_id,'UTF8') || decode('00','hex') || convert_to($2,'UTF8')),'hex')
      and r.payload->>'kind'='relationship_read'
    left join orbit_records marker on marker.workspace_id=$1
      and marker.collection_name='relationship_communication_messages'
      and marker.record_id=r.payload->>'lastReadMessageId'
      and marker.target_id=c.conversation_id
      and marker.payload->>'kind'='relationship_message'
      and marker.payload->>'conversationId'=c.conversation_id
    join orbit_records m on m.workspace_id=$1
      and m.collection_name='relationship_communication_messages'
      and m.target_id=c.conversation_id
      and m.payload->>'kind'='relationship_message'
      and m.payload->>'conversationId'=c.conversation_id
      and m.payload->>'senderAccountId'<>$2
      and (marker.record_id is null or
        ((m.payload->>'sentAt') collate "C", (m.payload->>'messageId') collate "C") >
        ((marker.payload->>'sentAt') collate "C", (marker.payload->>'messageId') collate "C"))
  `, [input.workspaceId, input.actorId]);
  return relationshipUnreadSummarySchema.parse({
    actorId: input.actorId,
    unreadTotal: Number(result.rows[0]?.unread_total),
    refreshedAt: (input.now ?? (() => new Date().toISOString()))(),
  });
}
