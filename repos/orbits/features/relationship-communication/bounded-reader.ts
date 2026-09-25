import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { RelationshipConversationSummaryPageDTO, RelationshipMessagePageDTO } from "../../shared/contract/relationship-communication";
import { relationshipConversationSummaryPageSchema, relationshipMessagePageSchema } from "../../shared/api-schema/relationship-pages";
import { createRelationshipReadCursor } from "./read-cursor";

// Same bilateral binding boundary as unread-summary; every page rechecks it in
// the same SQL snapshot as its message data. No cached permission or N+1 RPCs.
const ELIGIBLE = `eligible as (
  select c.record_id, c.payload from orbit_records c
  join orbit_records b on b.workspace_id=c.workspace_id
    and b.collection_name='relationship_communication_bindings'
    and b.record_id=c.payload->>'bindingId' and b.lifecycle_state='active'
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
)`;

const IDENTITY = `jsonb_build_object(
  'conversationId', left(c.record_id,512), 'contactId', left(c.payload->>'contactId',512),
  'participantAccountIds', c.payload->'participantAccountIds',
  'participantDisplayNames', jsonb_build_object(
    c.payload->'participantAccountIds'->>0, left(c.payload->'participantDisplayNames'->>(c.payload->'participantAccountIds'->>0),256),
    c.payload->'participantAccountIds'->>1, left(c.payload->'participantDisplayNames'->>(c.payload->'participantAccountIds'->>1),256)),
  'qualificationVersion', left(c.payload->>'qualificationVersion',512), 'status','active',
  'createdAt', left(c.payload->>'createdAt',64), 'updatedAt', left(c.payload->>'updatedAt',64)
)`;

const MESSAGE_MATCH = `m.workspace_id=$1 and m.collection_name='relationship_communication_messages'
  and m.target_id=c.record_id and m.lifecycle_state<>'deleted'
  and m.payload->>'kind'='relationship_message' and m.payload->>'conversationId'=c.record_id`;

const CONVERSATIONS_SQL = `with ${ELIGIBLE}, candidates as (
  select c.* from eligible c
  where ($6::text is null or c.record_id=$6)
    and ($4::text is null or (c.payload->>'updatedAt') collate "C" < $4
      or (c.payload->>'updatedAt'=$4 and c.record_id collate "C">$5))
  order by (c.payload->>'updatedAt') collate "C" desc, c.record_id collate "C" asc limit $3+1
), selected as (select * from candidates order by (payload->>'updatedAt') collate "C" desc,record_id collate "C" asc limit $3)
select coalesce(jsonb_agg(${IDENTITY} || jsonb_build_object(
  'unreadCount', (select count(*) from orbit_records m where ${MESSAGE_MATCH}
    and m.payload->>'senderAccountId'<>$2 and (marker.record_id is null or
      ((m.payload->>'sentAt') collate "C",(m.payload->>'messageId') collate "C") >
      ((marker.payload->>'sentAt') collate "C",(marker.payload->>'messageId') collate "C"))),
  'lastMessage', (select jsonb_build_object('messageId',left(m.payload->>'messageId',512),
    'senderAccountId',left(m.payload->>'senderAccountId',512),'sentAt',left(m.payload->>'sentAt',64),
    'bodyPreview',left(m.payload->>'body',320)) from orbit_records m where ${MESSAGE_MATCH}
    order by (m.payload->>'sentAt') collate "C" desc,(m.payload->>'messageId') collate "C" desc limit 1)
) order by (c.payload->>'updatedAt') collate "C" desc,c.record_id collate "C" asc),'[]'::jsonb) as items,
exists(select 1 from candidates offset $3 limit 1) as has_more
from selected c
left join orbit_records r on r.workspace_id=$1 and r.collection_name='relationship_communication_reads'
  and r.record_id='relationship-read:'||encode(sha256(convert_to(c.record_id,'UTF8')||decode('00','hex')||convert_to($2,'UTF8')),'hex')
  and r.lifecycle_state<>'deleted' and r.payload->>'kind'='relationship_read'
left join orbit_records marker on marker.workspace_id=$1 and marker.collection_name='relationship_communication_messages'
  and marker.record_id=r.payload->>'lastReadMessageId' and marker.target_id=c.record_id
  and marker.lifecycle_state<>'deleted' and marker.payload->>'kind'='relationship_message'
  and marker.payload->>'conversationId'=c.record_id`;

function messagesSql(direction: "older" | "newer"): string {
  const comparison = direction === "older" ? "<" : ">";
  const order = direction === "older" ? "desc" : "asc";
  return `with ${ELIGIBLE}, selected as (select * from eligible where record_id=$3), candidates as (
    select m.payload from selected c join orbit_records m on ${MESSAGE_MATCH}
    where ($5::text is null or ((m.payload->>'sentAt') collate "C", (m.payload->>'messageId') collate "C") ${comparison} ($5::text,$6::text))
    order by (m.payload->>'sentAt') collate "C" ${order},(m.payload->>'messageId') collate "C" ${order} limit $4+1
  ), measured as (
    select *, row_number() over w as position,
      sum(octet_length(coalesce(payload->>'body','')) + 4096) over w as window_bytes
    from candidates window w as (order by (payload->>'sentAt') collate "C" ${order},(payload->>'messageId') collate "C" ${order})
  ), window_messages as (
    select * from measured where position<=$4 and (position=1 or window_bytes<=96000)
  ) select (select ${IDENTITY} from selected c) as conversation,
    coalesce((select jsonb_agg(jsonb_build_object(
      'messageId',left(payload->>'messageId',512),'conversationId',left(payload->>'conversationId',512),
      'senderAccountId',left(payload->>'senderAccountId',512),'senderDisplayName',left(payload->>'senderDisplayName',512),
      'body',left(payload->>'body',10000),'sentAt',left(payload->>'sentAt',64),'deliveryState',payload->>'deliveryState'
    ) order by (payload->>'sentAt') collate "C" asc,(payload->>'messageId') collate "C" asc) from window_messages),'[]'::jsonb) as items,
    (select count(*) from candidates) > (select count(*) from window_messages) as has_more,
    exists(select 1 from window_messages where char_length(payload->>'body')>10000
      or char_length(payload->>'messageId')>512 or char_length(payload->>'conversationId')>512
      or char_length(payload->>'senderAccountId')>512 or char_length(payload->>'senderDisplayName')>512
      or char_length(payload->>'sentAt')>64) as invalid_message`;
}

export function createRelationshipBoundedReader(input: {
  client: LiveRecordSqlClient; workspaceId: string; actorId: string; cursorSecret: string; now?: () => string;
}) {
  if (!input.workspaceId.trim() || !input.actorId.trim()) throw new Error("RELATIONSHIP_SCOPE_REQUIRED");
  const codec = createRelationshipReadCursor(input.cursorSecret);
  const scope = (...keys: string[]) => JSON.stringify([input.workspaceId, input.actorId, ...keys]);
  const now = input.now ?? (() => new Date().toISOString());
  const limitFor = (value: number | undefined, fallback: number) => {
    const limit = value ?? fallback;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("RELATIONSHIP_PAGE_INPUT_INVALID");
    return limit;
  };
  return {
    async conversations(query: { limit?: number; cursor?: string | null; conversationId?: string } = {}): Promise<RelationshipConversationSummaryPageDTO> {
      const limit = limitFor(query.limit, 20);
      const cursorScope = scope("conversations", query.conversationId ?? "");
      const cursor = codec.decode(query.cursor, cursorScope);
      const result = await input.client.query<{ items: unknown[]; has_more: boolean }>(CONVERSATIONS_SQL,
        [input.workspaceId,input.actorId,limit,cursor?.at ?? null,cursor?.id ?? null,query.conversationId ?? null]);
      const row = result.rows[0];
      if (!row) throw new Error("RELATIONSHIP_PAGE_RESULT_INVALID");
      const parsed = relationshipConversationSummaryPageSchema.parse({ actorId: input.actorId, items: row.items, hasMore: row.has_more, nextCursor: null, asOf: now() });
      const last = parsed.items.at(-1);
      return { ...parsed, items: parsed.items.map(item => ({ ...item, participantAccountIds: item.participantAccountIds!, lastMessage: item.lastMessage ?? null })),
        nextCursor: parsed.hasMore && last ? codec.encode(cursorScope, last.updatedAt, last.conversationId) : null };
    },
    async messages(conversationId: string, query: { limit?: number; cursor?: string | null; direction?: "older" | "newer" } = {}): Promise<RelationshipMessagePageDTO> {
      if (!conversationId.trim() || conversationId.length > 512) throw new Error("RELATIONSHIP_PAGE_INPUT_INVALID");
      const limit = limitFor(query.limit, 30), direction = query.direction ?? "older";
      if (direction !== "older" && direction !== "newer") throw new Error("RELATIONSHIP_PAGE_INPUT_INVALID");
      const cursorScope = scope("messages", conversationId, direction);
      const cursor = codec.decode(query.cursor, cursorScope);
      const result = await input.client.query<{ conversation: unknown; items: unknown[]; has_more: boolean; invalid_message: boolean }>(messagesSql(direction),
        [input.workspaceId,input.actorId,conversationId,limit,cursor?.at ?? null,cursor?.id ?? null]);
      const row = result.rows[0];
      if (!row?.conversation) throw new Error("RELATIONSHIP_NOT_FOUND");
      if (row.invalid_message) throw new Error("RELATIONSHIP_PAGE_RESULT_INVALID");
      const page = relationshipMessagePageSchema.parse({ actorId: input.actorId, conversation: row.conversation, items: row.items, hasMore: row.has_more, direction, nextCursor: null, newestCursor: null, asOf: now() });
      const last = direction === "older" ? page.items[0] : page.items.at(-1);
      const newest = page.items.at(-1);
      return { ...page,
        conversation: { ...page.conversation, participantAccountIds: page.conversation.participantAccountIds! },
        nextCursor: page.hasMore && last ? codec.encode(cursorScope, last.sentAt, last.messageId) : null,
        newestCursor: newest ? codec.encode(scope("messages",conversationId,"newer"),newest.sentAt,newest.messageId) : direction === "newer" ? query.cursor ?? null : null,
      };
    },
  };
}
