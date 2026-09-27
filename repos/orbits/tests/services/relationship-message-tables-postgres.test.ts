import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createInboxSummaryGetHandler } from "../../app/api/inbox/summary/handler";
import {
  createConversationDraftGetHandler,
  createConversationDraftPutHandler,
  createConversationGetHandler,
  createConversationMessagesPostHandler,
  createConversationReadPostHandler,
  createContactBindingDeleteHandler,
} from "../../app/api/relationship-communication/handler";
import { createRelationshipPageGetHandler } from "../../app/api/relationship-communication/read-handler";
import { createRelationshipUnreadSummaryGetHandler } from "../../app/api/relationship-communication/unread-summary/handler";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { createRelationshipMessageMigration } from "../../features/relationship-communication/message-migration";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import { PARITY_ACTORS, PARITY_CURSOR_SECRET, PARITY_WORKSPACE, resolveParityContact, runParityRequests } from "../support/relationship-parity-scenario";
import { connect, createRelationshipHarness, relationshipPostgresSkip as skip, type HarnessActor, type RelationshipHarness } from "../support/relationship-message-harness";

/**
 * Sprint 0109 (message plan M2) against real PostgreSQL: the three message
 * tables, their write transactions, the switched readers and the one-time
 * migration, exercised through the real route handlers wherever a route exists.
 */

const A: HarnessActor = { accountId: "account:tables-a", displayName: "Tables A", email: "tables-a@example.test" };
const B: HarnessActor = { accountId: "account:tables-b", displayName: "Tables B", email: "tables-b@example.test" };
const C: HarnessActor = { accountId: "account:tables-c", displayName: "Tables C", email: "tables-c@example.test" };
const SECRET = "relationship-tables-test-cursor-secret-xxxxxxxxxxxx";
const routeActor = (who: HarnessActor, workspaceId: string) => ({ id: who.accountId, accountId: who.accountId, name: who.displayName, email: who.email, workspaceId });

type Json = { success: boolean; data?: any; error?: { code: string; message: string } };

function routes(h: RelationshipHarness) {
  const deps = (who: HarnessActor, now?: () => string) => ({ resolveActor: async () => routeActor(who, h.workspaceId), createService: () => h.service(who, now ? { now } : {}) });
  const reader = (who: HarnessActor) => createRelationshipBoundedReader({ client: h.client, workspaceId: h.workspaceId, actorId: who.accountId, cursorSecret: SECRET });
  const call = async (response: Promise<Response>) => { const r = await response; return { status: r.status, body: await r.json() as Json }; };
  const url = (path: string) => `https://orbit.example/api/relationship-communication/${path}`;
  const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  return {
    summaries: (who: HarnessActor, query = "") => call(createRelationshipPageGetHandler("conversations", { resolveActor: async () => routeActor(who, h.workspaceId), service: () => reader(who) })(new Request(url(`conversation-summaries${query}`)))),
    messages: (who: HarnessActor, id: string, query = "") => call(createRelationshipPageGetHandler("messages", { resolveActor: async () => routeActor(who, h.workspaceId), service: () => reader(who) })(new Request(url(`conversations/${encodeURIComponent(id)}/messages${query}`)), { params: Promise.resolve({ id }) })),
    unread: (who: HarnessActor) => call(createRelationshipUnreadSummaryGetHandler({ resolveActor: async () => routeActor(who, h.workspaceId), read: (actorId) => readRelationshipUnreadSummary({ client: h.client, workspaceId: h.workspaceId, actorId }) })()),
    inbox: (who: HarnessActor) => call(createInboxSummaryGetHandler({ resolveActor: async () => routeActor(who, h.workspaceId), typedEnabled: () => true, readTyped: async () => 0,
      readMessages: async () => (await readRelationshipUnreadSummary({ client: h.client, workspaceId: h.workspaceId, actorId: who.accountId })).unreadTotal })()),
    conversation: (who: HarnessActor, id: string) => call(createConversationGetHandler(deps(who))(new Request(url(`conversations/${encodeURIComponent(id)}`)), { params: Promise.resolve({ id }) })),
    send: (who: HarnessActor, id: string, body: Record<string, unknown>, requestId?: string, now?: () => string) => call(createConversationMessagesPostHandler(deps(who, now))(
      new Request(url(`conversations/${encodeURIComponent(id)}/messages`), json("POST", body, requestId ? { "idempotency-key": requestId } : {})), { params: Promise.resolve({ id }) })),
    read: (who: HarnessActor, id: string, lastReadMessageId: string) => call(createConversationReadPostHandler(deps(who))(new Request(url(`conversations/${encodeURIComponent(id)}/read`), json("POST", { lastReadMessageId })), { params: Promise.resolve({ id }) })),
    draftGet: (who: HarnessActor, id: string) => call(createConversationDraftGetHandler(deps(who))(new Request(url(`conversations/${encodeURIComponent(id)}/draft`)), { params: Promise.resolve({ id }) })),
    draftPut: (who: HarnessActor, id: string, body: string) => call(createConversationDraftPutHandler(deps(who))(new Request(url(`conversations/${encodeURIComponent(id)}/draft`), json("PUT", { body })), { params: Promise.resolve({ id }) })),
    revoke: (who: HarnessActor, contactId: string) => call(createContactBindingDeleteHandler(deps(who))(new Request(url(`bindings/${encodeURIComponent(contactId)}`), { method: "DELETE" }), { params: Promise.resolve({ contactId }) })),
  };
}

async function tableCounts(h: RelationshipHarness) {
  const result = await h.client.query<{ conversations: string; members: string; messages: string }>(
    `select (select count(*) from relationship_conversations)::text as conversations,
            (select count(*) from relationship_conversation_members)::text as members,
            (select count(*) from relationship_messages)::text as messages`);
  return result.rows[0]!;
}

// ---------------------------------------------------------------- parity (SC-04)

const golden = JSON.parse(readFileSync(join(__dirname, "../fixtures/relationship-message-parity.golden.json"), "utf8")) as {
  conversations: { ab: string; ad: string; ae: string };
  legacyRows: Record<string, unknown>[];
  responses: Record<string, { status: number; body: unknown }>;
};

async function seedLegacy(h: RelationshipHarness) {
  for (const row of golden.legacyRows) {
    const columns = Object.keys(row);
    await h.client.query(
      `insert into orbit_records (${columns.join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
      columns.map((column) => row[column]),
    );
  }
}

test("parity: the pre-0109 legacy rows, migrated into the tables, answer every read route exactly as the old code did", { skip, timeout: 120_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_parity", workspaceId: PARITY_WORKSPACE, resolveContact: resolveParityContact });
  try {
    await seedLegacy(h);
    const migration = createRelationshipMessageMigration({ client: h.client, workspaceId: PARITY_WORKSPACE });
    const planned = await migration.plan();
    assert.equal(planned.create, 3);
    assert.deepEqual(await tableCounts(h), { conversations: "0", members: "0", messages: "0" }, "a dry run writes nothing");
    await migration.apply();
    const service = (who: (typeof PARITY_ACTORS)[keyof typeof PARITY_ACTORS]) => h.service({ accountId: who.id, displayName: who.name, email: who.email }, { resolveContact: resolveParityContact });
    const replayed = await runParityRequests({ client: h.client, createService: service, conversations: golden.conversations });
    assert.deepEqual(Object.keys(replayed), Object.keys(golden.responses));
    for (const [name, expected] of Object.entries(golden.responses)) {
      assert.deepEqual(replayed[name], expected, `route response ${name} differs from the pre-0109 code`);
    }
    assert.equal(PARITY_CURSOR_SECRET.length >= 32, true);
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- migration idempotency (SC-05)

test("migration is repeatable: dry run, apply, dry run is zero; legacy rows are untouched; a late legacy message is appended once; a broken row is reported", { skip, timeout: 120_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_migrate", workspaceId: PARITY_WORKSPACE, resolveContact: resolveParityContact });
  try {
    await seedLegacy(h);
    // A legacy conversation whose binding is missing cannot be migrated safely.
    await h.client.query(`insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at)
      values ($1, 'relationship_communication_conversations', 'relationship-conversation:orphan', 'system', 'x',
        '{"kind":"relationship_conversation","conversationId":"relationship-conversation:orphan","bindingId":"relationship-binding:gone","contactId":"c","participantAccountIds":["x","y"],"status":"active","qualificationVersion":"q"}', now(), now())`, [PARITY_WORKSPACE]);
    const legacyChecksum = async () => (await h.client.query<{ sum: string }>(
      "select md5(string_agg(record_id || payload::text || updated_at::text, ',' order by record_id)) as sum from orbit_records where collection_name like 'relationship_communication_%'")).rows[0]!.sum;
    const before = await legacyChecksum();
    const migration = createRelationshipMessageMigration({ client: h.client, workspaceId: PARITY_WORKSPACE });

    const dry = await migration.plan();
    assert.deepEqual([dry.create, dry.append, dry.skipped], [3, 0, 1]);
    assert.equal(dry.items.find((item) => item.action === "skip")?.reason, "binding missing");
    const applied = await migration.apply();
    assert.deepEqual([applied.create, applied.skipped, applied.revoke], [3, 1, 0]);
    assert.deepEqual(await tableCounts(h), { conversations: "3", members: "6", messages: "8" });
    const revisions = async () => (await h.client.query<{ max: string }>("select greatest((select max(sync_revision) from relationship_conversations),(select max(sync_revision) from relationship_conversation_members),(select max(sync_revision) from relationship_messages))::text as max")).rows[0]!.max;
    const afterFirst = await revisions();

    const again = await migration.plan();
    assert.deepEqual([again.create, again.append, again.appendedMessages, again.unchanged], [0, 0, 0, 3]);
    await migration.apply();
    assert.equal(await revisions(), afterFirst, "a second apply writes no row");
    assert.equal(await legacyChecksum(), before, "legacy rows are never changed");

    // Old code (still deployed during a rollout) wrote one more message after the first run.
    const late = golden.legacyRows.find((row) => row.collection_name === "relationship_communication_messages" && (row.payload as { senderAccountId: string }).senderAccountId === PARITY_ACTORS.a.id)!;
    const payload = { ...(late.payload as Record<string, unknown>), messageId: "relationship-message:late", requestId: "late", body: "迟到的一条", sentAt: "2026-09-21T00:00:00.000Z" };
    await h.client.query(`insert into orbit_records (workspace_id, collection_name, record_id, target_id, source_type, source_id, payload, created_at, updated_at)
      values ($1, 'relationship_communication_messages', 'relationship-message:late', $2, 'system', 'x', $3, now(), now())`, [PARITY_WORKSPACE, golden.conversations.ab, payload]);
    const pending = await migration.plan();
    assert.deepEqual([pending.append, pending.appendedMessages], [1, 1]);
    await migration.apply();
    const row = (await h.client.query<{ seq: string; body: string }>("select seq::text, body from relationship_messages where message_id='relationship-message:late'")).rows[0];
    assert.deepEqual(row, { seq: "7", body: "迟到的一条" });
    const b = (await h.client.query<{ unread_count: number }>("select unread_count from relationship_conversation_members where conversation_id=$1 and account_id=$2", [golden.conversations.ab, PARITY_ACTORS.b.id])).rows[0];
    assert.equal(b?.unread_count, 3, "B had 2 unread (A's 3rd and 6th message) and gains the late one");
    const final = await migration.plan();
    assert.deepEqual([final.create, final.append, final.appendedMessages], [0, 0, 0]);
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- dedupe and ordering (SC-02)

test("send dedupe: the same request id stores one message and the next message takes the next sequence number; reusing it for other text is 409", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_dedupe" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:dedupe-b");
    const first = await r.send(A, conversationId, { body: "只发一次", qualificationVersion }, "request-1");
    const replay = await r.send(A, conversationId, { body: "只发一次", qualificationVersion }, "request-1");
    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    assert.equal(replay.body.data.message.messageId, first.body.data.message.messageId);
    assert.equal(replay.body.data.message.sentAt, first.body.data.message.sentAt);
    const reused = await r.send(A, conversationId, { body: "别的内容", qualificationVersion }, "request-1");
    assert.equal(reused.status, 409);
    const second = await r.send(A, conversationId, { body: "第二条", qualificationVersion }, "request-2");
    assert.equal(second.status, 201);
    const rows = (await h.client.query<{ s: string; message_id: string }>("select seq::text as s, message_id from relationship_messages order by seq")).rows;
    assert.deepEqual(rows.map((row) => row.s), ["1", "2"]);
    assert.deepEqual(rows.map((row) => row.message_id), [first.body.data.message.messageId, second.body.data.message.messageId]);
    assert.equal((await r.unread(B)).body.data.unreadTotal, 2, "the replay did not count twice");
  } finally { await h.close(); }
});

test("concurrency: A and B each send 50 messages at the same time; sequence numbers are exactly 1..100 and unread counts equal a recount", { skip, timeout: 120_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_concurrent", poolSize: 12 });
  try {
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:concurrent-b");
    const send = (who: HarnessActor, n: number) => h.service(who).sendMessage({ conversationId, qualificationVersion, requestId: `${who.accountId}:${n}`, body: `${who.displayName} #${n}` });
    const results = await Promise.all(Array.from({ length: 50 }, (_, n) => [send(A, n), send(B, n)]).flat());
    assert.equal(new Set(results.map((result) => result.message.messageId)).size, 100);
    const seqs = (await h.client.query<{ s: string }>("select seq::text as s from relationship_messages where conversation_id=$1 order by seq", [conversationId])).rows.map((row) => Number(row.s));
    assert.deepEqual(seqs, Array.from({ length: 100 }, (_, index) => index + 1));
    const conversation = (await h.client.query<{ last_message_seq: string }>("select last_message_seq::text from relationship_conversations where conversation_id=$1", [conversationId])).rows[0];
    assert.equal(conversation?.last_message_seq, "100");
    // Each member's maintained unread equals the other side's messages after the member's read position.
    const members = (await h.client.query<{ account_id: string; read_seq: string; unread_count: number; recount: string }>(
      `select me.account_id, me.read_seq::text, me.unread_count,
         (select count(*) from relationship_messages m where m.conversation_id=me.conversation_id and m.seq>me.read_seq and m.sender_account_id<>me.account_id)::text as recount
       from relationship_conversation_members me where me.conversation_id=$1`, [conversationId])).rows;
    assert.equal(members.length, 2);
    for (const member of members) assert.equal(String(member.unread_count), member.recount, `unread for ${member.account_id}`);
    // Replaying all 100 requests concurrently changes nothing.
    await Promise.all(Array.from({ length: 50 }, (_, n) => [send(A, n), send(B, n)]).flat());
    assert.equal((await tableCounts(h)).messages, "100");
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- unread (SC-03), drafts as in 0122

test("unread: equals the other side's unread messages; opening clears it; own messages never count; an older read marker recounts", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_unread" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:unread-b");
    const sent: string[] = [];
    for (const n of [1, 2, 3]) sent.push((await r.send(A, conversationId, { body: `A${n}`, qualificationVersion }, `a-${n}`)).body.data.message.messageId);
    for (const [who, total] of [[B, 3], [A, 0]] as const) {
      assert.equal((await r.unread(who)).body.data.unreadTotal, total);
      assert.equal((await r.inbox(who)).body.data.messagesUnread, total);
      assert.equal((await r.summaries(who)).body.data.items[0].unreadCount, total);
      assert.equal((await r.conversation(who, conversationId)).body.data.unreadCount, total);
    }
    assert.equal((await r.read(B, conversationId, sent[0]!)).status, 200);
    assert.equal((await r.unread(B)).body.data.unreadTotal, 2, "read up to the first message");
    assert.equal((await r.read(B, conversationId, sent[2]!)).status, 200);
    assert.equal((await r.unread(B)).body.data.unreadTotal, 0, "opening the newest clears it");
    assert.equal((await r.conversation(B, conversationId)).body.data.lastReadMessageId, sent[2]);
    const reply = (await r.send(B, conversationId, { body: "B1", qualificationVersion }, "b-1")).body.data.message.messageId as string;
    assert.equal((await r.unread(B)).body.data.unreadTotal, 0, "B's own reply is not unread for B");
    assert.equal((await r.unread(A)).body.data.unreadTotal, 1);
    assert.equal((await r.summaries(A)).body.data.items[0].lastMessage.messageId, reply);
    // The sender has read up to its own message (message plan step 6).
    await r.send(A, conversationId, { body: "A4", qualificationVersion }, "a-4");
    assert.equal((await r.unread(A)).body.data.unreadTotal, 0);
    assert.equal((await r.unread(B)).body.data.unreadTotal, 1);
    // Pointing the marker back at an older message recounts, as the legacy readers did.
    await r.read(B, conversationId, sent[0]!);
    assert.equal((await r.unread(B)).body.data.unreadTotal, 3, "A2, A3 and A4 are after the marker; B1 is B's own");
    assert.equal((await r.read(B, conversationId, "relationship-message:unknown")).status, 404);
    assert.equal((await r.read(B, conversationId, "")).status, 400);
  } finally { await h.close(); }
});

test("drafts keep 0122 semantics on the tables: per-account drafts, a delivered reply retires the sender's earlier draft only", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_drafts" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:drafts-b");
    await r.draftPut(A, conversationId, "A 的草稿");
    await r.draftPut(B, conversationId, "B 的草稿");
    assert.equal((await r.draftGet(A, conversationId)).body.data.body, "A 的草稿");
    assert.equal((await r.draftGet(C, conversationId)).status, 404);
    const sent = await r.send(A, conversationId, { body: "A 的草稿", qualificationVersion }, "draft-send", () => "2099-01-01T00:00:00.000Z");
    assert.equal(sent.status, 201);
    assert.equal((await r.draftGet(A, conversationId)).body.data.body, "");
    assert.equal((await r.draftGet(B, conversationId)).body.data.body, "B 的草稿");
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- revocation (SC-03)

test("revocation: both sides lose the conversation in every route, an old qualification cannot send, and the server keeps every row", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_revoke" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:revoke-b");
    const kept = (await r.send(B, conversationId, { body: "撤销前的消息", qualificationVersion }, "before")).body.data.message.messageId;
    await r.draftPut(A, conversationId, "撤销前的草稿");
    const beforeRevision = (await h.client.query<{ r: string }>("select max(sync_revision)::text as r from relationship_conversation_members where conversation_id=$1", [conversationId])).rows[0]!.r;
    const revoked = await r.revoke(A, "contact:revoke-b");
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data.status, "revoked");
    assert.notEqual(revoked.body.data.qualificationVersion, qualificationVersion);
    for (const who of [A, B]) {
      assert.deepEqual((await r.summaries(who)).body.data.items, []);
      assert.equal((await r.unread(who)).body.data.unreadTotal, 0);
      assert.equal((await r.inbox(who)).body.data.messagesUnread, 0);
      assert.equal((await r.messages(who, conversationId)).status, 404);
      assert.equal((await r.conversation(who, conversationId)).status, 404);
      assert.equal((await r.draftGet(who, conversationId)).status, 404);
    }
    const stale = await r.send(B, conversationId, { body: "撤销后", qualificationVersion }, "after");
    assert.equal(stale.status, 409);
    assert.match(stale.body.error!.message, /revoked/);
    const fresh = await r.send(A, conversationId, { body: "撤销后", qualificationVersion: revoked.body.data.qualificationVersion }, "after-new");
    assert.equal(fresh.status, 409, "even the new qualification cannot send into a revoked conversation");
    const repeated = await r.revoke(A, "contact:revoke-b");
    assert.equal(repeated.body.data.status, "revoked");
    // Server keeps everything: status, left members with new sync revisions, the message.
    const conversation = (await h.client.query<{ status: string; revoked_at: string | null; revoked_by_account_id: string }>("select status, revoked_at, revoked_by_account_id from relationship_conversations where conversation_id=$1", [conversationId])).rows[0]!;
    assert.equal(conversation.status, "revoked");
    assert.ok(conversation.revoked_at);
    assert.equal(conversation.revoked_by_account_id, A.accountId);
    const members = (await h.client.query<{ state: string; sync_revision: string }>("select state, sync_revision::text from relationship_conversation_members where conversation_id=$1", [conversationId])).rows;
    assert.deepEqual(members.map((m) => m.state), ["left", "left"]);
    assert.ok(members.every((m) => BigInt(m.sync_revision) > BigInt(beforeRevision)), "leaving gives each member row a new sync revision (0119 hand-off)");
    assert.equal((await h.client.query("select 1 from relationship_messages where message_id=$1", [kept])).rows.length, 1);
    assert.equal((await tableCounts(h)).messages, "1");
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- isolation (SC-04)

test("isolation: a third account gets nothing from any route and writes nothing; another account's cursor is rejected", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_isolation" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:iso-b");
    const message = (await r.send(A, conversationId, { body: "只给 B", qualificationVersion }, "iso-1")).body.data.message.messageId;
    await r.send(A, conversationId, { body: "第二条", qualificationVersion }, "iso-2");
    const before = await tableCounts(h);
    assert.deepEqual((await r.summaries(C)).body.data.items, []);
    assert.equal((await r.unread(C)).body.data.unreadTotal, 0);
    assert.equal((await r.messages(C, conversationId)).status, 404);
    assert.equal((await r.conversation(C, conversationId)).status, 404);
    assert.equal((await r.draftGet(C, conversationId)).status, 404);
    assert.equal((await r.draftPut(C, conversationId, "偷写")).status, 404);
    assert.equal((await r.send(C, conversationId, { body: "闯入", qualificationVersion }, "iso-c")).status, 404);
    assert.equal((await r.read(C, conversationId, message)).status, 404);
    assert.deepEqual(await tableCounts(h), before);
    const page = await r.messages(B, conversationId, "?limit=1");
    assert.equal(page.body.data.hasMore, true);
    assert.equal((await r.messages(A, conversationId, `?limit=1&cursor=${encodeURIComponent(page.body.data.nextCursor)}`)).status, 400, "a cursor is bound to its account");
    const otherWorkspace = await readRelationshipUnreadSummary({ client: h.client, workspaceId: "workspace:other", actorId: B.accountId });
    assert.equal(otherWorkspace.unreadTotal, 0);
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- sync revision discipline (0108)

test("the tables' strict trigger refuses an unlocked write and draws locked writes from the orbit_records revision sequence", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_trigger" });
  try {
    const { conversationId } = await connect(h, A, B, "contact:trigger-b");
    for (const sql of [
      "update relationship_conversations set updated_at = now()",
      "update relationship_conversation_members set updated_at = now()",
      `insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
       values ('${h.workspaceId}', '${conversationId}', 99, 'unlocked', 'x', 'x', 'x', now(), 'q', 'r')`,
    ]) {
      await assert.rejects(h.client.query(sql), (error: { code?: string; message?: string }) => error.code === "55P03" && /SYNC_WRITE_LOCK_REQUIRED/.test(error.message ?? ""), sql);
    }
    const before = (await h.client.query<{ v: string }>("select last_value::text as v from orbit_records_sync_revision_seq")).rows[0]!.v;
    await h.client.transaction(async (tx) => {
      await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
      await tx.query("update relationship_conversations set updated_at = now() where conversation_id = $1", [conversationId]);
    });
    const after = (await h.client.query<{ v: string; r: string }>("select (select last_value::text from orbit_records_sync_revision_seq) as v, (select sync_revision::text from relationship_conversations where conversation_id=$1) as r", [conversationId])).rows[0]!;
    assert.ok(BigInt(after.v) > BigInt(before));
    assert.equal(after.r, after.v, "the locked update took the newest revision of the shared sequence");
  } finally { await h.close(); }
});
