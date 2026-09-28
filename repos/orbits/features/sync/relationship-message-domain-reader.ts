import type { DomainChange } from "../../shared/contract/universal-read";
import { relationshipMessageRowId } from "../../shared/compute/relationship-local";
import { RELATIONSHIP_CONVERSATION_IDENTITY_SQL, RELATIONSHIP_CONVERSATION_LAST_MESSAGE_SQL } from "../relationship-communication/bounded-reader";
import type { RelationshipMessagesSyncSource } from "./domain-registry";
import { SyncReadError } from "./read-service";

/**
 * Sprint 0119 (offline 3b = message plan M3): the readers behind the sync
 * domains "relationship-conversations" and "relationship-messages", from the
 * three dedicated message tables (0109, features/relationship-communication/
 * message-tables.ts). Every statement starts from the account's own member
 * rows (account_id = actor); only the conversations those rows name are read
 * (the other participant's display name comes from their member row, as in
 * the server's summary page), never another conversation or its messages.
 *
 * Revisions: all three tables draw sync_revision from the orbit_records
 * sequence under the commit-order lock, so a bookmark is reliable across them.
 *   - a conversation row's revision is greatest(member, conversation): a send
 *     updates the conversation and both member rows, a read updates the
 *     reader's member row, a revocation updates the conversation and marks
 *     both member rows 'left'. A left member row, or a revoked conversation,
 *     is sent as a delete (never on a first pull); the device removes the
 *     conversation's messages with it.
 *   - a message row's revision is its own (messages are inserted once and
 *     never change); only conversations the account is an active member of
 *     are read, so nothing of a revoked conversation is sent again. A member
 *     row never returns from 'left' (database guard), so a device that dropped
 *     a history is never expected to hold it again.
 */
interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

type PageRead = { changes: DomainChange[]; hasMore: boolean; lastRevision: string | null };
type PageInput = { workspaceId: string; actorId: string; afterRevision: string; highWatermark: string; limit: number };

/** A message page stops before this many bytes of rows (the page itself is capped by SYNC_MAX_PAGE_BYTES). */
export const RELATIONSHIP_MESSAGE_PAGE_BYTES = 768 * 1024;
// Per-row allowance on top of the body: ids, names, time and JSON framing.
const MESSAGE_ROW_OVERHEAD_BYTES = 1024;

const ACTIVE_MEMBERSHIPS = `
  select me.conversation_id from relationship_conversation_members me
  join relationship_conversations c on c.workspace_id = me.workspace_id and c.conversation_id = me.conversation_id and c.status = 'active'
  where me.workspace_id = $1 and me.account_id = $2 and me.state = 'active'`;

const SUMMARY_SQL = `
  /* sync:relationship:summary */
  select
    (select coalesce(max(greatest(me.sync_revision, c.sync_revision)), 0)::text
      from relationship_conversation_members me
      join relationship_conversations c on c.workspace_id = me.workspace_id and c.conversation_id = me.conversation_id
      where me.workspace_id = $1 and me.account_id = $2) as conversations,
    (select coalesce(max((select max(m.sync_revision) from relationship_messages m
        where m.workspace_id = $1 and m.conversation_id = mine.conversation_id)), 0)::text
      from (${ACTIVE_MEMBERSHIPS}) mine) as messages
`;

const CONVERSATIONS_PAGE_SQL = `
  /* sync:relationship:conversations-page */
  select me.conversation_id, me.account_id, me.state, c.status,
    greatest(me.sync_revision, c.sync_revision)::text as sync_revision,
    case when me.state = 'active' and c.status = 'active' then ${RELATIONSHIP_CONVERSATION_IDENTITY_SQL} || jsonb_build_object(
      'unreadCount', me.unread_count, 'readSeq', me.read_seq, 'lastMessageSeq', c.last_message_seq,
      'lastMessage', ${RELATIONSHIP_CONVERSATION_LAST_MESSAGE_SQL}) end as payload
  from relationship_conversation_members me
  join relationship_conversations c on c.workspace_id = me.workspace_id and c.conversation_id = me.conversation_id
  where me.workspace_id = $1 and me.account_id = $2
    and greatest(me.sync_revision, c.sync_revision) > $3::bigint
    and greatest(me.sync_revision, c.sync_revision) <= $4::bigint
  order by greatest(me.sync_revision, c.sync_revision) asc
  limit $5
`;

// Oldest revision first, cut by bytes: position 1 always fits (a body is at
// most 10,000 characters), and the page keeps the rows whose running size
// stays under the budget.
const MESSAGES_PAGE_SQL = `
  /* sync:relationship:messages-page */
  with mine as (${ACTIVE_MEMBERSHIPS}
  ), candidates as (
    select m.conversation_id, m.seq, m.message_id, m.sender_account_id, m.sender_display_name, m.body, m.sent_at, m.sync_revision
    from mine join relationship_messages m on m.workspace_id = $1 and m.conversation_id = mine.conversation_id
    where m.sync_revision > $3::bigint and m.sync_revision <= $4::bigint
    order by m.sync_revision asc
    limit $5 + 1
  ), measured as (
    select *, row_number() over w as position,
      sum(octet_length(body) + octet_length(sender_display_name) + ${MESSAGE_ROW_OVERHEAD_BYTES}) over w as page_bytes,
      count(*) over () as candidate_count
    from candidates window w as (order by sync_revision asc)
  )
  select conversation_id, seq::text as seq, message_id, sender_account_id, sender_display_name, body,
    to_char(sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as sent_at,
    sync_revision::text as sync_revision, candidate_count::text as candidate_count
  from measured
  where position <= $5 and (position = 1 or page_bytes <= $6)
  -- The window position, not the text alias above: "101" sorts before "13".
  order by position asc
`;

export interface RelationshipDomainSummary {
  /** The high watermark of each view, from one statement. */
  watermarks: Record<RelationshipMessagesSyncSource["view"], string>;
}

const REVISION = /^(?:0|[1-9]\d*)$/;

/** Both views' watermarks in one statement (the manifest folds them into its conditional-read key). */
export async function readRelationshipDomainSummary(client: Queryable, input: { workspaceId: string; actorId: string }): Promise<RelationshipDomainSummary> {
  const row = (await client.query<{ conversations: string; messages: string }>(SUMMARY_SQL, [input.workspaceId, input.actorId])).rows[0];
  if (!row || !REVISION.test(row.conversations) || !REVISION.test(row.messages)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
  return { watermarks: { conversations: row.conversations, messages: row.messages } };
}

export function relationshipDomainSummaryKey(summary: RelationshipDomainSummary): string {
  return `${summary.watermarks.conversations}.${summary.watermarks.messages}`;
}

export async function readRelationshipDomainPage(client: Queryable, source: RelationshipMessagesSyncSource, input: PageInput): Promise<PageRead> {
  return source.view === "conversations" ? readConversationsPage(client, input) : readMessagesPage(client, input);
}

async function readConversationsPage(client: Queryable, input: PageInput): Promise<PageRead> {
  const result = await client.query<{ conversation_id: string; account_id: string; state: string; status: string; sync_revision: string; payload: Record<string, unknown> | string | null }>(
    CONVERSATIONS_PAGE_SQL, [input.workspaceId, input.actorId, input.afterRevision, input.highWatermark, input.limit + 1],
  );
  if (result.rows.some((row) => row.account_id !== input.actorId)) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
  const pageRows = result.rows.slice(0, input.limit);
  const firstPull = input.afterRevision === "0";
  const changes: DomainChange[] = [];
  for (const row of pageRows) {
    if (row.state !== "active" || row.status !== "active" || row.payload === null) {
      if (!firstPull) changes.push({ id: row.conversation_id, revision: row.sync_revision, operation: "delete", payload: null });
      continue;
    }
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) as Record<string, unknown> : row.payload;
    const participants = payload.participantAccountIds;
    if (payload.conversationId !== row.conversation_id || !Array.isArray(participants) || !participants.includes(input.actorId)) {
      throw new SyncReadError("SYNC_INVALID_RECORD", "A relationship conversation row is invalid.");
    }
    changes.push({ id: row.conversation_id, revision: row.sync_revision, operation: "upsert", payload: { ...payload, readSeq: Number(payload.readSeq), lastMessageSeq: Number(payload.lastMessageSeq) } });
  }
  return { changes, hasMore: result.rows.length > input.limit, lastRevision: pageRows.length ? pageRows.at(-1)!.sync_revision : null };
}

async function readMessagesPage(client: Queryable, input: PageInput): Promise<PageRead> {
  const result = await client.query<{
    conversation_id: string; seq: string; message_id: string; sender_account_id: string; sender_display_name: string; body: string; sent_at: string; sync_revision: string; candidate_count: string;
  }>(MESSAGES_PAGE_SQL, [input.workspaceId, input.actorId, input.afterRevision, input.highWatermark, input.limit, RELATIONSHIP_MESSAGE_PAGE_BYTES]);
  const rows = result.rows;
  const candidates = rows.length ? Number(rows[0]!.candidate_count) : 0;
  return {
    changes: rows.map((row) => ({
      id: relationshipMessageRowId(row.conversation_id, Number(row.seq)),
      revision: row.sync_revision,
      operation: "upsert" as const,
      payload: {
        conversationId: row.conversation_id, seq: Number(row.seq), messageId: row.message_id, senderAccountId: row.sender_account_id,
        senderDisplayName: row.sender_display_name, body: row.body, sentAt: row.sent_at,
      },
    })),
    hasMore: candidates > rows.length,
    lastRevision: rows.length ? rows.at(-1)!.sync_revision : null,
  };
}
