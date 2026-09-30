import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createRelationshipPageGetHandler } from "../../app/api/relationship-communication/read-handler";
import { createRelationshipUnreadSummaryGetHandler } from "../../app/api/relationship-communication/unread-summary/handler";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { acquireSyncCommitOrderLock } from "../../features/sync/commit-order-lock";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { derivedOwnerTables, findSyncDomain, RELATIONSHIP_MESSAGE_SYNC_DOMAINS, SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { SYNC_MAX_PAGE_BYTES } from "../../features/sync/read-service";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../shared/api-schema/universal-read";
import {
  relationshipLocalMessagePage,
  relationshipLocalSummaryPage,
  relationshipLocalUnreadTotal,
  type RelationshipDeviceConversation,
  type RelationshipDeviceMessage,
} from "../../shared/compute/relationship-local";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";
import { connect, createRelationshipHarness, relationshipPostgresSkip, type HarnessActor, type RelationshipHarness } from "../support/relationship-message-harness";

// Sprint 0119 (offline 3b = message plan M3): the account's conversations and
// their full message history are sync domains read from the three dedicated
// message tables (0109). The owner is derived from the account's own member
// row; a member row that leaves (revocation) is sent as a delete, so the
// conversation and its messages leave both phones. This local Postgres plays
// the server holding accounts A, B and C; every device pull goes through the
// real sync route handlers and every message write through the real
// relationship service. A device is a Map of the rows it was sent, following
// its cursor like the App; a conversation delete takes that conversation's
// messages with it (the App repository's cascade, tested on the App side).

const options = { skip: relationshipPostgresSkip, timeout: 240_000 };
const A: HarnessActor = { accountId: "account:msync-a", displayName: "Sync A", email: "msync-a@example.test" };
const B: HarnessActor = { accountId: "account:msync-b", displayName: "Sync B", email: "msync-b@example.test" };
const C: HarnessActor = { accountId: "account:msync-c", displayName: "Sync C", email: "msync-c@example.test" };
const SECRET = "relationship-sync-secret-0123456789abcdef0123456789abcdef";
const NOW = "2026-09-28T09:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const CONVERSATIONS = "relationship-conversations";
const MESSAGES = "relationship-messages";

async function host(t: TestContext) {
  const h = await createRelationshipHarness({ prefix: "rel_sync", poolSize: 6 });
  t.after(() => h.close());
  // The production orbit_records sync_revision (the manifest's conditional read keys on it).
  await h.client.query(STRICT_SYNC_REVISION_SQL);
  for (const actor of [A, B, C]) {
    await h.store.upsertRecord({
      workspaceId: h.workspaceId, collectionName: "accounts", recordId: actor.accountId, userId: actor.accountId, sourceType: "manual", sourceId: actor.accountId,
      evidenceIds: [], lifecycleState: "active", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", payload: { id: actor.accountId },
    });
  }
  const service = createDomainReadService({ client: h.client, cursorSecret: SECRET, now: () => NOW, domains: RELATIONSHIP_MESSAGE_SYNC_DOMAINS });
  const handlersFor = (actor: HarnessActor) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor.accountId, userId: actor.accountId, workspaceId: h.workspaceId }), createService: () => service, now: () => NOW_MS,
    conditionalRead: { client: h.client, workspaceId: h.workspaceId, version: "test" },
  });
  let clock = Date.parse("2026-09-27T08:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  const send = async (from: HarnessActor, conversation: { conversationId: string; qualificationVersion: string }, body: string) =>
    h.service(from, { now: tick }).sendMessage({ conversationId: conversation.conversationId, body, qualificationVersion: conversation.qualificationVersion, requestId: `req-${clock}-${Math.random()}` });
  return { h, handlersFor, send, tick };
}

type Host = Awaited<ReturnType<typeof host>>;

/** One phone: both message domains, pulled in lease order (conversations first) through the real route handlers. */
function phone(x: Host, actor: HarnessActor, limit = 7) {
  const conversations = new Map<string, Record<string, unknown>>();
  const messages = new Map<string, Record<string, unknown>>();
  const cursors: Record<string, string | undefined> = {};
  async function pull(domainId: string) {
    const rows = domainId === CONVERSATIONS ? conversations : messages;
    let upserts = 0, deletes = 0, pages = 0;
    const ids: string[] = [];
    for (let page = 0; page < 400; page += 1) {
      const cursor = cursors[domainId];
      const response = await x.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${domainId}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), domainId);
      if (response.status === 409) { rows.clear(); cursors[domainId] = undefined; continue; }
      assert.equal(response.status, 200, await response.clone().text());
      const text = await response.text();
      assert.ok(Buffer.byteLength(text, "utf8") <= SYNC_MAX_PAGE_BYTES, "a page never exceeds SYNC_MAX_PAGE_BYTES");
      pages += 1;
      const data = domainPageSchema.parse((JSON.parse(text) as { data: unknown }).data);
      for (const change of data.changes) {
        ids.push(change.id);
        if (change.operation === "upsert") { rows.set(change.id, change.payload as Record<string, unknown>); upserts += 1; continue; }
        rows.delete(change.id); deletes += 1;
        // The App repository's cascade: a conversation that left takes its messages with it.
        if (domainId === CONVERSATIONS) for (const key of [...messages.keys()]) if (key.startsWith(`${change.id}/`)) messages.delete(key);
      }
      cursors[domainId] = data.nextCursor;
      if (!data.hasMore) return { upserts, deletes, ids, pages };
    }
    throw new Error("pagination did not terminate");
  }
  return {
    conversations, messages,
    async sync() { return { conversations: await pull(CONVERSATIONS), messages: await pull(MESSAGES) }; },
    deviceConversations: () => [...conversations.values()] as unknown as RelationshipDeviceConversation[],
    deviceMessages: () => [...messages.values()] as unknown as RelationshipDeviceMessage[],
    /** One conversation's whole history on the device, in sequence order. */
    history: (conversationId: string) => ([...messages.values()] as unknown as RelationshipDeviceMessage[]).filter((row) => row.conversationId === conversationId).sort((l, r) => l.seq - r.seq),
  };
}

function routes(x: Host) {
  const actorOf = (who: HarnessActor) => ({ id: who.accountId, accountId: who.accountId, name: who.displayName, email: who.email, workspaceId: x.h.workspaceId });
  const reader = (who: HarnessActor) => createRelationshipBoundedReader({ client: x.h.client, workspaceId: x.h.workspaceId, actorId: who.accountId, cursorSecret: SECRET });
  const json = async (response: Promise<Response>) => { const r = await response; assert.equal(r.status, 200, await r.clone().text()); return ((await r.json()) as { data: any }).data; };
  const url = (path: string) => `https://orbit.example/api/relationship-communication/${path}`;
  return {
    summaries: (who: HarnessActor) => json(createRelationshipPageGetHandler("conversations", { resolveActor: async () => actorOf(who), service: () => reader(who) })(new Request(url("conversation-summaries?limit=50")))),
    messages: (who: HarnessActor, id: string) => json(createRelationshipPageGetHandler("messages", { resolveActor: async () => actorOf(who), service: () => reader(who) })(new Request(url(`conversations/${encodeURIComponent(id)}/messages?limit=30&direction=older`)), { params: Promise.resolve({ id }) })),
    unread: (who: HarnessActor) => json(createRelationshipUnreadSummaryGetHandler({ resolveActor: async () => actorOf(who), read: (actorId) => readRelationshipUnreadSummary({ client: x.h.client, workspaceId: x.h.workspaceId, actorId }) })()),
  };
}

async function manifest(x: Host, actor: HarnessActor, etag?: string) {
  const response = await x.handlersFor(actor).manifest(new Request("https://orbit.local/api/sync/manifest", etag ? { headers: { "If-None-Match": etag } } : {}));
  return { status: response.status, etag: response.headers.get("ETag"), body: response.status === 200 ? domainManifestSchema.parse(((await response.json()) as { data: unknown }).data) : null };
}

const locked = (h: RelationshipHarness, sql: string, values: unknown[]) => h.client.transaction(async (tx) => { await acquireSyncCommitOrderLock(tx); await tx.query(sql, values); });

test("registry: the message domains are leased device domains whose owner is the account's member row; the database guard refuses moving a member, a conversation or a message", options, async (t) => {
  for (const domainId of [CONVERSATIONS, MESSAGES]) {
    const domain = findSyncDomain(domainId, SYNC_DOMAINS);
    assert.equal(domain?.exposure, "device", domainId);
    assert.equal(domain?.ownership.rule, "derived");
    assert.equal(domain?.source.kind, "relationship_messages");
  }
  const owners = derivedOwnerTables().map((owner) => owner.table);
  for (const table of ["relationship_conversation_members", "relationship_conversations", "relationship_messages"]) assert.ok(owners.includes(table), `${table} is a derived owner table`);
  const x = await host(t);
  const lease = offlineReadEnvelopeSchema.parse(((await (await x.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants.map((grant) => grant.domainId), [CONVERSATIONS, MESSAGES], "conversations are leased (and pulled) before their messages");

  const ab = await connect(x.h, A, B, "contact:guard-b");
  await x.send(A, ab, "guard message");
  const { h } = x;
  // Even a writer holding the commit-order lock (a batch script) cannot move rows between accounts or conversations.
  await assert.rejects(locked(h, "update relationship_conversation_members set account_id = $1 where workspace_id = $2 and account_id = $3", [C.accountId, h.workspaceId, B.accountId]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await assert.rejects(locked(h, "update relationship_conversation_members set conversation_id = 'relationship-conversation:other' where workspace_id = $1 and account_id = $2", [h.workspaceId, B.accountId]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await assert.rejects(locked(h, "update relationship_messages set conversation_id = 'relationship-conversation:other' where workspace_id = $1", [h.workspaceId]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await assert.rejects(locked(h, "update relationship_conversations set invitee_account_id = $1 where workspace_id = $2", [C.accountId, h.workspaceId]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  // A left member never comes back (its device dropped the history, which would not be sent again), nor does a revoked conversation.
  await h.service(A).revokeContactBinding("contact:guard-b");
  await assert.rejects(locked(h, "update relationship_conversation_members set state = 'active' where workspace_id = $1", [h.workspaceId]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await assert.rejects(locked(h, "update relationship_conversations set status = 'active' where workspace_id = $1", [h.workspaceId]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  // Ordinary locked writes that keep the identity pass.
  await locked(h, "update relationship_conversation_members set updated_at = updated_at where workspace_id = $1", [h.workspaceId]);
  // And an unlocked write is still refused (0109 commit-order guarantee).
  await assert.rejects(h.client.query("update relationship_conversation_members set updated_at = updated_at where workspace_id = $1", [h.workspaceId]), /SYNC_WRITE_LOCK_REQUIRED/);
});

test("isolation with a third account: C's phone holds only C's conversation; nobody receives another conversation's text or ids", options, async (t) => {
  const x = await host(t);
  const ab = await connect(x.h, A, B, "contact:a-knows-b");
  const bc = await connect(x.h, B, C, "contact:b-knows-c");
  await x.send(A, ab, "secret-ab-1");
  await x.send(B, ab, "secret-ab-2");
  await x.send(B, bc, "hello-bc-1");
  await x.send(C, bc, "hello-bc-2");
  const a = phone(x, A), b = phone(x, B), c = phone(x, C);
  await a.sync(); await b.sync(); await c.sync();
  assert.deepEqual([...a.conversations.keys()], [ab.conversationId]);
  assert.deepEqual([...c.conversations.keys()], [bc.conversationId]);
  assert.deepEqual([...b.conversations.keys()].sort(), [ab.conversationId, bc.conversationId].sort());
  const cText = JSON.stringify([...c.conversations.values(), ...c.messages.values(), ...c.messages.keys()]);
  assert.ok(!cText.includes("secret-ab") && !cText.includes(ab.conversationId) && !cText.includes(A.accountId) && !cText.includes("Sync A"), "nothing of A–B reaches C");
  const aText = JSON.stringify([...a.conversations.values(), ...a.messages.values(), ...a.messages.keys()]);
  assert.ok(!aText.includes("hello-bc") && !aText.includes(bc.conversationId) && !aText.includes(C.accountId), "nothing of B–C reaches A");
  assert.equal(a.messages.size, 2);
  assert.equal(c.messages.size, 2);
  assert.equal(b.messages.size, 4);
  for (const [id, row] of c.messages) assert.equal(id, `${row.conversationId}/${row.seq}`, "a message row id is conversation/seq");
  for (const row of [...a.conversations.values()]) assert.ok(Object.keys(row).every((key) => (RELATIONSHIP_MESSAGE_SYNC_DOMAINS[0]!.fields as readonly string[]).includes(key)), JSON.stringify(Object.keys(row)));
  for (const row of [...a.messages.values()]) assert.ok(Object.keys(row).every((key) => (RELATIONSHIP_MESSAGE_SYNC_DOMAINS[1]!.fields as readonly string[]).includes(key)), JSON.stringify(Object.keys(row)));
});

test("incremental: a multi-page first sync delivers the whole history in order; a new message is one message and one member row per phone; the next sync sends nothing", options, async (t) => {
  const x = await host(t);
  const ab = await connect(x.h, A, B, "contact:history");
  for (let index = 1; index <= 45; index += 1) await x.send(index % 3 === 0 ? B : A, ab, `history ${index}`);
  const a = phone(x, A), b = phone(x, B);
  const first = await a.sync();
  assert.ok(first.messages.pages >= 7, `the history came in pages (${first.messages.pages})`);
  assert.equal(first.messages.upserts, 45);
  const history = a.history(ab.conversationId);
  assert.deepEqual(history.map((item) => item.seq), Array.from({ length: 45 }, (_, index) => index + 1), "no gap in the sequence");
  assert.deepEqual(history.map((item) => item.body), Array.from({ length: 45 }, (_, index) => `history ${index + 1}`), "complete and in order");
  await b.sync();
  assert.deepEqual(await a.sync(), { conversations: { upserts: 0, deletes: 0, ids: [], pages: 1 }, messages: { upserts: 0, deletes: 0, ids: [], pages: 1 } }, "nothing changed");

  await x.send(B, ab, "one more");
  const aAfter = await a.sync(), bAfter = await b.sync();
  assert.deepEqual([aAfter.conversations.upserts, aAfter.messages.upserts], [1, 1], "A: its member row and the new message");
  assert.deepEqual([bAfter.conversations.upserts, bAfter.messages.upserts], [1, 1], "B: its member row and the new message");
  assert.equal(a.deviceConversations()[0]!.unreadCount, 2, "B wrote the last history message and this one");
  assert.deepEqual(await a.sync(), { conversations: { upserts: 0, deletes: 0, ids: [], pages: 1 }, messages: { upserts: 0, deletes: 0, ids: [], pages: 1 } });

  // A reads: only A's member row moves; B's phone hears nothing.
  const last = (await routes(x).messages(A, ab.conversationId)).items.at(-1);
  await x.h.service(A).markConversationRead({ conversationId: ab.conversationId, lastReadMessageId: last.messageId });
  const aRead = await a.sync(), bRead = await b.sync();
  assert.deepEqual([aRead.conversations.upserts, aRead.messages.upserts], [1, 0]);
  assert.deepEqual([bRead.conversations.upserts, bRead.messages.upserts], [0, 0]);
  assert.equal(a.deviceConversations()[0]!.unreadCount, 0);
});

test("first sync pages stay within SYNC_MAX_PAGE_BYTES: long messages split the history even at the largest page limit", options, async (t) => {
  const x = await host(t);
  const ab = await connect(x.h, A, B, "contact:long");
  const long = (index: number) => `${index}:` + "长".repeat(9990);
  for (let index = 1; index <= 40; index += 1) await x.send(A, ab, long(index));
  const a = phone(x, A, 200);
  const first = await a.sync();
  assert.equal(first.messages.upserts, 40);
  assert.ok(first.messages.pages >= 2, `about 1.2MB of history needs more than one page (${first.messages.pages})`);
  assert.deepEqual(a.history(ab.conversationId).map((item) => item.body), Array.from({ length: 40 }, (_, index) => long(index + 1)));
  // Paging back through the device copy walks the whole history without the network.
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let step = 0; step < 50; step += 1) {
    const page = relationshipLocalMessagePage(a.deviceConversations()[0]!, a.deviceMessages(), A.accountId, { limit: 30, cursor, asOf: NOW });
    seen.unshift(...page.items.map((item) => item.body));
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  assert.deepEqual(seen, Array.from({ length: 40 }, (_, index) => long(index + 1)), "older pages on the device reach the first message");
});

test("revocation: the conversation and all of its messages leave both phones on the next sync; the server keeps every row; a fresh phone never receives it", options, async (t) => {
  const x = await host(t);
  const ab = await connect(x.h, A, B, "contact:revoke");
  const ac = await connect(x.h, A, C, "contact:stays");
  for (let index = 1; index <= 12; index += 1) await x.send(index % 2 ? A : B, ab, `revoked ${index}`);
  await x.send(C, ac, "still here");
  const a = phone(x, A), b = phone(x, B);
  await a.sync(); await b.sync();
  assert.equal(a.messages.size, 13);
  assert.equal(b.messages.size, 12);

  await x.h.service(A).revokeContactBinding("contact:revoke");
  const aAfter = await a.sync(), bAfter = await b.sync();
  assert.deepEqual([aAfter.conversations.deletes, aAfter.conversations.ids], [1, [ab.conversationId]], "A's member row left: one delete");
  assert.deepEqual([bAfter.conversations.deletes, bAfter.conversations.ids], [1, [ab.conversationId]], "B's member row left: one delete");
  assert.deepEqual([...a.conversations.keys()], [ac.conversationId]);
  assert.equal(b.conversations.size, 0);
  assert.deepEqual([...a.messages.keys()].map((key) => key.startsWith(`${ac.conversationId}/`)), [true], "A keeps only the other conversation's message");
  assert.equal(b.messages.size, 0, "B's phone holds none of the revoked history");
  assert.deepEqual([aAfter.messages.upserts, bAfter.messages.upserts], [0, 0], "no message is sent for a conversation that left");
  // The server keeps everything (user decision: invisible to both sides, kept on the server).
  const kept = await x.h.client.query<{ status: string; left: string; messages: string }>(
    `select c.status, (select count(*) from relationship_conversation_members m where m.conversation_id = c.conversation_id and m.state = 'left')::text as left,
      (select count(*) from relationship_messages m where m.conversation_id = c.conversation_id)::text as messages
     from relationship_conversations c where c.workspace_id = $1 and c.conversation_id = $2`, [x.h.workspaceId, ab.conversationId]);
  assert.deepEqual(kept.rows[0], { status: "revoked", left: "2", messages: "12" });
  // A phone that starts from nothing never receives the revoked conversation (no tombstones on a first pull either).
  const fresh = phone(x, B);
  const freshSync = await fresh.sync();
  assert.deepEqual([freshSync.conversations.upserts, freshSync.conversations.deletes, freshSync.messages.upserts], [0, 0, 0]);
});

test("the device copy computes what the server returns: the conversation list, the unread total and the latest message page match the routes", options, async (t) => {
  const x = await host(t);
  const ab = await connect(x.h, A, B, "contact:parity-b");
  const ac = await connect(x.h, A, C, "contact:parity-c");
  for (let index = 1; index <= 34; index += 1) await x.send(index % 4 ? B : A, ab, `ab ${index} ${"字".repeat(index)}`);
  await x.send(C, ac, "from c");
  await x.send(C, ac, "from c again");
  const a = phone(x, A);
  await a.sync();
  const server = routes(x);
  const check = async () => {
    const summaries = await server.summaries(A);
    const local = relationshipLocalSummaryPage(a.deviceConversations(), A.accountId, { asOf: summaries.asOf });
    assert.deepEqual(local.items, summaries.items, "the list, its order, previews and unread counts");
    assert.equal(relationshipLocalUnreadTotal(a.deviceConversations()), (await server.unread(A)).unreadTotal, "the unread total");
    for (const conversation of a.deviceConversations()) {
      const remote = await server.messages(A, conversation.conversationId);
      const page = relationshipLocalMessagePage(conversation, a.deviceMessages(), A.accountId, { limit: 30, asOf: remote.asOf });
      assert.deepEqual(page.conversation, remote.conversation);
      assert.deepEqual(page.items, remote.items, "the latest 30 messages");
      assert.equal(page.hasMore, remote.hasMore);
    }
  };
  await check();
  const latest = (await server.messages(A, ab.conversationId)).items.at(-1);
  await x.h.service(A).markConversationRead({ conversationId: ab.conversationId, lastReadMessageId: latest.messageId });
  await x.send(C, ac, "third from c");
  await a.sync();
  await check();
  assert.equal(relationshipLocalUnreadTotal(a.deviceConversations()), 3);
});

test("manifest: an unchanged account gets a 304; a new message, a read and a revocation each move it", options, async (t) => {
  const x = await host(t);
  const ab = await connect(x.h, A, B, "contact:manifest");
  await x.send(A, ab, "first");
  const first = await manifest(x, B);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body!.domains.map((domain) => domain.domainId), [CONVERSATIONS, MESSAGES]);
  assert.equal((await manifest(x, B, first.etag!)).status, 304);
  await x.send(A, ab, "second");
  const moved = await manifest(x, B, first.etag!);
  assert.equal(moved.status, 200, "a new message moves B's manifest");
  assert.notEqual(moved.body!.domains[1]!.watermark, first.body!.domains[1]!.watermark);
  const cOnly = await manifest(x, C);
  await x.send(B, ab, "third");
  assert.equal((await manifest(x, C, cOnly.etag!)).status, 304, "another conversation's message does not move C's manifest");
  const beforeRead = await manifest(x, B);
  const latest = (await routes(x).messages(B, ab.conversationId)).items.at(-1);
  await x.h.service(B).markConversationRead({ conversationId: ab.conversationId, lastReadMessageId: latest.messageId });
  assert.equal((await manifest(x, B, beforeRead.etag!)).status, 200, "a read moves the reader's manifest");
  const beforeRevoke = await manifest(x, A);
  await x.h.service(A).revokeContactBinding("contact:manifest");
  assert.equal((await manifest(x, A, beforeRevoke.etag!)).status, 200, "a revocation moves the manifest");
});
