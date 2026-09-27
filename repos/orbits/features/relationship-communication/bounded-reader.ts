import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { RelationshipConversationSummaryPageDTO, RelationshipMessagePageDTO } from "../../shared/contract/relationship-communication";
import { relationshipConversationSummaryPageSchema, relationshipMessagePageSchema } from "../../shared/api-schema/relationship-pages";
import { createRelationshipReadCursor } from "./read-cursor";

// Sprint 0109: summaries walk the caller's member rows through the
// (account, last_message_at) inbox index and messages page by the
// (conversation, seq) primary key. Both check, in the same SQL snapshot, that
// the conversation is active and the caller is an active member; a revoked
// conversation is invisible to both sides. No other account's rows are read.
const iso = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const MEMBER_NAME = (account: string) => `(select left(n.display_name,256) from relationship_conversation_members n
  where n.workspace_id=c.workspace_id and n.conversation_id=c.conversation_id and n.account_id=${account})`;

const IDENTITY = `jsonb_build_object(
  'conversationId', left(c.conversation_id,512), 'contactId', left(c.inviter_contact_id,512),
  'participantAccountIds', jsonb_build_array(c.inviter_account_id, c.invitee_account_id),
  'participantDisplayNames', jsonb_build_object(
    c.inviter_account_id, ${MEMBER_NAME("c.inviter_account_id")},
    c.invitee_account_id, ${MEMBER_NAME("c.invitee_account_id")}),
  'qualificationVersion', left(c.qualification_version,512), 'status','active',
  'createdAt', ${iso("c.created_at")}, 'updatedAt', ${iso("c.last_message_at")}
)`;

const CONVERSATIONS_SQL = `with candidates as (
  select me.conversation_id, me.unread_count, me.last_message_at from relationship_conversation_members me
  join relationship_conversations c on c.workspace_id=me.workspace_id and c.conversation_id=me.conversation_id and c.status='active'
  where me.workspace_id=$1 and me.account_id=$2 and me.state='active'
    and ($6::text is null or me.conversation_id=$6)
    and ($4::timestamptz is null or me.last_message_at < $4::timestamptz
      or (me.last_message_at=$4::timestamptz and me.conversation_id>$5::text))
  order by me.last_message_at desc, me.conversation_id asc limit $3+1
), selected as (select * from candidates order by last_message_at desc, conversation_id asc limit $3)
select coalesce(jsonb_agg(${IDENTITY} || jsonb_build_object(
  'unreadCount', s.unread_count,
  'lastMessage', (select jsonb_build_object('messageId',left(lm.message_id,512),
    'senderAccountId',left(lm.sender_account_id,512),'sentAt',${iso("lm.sent_at")},
    'bodyPreview',left(lm.body,320)) from relationship_messages lm
    where lm.workspace_id=$1 and lm.conversation_id=c.conversation_id and lm.seq=c.last_message_seq)
) order by s.last_message_at desc, s.conversation_id asc),'[]'::jsonb) as items,
exists(select 1 from candidates offset $3 limit 1) as has_more
from selected s join relationship_conversations c on c.workspace_id=$1 and c.conversation_id=s.conversation_id`;

function messagesSql(direction: "older" | "newer"): string {
  const comparison = direction === "older" ? "<" : ">";
  const order = direction === "older" ? "desc" : "asc";
  return `with selected as (
    select c.* from relationship_conversations c
    join relationship_conversation_members me on me.workspace_id=c.workspace_id and me.conversation_id=c.conversation_id
      and me.account_id=$2 and me.state='active'
    where c.workspace_id=$1 and c.conversation_id=$3 and c.status='active'
  ), anchor as (
    select a.seq from relationship_messages a where $5::text is not null and a.workspace_id=$1 and a.conversation_id=$3 and a.message_id=$5
  ), candidates as (
    select m.* from relationship_messages m
    where m.workspace_id=$1 and m.conversation_id=$3 and exists(select 1 from selected)
      and ($5::text is null or m.seq ${comparison} (select seq from anchor))
    order by m.seq ${order} limit $4+1
  ), measured as (
    select *, row_number() over w as position,
      sum(octet_length(body) + 4096) over w as window_bytes
    from candidates window w as (order by seq ${order})
  ), window_messages as (
    select * from measured where position<=$4 and (position=1 or window_bytes<=96000)
  ) select (select ${IDENTITY} from selected c) as conversation,
    ($5::text is null or exists(select 1 from anchor)) as anchor_found,
    coalesce((select jsonb_agg(jsonb_build_object(
      'messageId',left(message_id,512),'conversationId',left(conversation_id,512),
      'senderAccountId',left(sender_account_id,512),'senderDisplayName',left(sender_display_name,512),
      'body',left(body,10000),'sentAt',${iso("sent_at")},'deliveryState','delivered'
    ) order by seq asc) from window_messages),'[]'::jsonb) as items,
    (select count(*) from candidates) > (select count(*) from window_messages) as has_more,
    exists(select 1 from window_messages where char_length(body)>10000
      or char_length(message_id)>512 or char_length(conversation_id)>512
      or char_length(sender_account_id)>512 or char_length(sender_display_name)>512) as invalid_message`;
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
      // The cursor still carries (sentAt, messageId) of the boundary message, so
      // cursors issued before sprint 0109 stay valid; the page anchors on that
      // message's sequence number.
      const result = await input.client.query<{ conversation: unknown; anchor_found: boolean; items: unknown[]; has_more: boolean; invalid_message: boolean }>(messagesSql(direction),
        [input.workspaceId,input.actorId,conversationId,limit,cursor?.id ?? null]);
      const row = result.rows[0];
      if (!row?.conversation) throw new Error("RELATIONSHIP_NOT_FOUND");
      if (!row.anchor_found) throw new Error("RELATIONSHIP_CURSOR_INVALID");
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
