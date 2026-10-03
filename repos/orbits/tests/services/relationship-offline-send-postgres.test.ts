import assert from "node:assert/strict";
import test from "node:test";

import {
  createConversationDraftGetHandler,
  createConversationDraftPutHandler,
  createConversationGetHandler,
  createConversationMessagesPostHandler,
  createContactBindingDeleteHandler,
} from "../../app/api/relationship-communication/handler";
import { createRelationshipPageGetHandler } from "../../app/api/relationship-communication/read-handler";
import { createRelationshipUnreadSummaryGetHandler } from "../../app/api/relationship-communication/unread-summary/handler";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import { connect, createRelationshipHarness, relationshipPostgresSkip as skip, type HarnessActor, type RelationshipHarness } from "../support/relationship-message-harness";

/**
 * Sprint 0135 (message plan M4, offline-write design steps 6-8): a message
 * written offline is replayed later by the device outbox with the same request
 * id. Against real PostgreSQL through the real route handlers:
 * - a replay returns the stored message before any eligibility check, in the
 *   same transaction and row lock, so a lost receipt followed by a revocation
 *   still answers "delivered" instead of "revoked";
 * - a never-delivered message is not delivered into a revoked conversation;
 * - an offline replay does not retire a draft saved after the message was written.
 */

const A: HarnessActor = { accountId: "account:offline-a", displayName: "Offline A", email: "offline-a@example.test" };
const B: HarnessActor = { accountId: "account:offline-b", displayName: "Offline B", email: "offline-b@example.test" };
const C: HarnessActor = { accountId: "account:offline-c", displayName: "Offline C", email: "offline-c@example.test" };
const SECRET = "relationship-offline-send-cursor-secret-xxxxxxxxx";
const routeActor = (who: HarnessActor, workspaceId: string) => ({ id: who.accountId, accountId: who.accountId, name: who.displayName, email: who.email, workspaceId });

type Json = { success: boolean; data?: any; error?: { code: string; message: string } };

function routes(h: RelationshipHarness) {
  const deps = (who: HarnessActor, now?: () => string) => ({ resolveActor: async () => routeActor(who, h.workspaceId), createService: () => h.service(who, now ? { now } : {}) });
  const reader = (who: HarnessActor) => createRelationshipBoundedReader({ client: h.client, workspaceId: h.workspaceId, actorId: who.accountId, cursorSecret: SECRET });
  const call = async (response: Promise<Response>) => { const r = await response; return { status: r.status, body: await r.json() as Json }; };
  const url = (path: string) => `https://orbit.example/api/relationship-communication/${path}`;
  const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  return {
    summaries: (who: HarnessActor) => call(createRelationshipPageGetHandler("conversations", { resolveActor: async () => routeActor(who, h.workspaceId), service: () => reader(who) })(new Request(url("conversation-summaries")))),
    messages: (who: HarnessActor, id: string) => call(createRelationshipPageGetHandler("messages", { resolveActor: async () => routeActor(who, h.workspaceId), service: () => reader(who) })(new Request(url(`conversations/${encodeURIComponent(id)}/messages`)), { params: Promise.resolve({ id }) })),
    unread: (who: HarnessActor) => call(createRelationshipUnreadSummaryGetHandler({ resolveActor: async () => routeActor(who, h.workspaceId), read: (actorId) => readRelationshipUnreadSummary({ client: h.client, workspaceId: h.workspaceId, actorId }) })()),
    conversation: (who: HarnessActor, id: string) => call(createConversationGetHandler(deps(who))(new Request(url(`conversations/${encodeURIComponent(id)}`)), { params: Promise.resolve({ id }) })),
    send: (who: HarnessActor, id: string, body: Record<string, unknown>, requestId: string, now?: () => string) => call(createConversationMessagesPostHandler(deps(who, now))(
      new Request(url(`conversations/${encodeURIComponent(id)}/messages`), json("POST", body, { "idempotency-key": requestId })), { params: Promise.resolve({ id }) })),
    draftGet: (who: HarnessActor, id: string) => call(createConversationDraftGetHandler(deps(who))(new Request(url(`conversations/${encodeURIComponent(id)}/draft`)), { params: Promise.resolve({ id }) })),
    draftPut: (who: HarnessActor, id: string, body: string, now?: () => string) => call(createConversationDraftPutHandler(deps(who, now))(new Request(url(`conversations/${encodeURIComponent(id)}/draft`), json("PUT", { body })), { params: Promise.resolve({ id }) })),
    revoke: (who: HarnessActor, contactId: string) => call(createContactBindingDeleteHandler(deps(who))(new Request(url(`bindings/${encodeURIComponent(contactId)}`), { method: "DELETE" }), { params: Promise.resolve({ contactId }) })),
  };
}

async function messageRows(h: RelationshipHarness, conversationId: string) {
  return (await h.client.query<{ seq: string; message_id: string; body: string; sender_account_id: string }>(
    "select seq::text as seq, message_id, body, sender_account_id from relationship_messages where conversation_id = $1 order by seq", [conversationId])).rows;
}

const at = (iso: string) => () => iso;

// ---------------------------------------------------------------- SC-0135-01

test("lost receipt then revocation: replaying the same request returns the stored message, not 'revoked'; one row, no sequence gap", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_off_replay" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:off-replay-b");
    const before = await r.send(A, conversationId, { body: "撤销前一条", qualificationVersion }, "off-0");
    assert.equal(before.status, 201);
    // The server stored the queued message but the device lost the receipt.
    const delivered = await r.send(A, conversationId, { body: "回执丢了", qualificationVersion }, "off-1");
    assert.equal(delivered.status, 201);
    assert.equal((await r.revoke(A, "contact:off-replay-b")).status, 200);

    // The outbox replays the frozen request after the revocation.
    const replay = await r.send(A, conversationId, { body: "回执丢了", qualificationVersion }, "off-1");
    assert.equal(replay.status, 201, `a replay of a delivered message is delivered, got ${JSON.stringify(replay.body.error)}`);
    assert.equal(replay.body.data.message.messageId, delivered.body.data.message.messageId);
    assert.equal(replay.body.data.message.sentAt, delivered.body.data.message.sentAt, "the server time of the first delivery (D13)");
    assert.equal(replay.body.data.deliveryState, "delivered");

    // Reusing the request id for other text is still refused, revoked or not.
    const reused = await r.send(A, conversationId, { body: "换了内容", qualificationVersion }, "off-1");
    assert.equal(reused.status, 409);
    assert.match(reused.body.error!.message, /already used/);

    // A message never delivered before the revocation is not delivered after it.
    const late = await r.send(A, conversationId, { body: "联网前对方撤销了", qualificationVersion }, "off-2");
    assert.equal(late.status, 409);
    assert.match(late.body.error!.message, /revoked/);

    const rows = await messageRows(h, conversationId);
    assert.deepEqual(rows.map((row) => row.seq), ["1", "2"], "one row per request id, no gap, nothing after the revocation");
    assert.deepEqual(rows.map((row) => row.body), ["撤销前一条", "回执丢了"]);
    const conversation = (await h.client.query<{ last_message_seq: string; status: string }>("select last_message_seq::text, status from relationship_conversations where conversation_id = $1", [conversationId])).rows[0]!;
    assert.deepEqual(conversation, { last_message_seq: "2", status: "revoked" });
  } finally { await h.close(); }
});

test("replay after the sender's qualification changed still returns the stored message; the other member gains unread only once", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_off_qv" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:off-qv-b");
    const first = await r.send(A, conversationId, { body: "只算一次", qualificationVersion }, "qv-1");
    assert.equal(first.status, 201);
    // Replays race each other; the row lock serialises them and every one answers with the same message.
    const replays = await Promise.all(Array.from({ length: 5 }, () => r.send(A, conversationId, { body: "只算一次", qualificationVersion }, "qv-1")));
    assert.deepEqual(replays.map((reply) => reply.status), [201, 201, 201, 201, 201]);
    assert.ok(replays.every((reply) => reply.body.data.message.messageId === first.body.data.message.messageId));
    assert.equal((await r.unread(B)).body.data.unreadTotal, 1);
    // The device recorded an older qualification for this conversation; the replay is still the same message.
    await h.client.transaction(async (tx) => {
      await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
      await tx.query("update relationship_messages set qualification_version = 'qv_older' where message_id = $1", [first.body.data.message.messageId]);
    });
    const replay = await r.send(A, conversationId, { body: "只算一次", qualificationVersion }, "qv-1");
    assert.equal(replay.status, 201, JSON.stringify(replay.body.error));
    assert.equal(replay.body.data.message.messageId, first.body.data.message.messageId);
    assert.equal((await messageRows(h, conversationId)).length, 1);
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- SC-0135-02

test("three queued messages replayed in order (with a lost receipt in the middle) arrive once each with consecutive sequence numbers and server times", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_off_three" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:off-three-b");
    const times = ["2099-01-01T00:00:01.000Z", "2099-01-01T00:00:02.000Z", "2099-01-01T00:00:03.000Z"];
    const first = await r.send(A, conversationId, { body: "第一条", qualificationVersion }, "q-1", at(times[0]!));
    const second = await r.send(A, conversationId, { body: "第二条", qualificationVersion }, "q-2", at(times[1]!));
    // Receipt for q-2 lost: the uploader resends q-2 before q-3 (same record order).
    const secondAgain = await r.send(A, conversationId, { body: "第二条", qualificationVersion }, "q-2", at("2099-01-01T00:00:09.000Z"));
    const third = await r.send(A, conversationId, { body: "第三条", qualificationVersion }, "q-3", at(times[2]!));
    for (const reply of [first, second, secondAgain, third]) assert.equal(reply.status, 201);
    assert.equal(secondAgain.body.data.message.sentAt, times[1], "the replay keeps the first server time");
    const rows = await messageRows(h, conversationId);
    assert.deepEqual(rows.map((row) => [row.seq, row.message_id]), [first, second, third].map((reply, index) => [String(index + 1), reply.body.data.message.messageId]));
    assert.deepEqual([first, second, third].map((reply) => reply.body.data.message.sentAt), times);
    const page = await r.messages(B, conversationId);
    assert.equal(page.status, 200);
    assert.deepEqual(page.body.data.items.map((item: { body: string }) => item.body), ["第一条", "第二条", "第三条"]);
    assert.equal((await r.unread(B)).body.data.unreadTotal, 3);
    assert.equal((await r.unread(A)).body.data.unreadTotal, 0, "own messages are never unread");
  } finally { await h.close(); }
});

// ---------------------------------------------------------------- SC-0135-03 / 04

test("isolation: a third account cannot replay into, read or detect the conversation; its own request id never matches A's message", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_off_iso" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:off-iso-b");
    const sent = await r.send(A, conversationId, { body: "只给 B", qualificationVersion }, "iso-1");
    assert.equal(sent.status, 201);
    const intrusion = await r.send(C, conversationId, { body: "只给 B", qualificationVersion }, "iso-1");
    assert.equal(intrusion.status, 404, "C replaying A's request id gets nothing, not A's message");
    assert.equal(JSON.stringify(intrusion.body).includes("只给 B"), false);
    assert.equal((await r.messages(C, conversationId)).status, 404);
    assert.equal((await r.conversation(C, conversationId)).status, 404);
    assert.deepEqual((await r.summaries(C)).body.data.items, []);
    await r.revoke(A, "contact:off-iso-b");
    const afterRevoke = await r.send(C, conversationId, { body: "只给 B", qualificationVersion }, "iso-1");
    assert.equal(afterRevoke.status, 404, "after revocation C still cannot learn the stored message");
    assert.equal(JSON.stringify(afterRevoke.body).includes("只给 B"), false);
    // B (a member who left) replaying a request id A used is a different message id: refused as revoked.
    const otherMember = await r.send(B, conversationId, { body: "只给 B", qualificationVersion }, "iso-1");
    assert.equal(otherMember.status, 409);
    assert.match(otherMember.body.error!.message, /revoked/);
    assert.equal((await messageRows(h, conversationId)).length, 1);
  } finally { await h.close(); }
});

test("drafts: an offline replay retires only the draft the device knew when it wrote the message; a draft saved after it is kept", { skip, timeout: 60_000 }, async () => {
  const h = await createRelationshipHarness({ prefix: "rel_off_draft" });
  try {
    const r = routes(h);
    const { conversationId, qualificationVersion } = await connect(h, A, B, "contact:off-draft-b");
    // Online at 10:00 A saves a draft, then goes offline and sends it (queued with the draft time it knew).
    const known = await r.draftPut(A, conversationId, "断网前的草稿", at("2099-01-01T10:00:00.000Z"));
    assert.equal(known.status, 200);
    const knownAt = known.body.data.updatedAt as string;
    // Back online at 10:05 A saves a new draft before the outbox uploads at 10:06.
    assert.equal((await r.draftPut(A, conversationId, "发送之后才存的草稿", at("2099-01-01T10:05:00.000Z"))).status, 200);
    const replay = await r.send(A, conversationId, { body: "断网前的草稿", qualificationVersion, retireDraftThrough: knownAt }, "draft-1", at("2099-01-01T10:06:00.000Z"));
    assert.equal(replay.status, 201, JSON.stringify(replay.body.error));
    assert.equal((await r.draftGet(A, conversationId)).body.data.body, "发送之后才存的草稿", "the later draft survives the offline send");

    // With no newer draft, the known draft is retired as in 0122.
    assert.equal((await r.draftPut(A, conversationId, "又一份草稿", at("2099-01-01T11:00:00.000Z"))).status, 200);
    const sent = await r.send(A, conversationId, { body: "又一份草稿", qualificationVersion, retireDraftThrough: "2099-01-01T11:00:00.000Z" }, "draft-2", at("2099-01-01T11:01:00.000Z"));
    assert.equal(sent.status, 201);
    assert.equal((await r.draftGet(A, conversationId)).body.data.body, "");

    // A device that knew no draft (null) never retires one.
    assert.equal((await r.draftPut(A, conversationId, "设备不知道的草稿", at("2099-01-01T12:00:00.000Z"))).status, 200);
    const unknown = await r.send(A, conversationId, { body: "离线写的", qualificationVersion, retireDraftThrough: null }, "draft-3", at("2099-01-01T12:01:00.000Z"));
    assert.equal(unknown.status, 201);
    assert.equal((await r.draftGet(A, conversationId)).body.data.body, "设备不知道的草稿");

    // Without the field (online send) the 0122 rule is unchanged: drafts saved at or before the send are retired.
    const online = await r.send(A, conversationId, { body: "在线发送", qualificationVersion }, "draft-4", at("2099-01-01T12:02:00.000Z"));
    assert.equal(online.status, 201);
    assert.equal((await r.draftGet(A, conversationId)).body.data.body, "");

    // A malformed bound is a validation error and stores nothing.
    const bad = await r.send(A, conversationId, { body: "坏的", qualificationVersion, retireDraftThrough: "not-a-time" }, "draft-5");
    assert.equal(bad.status, 400);
    const badType = await r.send(A, conversationId, { body: "坏的", qualificationVersion, retireDraftThrough: 12 }, "draft-6");
    assert.equal(badType.status, 400);
    assert.equal((await messageRows(h, conversationId)).length, 4);
  } finally { await h.close(); }
});
