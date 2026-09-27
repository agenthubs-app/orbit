import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import {
  createRelationshipInboxGetHandler,
  createRelationshipInboxPostHandler,
} from "../../app/api/chat/relationship-inbox/handler";
import {
  createConversationDraftGetHandler,
  createConversationDraftPutHandler,
  createConversationMessagesPostHandler,
} from "../../app/api/relationship-communication/handler";
import { createLiveAsyncRelationshipConversationService } from "../../features/chat/live-async-service";
import { createStorageAsyncRelationshipConversationProvider } from "../../features/chat/storage/async-relationship-conversation-live-record-provider";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createReadCostLedger } from "../performance/read-cost-ledger";

/**
 * Sprint 0104 (legacy chat retirement, message plan M1) against a real
 * PostgreSQL schema. Reply drafts live on new-system relationship conversations;
 * staged draft threads no longer read the legacy `conversations`/`messages`
 * collections. The route handlers, services and the Postgres record store run
 * for real; the store is wrapped only to record which collections are read.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `relationship_drafts_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:relationship-drafts:${schema}`;
const A = { id: "account:draft-a", accountId: "account:draft-a", name: "Draft A", email: "draft-a@example.test", workspaceId };
const B = { id: "account:draft-b", accountId: "account:draft-b", name: "Draft B", email: "draft-b@example.test", workspaceId };
const C = { id: "account:draft-c", accountId: "account:draft-c", name: "Draft C", email: "draft-c@example.test", workspaceId };
const LEGACY = new Set(["messages", "conversations"]);

const envKeys = ["ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE"] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let admin: Pool;
let client: TransactionalPostgresClient;
let store: LiveRecordStoreLike<Record<string, unknown>>;
const ledger = createReadCostLedger();
const reads: { method: string; collectionName: string; limit?: unknown }[] = [];
let conversationId = "";

function recorded(inner: LiveRecordStoreLike<Record<string, unknown>>): LiveRecordStoreLike<Record<string, unknown>> {
  return new Proxy(inner, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      if (property === "listRecords" || property === "getRecord") {
        return (query: { collectionName?: string; limit?: unknown }) => {
          reads.push({ method: String(property), collectionName: query.collectionName ?? "*", limit: query.limit });
          return value.call(target, query);
        };
      }
      return value.bind(target);
    },
  });
}

function serviceFor(actor: typeof A, now?: () => string) {
  return createRelationshipCommunicationService({
    actor: { accountId: actor.id, displayName: actor.name, email: actor.email },
    ...(now ? { now } : {}),
    invitationBaseUrl: "https://orbit.example/app/invitations",
    randomToken: () => `token-${randomUUID()}`,
    resolveContact: async (contactId, accountId) =>
      contactId === "contact:draft-b" && accountId === A.id
        ? { contactId, displayName: B.name, organization: "Orbit QA", recipientEmail: B.email }
        : null,
    store,
    workspaceId,
  });
}

function draftRequest(method: "GET" | "PUT", id: string, body?: unknown): Request {
  return new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(id)}/draft`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });
}

async function draftCall(actor: typeof A, method: "GET" | "PUT", id: string, body?: unknown) {
  const handler = method === "GET"
    ? createConversationDraftGetHandler({ createService: () => serviceFor(actor), resolveActor: async () => actor })
    : createConversationDraftPutHandler({ createService: () => serviceFor(actor), resolveActor: async () => actor });
  const response = await handler(draftRequest(method, id, body), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() as { success: boolean; data?: { body: string; conversationId: string; updatedAt: string | null }; error?: { code: string } } };
}

function legacyRecord(collectionName: string, recordId: string, payload: Record<string, unknown>): LiveRecord<Record<string, unknown>> {
  const at = "2026-09-20T00:00:00.000Z";
  return {
    collectionName, createdAt: at, evidenceIds: [], lifecycleState: "active", occurredAt: at, payload,
    provider: "legacy-chat-fixture", providerRecordId: recordId, recordId, searchText: "", sourceId: recordId,
    sourceLabel: "legacy chat fixture", sourceType: "manual", updatedAt: at, userId: A.id, workspaceId,
  };
}

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  Object.assign(process.env, { ORBIT_FEATURE_MODE: "live", ORBIT_MODULE_MODE: "live" });
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool, readMetrics: ledger.observer });
  await runOrbitRecordsMigration(client);
  store = recorded(createPostgresLiveRecordStore<Record<string, unknown>>({ client }));
  // Legacy chat rows owned by A: they must never be read or surfaced again.
  await store.upsertRecord(legacyRecord("conversations", "legacy-conversation-1", { id: "legacy-conversation-1", participantContactIds: ["contact:draft-b"], actorId: A.id, subject: "旧对话" }));
  await store.upsertRecord(legacyRecord("messages", "legacy-message-1", { id: "legacy-message-1", conversationId: "legacy-conversation-1", body: "旧消息", occurredAt: "2026-09-20T00:00:00.000Z", direction: "inbound" }));
  await store.upsertRecord(legacyRecord("connections", "legacy-connection-1", { id: "legacy-connection-1", contactId: "contact:draft-b", actorId: A.id }));
  await store.upsertRecord(legacyRecord("contacts", "contact:draft-b", { id: "contact:draft-b", displayName: B.name, organization: "Orbit QA" }));
  const invitation = await serviceFor(A).createInvitation({ contactId: "contact:draft-b", recipientEmail: B.email, recipientName: B.name });
  const eligibility = await serviceFor(B).acceptInvitation({ confirmed: true, token: invitation.token });
  conversationId = eligibility.conversationId!;
  assert.ok(conversationId);
}, { timeout: 120_000 });

after(async () => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

// SC-0104-01: reply draft on a new-system conversation — save, read back, isolation.
test("a participant saves a reply draft on a relationship conversation and reads it back; the other participant keeps a separate draft", { skip, timeout: 60_000 }, async () => {
  reads.length = 0;
  const empty = await draftCall(A, "GET", conversationId);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, { body: "", conversationId, updatedAt: null });

  const saved = await draftCall(A, "PUT", conversationId, { body: "周四见面前确认议程" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data?.body, "周四见面前确认议程");
  assert.ok(saved.body.data?.updatedAt);

  const readBack = await draftCall(A, "GET", conversationId);
  assert.equal(readBack.body.data?.body, "周四见面前确认议程");

  const other = await draftCall(B, "GET", conversationId);
  assert.equal(other.status, 200);
  assert.equal(other.body.data?.body, "", "B must not see A's draft");
  await draftCall(B, "PUT", conversationId, { body: "B 的草稿" });
  assert.equal((await draftCall(A, "GET", conversationId)).body.data?.body, "周四见面前确认议程");
  assert.equal((await draftCall(B, "GET", conversationId)).body.data?.body, "B 的草稿");

  const cleared = await draftCall(A, "PUT", conversationId, { body: "" });
  assert.equal(cleared.status, 200);
  assert.equal((await draftCall(A, "GET", conversationId)).body.data?.body, "");

  assert.deepEqual(reads.filter((read) => LEGACY.has(read.collectionName)), []);
  assert.deepEqual(reads.filter((read) => read.method === "listRecords"), [], "draft routes use point reads only");
});

test("a non-participant and an unknown conversation get 404 and nothing is written", { skip, timeout: 60_000 }, async () => {
  const outsiderRead = await draftCall(C, "GET", conversationId);
  assert.equal(outsiderRead.status, 404);
  const outsiderWrite = await draftCall(C, "PUT", conversationId, { body: "偷写" });
  assert.equal(outsiderWrite.status, 404);
  const unknown = await draftCall(A, "PUT", "relationship-conversation:does-not-exist", { body: "x" });
  assert.equal(unknown.status, 404);
  const rows = await client.query<{ n: string }>(
    "select count(*)::text as n from orbit_records where collection_name='relationshipConversationDrafts' and (user_id=$1 or payload::text like '%偷写%' or payload->>'conversationId'='relationship-conversation:does-not-exist')",
    [C.id],
  );
  assert.equal(rows.rows[0]?.n, "0");
});

test("an oversized or non-string draft body is rejected", { skip, timeout: 60_000 }, async () => {
  assert.equal((await draftCall(A, "PUT", conversationId, { body: "x".repeat(10_001) })).status, 400);
  assert.equal((await draftCall(A, "PUT", conversationId, { body: 42 })).status, 400);
});

// Sprint 0122 (Codex 104-C): the delivery itself retires the sender's reply
// draft, so a failed follow-up clear can no longer bring the sent text back as a
// draft. Only drafts saved up to the send are retired; newer text survives replays.
test("a delivered reply retires the sender's draft saved before it, keeps the other participant's draft, and never erases text saved after the send", { skip, timeout: 60_000 }, async () => {
  const at = (iso: string) => () => iso;
  const send = (actor: typeof A, now: () => string, payload: Record<string, unknown>) =>
    createConversationMessagesPostHandler({ createService: () => serviceFor(actor, now), resolveActor: async () => actor })(
      new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(conversationId)}/messages`, {
        body: JSON.stringify(payload), headers: { "content-type": "application/json" }, method: "POST",
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
  const version = (await serviceFor(A).getConversation(conversationId)).qualificationVersion;
  await draftCall(A, "PUT", conversationId, { body: "要发出去的回复" });
  await draftCall(B, "PUT", conversationId, { body: "B 还没发的草稿" });

  const stale = await send(A, at("2026-09-27T01:00:00.000Z"), { body: "要发出去的回复", qualificationVersion: "stale", requestId: "draft-send-stale" });
  assert.notEqual(stale.status, 201);
  assert.equal((await draftCall(A, "GET", conversationId)).body.data?.body, "要发出去的回复", "a rejected send keeps the draft");

  const sent = await send(A, at("2099-01-01T00:00:00.000Z"), { body: "要发出去的回复", qualificationVersion: version, requestId: "draft-send-1" });
  assert.equal(sent.status, 201);
  assert.deepEqual((await draftCall(A, "GET", conversationId)).body.data?.body, "", "the sent text does not come back as a draft");
  assert.equal((await draftCall(B, "GET", conversationId)).body.data?.body, "B 还没发的草稿");

  // Written after the delivery (e.g. on another device); a retried request must not erase it.
  const later = await createConversationDraftPutHandler({ createService: () => serviceFor(A, at("2099-01-01T00:05:00.000Z")), resolveActor: async () => A })(
    draftRequest("PUT", conversationId, { body: "发送之后新写的" }), { params: Promise.resolve({ id: conversationId }) });
  assert.equal(later.status, 200);
  const replay = await send(A, at("2099-01-01T00:06:00.000Z"), { body: "要发出去的回复", qualificationVersion: version, requestId: "draft-send-1" });
  assert.equal(replay.status, 201);
  assert.equal((await draftCall(A, "GET", conversationId)).body.data?.body, "发送之后新写的");
  await draftCall(A, "PUT", conversationId, { body: "" });
  await draftCall(B, "PUT", conversationId, { body: "" });
});

test("after the binding is revoked the draft is no longer reachable", { skip, timeout: 60_000 }, async () => {
  await draftCall(A, "PUT", conversationId, { body: "撤销前的草稿" });
  await serviceFor(A).revokeContactBinding("contact:draft-b");
  assert.equal((await draftCall(A, "GET", conversationId)).status, 404);
  assert.equal((await draftCall(A, "PUT", conversationId, { body: "撤销后" })).status, 404);
});

// SC-0104-01: staged draft threads (new-conversation drafts) no longer read legacy chat.
test("staged draft threads save and list without reading legacy conversations or messages, and stay account-scoped", { skip, timeout: 60_000 }, async () => {
  const serviceFactory = () => createLiveAsyncRelationshipConversationService({
    provider: createStorageAsyncRelationshipConversationProvider({ store, workspaceId }),
  });
  const post = createRelationshipInboxPostHandler(async () => A, serviceFactory);
  const created = await post(new Request("https://orbit.example/api/chat/relationship-inbox", {
    body: JSON.stringify({ contactId: "contact:draft-b", requestId: "request-draft-1", participantName: B.name, organization: "Orbit QA", subject: "会面安排", body: "想约周四见面" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  assert.equal(created.status, 200);

  reads.length = 0;
  const { result: listed } = await ledger.measure("staged-drafts", async () => {
    const get = createRelationshipInboxGetHandler(async () => A, serviceFactory);
    const response = await get(new Request("https://orbit.example/api/chat/relationship-inbox"));
    return { status: response.status, body: await response.json() as { data: { inbox: { conversations: { conversationId: string; subject: string }[] } } } };
  });
  assert.equal(listed.status, 200);
  const subjects = listed.body.data.inbox.conversations.map((item) => item.subject);
  assert.deepEqual(subjects, ["会面安排"], "only A's staged draft, never the legacy thread");
  assert.deepEqual(reads.filter((read) => LEGACY.has(read.collectionName)), []);
  assert.deepEqual(reads.filter((read) => read.limit === "unbounded"), []);

  const getB = createRelationshipInboxGetHandler(async () => B, serviceFactory);
  const other = await (await getB(new Request("https://orbit.example/api/chat/relationship-inbox"))).json() as { data: { inbox?: { conversations: unknown[] }; state: string } };
  assert.deepEqual(other.data.inbox?.conversations ?? [], [], "B does not see A's staged draft");
});
