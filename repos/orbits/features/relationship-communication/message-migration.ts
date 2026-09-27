import { acquireSyncCommitOrderLock } from "../sync/commit-order-lock";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { createHash } from "node:crypto";
import { RELATIONSHIP_COMMUNICATION_COLLECTIONS } from "./service";

/**
 * Sprint 0109: one-time, repeatable move of relationship messaging from the
 * universal orbit_records collections (bindings, conversations, messages,
 * reads) into the three message tables. The legacy rows are only read, never
 * changed or deleted.
 *
 * Per legacy conversation, in one transaction holding the sync commit-order lock:
 *   - not yet in the tables: create the conversation (binding merged in), both
 *     member rows (read marker -> read_seq, unread recomputed exactly as the
 *     legacy readers counted it) and every message with seq 1..n in the legacy
 *     order (sentAt, messageId);
 *   - already in the tables: append legacy messages the tables do not have
 *     (written by old code after an earlier run) with the next seq numbers and
 *     one unread each for the other member, and carry over a legacy revocation.
 * A second run therefore changes nothing. Rows that cannot be migrated are
 * reported (skipped) instead of guessed.
 */

type Payload = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");

function digest(...values: string[]): string {
  return createHash("sha256").update(values.join("\u0000")).digest("hex");
}
const readRecordId = (conversationId: string, accountId: string) => `relationship-read:${digest(conversationId, accountId)}`;

export interface RelationshipMessageMigrationItem {
  conversationId: string;
  action: "create" | "append" | "unchanged" | "skip";
  messages: number;
  appended: number;
  revoke: boolean;
  status?: "active" | "revoked";
  reason?: string;
  skippedMessages?: { messageId: string; reason: string }[];
}

export interface RelationshipMessageMigrationResult {
  mode: "dry-run" | "apply";
  workspaceId: string;
  legacy: { conversations: number; bindings: number; messages: number; reads: number };
  create: number;
  append: number;
  appendedMessages: number;
  revoke: number;
  unchanged: number;
  skipped: number;
  items: RelationshipMessageMigrationItem[];
}

interface LegacyMessage { messageId: string; senderAccountId: string; senderDisplayName: string; body: string; sentAt: string; qualificationVersion: string; requestId: string }

interface Plan {
  item: RelationshipMessageMigrationItem;
  create?: {
    inviterAccountId: string; inviteeAccountId: string; inviterContactId: string; status: "active" | "revoked";
    qualificationVersion: string; revokedAt: string | null; revokedBy: string | null; createdAt: string; lastMessageAt: string;
    names: Record<string, string>; readMessageIds: Record<string, string | undefined>;
  };
  messages: LegacyMessage[];
  revoke?: { qualificationVersion: string; revokedAt: string; revokedBy: string | null };
}

async function legacyRows(executor: TransactionalSqlExecutor, workspaceId: string, collectionName: string, where = "", values: unknown[] = []) {
  const result = await executor.query<{ record_id: string; user_id: string | null; target_id: string | null; payload: Payload }>(
    `select record_id, user_id, target_id, payload from orbit_records
      where workspace_id = $1 and collection_name = $2 and lifecycle_state <> 'deleted' ${where}
      order by record_id`,
    [workspaceId, collectionName, ...values],
  );
  return result.rows;
}

async function countLegacy(executor: TransactionalSqlExecutor, workspaceId: string) {
  const result = await executor.query<{ collection_name: string; n: string }>(
    `select collection_name, count(*)::text as n from orbit_records
      where workspace_id = $1 and collection_name = any($2::text[]) and lifecycle_state <> 'deleted' group by collection_name`,
    [workspaceId, [RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations, RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings, RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages, RELATIONSHIP_COMMUNICATION_COLLECTIONS.reads]],
  );
  const n = (name: string) => Number(result.rows.find((row) => row.collection_name === name)?.n ?? 0);
  return {
    conversations: n(RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations),
    bindings: n(RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings),
    messages: n(RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages),
    reads: n(RELATIONSHIP_COMMUNICATION_COLLECTIONS.reads),
  };
}

async function planConversation(executor: TransactionalSqlExecutor, workspaceId: string, row: { record_id: string; payload: Payload }): Promise<Plan> {
  const c = row.payload;
  const conversationId = row.record_id;
  const skip = (reason: string): Plan => ({ item: { conversationId, action: "skip", messages: 0, appended: 0, revoke: false, reason }, messages: [] });
  if (c.kind !== "relationship_conversation" || c.conversationId !== conversationId) return skip("not a relationship conversation payload");
  const participants = Array.isArray(c.participantAccountIds) ? c.participantAccountIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  if (participants.length !== 2 || participants[0] === participants[1]) return skip("participants are not two distinct accounts");
  const [binding] = await legacyRows(executor, workspaceId, RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings, "and record_id = $3", [text(c.bindingId)]);
  const b = binding?.payload;
  if (!b || b.kind !== "relationship_binding") return skip("binding missing");
  const inviter = text(b.inviterAccountId), invitee = text(b.remoteAccountId), contactId = text(b.contactId);
  if (!inviter || !invitee || inviter === invitee || !participants.includes(inviter) || !participants.includes(invitee)
    || b.conversationId !== conversationId || contactId !== text(c.contactId)) return skip("binding does not match the conversation");

  const active = b.status === "confirmed" && c.status === "active" && b.qualificationVersion === c.qualificationVersion;
  const status: "active" | "revoked" = active ? "active" : "revoked";
  const skippedMessages: { messageId: string; reason: string }[] = [];
  const messages = (await legacyRows(executor, workspaceId, RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages, "and target_id = $3", [conversationId]))
    .flatMap(({ record_id, payload: m }) => {
      if (m.kind !== "relationship_message" || m.conversationId !== conversationId) return [];
      const body = text(m.body), sentAt = text(m.sentAt), sender = text(m.senderAccountId);
      if (m.messageId !== record_id) { skippedMessages.push({ messageId: record_id, reason: "messageId differs from record id" }); return []; }
      if (!participants.includes(sender)) { skippedMessages.push({ messageId: record_id, reason: "sender is not a participant" }); return []; }
      if (!body || body.length > 10_000) { skippedMessages.push({ messageId: record_id, reason: "body empty or over 10000 characters" }); return []; }
      if (!Number.isFinite(Date.parse(sentAt))) { skippedMessages.push({ messageId: record_id, reason: "sentAt is not a timestamp" }); return []; }
      return [{ messageId: record_id, senderAccountId: sender, senderDisplayName: text(m.senderDisplayName) || sender, body, sentAt,
        qualificationVersion: text(m.qualificationVersion), requestId: text(m.requestId) || record_id }];
    })
    // The legacy readers ordered by (sentAt, messageId), byte-wise.
    .sort((l, r) => (l.sentAt < r.sentAt ? -1 : l.sentAt > r.sentAt ? 1 : l.messageId < r.messageId ? -1 : l.messageId > r.messageId ? 1 : 0));

  const existing = await executor.query<{ status: string; last_message_seq: string }>(
    "select status, last_message_seq::text from relationship_conversations where workspace_id = $1 and conversation_id = $2",
    [workspaceId, conversationId],
  );
  const revokedAt = text(b.revokedAt) || text(b.updatedAt) || text(c.updatedAt);
  const revokedBy = status === "revoked" ? binding!.user_id : null;
  const base = { conversationId, messages: messages.length, skippedMessages: skippedMessages.length ? skippedMessages : undefined, status };
  if (!existing.rows[0]) {
    const names = typeof c.participantDisplayNames === "object" && c.participantDisplayNames ? c.participantDisplayNames as Record<string, unknown> : {};
    const readMessageIds: Record<string, string | undefined> = {};
    for (const account of [inviter, invitee]) {
      const [read] = await legacyRows(executor, workspaceId, RELATIONSHIP_COMMUNICATION_COLLECTIONS.reads, "and record_id = $3", [readRecordId(conversationId, account)]);
      readMessageIds[account] = read?.payload.kind === "relationship_read" ? text(read.payload.lastReadMessageId) || undefined : undefined;
    }
    const newest = messages.at(-1)?.sentAt;
    const createdAt = text(c.createdAt) || text(b.createdAt);
    const lastMessageAt = active ? text(c.updatedAt) || newest || createdAt : [createdAt, newest ?? createdAt].sort().at(-1)!;
    return {
      item: { ...base, action: "create", appended: messages.length, revoke: false },
      create: {
        inviterAccountId: inviter, inviteeAccountId: invitee, inviterContactId: contactId, status,
        qualificationVersion: text(b.qualificationVersion), revokedAt: active ? null : revokedAt, revokedBy,
        createdAt, lastMessageAt,
        names: { [inviter]: text(names[inviter]) || text(b.inviterDisplayName) || inviter, [invitee]: text(names[invitee]) || text(b.remoteDisplayName) || invitee },
        readMessageIds,
      },
      messages,
    };
  }
  const present = await executor.query<{ message_id: string }>(
    "select message_id from relationship_messages where workspace_id = $1 and message_id = any($2::text[])",
    [workspaceId, messages.map((m) => m.messageId)],
  );
  const known = new Set(present.rows.map((r) => r.message_id));
  const missing = messages.filter((m) => !known.has(m.messageId));
  const revoke = !active && existing.rows[0].status === "active" ? { qualificationVersion: text(b.qualificationVersion), revokedAt, revokedBy } : undefined;
  const action = missing.length || revoke ? "append" : "unchanged";
  return { item: { ...base, action, appended: missing.length, revoke: Boolean(revoke) }, messages: missing, revoke };
}

async function applyPlan(tx: TransactionalSqlExecutor, workspaceId: string, plan: Plan): Promise<void> {
  const id = plan.item.conversationId;
  if (plan.create) {
    const p = plan.create;
    const seqOf = new Map(plan.messages.map((m, index) => [m.messageId, index + 1]));
    await tx.query(
      `insert into relationship_conversations (workspace_id, conversation_id, inviter_account_id, invitee_account_id, inviter_contact_id,
         status, qualification_version, revoked_at, revoked_by_account_id, last_message_seq, last_message_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11::timestamptz, $12::timestamptz, $11::timestamptz)`,
      [workspaceId, id, p.inviterAccountId, p.inviteeAccountId, p.inviterContactId, p.status, p.qualificationVersion, p.revokedAt, p.revokedBy,
        plan.messages.length, p.lastMessageAt, p.createdAt],
    );
    for (const [index, m] of plan.messages.entries()) {
      await tx.query(
        `insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10)`,
        [workspaceId, id, index + 1, m.messageId, m.senderAccountId, m.senderDisplayName, m.body, m.sentAt, m.qualificationVersion, m.requestId],
      );
    }
    for (const account of [p.inviterAccountId, p.inviteeAccountId]) {
      // A marker that is not in this conversation counts as no marker, as the legacy readers did.
      const readSeq = seqOf.get(p.readMessageIds[account] ?? "") ?? 0;
      const unread = plan.messages.filter((m, index) => index + 1 > readSeq && m.senderAccountId !== account).length;
      await tx.query(
        `insert into relationship_conversation_members (workspace_id, conversation_id, account_id, display_name, read_seq, unread_count, last_message_at, state, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $7::timestamptz)`,
        [workspaceId, id, account, p.names[account], readSeq, unread, p.lastMessageAt, p.status === "active" ? "active" : "left"],
      );
    }
    return;
  }
  if (plan.messages.length) {
    const locked = await tx.query<{ last_message_seq: string }>(
      "select last_message_seq::text from relationship_conversations where workspace_id = $1 and conversation_id = $2 for update",
      [workspaceId, id],
    );
    let seq = Number(locked.rows[0]?.last_message_seq ?? 0);
    for (const m of plan.messages) {
      seq += 1;
      await tx.query(
        `insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10) on conflict (workspace_id, message_id) do nothing`,
        [workspaceId, id, seq, m.messageId, m.senderAccountId, m.senderDisplayName, m.body, m.sentAt, m.qualificationVersion, m.requestId],
      );
      await tx.query(
        `update relationship_conversation_members set unread_count = unread_count + 1, last_message_at = greatest(last_message_at, $4::timestamptz), updated_at = now()
         where workspace_id = $1 and conversation_id = $2 and account_id <> $3`,
        [workspaceId, id, m.senderAccountId, m.sentAt],
      );
    }
    await tx.query(
      `update relationship_conversations set last_message_seq = $3,
         last_message_at = greatest(last_message_at, (select max(sent_at) from relationship_messages where workspace_id = $1 and conversation_id = $2)), updated_at = now()
       where workspace_id = $1 and conversation_id = $2`,
      [workspaceId, id, seq],
    );
    await tx.query(
      `update relationship_conversation_members me set last_message_at = c.last_message_at
       from relationship_conversations c where c.workspace_id = me.workspace_id and c.conversation_id = me.conversation_id
         and me.workspace_id = $1 and me.conversation_id = $2`,
      [workspaceId, id],
    );
  }
  if (plan.revoke) {
    await tx.query(
      `update relationship_conversations set status = 'revoked', qualification_version = $3, revoked_at = $4::timestamptz, revoked_by_account_id = $5, updated_at = now()
       where workspace_id = $1 and conversation_id = $2 and status = 'active'`,
      [workspaceId, id, plan.revoke.qualificationVersion, plan.revoke.revokedAt, plan.revoke.revokedBy],
    );
    await tx.query("update relationship_conversation_members set state = 'left', updated_at = now() where workspace_id = $1 and conversation_id = $2", [workspaceId, id]);
  }
}

export function createRelationshipMessageMigration(input: { client: TransactionalPostgresClient; workspaceId: string }) {
  const { client, workspaceId } = input;
  async function run(apply: boolean): Promise<RelationshipMessageMigrationResult> {
    const legacy = await countLegacy(client, workspaceId);
    const conversations = await legacyRows(client, workspaceId, RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations);
    const items: RelationshipMessageMigrationItem[] = [];
    for (const row of conversations) {
      if (!apply) {
        items.push((await planConversation(client, workspaceId, row)).item);
        continue;
      }
      items.push(await client.transaction(async (tx) => {
        await acquireSyncCommitOrderLock(tx);
        // Planned inside the lock, so a concurrent send cannot interleave.
        const plan = await planConversation(tx, workspaceId, row);
        if (plan.item.action === "create" || plan.item.action === "append") await applyPlan(tx, workspaceId, plan);
        return plan.item;
      }, { isolation: "read committed" }));
    }
    const count = (action: RelationshipMessageMigrationItem["action"]) => items.filter((item) => item.action === action).length;
    return {
      mode: apply ? "apply" : "dry-run", workspaceId, legacy,
      create: count("create"), append: items.filter((item) => item.action === "append" && item.appended > 0).length,
      appendedMessages: items.reduce((sum, item) => sum + (item.action === "append" ? item.appended : 0), 0),
      revoke: items.filter((item) => item.revoke).length, unchanged: count("unchanged"), skipped: count("skip"), items,
    };
  }
  return { plan: () => run(false), apply: () => run(true) };
}
