import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";

import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import type { InboxNotificationUpsert } from "../../features/notifications/inbox-record-service";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { createStorageOrbitAgentChatSessionProvider, orbitAgentChatSessionActorWorkspaceId } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createTransactionalOrbitAgentChatOrganizationStore } from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { acquireSyncCommitOrderLock, isSyncCollection } from "../../features/sync/commit-order-lock";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import {
  AI_SESSION_MESSAGE_DEVICE_WINDOW,
  AI_SESSION_SYNC_DOMAINS,
  findSyncDomain,
  INBOX_SYNC_DOMAINS,
  ownerGuardedCollections,
  personalSubspaceCollections,
  SYNC_DOMAINS,
} from "../../features/sync/domain-registry";
import { reconcileInboxSourceStates } from "../../features/sync/inbox-domain-reader";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../shared/api-schema/universal-read";
import { inboxUnreadCount, localInboxList, type InboxDeviceNotification } from "../../shared/compute/inbox-local";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0118 (offline 3a = AI B3): the typed inbox and the AI sessions are
// sync domains. This local Postgres plays the server holding accounts A and B;
// every device pull goes through the real sync route handlers, and the inbox's
// read-time source check is the production one (createInboxRuntime). A device
// is a Map of the rows it was sent, following its cursor like the App.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 180_000 };
const W = "workspace:inbox-ai-sync";
const A = "actor:sync-a";
const B = "actor:sync-b";
const SECRET = "inbox-ai-sync-secret-0123456789abcdef0123456789abcdef";
const NOW = "2026-09-28T09:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const INBOX = "inbox-notifications";
const SESSIONS = "ai-sessions";
const MESSAGES = "ai-session-messages";

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `inbox_ai_sync_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  const identity = async (actor: string, state: "active" | "deleted") => store.upsertRecord({
    workspaceId: W, collectionName: "accounts", recordId: actor, userId: actor, sourceType: "manual", sourceId: actor, evidenceIds: [],
    lifecycleState: state, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: new Date(Date.now()).toISOString(), payload: { id: actor },
  });
  for (const actor of [A, B]) await identity(actor, "active");
  const inbox = createInboxRuntime({ client, workspaceId: W, now: () => NOW });
  const reconcileCalls: string[] = [];
  const service = createDomainReadService({
    client, cursorSecret: SECRET, now: () => NOW, domains: [...INBOX_SYNC_DOMAINS, ...AI_SESSION_SYNC_DOMAINS],
    inboxReconciler: async ({ actorId, workspaceId }) => {
      reconcileCalls.push(actorId);
      return reconcileInboxSourceStates({ client, workspaceId, actorId, access: inbox.sourceAccessBatch });
    },
  });
  const handlersFor = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => NOW_MS,
    conditionalRead: { client, workspaceId: W, version: "test" },
  });
  const contact = (id: string, version: number, actor = A) => store.upsertRecord({
    workspaceId: W, collectionName: "contacts", recordId: id, userId: actor, sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState: "active",
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", payload: { id, displayName: `Name ${id}`, version },
  });
  const providers = new Map<string, ReturnType<typeof createStorageOrbitAgentChatSessionProvider>>();
  const ai = (actor: string) => {
    if (!providers.has(actor)) providers.set(actor, createStorageOrbitAgentChatSessionProvider({ actorId: actor, store, workspaceId: W, summaryPageClient: client, summaryPageSecret: SECRET, transactionClient: client }));
    return providers.get(actor)!;
  };
  const organizations = (actor: string) => createTransactionalOrbitAgentChatOrganizationStore({ actorId: actor, client, workspaceId: W, now: () => NOW });
  return { client, store, identity, inbox, handlersFor, contact, ai, organizations, reconcileCalls };
}

type Host = Awaited<ReturnType<typeof host>>;

function notification(actor: string, key: string, fields: Partial<InboxNotificationUpsert> = {}): InboxNotificationUpsert {
  const copy = { zh: { title: `提醒 ${key}`, reason: `原因 ${key}` }, en: { title: `Note ${key}`, reason: `Reason ${key}` }, ja: { title: `通知 ${key}`, reason: `理由 ${key}` } };
  return {
    actorId: actor, semanticKey: `test:${key}`, kind: "suggestion", origin: "automation", ...copy.zh, copy, object: { id: `contact:${key}`, name: `secret-object-${key}` },
    sources: [{ sourceKind: "contact", sourceId: `contact:${key}`, sourceRevision: "1", occurredAt: "2026-09-27T00:00:00.000Z", readAt: "2026-09-27T00:00:00.000Z", excerpt: `secret-excerpt-${key}` }],
    target: { kind: "source", id: `contact:${key}`, href: `/contacts/contact:${key}`, status: "available" }, actions: ["read", "dismiss", "accept"],
    occurredAt: "2026-09-27T08:00:00.000Z", ...fields,
  };
}

/** A device's copy of one domain, following its cursor through the real route handler (resets on 409 like the App). */
function device(h: Host, actor: string, domainId: string, partitions?: () => readonly string[]) {
  const rows = new Map<string, Record<string, unknown>>();
  let cursor: string | undefined;
  return {
    rows,
    async pull(): Promise<{ upserts: number; deletes: number; ids: string[]; pages: number }> {
      let upserts = 0, deletes = 0, pages = 0;
      const ids: string[] = [];
      for (let page = 0; page < 80; page += 1) {
        const sessions = partitions?.();
        const response = await h.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${domainId}?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${sessions ? `&sessions=${sessions.map(encodeURIComponent).join(",")}` : ""}`), domainId);
        if (response.status === 409) { rows.clear(); cursor = undefined; continue; }
        assert.equal(response.status, 200, await response.clone().text());
        pages += 1;
        const data = domainPageSchema.parse(((await response.json()) as { data: unknown }).data);
        for (const change of data.changes) {
          ids.push(change.id);
          if (change.operation === "upsert") { rows.set(change.id, change.payload as Record<string, unknown>); upserts += 1; }
          else { rows.delete(change.id); deletes += 1; }
        }
        cursor = data.nextCursor;
        if (!data.hasMore) return { upserts, deletes, ids, pages };
      }
      throw new Error("pagination did not terminate");
    },
    inbox(): InboxDeviceNotification[] { return [...rows.values()] as unknown as InboxDeviceNotification[]; },
  };
}

async function manifest(h: Host, actor: string, etag?: string) {
  const response = await h.handlersFor(actor).manifest(new Request("https://orbit.local/api/sync/manifest", etag ? { headers: { "If-None-Match": etag } } : {}));
  return { status: response.status, etag: response.headers.get("ETag"), body: response.status === 200 ? domainManifestSchema.parse(((await response.json()) as { data: unknown }).data) : null };
}

const turn = (id: string, role: "user" | "assistant", text: string) => ({ id, role, text });
async function session(h: Host, actor: string, id: string, messages: number, at = "2026-09-27T01:00:00.000Z") {
  for (let index = 0; index < messages; index += 2) {
    await h.ai(actor).appendMessages(id, {
      create: { createdAt: at, title: `Session ${id}` },
      messages: [turn(`${id}:${at}:q${index}`, "user", `question ${index} of ${id}`), turn(`${id}:${at}:a${index}`, "assistant", `answer ${index} of ${id}`)].slice(0, Math.min(2, messages - index)) as never,
      updatedAt: new Date(Date.parse(at) + index * 1000).toISOString(),
    });
  }
}

test("registry: the inbox and the AI sessions are leased device domains; their collections are owner guarded and take the commit-order lock", options, async (t) => {
  for (const domainId of [INBOX, SESSIONS, MESSAGES]) assert.equal(findSyncDomain(domainId, SYNC_DOMAINS)?.exposure, "device", domainId);
  assert.equal(findSyncDomain(INBOX)!.source.kind, "inbox_records");
  assert.deepEqual(findSyncDomain(SESSIONS)!.ownership.rule, "personal_subspace");
  for (const collection of ["inboxNotifications", "orbit_agent_chat_session_organizations"]) assert.ok(ownerGuardedCollections().includes(collection), `${collection} owner guarded`);
  assert.deepEqual(personalSubspaceCollections(), ["orbit_agent_chat_messages", "orbit_agent_chat_sessions"]);
  for (const collection of ["inboxNotifications", "orbit_agent_chat_sessions", "orbit_agent_chat_messages", "orbit_agent_chat_session_organizations"]) assert.ok(isSyncCollection(collection), `${collection} takes the lock`);
  const h = await host(t);
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants.map((grant) => grant.domainId), [INBOX, SESSIONS, MESSAGES]);

  // Database guard: an AI row cannot move to another workspace, an inbox row cannot change owner.
  await session(h, A, "s-guard", 2);
  const subspace = orbitAgentChatSessionActorWorkspaceId(W, A);
  const other = orbitAgentChatSessionActorWorkspaceId(W, B);
  // Even a writer that holds the commit-order lock (a batch script) cannot move them.
  const locked = (sql: string, values: unknown[]) => h.client.transaction(async (tx) => { await acquireSyncCommitOrderLock(tx); await tx.query(sql, values); });
  await assert.rejects(locked(`update orbit_records set workspace_id = $1 where workspace_id = $2 and collection_name = 'orbit_agent_chat_sessions'`, [other, subspace]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await assert.rejects(locked(`update orbit_records set collection_name = 'agentPreferences' where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages'`, [subspace]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await h.contact("contact:guard", 1);
  const saved = await h.inbox.service.upsert(notification(A, "guard"));
  await assert.rejects(locked(`update orbit_records set user_id = $1 where record_id = $2 and collection_name = 'inboxNotifications'`, [B, saved.id]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  await h.organizations(A).mutateSessionOrganization("s-guard", { expectedRevision: 0, mutationId: "guard-pin", patch: { pinned: true } });
  await assert.rejects(locked(`update orbit_records set user_id = $1 where workspace_id = $2 and collection_name = 'orbit_agent_chat_session_organizations'`, [B, W]), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  // An ordinary write that keeps the owner passes (a payload edit under the lock).
  await locked(`update orbit_records set payload = payload where workspace_id = $1 and collection_name = 'orbit_agent_chat_sessions'`, [subspace]);
  // Commit order: an unlocked raw write to any of the four collections is refused (each holds a row by now).
  for (const [workspace, collection] of [[W, "inboxNotifications"], [subspace, "orbit_agent_chat_sessions"], [subspace, "orbit_agent_chat_messages"], [W, "orbit_agent_chat_session_organizations"]] as const) {
    const present = await h.client.query<{ n: string }>(`select count(*)::text as n from orbit_records where workspace_id = $1 and collection_name = $2`, [workspace, collection]);
    assert.ok(Number(present.rows[0]!.n) > 0, `${collection} has a row to update`);
    await assert.rejects(h.client.query(`update orbit_records set payload = payload where workspace_id = $1 and collection_name = $2`, [workspace, collection]), /SYNC_WRITE_LOCK_REQUIRED/, collection);
  }
});

test("inbox isolation, incremental pull and deletes: A's device holds only A's notifications, without owner ids; one new notification is one row", options, async (t) => {
  const h = await host(t);
  for (const key of ["a1", "a2", "a3"]) { await h.contact(`contact:${key}`, 1); await h.inbox.service.upsert(notification(A, key)); }
  await h.contact("contact:b1", 1, B);
  await h.inbox.service.upsert(notification(B, "b1", { title: "secret-b-title" }));
  const a = device(h, A, INBOX);
  const first = await a.pull();
  assert.equal(first.upserts, 3);
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [], pages: 1 }, "nothing changed");
  const text = JSON.stringify([...a.rows.values()]);
  assert.ok(!text.includes("secret-b") && !text.includes("b1"), "B's notification never reaches A");
  assert.ok(!text.includes(A), "no owner id leaves the server");
  for (const row of a.rows.values()) {
    assert.ok(Object.keys(row).every((key) => (INBOX_SYNC_DOMAINS[0]!.fields as readonly string[]).includes(key)), JSON.stringify(Object.keys(row)));
    assert.equal(row.sourceState, "available");
  }
  const b = device(h, B, INBOX);
  await b.pull();
  assert.deepEqual([...b.rows.values()].map((row) => row.semanticKey), ["test:b1"]);

  await h.contact("contact:a4", 1);
  const fourth = await h.inbox.service.upsert(notification(A, "a4"));
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: [fourth.id], pages: 1 }, "one new notification, one row");
  // Mark read online: the reader's own change comes back as one row with readAt.
  await h.inbox.service.action(A, fourth.id, { action: "read", expectedRevision: 1, idempotencyKey: "read-a4" });
  const read = await a.pull();
  assert.deepEqual(read.ids, [fourth.id]);
  assert.ok(a.rows.get(fourth.id)!.readAt);
  // A notification row that is archived or deleted leaves the device.
  await h.store.deleteRecord({ workspaceId: W, collectionName: "inboxNotifications", recordId: fourth.id, deletedAt: NOW });
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 1, ids: [fourth.id], pages: 1 });
  assert.equal(a.rows.has(fourth.id), false);
  // Revocation: A's authorization goes; the domain answers 403 and the lease grants nothing.
  await h.identity(A, "deleted");
  const denied = await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${INBOX}?limit=7`), INBOX);
  assert.equal(denied.status, 403);
});

test("invalidation: when a notification's source goes away the next sync sends it without content, and the device list and unread count follow", options, async (t) => {
  const h = await host(t);
  for (const key of ["keep", "gone", "edited"]) { await h.contact(`contact:${key}`, 1); await h.inbox.service.upsert(notification(A, key)); }
  const a = device(h, A, INBOX);
  const first = await manifest(h, A);
  await a.pull();
  assert.equal(inboxUnreadCount(a.inbox(), NOW_MS), 3);
  assert.equal((await manifest(h, A, first.etag!)).status, 304, "nothing moved");

  // The cited contact is deleted, another is edited (its version moves): read-time decisions change, the rows do not.
  await h.store.deleteRecord({ workspaceId: W, collectionName: "contacts", recordId: "contact:gone", deletedAt: NOW });
  await h.contact("contact:edited", 2);
  const next = await manifest(h, A, first.etag!);
  assert.equal(next.status, 200, "the manifest runs the source check first and sees its write-back");
  assert.ok(h.reconcileCalls.includes(A));
  const pulled = await a.pull();
  assert.equal(pulled.upserts, 2, "the two notifications whose decision changed, and only them");
  const byKey = new Map(a.inbox().map((row) => [row.semanticKey, row]));
  const gone = byKey.get("test:gone")!;
  assert.equal(gone.sourceState, "unavailable");
  assert.equal(gone.title, "来源已不可用");
  assert.equal(gone.copy, undefined);
  assert.equal(gone.object, undefined);
  assert.equal(gone.target.href, null);
  assert.deepEqual(gone.actions, []);
  assert.ok(!JSON.stringify(gone).includes("secret-excerpt") && !JSON.stringify(gone).includes("secret-object"), "the invalidated content leaves the device");
  assert.equal(byKey.get("test:edited")!.sourceState, "changed");
  assert.equal(byKey.get("test:keep")!.sourceState, "available");

  // The device's list and count equal the server's, in every language and in history.
  const server = await h.inbox.service.list(A, { limit: 50, language: "en" });
  const local = localInboxList(a.inbox(), { filter: "all", language: "en", nowMs: NOW_MS });
  assert.deepEqual(local.map((row) => [row.id, row.title, row.target.status]), server.items.map((row) => [row.id, row.title, row.target.status]));
  const history = await h.inbox.service.list(A, { limit: 50, history: true, language: "ja" });
  assert.deepEqual(localInboxList(a.inbox(), { filter: "history", language: "ja", nowMs: NOW_MS }).map((row) => [row.id, row.title]), history.items.map((row) => [row.id, row.title]));
  assert.equal(inboxUnreadCount(a.inbox(), NOW_MS), await h.inbox.service.unreadCount(A));
  assert.equal(inboxUnreadCount(a.inbox(), NOW_MS), 1);

  // Stable afterwards; and a restored source brings the content back.
  // The manifest's ETag already covered its own write-back: nothing moves now.
  assert.equal((await manifest(h, A, next.etag!)).status, 304);
  assert.deepEqual((await a.pull()).upserts, 0);
  await h.contact("contact:gone", 1);
  await manifest(h, A);
  assert.equal((await a.pull()).upserts, 1);
  assert.equal(a.inbox().find((row) => row.semanticKey === "test:gone")!.sourceState, "available");
  assert.equal(inboxUnreadCount(a.inbox(), NOW_MS), await h.inbox.service.unreadCount(A));
});

test("unread parity: the device count equals the server count across read, dismissed, expired, scheduled, old and reminder notifications", options, async (t) => {
  const h = await host(t);
  const cases: [string, Partial<InboxNotificationUpsert>][] = [
    ["plain", {}],
    ["expired", { expiresAt: "2026-09-28T08:00:00.000Z" }],
    ["future-expiry", { expiresAt: "2026-10-28T08:00:00.000Z" }],
    ["scheduled-later", { scheduledFor: "2026-09-29T00:00:00.000Z" }],
    ["scheduled-past", { scheduledFor: "2026-09-27T00:00:00.000Z" }],
    ["old", { occurredAt: "2026-08-01T00:00:00.000Z" }],
    ["old-reminder", { kind: "reminder", occurredAt: "2026-08-01T00:00:00.000Z", dueAt: "2026-08-01T00:00:00.000Z" }],
    ["to-read", {}],
    ["to-dismiss", {}],
  ];
  for (const [key, fields] of cases) { await h.contact(`contact:${key}`, 1); await h.inbox.service.upsert(notification(A, key, fields)); }
  const stored = await h.inbox.service.list(A, { limit: 50, history: true });
  const id = (key: string) => stored.items.find((row) => row.semanticKey === `test:${key}`)!.id;
  await h.inbox.service.action(A, id("to-read"), { action: "read", expectedRevision: 1, idempotencyKey: "r" });
  await h.inbox.service.action(A, id("to-dismiss"), { action: "dismiss", expectedRevision: 1, idempotencyKey: "d" });
  const a = device(h, A, INBOX);
  await a.pull();
  const serverCount = await h.inbox.service.unreadCount(A);
  assert.equal(inboxUnreadCount(a.inbox(), NOW_MS), serverCount);
  assert.equal(serverCount, 4, "plain, future-expiry, scheduled-past, old-reminder");
  for (const filter of ["all", "history", "suggestion", "reminder"] as const) {
    const server = await h.inbox.service.list(A, { limit: 50, language: "zh", ...(filter === "history" ? { history: true } : filter === "all" ? {} : { kind: filter }) });
    assert.deepEqual(localInboxList(a.inbox(), { filter, language: "zh", nowMs: NOW_MS }).map((row) => [row.id, row.disposition, row.actions.join()]), server.items.map((row) => [row.id, row.disposition, row.actions.join()]), filter);
  }
});

test("AI sessions: A's list holds only A's sessions; renaming or pinning resends one row; a deleted session leaves the list", options, async (t) => {
  const h = await host(t);
  await session(h, A, "s-a1", 2);
  await session(h, A, "s-a2", 4, "2026-09-27T02:00:00.000Z");
  await session(h, B, "s-b1", 2);
  const a = device(h, A, SESSIONS);
  assert.equal((await a.pull()).upserts, 2);
  assert.deepEqual([...a.rows.keys()].sort(), ["s-a1", "s-a2"]);
  assert.ok(!JSON.stringify([...a.rows.values()]).includes("s-b1"));
  assert.deepEqual(a.rows.get("s-a2"), {
    id: "s-a2", title: "Session s-a2", firstUserText: "question 0 of s-a2", lastMessagePreview: "answer 2 of s-a2",
    createdAt: "2026-09-27T02:00:00.000Z", updatedAt: "2026-09-27T02:00:02.000Z", messageCount: 4, messageRevision: 4,
    organization: { customTitle: null, groupId: null, pinned: false, revision: 0 },
  });
  // The server's own list page reads the same.
  const serverPage = await h.ai(A).listSessionSummariesPage({ limit: 20 });
  for (const item of serverPage.items) assert.deepEqual({ ...a.rows.get(item.id), messageCount: undefined }, { ...item, messageCount: undefined });
  assert.equal((await a.pull()).upserts, 0);

  await h.organizations(A).mutateSessionOrganization("s-a1", { expectedRevision: 0, mutationId: "pin-1", patch: { pinned: true, customTitle: "Pinned one" } });
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["s-a1"], pages: 1 }, "an organization change resends that session");
  assert.deepEqual(a.rows.get("s-a1")!.organization, { customTitle: "Pinned one", groupId: null, pinned: true, revision: 1 });
  await session(h, A, "s-a1", 2, "2026-09-27T03:00:00.000Z");
  assert.deepEqual((await a.pull()).ids, ["s-a1"], "a new turn resends the session summary");
  await h.ai(A).deleteSession("s-a2");
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 1, ids: ["s-a2"], pages: 1 });
  // B's organization change never moves A's list.
  await h.organizations(B).mutateSessionOrganization("s-b1", { expectedRevision: 0, mutationId: "pin-b", patch: { pinned: true } });
  assert.equal((await a.pull()).upserts, 0);
});

test("AI messages: only opened sessions are sent, a newly opened one from its latest window, then only new messages; another actor's ids name nothing", options, async (t) => {
  const h = await host(t);
  await session(h, A, "s-long", 120);
  await session(h, A, "s-short", 6, "2026-09-27T02:00:00.000Z");
  await session(h, A, "s-never", 8, "2026-09-27T03:00:00.000Z");
  await session(h, B, "s-b", 6);
  // Read metering: every messages page statement is recorded with the rows it returned.
  const reads: { sessions: string[]; rows: number }[] = [];
  const original = h.client.query.bind(h.client);
  (h.client as { query: LiveRecordSqlClient["query"] }).query = (async (text: string, values?: readonly unknown[]) => {
    const result = await original(text, values as unknown[]);
    if (text.includes("sync:ai-session-messages:page")) reads.push({ sessions: [...(values![1] as string[])], rows: result.rows.length });
    return result;
  }) as LiveRecordSqlClient["query"];
  let opened: string[] = ["s-short"];
  const a = device(h, A, MESSAGES, () => opened);
  const first = await a.pull();
  assert.equal(first.upserts, 6, "the opened short session, whole");
  assert.ok([...a.rows.values()].every((row) => row.sessionId === "s-short"));
  assert.ok(reads.every((read) => read.sessions.join() === "s-short"), "no statement reads a session the device did not open");
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [], pages: 1 });

  // Opening the long session: its latest window only, not its 120 messages.
  reads.length = 0;
  opened = ["s-short", "s-long"];
  const caught = await a.pull();
  assert.equal(caught.upserts, AI_SESSION_MESSAGE_DEVICE_WINDOW);
  const longIndexes = [...a.rows.values()].filter((row) => row.sessionId === "s-long").map((row) => row.index as number).sort((x, y) => x - y);
  assert.deepEqual([longIndexes[0], longIndexes.at(-1)], [120 - AI_SESSION_MESSAGE_DEVICE_WINDOW, 119], "the latest window, oldest to newest");
  assert.ok(reads.every((read) => !read.sessions.includes("s-never")), "the never-opened session is never read");
  // Rows read are the window plus each page's one look-ahead row.
  assert.ok(reads.reduce((total, read) => total + read.rows, 0) <= AI_SESSION_MESSAGE_DEVICE_WINDOW + reads.length, "rows read: the window and one look-ahead row per page");
  assert.deepEqual((await a.pull()).upserts, 0, "then nothing");

  // A new turn in an opened session is two rows; one in a closed session is none.
  await session(h, A, "s-long", 2, "2026-09-28T01:00:00.000Z");
  await session(h, A, "s-never", 2, "2026-09-28T01:00:00.000Z");
  const turnPull = await a.pull();
  assert.equal(turnPull.upserts, 2);
  assert.ok(turnPull.ids.every((id) => a.rows.get(id)!.sessionId === "s-long"));

  // B's session id named by A's device reads nothing (the statement is bound to A's sub-workspace).
  opened = ["s-short", "s-long", "s-b"];
  assert.equal((await a.pull()).upserts, 0);
  assert.ok(![...a.rows.values()].some((row) => row.sessionId === "s-b"));

  // Deleting an opened session tombstones its messages on the device.
  opened = ["s-short", "s-long"];
  await h.ai(A).deleteSession("s-short");
  const deleted = await a.pull();
  assert.equal(deleted.deletes, 6);
  assert.ok(![...a.rows.values()].some((row) => row.sessionId === "s-short"));

  // More than the limit of opened sessions is refused, not truncated.
  const tooMany = await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${MESSAGES}?sessions=${Array.from({ length: 21 }, (_, index) => `s${index}`).join(",")}`), MESSAGES);
  assert.equal(tooMany.status, 503);
  const unpartitioned = await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${INBOX}?sessions=s-long`), INBOX);
  assert.equal(unpartitioned.status, 503, "only the messages domain takes partitions");
});

test("manifest: the new domains' watermarks move with their writes, and B's writes keep A at 304", options, async (t) => {
  const h = await host(t);
  await session(h, A, "s-a", 2);
  await h.contact("contact:m1", 1);
  await h.inbox.service.upsert(notification(A, "m1"));
  const first = await manifest(h, A);
  assert.deepEqual(first.body!.domains.map((entry) => entry.domainId), [INBOX, SESSIONS, MESSAGES]);
  assert.equal((await manifest(h, A, first.etag!)).status, 304);
  await session(h, B, "s-b", 2);
  await h.contact("contact:b", 1, B);
  await h.inbox.service.upsert(notification(B, "b"));
  assert.equal((await manifest(h, A, first.etag!)).status, 304, "B's sessions and inbox are not A's");
  await session(h, A, "s-a", 2, "2026-09-28T00:00:00.000Z");
  const moved = await manifest(h, A, first.etag!);
  assert.equal(moved.status, 200);
  const watermark = (m: typeof first, id: string) => BigInt(m.body!.domains.find((entry) => entry.domainId === id)!.watermark);
  assert.ok(watermark(moved, MESSAGES) > watermark(first, MESSAGES) && watermark(moved, SESSIONS) > watermark(first, SESSIONS));
  assert.equal(watermark(moved, INBOX), watermark(first, INBOX));
});
