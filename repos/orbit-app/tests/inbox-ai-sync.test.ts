import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { SyncChangeKind } from "../src/api/contract/sync";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { AI_OPENED_SESSION_LIMIT } from "../src/data/sync/local-sync-repository";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { KNOWN_SYNC_DOMAINS } from "../src/data/sync/sync-domains";
import { WEB_MIRROR_DOMAIN_IDS } from "../src/data/sync/web-mirror-storage";
import { NodeTestDatabase } from "./helpers/node-sync-database";
import { inboxDeviceRows, localInboxDetail, localInboxListData } from "../src/view-models/inbox-local";
import { aiSessionMessages, aiSessionRows, localAiSessionPage } from "../src/view-models/ai-sessions-local";

// Sprint 0118: the App side of the inbox and AI session domains — the real
// coordinator and the real SQLite mirror (node:sqlite) against a scripted host
// that speaks the domain protocol. The host records the partitions (opened AI
// sessions) each messages page names, the way the server reads them.
const baseUrl = "https://host.example";
const A = "actor-a";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const NOW = "2026-10-02T09:00:00.000Z";
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");
const INBOX = "inbox-notifications";
const SESSIONS = "ai-sessions";
const MESSAGES = "ai-session-messages";

interface Host { epoch: string; granted: string[]; log: Record<string, DomainChange[]>; calls: string[]; named: string[][] }

function lease(host: Host): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0,
    grants: host.granted.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: host.epoch })), databaseKeyRef: "key-ref",
  };
}

/** The messages log holds every session's rows; a page returns only the named sessions (a new one from the start). */
function client(host: Host): SyncClient {
  return {
    async getLease() { host.calls.push("lease"); return lease(host); },
    async getManifest(): Promise<DomainManifest> {
      return { registryVersion: 2, domains: host.granted.map((domainId) => ({ domainId, schemaVersion: 2, workspaceId: W, authorizationEpoch: host.epoch, generation: "g", watermark: String((host.log[domainId] ?? []).length), history: "complete", membershipCursor: null })) };
    },
    async getDomainPage(input): Promise<DomainPage> {
      host.calls.push(`page:${input.domainId}`);
      if (!host.granted.includes(input.domainId)) throw new Error(`ungranted ${input.domainId}`);
      const log = host.log[input.domainId] ?? [];
      let changes = log.slice(input.cursor ? Number(input.cursor.split("|")[0]) : 0);
      if (input.domainId === MESSAGES) {
        const named = [...(input.sessions ?? [])];
        host.named.push(named);
        const known = input.cursor ? (input.cursor.split("|")[1] ?? "").split(",").filter(Boolean) : [];
        const fresh = named.filter((id) => !known.includes(id));
        changes = [...log.filter((change) => fresh.includes(String(change.payload?.sessionId))), ...changes.filter((change) => known.includes(String(change.payload?.sessionId)))];
        return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: host.epoch, changes, nextCursor: `${log.length}|${named.join(",")}`, highWatermark: String(log.length), hasMore: false, generation: "g", serverTime: NOW };
      }
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: host.epoch, changes, nextCursor: String(log.length), highWatermark: String(log.length), hasMore: false, generation: "g", serverTime: NOW };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

async function device(t: TestContext, host: Host) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
  };
  const session = createSyncCoordinator({ lifecycle, now: () => T0, hashPayload }).openScope({ actorId: A, baseUrl, client: client(host), scopeKey: "k" });
  t.after(() => session.deactivate());
  return {
    session,
    async sync() { const request = session.synchronize("inbox_notification", { reason: "explicit" }); await request.started; return request.promise; },
    async records(kind: SyncChangeKind) { return ((await session.readCollection(kind))?.records ?? []) as never[]; },
  };
}

const notice = (id: string, revision: number, fields: Record<string, unknown> = {}): DomainChange => ({
  id, revision: String(revision), operation: "upsert", payload: JSON.parse(JSON.stringify({
    id, revision: 1, kind: "suggestion", origin: "automation", semanticKey: `k:${id}`, title: `提醒 ${id}`, reason: `原因 ${id}`,
    copy: { zh: { title: `提醒 ${id}`, reason: `原因 ${id}` }, en: { title: `Note ${id}`, reason: `Reason ${id}` }, ja: { title: `通知 ${id}`, reason: `理由 ${id}` } },
    sources: [{ sourceKind: "contact", sourceId: `c:${id}`, sourceRevision: "1", occurredAt: "2026-10-01T00:00:00.000Z", readAt: "2026-10-01T00:00:00.000Z" }],
    target: { kind: "source", id: `c:${id}`, href: `/contacts/c:${id}`, status: "available" }, actions: ["read", "dismiss"],
    occurredAt: "2026-10-02T08:00:00.000Z", updatedAt: "2026-10-02T08:00:00.000Z", readAt: null, disposition: "open", sourceState: "available", ...fields,
  })) as Record<string, unknown>,
});
const sessionRow = (id: string, revision: number, pinned = false): DomainChange => ({
  id, revision: String(revision), operation: "upsert", payload: {
    id, title: `Session ${id}`, firstUserText: `first ${id}`, lastMessagePreview: `last ${id}`, createdAt: `2026-10-0${revision % 9 + 1}T00:00:00.000Z`, updatedAt: "2026-10-02T00:00:00.000Z",
    messageCount: 2, messageRevision: 2, organization: { customTitle: null, groupId: null, pinned, revision: pinned ? 1 : 0 },
  },
});
const message = (sessionId: string, index: number, revision: number): DomainChange => ({
  id: `${sessionId}:m${index}`, revision: String(revision), operation: "upsert",
  payload: { sessionId, id: `${sessionId}:m${index}`, role: index % 2 ? "assistant" : "user", text: `${sessionId} text ${index}`, index, createdAt: NOW },
});

test("the three domains are known to this build and mirrored in the browser too", () => {
  assert.equal(KNOWN_SYNC_DOMAINS[INBOX], "inbox_notification");
  assert.equal(KNOWN_SYNC_DOMAINS[SESSIONS], "ai_session");
  assert.equal(KNOWN_SYNC_DOMAINS[MESSAGES], "ai_session_message");
  for (const domain of [INBOX, SESSIONS, MESSAGES]) assert.ok(WEB_MIRROR_DOMAIN_IDS.includes(domain), domain);
});

test("inbox: pulled rows become the list, detail and unread count; an invalidated row loses its content; a delete removes it", async (t) => {
  const host: Host = { epoch: "e1", granted: [INBOX], calls: [], named: [], log: { [INBOX]: [notice("n1", 1), notice("n2", 2), notice("n3", 3, { readAt: "2026-10-02T08:30:00.000Z" })] } };
  const d = await device(t, host);
  assert.equal((await d.sync())?.error, null);
  const rows = inboxDeviceRows(await d.records("inbox_notification"), A);
  assert.equal(rows.length, 3);
  const list = localInboxListData(rows, { actorId: A, filter: "all", language: "en", nowMs: T0 });
  assert.deepEqual(list.items.map((item) => item.title), ["Note n3", "Note n2", "Note n1"].sort().reverse());
  assert.equal(list.unreadCount, 2);
  assert.ok(list.items.every((item) => item.actorId === A), "the device fills in its own actor for the existing views");
  // The server invalidated n2 (its source went away): the row comes back without content.
  host.log[INBOX]!.push(notice("n2", 4, { sourceState: "unavailable", title: "来源已不可用", reason: "来源已变更、不可访问，或此通知已不再适用。", copy: undefined, actions: [], target: { kind: "source", id: "c:n2", href: null, status: "unavailable" } }));
  host.log[INBOX]!.push({ id: "n1", revision: "5", operation: "delete", payload: null });
  assert.equal((await d.sync())?.error, null);
  const after = inboxDeviceRows(await d.records("inbox_notification"), A);
  assert.deepEqual(after.map((row) => row.id).sort(), ["n2", "n3"]);
  assert.equal(localInboxListData(after, { actorId: A, filter: "all", language: "zh", nowMs: T0 }).items.map((item) => item.id).join(), "n3", "an unavailable notification leaves the default list");
  assert.equal(localInboxListData(after, { actorId: A, filter: "history", language: "ja", nowMs: T0 }).items.find((item) => item.id === "n2")!.title, "参照元を利用できません");
  assert.equal(localInboxListData(after, { actorId: A, filter: "all", language: "zh", nowMs: T0 }).unreadCount, 0);
  assert.equal(localInboxDetail(after, { actorId: A, id: "n2", language: "en", nowMs: T0 })!.title, "Source unavailable");
  // Revocation retires the inbox rows.
  host.granted = [];
  await d.sync();
  assert.deepEqual(await d.records("inbox_notification"), []);
});

test("AI sessions: the list comes from the mirror in the server's order; opened sessions' messages sync, others never do", async (t) => {
  const host: Host = {
    epoch: "e1", granted: [SESSIONS, MESSAGES], calls: [], named: [],
    log: { [SESSIONS]: [sessionRow("s1", 1), sessionRow("s2", 2, true), sessionRow("s3", 3)], [MESSAGES]: [message("s1", 0, 1), message("s1", 1, 2), message("s2", 0, 3), message("s3", 0, 4)] },
  };
  const d = await device(t, host);
  await d.sync();
  const page = localAiSessionPage(aiSessionRows(await d.records("ai_session")));
  assert.deepEqual(page.items.map((item) => item.id), ["s2", "s3", "s1"], "pinned first, then newest");
  assert.deepEqual(localAiSessionPage(aiSessionRows(await d.records("ai_session")), { q: "FIRST S3" }).items.map((item) => item.id), ["s3"]);
  assert.deepEqual(await d.records("ai_session_message"), [], "no session opened: no messages");
  assert.deepEqual(host.named.at(-1), [], "the page names no session");

  // Opening s1 while the manifest says nothing moved still fetches it.
  const receipt = await d.session.openAiSession("s1");
  assert.deepEqual(receipt, { opened: ["s1"], evicted: [], added: true });
  const pagesBefore = host.calls.filter((call) => call === `page:${MESSAGES}`).length;
  await d.sync();
  assert.equal(host.calls.filter((call) => call === `page:${MESSAGES}`).length, pagesBefore + 1, "a changed opened set is not skipped by an unchanged manifest");
  assert.deepEqual(host.named.at(-1), ["s1"]);
  assert.deepEqual(aiSessionMessages(await d.records("ai_session_message"), "s1").map((row) => row.text), ["s1 text 0", "s1 text 1"]);
  assert.deepEqual(aiSessionMessages(await d.records("ai_session_message"), "s2"), [], "s2 was never opened");
  // Nothing changed and the set is the same: the manifest skips the page.
  const pages = host.calls.filter((call) => call === `page:${MESSAGES}`).length;
  await d.sync();
  assert.equal(host.calls.filter((call) => call === `page:${MESSAGES}`).length, pages);
  // Reopening is not a new session.
  assert.equal((await d.session.openAiSession("s1"))?.added, false);
});

test("AI sessions: cards of the last online read are kept for an opened session, and eviction beyond the limit removes its messages and cards", async (t) => {
  const host: Host = { epoch: "e1", granted: [MESSAGES], calls: [], named: [], log: { [MESSAGES]: [message("s0", 0, 1)] } };
  const d = await device(t, host);
  await d.sync();
  await d.session.openAiSession("s0");
  await d.sync();
  assert.equal(aiSessionMessages(await d.records("ai_session_message"), "s0").length, 1);
  const cards = { turns: [{ sessionId: "s0", requestId: "r1", assistantMessageId: "s0:m1", userMessageId: "s0:m0", status: "ready", artifacts: [] }], truncated: false };
  await d.session.saveAiSessionCards("s0", cards);
  assert.deepEqual(await d.session.readAiSessionCards("s0"), cards);
  await d.session.saveAiSessionCards("never-opened", cards);
  assert.equal(await d.session.readAiSessionCards("never-opened"), null, "cards are kept only for opened sessions");
  let last: Awaited<ReturnType<typeof d.session.openAiSession>> = null;
  for (let index = 1; index <= AI_OPENED_SESSION_LIMIT; index += 1) last = await d.session.openAiSession(`s${index}`);
  assert.deepEqual(last?.evicted, ["s0"], "the least recently opened session is evicted");
  assert.equal(last?.opened.length, AI_OPENED_SESSION_LIMIT);
  assert.deepEqual(aiSessionMessages(await d.records("ai_session_message"), "s0"), [], "its messages left the device");
  assert.equal(await d.session.readAiSessionCards("s0"), null, "and its cards");
});
