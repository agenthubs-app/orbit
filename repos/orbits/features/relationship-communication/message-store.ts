import { acquireSyncCommitOrderLock } from "../sync/commit-order-lock";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

/**
 * Sprint 0109: writes and point reads for the three relationship message tables
 * (features/relationship-communication/message-tables.ts).
 *
 * Every write runs in one read-committed transaction that first takes the sync
 * commit-order lock (the tables' strict trigger requires it) and then locks the
 * conversation row. Read committed matters: each statement after the lock sees
 * rows committed while this transaction waited, so two senders queue on the
 * lock and the second one reads the first one's sequence number.
 */

/** ISO-8601 UTC with milliseconds, the exact format the API has always returned. */
export const isoSql = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export type RelationshipMessageStoreErrorCode =
  | "NOT_AVAILABLE"
  | "REVOKED"
  | "STALE"
  | "REQUEST_REUSED"
  | "READ_TARGET_MISSING"
  | "READ_TARGET_REQUIRED"
  | "BINDING_CONFLICT";

export class RelationshipMessageStoreError extends Error {
  constructor(readonly code: RelationshipMessageStoreErrorCode, message: string) {
    super(message);
  }
}

export interface RelationshipMemberRow {
  accountId: string;
  displayName: string;
  readSeq: number;
  unreadCount: number;
  state: "active" | "left";
}

export interface RelationshipConversationRow {
  conversationId: string;
  inviterAccountId: string;
  inviteeAccountId: string;
  inviterContactId: string;
  status: "active" | "revoked";
  qualificationVersion: string;
  revokedAt: string | null;
  lastMessageSeq: number;
  lastMessageAt: string;
  createdAt: string;
  members: RelationshipMemberRow[];
}

export interface RelationshipMessageRow {
  conversationId: string;
  seq: number;
  messageId: string;
  senderAccountId: string;
  senderDisplayName: string;
  body: string;
  sentAt: string;
  qualificationVersion: string;
  requestId: string;
}

const CONVERSATION_COLUMNS = `c.conversation_id as "conversationId", c.inviter_account_id as "inviterAccountId",
  c.invitee_account_id as "inviteeAccountId", c.inviter_contact_id as "inviterContactId", c.status,
  c.qualification_version as "qualificationVersion", ${isoSql("c.revoked_at")} as "revokedAt",
  c.last_message_seq::text as "lastMessageSeq", ${isoSql("c.last_message_at")} as "lastMessageAt",
  ${isoSql("c.created_at")} as "createdAt",
  (select jsonb_agg(jsonb_build_object('accountId', m.account_id, 'displayName', m.display_name,
      'readSeq', m.read_seq, 'unreadCount', m.unread_count, 'state', m.state) order by m.account_id)
    from relationship_conversation_members m
    where m.workspace_id = c.workspace_id and m.conversation_id = c.conversation_id) as members`;

const MESSAGE_COLUMNS = `conversation_id as "conversationId", seq::text as seq, message_id as "messageId",
  sender_account_id as "senderAccountId", sender_display_name as "senderDisplayName", body,
  ${isoSql("sent_at")} as "sentAt", qualification_version as "qualificationVersion", request_id as "requestId"`;

type RawConversation = Omit<RelationshipConversationRow, "lastMessageSeq" | "members"> & {
  lastMessageSeq: string;
  members: { accountId: string; displayName: string; readSeq: number | string; unreadCount: number; state: "active" | "left" }[] | null;
};
type RawMessage = Omit<RelationshipMessageRow, "seq"> & { seq: string };

function conversationFromRow(row: RawConversation | undefined): RelationshipConversationRow | null {
  if (!row) return null;
  return {
    ...row,
    lastMessageSeq: Number(row.lastMessageSeq),
    members: (row.members ?? []).map((member) => ({ ...member, readSeq: Number(member.readSeq) })),
  };
}

function messageFromRow(row: RawMessage): RelationshipMessageRow {
  return { ...row, seq: Number(row.seq) };
}

export interface CreateRelationshipConversationInput {
  conversationId: string;
  inviterAccountId: string;
  inviterDisplayName: string;
  inviteeAccountId: string;
  inviteeDisplayName: string;
  inviterContactId: string;
  qualificationVersion: string;
  createdAt: string;
}

export interface SendRelationshipStoredMessageInput {
  conversationId: string;
  senderAccountId: string;
  senderDisplayName: string;
  messageId: string;
  requestId: string;
  body: string;
  qualificationVersion: string;
  now: () => string;
}

async function conversationBy(executor: TransactionalSqlExecutor, workspaceId: string, where: string, values: unknown[], lock = false) {
  const result = await executor.query<RawConversation>(
    `select ${CONVERSATION_COLUMNS} from relationship_conversations c where c.workspace_id = $1 and ${where}${lock ? " for update of c" : ""}`,
    [workspaceId, ...values],
  );
  return conversationFromRow(result.rows[0]);
}

async function messageById(executor: TransactionalSqlExecutor, workspaceId: string, messageId: string) {
  const result = await executor.query<RawMessage>(
    `select ${MESSAGE_COLUMNS} from relationship_messages where workspace_id = $1 and message_id = $2`,
    [workspaceId, messageId],
  );
  return result.rows[0] ? messageFromRow(result.rows[0]) : null;
}

/** Point and index-range reads; any SQL executor (pool, transaction). */
export function createRelationshipMessageReader(input: { client: TransactionalSqlExecutor; workspaceId: string }) {
  const { client, workspaceId } = input;
  return {
    workspaceId,

    conversation(conversationId: string) {
      return conversationBy(client, workspaceId, "c.conversation_id = $2", [conversationId]);
    },

    conversationForInviterContact(inviterAccountId: string, contactId: string) {
      return conversationBy(client, workspaceId, "c.inviter_account_id = $2 and c.inviter_contact_id = $3", [inviterAccountId, contactId]);
    },

    message(messageId: string) {
      return messageById(client, workspaceId, messageId);
    },

    async messageIdAtSeq(conversationId: string, seq: number): Promise<string | null> {
      const result = await client.query<{ message_id: string }>(
        "select message_id from relationship_messages where workspace_id = $1 and conversation_id = $2 and seq = $3",
        [workspaceId, conversationId, seq],
      );
      return result.rows[0]?.message_id ?? null;
    },

    /** The newest `limit` messages, oldest first. */
    async recentMessages(conversationId: string, limit: number): Promise<RelationshipMessageRow[]> {
      const result = await client.query<RawMessage>(
        `select * from (select ${MESSAGE_COLUMNS} from relationship_messages
          where workspace_id = $1 and conversation_id = $2 order by seq desc limit $3) recent order by seq::bigint asc`,
        [workspaceId, conversationId, limit],
      );
      return result.rows.map(messageFromRow);
    },

    /** The caller's active conversations, newest first, through the member inbox index. */
    async memberConversationIds(accountId: string, limit: number, after: { at: string; id: string } | null): Promise<string[]> {
      const result = await client.query<{ conversation_id: string }>(
        `select m.conversation_id from relationship_conversation_members m
          join relationship_conversations c on c.workspace_id = m.workspace_id and c.conversation_id = m.conversation_id and c.status = 'active'
          where m.workspace_id = $1 and m.account_id = $2 and m.state = 'active'
            and ($3::timestamptz is null or m.last_message_at < $3::timestamptz
              or (m.last_message_at = $3::timestamptz and m.conversation_id > $4::text))
          order by m.last_message_at desc, m.conversation_id asc limit $5`,
        [workspaceId, accountId, after?.at ?? null, after?.id ?? null, limit],
      );
      return result.rows.map((row) => row.conversation_id);
    },

    async unreadTotal(accountId: string): Promise<number> {
      const result = await client.query<{ total: string }>(
        `select coalesce(sum(m.unread_count), 0)::text as total from relationship_conversation_members m
          join relationship_conversations c on c.workspace_id = m.workspace_id and c.conversation_id = m.conversation_id and c.status = 'active'
          where m.workspace_id = $1 and m.account_id = $2 and m.state = 'active'`,
        [workspaceId, accountId],
      );
      return Number(result.rows[0]?.total ?? 0);
    },

  };
}

export type RelationshipMessageReader = ReturnType<typeof createRelationshipMessageReader>;

/** Reads plus the transactional writes (accept, send, read, revoke). */
export function createRelationshipMessageStore(input: { client: TransactionalPostgresClient; workspaceId: string }) {
  const { client, workspaceId } = input;

  async function write<T>(operation: (tx: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
    return client.transaction(async (tx) => {
      await acquireSyncCommitOrderLock(tx);
      return operation(tx);
    }, { isolation: "read committed" });
  }

  return {
    ...createRelationshipMessageReader(input),

    /**
     * Accepting an invitation creates the conversation and both member rows.
     * Replaying the same acceptance returns the existing conversation; a
     * different invitee for the same (inviter, contact) is a conflict.
     */
    createConversation(value: CreateRelationshipConversationInput): Promise<RelationshipConversationRow> {
      return write(async (tx) => {
        const existing = await conversationBy(tx, workspaceId, "c.inviter_account_id = $2 and c.inviter_contact_id = $3", [value.inviterAccountId, value.inviterContactId], true);
        if (existing) {
          if (existing.conversationId !== value.conversationId || existing.inviteeAccountId !== value.inviteeAccountId || existing.status !== "active") {
            throw new RelationshipMessageStoreError("BINDING_CONFLICT", "This contact identity has a conflicting binding.");
          }
          return existing;
        }
        await tx.query(
          `insert into relationship_conversations (workspace_id, conversation_id, inviter_account_id, invitee_account_id, inviter_contact_id,
             status, qualification_version, last_message_at, created_at, updated_at)
           values ($1, $2, $3, $4, $5, 'active', $6, $7, $7, $7)`,
          [workspaceId, value.conversationId, value.inviterAccountId, value.inviteeAccountId, value.inviterContactId, value.qualificationVersion, value.createdAt],
        );
        await tx.query(
          `insert into relationship_conversation_members (workspace_id, conversation_id, account_id, display_name, last_message_at, updated_at)
           values ($1, $2, $3, $4, $7, $7), ($1, $2, $5, $6, $7, $7)`,
          [workspaceId, value.conversationId, value.inviterAccountId, value.inviterDisplayName, value.inviteeAccountId, value.inviteeDisplayName, value.createdAt],
        );
        return (await conversationBy(tx, workspaceId, "c.conversation_id = $2", [value.conversationId]))!;
      });
    },

    /**
     * One transaction: lock the conversation row; a replayed request id returns
     * the stored message before any eligibility check (Sprint 0135: a lost
     * receipt followed by a revocation is still "delivered"); otherwise check it
     * is active and the qualification version matches, take the next sequence
     * number, insert the message and update both member rows (sender has read
     * it, the other side gains one unread).
     */
    send(value: SendRelationshipStoredMessageInput): Promise<{ message: RelationshipMessageRow; created: boolean }> {
      return write(async (tx) => {
        const conversation = await conversationBy(tx, workspaceId, "c.conversation_id = $2", [value.conversationId], true);
        if (!conversation || !conversation.members.some((member) => member.accountId === value.senderAccountId)) {
          throw new RelationshipMessageStoreError("NOT_AVAILABLE", "This conversation is not available to the signed-in account.");
        }
        const existing = await messageById(tx, workspaceId, value.messageId);
        if (existing) {
          // The qualification version is not part of the fingerprint: an offline
          // replay may carry the version the device saw when it wrote the message.
          if (existing.conversationId !== value.conversationId || existing.body !== value.body
            || existing.senderAccountId !== value.senderAccountId) {
            throw new RelationshipMessageStoreError("REQUEST_REUSED", "This request id was already used for a different message.");
          }
          return { message: existing, created: false };
        }
        const sender = conversation.members.find((member) => member.accountId === value.senderAccountId)!;
        if (conversation.status !== "active" || sender.state !== "active") {
          throw new RelationshipMessageStoreError("REVOKED", "Message eligibility has been revoked.");
        }
        if (conversation.qualificationVersion !== value.qualificationVersion) {
          throw new RelationshipMessageStoreError("STALE", "Message eligibility is stale; refresh before retrying.");
        }
        const sentAt = value.now();
        const inserted = await tx.query<RawMessage>(
          `with bumped as (
             update relationship_conversations set last_message_seq = last_message_seq + 1, last_message_at = $3::timestamptz, updated_at = $3::timestamptz
             where workspace_id = $1 and conversation_id = $2 returning last_message_seq
           )
           insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name,
             body, sent_at, qualification_version, request_id)
           select $1, $2, bumped.last_message_seq, $4, $5, $6, $7, $3::timestamptz, $8, $9 from bumped
           returning ${MESSAGE_COLUMNS}`,
          [workspaceId, value.conversationId, sentAt, value.messageId, value.senderAccountId, value.senderDisplayName, value.body, value.qualificationVersion, value.requestId],
        );
        const message = inserted.rows[0] ? messageFromRow(inserted.rows[0]) : null;
        if (!message) throw new Error("The message could not be confirmed as delivered.");
        await tx.query(
          `update relationship_conversation_members set
             read_seq = case when account_id = $3 then $4 else read_seq end,
             unread_count = case when account_id = $3 then 0 else unread_count + 1 end,
             last_message_at = $5::timestamptz, updated_at = $5::timestamptz
           where workspace_id = $1 and conversation_id = $2`,
          [workspaceId, value.conversationId, value.senderAccountId, message.seq, sentAt],
        );
        return { message, created: true };
      });
    },

    /**
     * The reader's member row points at the given message; unread becomes the
     * number of the other side's messages after it (zero when it is the newest).
     */
    markRead(value: { conversationId: string; accountId: string; messageId: string; now: string }): Promise<void> {
      return write(async (tx) => {
        const conversation = await conversationBy(tx, workspaceId, "c.conversation_id = $2", [value.conversationId], true);
        const member = conversation?.members.find((item) => item.accountId === value.accountId);
        if (!conversation || conversation.status !== "active" || member?.state !== "active") {
          throw new RelationshipMessageStoreError("NOT_AVAILABLE", "This conversation is not available to the signed-in account.");
        }
        const messageId = typeof value.messageId === "string" ? value.messageId.trim() : "";
        if (!messageId || messageId.length > 512) {
          throw new RelationshipMessageStoreError("READ_TARGET_REQUIRED", "Last read message is required.");
        }
        // Only the target's position, never its body.
        const target = (await tx.query<{ conversationId: string; seq: string }>(
          `select conversation_id as "conversationId", seq::text as seq from relationship_messages where workspace_id = $1 and message_id = $2`,
          [workspaceId, messageId],
        )).rows[0];
        if (!target || target.conversationId !== value.conversationId) {
          throw new RelationshipMessageStoreError("READ_TARGET_MISSING", "The last read message is not available in this conversation.");
        }
        await tx.query(
          `update relationship_conversation_members set read_seq = $4,
             unread_count = (select count(*) from relationship_messages
               where workspace_id = $1 and conversation_id = $2 and seq > $4 and sender_account_id <> $3),
             updated_at = $5::timestamptz
           where workspace_id = $1 and conversation_id = $2 and account_id = $3`,
          [workspaceId, value.conversationId, value.accountId, Number(target.seq), value.now],
        );
      });
    },

    /** Status and qualification change once; both members leave; every row is kept. */
    revoke(value: { conversationId: string; qualificationVersion: string; revokedAt: string; revokedByAccountId: string }): Promise<void> {
      return write(async (tx) => {
        const conversation = await conversationBy(tx, workspaceId, "c.conversation_id = $2", [value.conversationId], true);
        if (!conversation || conversation.status === "revoked") return;
        await tx.query(
          `update relationship_conversations set status = 'revoked', qualification_version = $3, revoked_at = $4::timestamptz,
             revoked_by_account_id = $5, updated_at = $4::timestamptz
           where workspace_id = $1 and conversation_id = $2`,
          [workspaceId, value.conversationId, value.qualificationVersion, value.revokedAt, value.revokedByAccountId],
        );
        await tx.query(
          `update relationship_conversation_members set state = 'left', updated_at = $3::timestamptz
           where workspace_id = $1 and conversation_id = $2`,
          [workspaceId, value.conversationId, value.revokedAt],
        );
      });
    },
  };
}

export type RelationshipMessageStore = ReturnType<typeof createRelationshipMessageStore>;
