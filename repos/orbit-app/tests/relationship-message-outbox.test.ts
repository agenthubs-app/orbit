import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { OrbitApiClient } from "../src/api/client";
import type { DomainChange, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { buildOfflineMessageMutation } from "../src/data/sync/message-outbox-mutation";
import { createMessageOutboxUploader } from "../src/data/sync/message-outbox-upload";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { relationshipDeviceConversations, relationshipDeviceMessages } from "../src/view-models/relationship-local";
import { endedConversationMessages, outboxRelationshipMessages } from "../src/view-models/relationship-outbox";
import { isOfflineEligible } from "../src/data/sync/mutation-adapters";
import { OFFLINE_POLICY_REGISTRATIONS } from "../src/api/schema/offline-policy";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// Sprint 0135 (message plan M4): the App side of offline sending — the real
// coordinator, the real SQLite queue and mirror (node:sqlite) and the real
// message uploader, against a scripted host that speaks the domain protocol
// and the send route's rules (message id = conversation + sender + request id;
// a replay returns the stored message; a revoked conversation refuses new ones).
const baseUrl = "https://host.example";
const A = "account:a";
const B = "account:b";
const W = "workspace-host";
const T0 = Date.parse("2026-10-03T09:00:00.000Z");
const CONVERSATIONS = "relationship-conversations";
const MESSAGES = "relationship-messages";
const CID = "relationship-conversation:ab";
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

interface Stored { messageId: string; requestId: string; body: string; seq: number; sentAt: string; retireDraftThrough: unknown }
interface Host {
  offline: boolean;
  revoked: boolean;
  dropNextReceipt: boolean;
  conversations: DomainChange[];
  messages: DomainChange[];
  stored: Stored[];
  posts: Array<{ requestId: string; body: Record<string, unknown> }>;
}

function newHost(): Host {
  const host: Host = { offline: false, revoked: false, dropNextReceipt: false, conversations: [], messages: [], stored: [], posts: [] };
  publishConversation(host);
  return host;
}

function publishConversation(host: Host) {
  const last = host.stored.at(-1);
  host.conversations.push(host.revoked
    ? { id: CID, revision: String(host.conversations.length + 1), operation: "delete", payload: null }
    : { id: CID, revision: String(host.conversations.length + 1), operation: "upsert", payload: {
      conversationId: CID, contactId: "contact:b", participantAccountIds: [A, B], participantDisplayNames: { [A]: "Me", [B]: "Bee" },
      qualificationVersion: "qv_1", status: "active", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: last?.sentAt ?? "2026-10-01T00:00:00.000Z",
      unreadCount: 0, readSeq: last?.seq ?? 0, lastMessageSeq: last?.seq ?? 0,
      lastMessage: last ? { messageId: last.messageId, senderAccountId: A, sentAt: last.sentAt, bodyPreview: last.body } : null } });
}

function lease(): OfflineReadEnvelope {
  return { version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0,
    grants: [CONVERSATIONS, MESSAGES].map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: "e1" })), databaseKeyRef: "key-ref" };
}

function syncClient(host: Host): SyncClient {
  const offline = () => { if (host.offline) throw new TypeError("Network request failed"); };
  return {
    async getLease() { offline(); return lease(); },
    async getManifest() { offline(); throw new Error("no manifest: pull every domain"); },
    async getDomainPage(input): Promise<DomainPage> {
      offline();
      const log = input.domainId === CONVERSATIONS ? host.conversations : host.messages;
      const from = input.cursor ? Number(input.cursor) : 0;
      const changes = log.slice(from, from + 2);
      const next = from + changes.length;
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: "e1", changes, nextCursor: String(next), highWatermark: String(log.length), hasMore: next < log.length, generation: "g", serverTime: new Date(T0 + 60_000).toISOString() };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

function writeClient(host: Host): Pick<OrbitApiClient, "post" | "patch" | "delete"> {
  return {
    async post(path: string, options: { body?: unknown; headers?: Record<string, string> }) {
      if (host.offline) throw new TypeError("Network request failed");
      const conversationId = decodeURIComponent(path.split("/")[4] ?? "");
      const body = options.body as Record<string, unknown>;
      const requestId = options.headers?.["Idempotency-Key"] ?? "";
      host.posts.push({ requestId, body });
      assert.equal(conversationId, CID);
      assert.equal(body.requestId, requestId, "the idempotency key is the frozen request id");
      const messageId = `m:${conversationId}:${A}:${requestId}`;
      let message = host.stored.find((item) => item.messageId === messageId);
      if (message && message.body !== body.body) return { success: false as const, status: 409, error: { code: "CONFLICT", message: "This request id was already used for a different message." } };
      if (!message) {
        if (host.revoked) return { success: false as const, status: 409, error: { code: "CONFLICT", message: "Message eligibility has been revoked." } };
        const seq = host.stored.length + 1;
        message = { messageId, requestId, body: String(body.body), seq, sentAt: new Date(T0 + seq * 1000).toISOString(), retireDraftThrough: body.retireDraftThrough };
        host.stored.push(message);
        host.messages.push({ id: `${CID}/${seq}`, revision: String(100 + seq), operation: "upsert", payload: {
          conversationId: CID, seq, messageId, senderAccountId: A, senderDisplayName: "Me", body: message.body, sentAt: message.sentAt } });
        publishConversation(host);
        if (host.dropNextReceipt) { host.dropNextReceipt = false; throw new TypeError("Network request failed after the server stored it"); }
      }
      return { success: true as const, status: 201, data: { conversationId, deliveryState: "delivered", qualificationVersion: body.qualificationVersion,
        message: { conversationId, messageId, senderAccountId: A, senderDisplayName: "Me", body: message.body, sentAt: message.sentAt, deliveryState: "delivered" } }, meta: {} };
    },
    async patch() { throw new Error("unused"); },
    async delete() { throw new Error("unused"); },
  } as unknown as Pick<OrbitApiClient, "post" | "patch" | "delete">;
}

/** One app process: a coordinator over the SQLite file; reopening the file models a killed and restarted app. */
function openDevice(t: TestContext, host: Host, path: string) {
  const database = new NodeTestDatabase(path);
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
  };
  const coordinator = createSyncCoordinator({
    lifecycle, now: () => T0, hashPayload,
    uploadOutbox: async ({ actorId, baseUrl: base, workspaceId, repository, syncClient: client, writeClient: write }) => {
      if (!write) return;
      await createMessageOutboxUploader({ actorId, baseUrl: base, workspaceId, repository, syncClient: client, writeClient: write, now: () => T0, }).run();
    },
  });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: syncClient(host), writeClient: writeClient(host), scopeKey: path });
  return {
    database, session,
    async ready() { await initializeLocalSyncDatabase(database); },
    async sync() { const request = session.synchronize("relationship_conversation", { reason: "explicit" }); await request.started; return request.promise; },
    async queued() { return outboxRelationshipMessages((await session.readOutboxOverlay("relationship_message"))?.queuedMutations ?? []); },
    async conversations() { return relationshipDeviceConversations(((await session.readCollection("relationship_conversation"))?.records ?? []) as never, A); },
    async messages() { return relationshipDeviceMessages(((await session.readCollection("relationship_message"))?.records ?? []) as never, CID); },
    close() { session.deactivate(); database.close(); },
  };
}

async function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "orbit-message-outbox-"));
  const path = join(directory, "sync.sqlite");
  const host = newHost();
  const bootstrap = new NodeTestDatabase(path);
  await initializeLocalSyncDatabase(bootstrap);
  bootstrap.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const device = openDevice(t, host, path);
  assert.equal((await device.sync())?.error, null, "the first online sync holds the conversation");
  assert.equal((await device.conversations()).length, 1);
  return { host, path, device };
}

const write = (body: string, requestId: string, retireDraftThrough: string | null = null, at = 0) =>
  buildOfflineMessageMutation({ requestId, conversationId: CID, body, qualificationVersion: "qv_1", retireDraftThrough, createdAt: new Date(T0 + at).toISOString() });

test("offline send is registered: message send is offline_queue in the shared policy and eligible on the device", () => {
  const registration = OFFLINE_POLICY_REGISTRATIONS.find((item) => item.method === "POST" && item.pathname === "/api/relationship-communication/conversations/:id/messages");
  assert.equal(registration?.action, "send");
  assert.equal(registration?.policy.mutationPolicy, "offline_queue");
  assert.equal(isOfflineEligible("relationship_message", "send", { actorPrivate: true, confirmed: true, connectionActive: true }), true);
  for (const operation of ["create", "update", "delete", "read"]) assert.equal(isOfflineEligible("relationship_message", operation, { actorPrivate: true, confirmed: true, connectionActive: true }), false, operation);
  assert.equal(isOfflineEligible("relationship_message", "send", { actorPrivate: true, confirmed: true, connectionActive: false }), false);
});

test("three messages written offline survive a killed app and arrive once each, in order, with server sequence numbers and times; a lost receipt is replayed once", async (t) => {
  const { host, path, device } = await setup(t);
  host.offline = true;
  await device.session.enqueueOfflineMessageMutation(write("第一条", "req-1", null, 1));
  await device.session.enqueueOfflineMessageMutation(write("第二条", "req-2", null, 2));
  await device.session.enqueueOfflineMessageMutation(write("第三条", "req-3", null, 3));
  await device.sync(); // offline: nothing leaves the device
  assert.deepEqual((await device.queued()).map((item) => [item.body, item.status]), [["第一条", "pending"], ["第二条", "pending"], ["第三条", "pending"]]);
  assert.equal(host.posts.length, 0);
  device.close();

  // The app is killed and restarted; the network is back. The second receipt is lost once.
  host.offline = false;
  const restarted = openDevice(t, host, path);
  t.after(() => { try { restarted.close(); } catch { /* closed */ } });
  // Lose the receipt of the second message: arm after the first post.
  const originalPush = host.posts.push.bind(host.posts);
  host.posts.push = (...items) => { const length = originalPush(...items); if (host.posts.length === 2 && host.stored.length === 1) host.dropNextReceipt = true; return length; };
  assert.equal((await restarted.sync())?.error, null);
  for (let round = 0; round < 3 && (await restarted.queued()).length; round += 1) await restarted.sync();

  assert.deepEqual(host.stored.map((item) => [item.seq, item.body, item.requestId]), [[1, "第一条", "req-1"], [2, "第二条", "req-2"], [3, "第三条", "req-3"]], "B receives three messages in order, consecutive numbers");
  assert.deepEqual(host.posts.map((item) => item.requestId), ["req-1", "req-2", "req-2", "req-3"], "only the lost receipt was replayed, with the same request id");
  assert.deepEqual(await restarted.queued(), [], "the queue is empty once each message is confirmed");
  const mirrored = await restarted.messages();
  assert.deepEqual(mirrored.map((item) => [item.seq, item.body, item.sentAt]), host.stored.map((item) => [item.seq, item.body, item.sentAt]), "待发送 became the server's number and time (D13)");
});

test("revoked before the device is back online: nothing is delivered, every queued message fails, and the inbox lists them as 未能发送 until discarded", async (t) => {
  const { host, device } = await setup(t);
  t.after(() => { try { device.close(); } catch { /* closed */ } });
  host.offline = true;
  await device.session.enqueueOfflineMessageMutation(write("撤销前写的一", "rv-1", null, 1));
  await device.session.enqueueOfflineMessageMutation(write("撤销前写的二", "rv-2", null, 2));
  host.revoked = true;
  publishConversation(host);
  host.offline = false;
  await device.sync();
  await device.sync();
  assert.deepEqual(host.stored, [], "the server stores no new message");
  assert.deepEqual(await device.conversations(), [], "the conversation left the device (0119)");
  const queued = await device.queued();
  assert.deepEqual(queued.map((item) => [item.body, item.status]), [["撤销前写的一", "failed"], ["撤销前写的二", "failed"]], "kept on this phone, never sent");
  assert.ok(host.posts.length <= 1, "at most the first message reached the server, which refused it");
  const ended = endedConversationMessages(queued, (await device.conversations()).map((row) => row.conversationId));
  assert.equal(ended.length, 2, "the inbox top line counts both");
  await assert.rejects(device.session.retryOfflineMessage("missing"), /only an unsent message/);
  assert.equal(await device.session.discardOfflineMessages(ended.map((item) => item.mutationId)), 2);
  assert.deepEqual(await device.queued(), []);
});

test("a refused message can be retried with the same request id, and a queued message carries the draft time it was written with", async (t) => {
  const { host, device } = await setup(t);
  t.after(() => { try { device.close(); } catch { /* closed */ } });
  host.offline = true;
  await device.session.enqueueOfflineMessageMutation(write("带草稿时间", "dr-1", "2026-10-03T08:00:00.000Z", 1));
  host.offline = false;
  host.revoked = true; // refused (409) without the conversation leaving yet
  await device.sync();
  host.revoked = false;
  host.conversations.pop(); // the revocation never reached the device in this case
  publishConversation(host);
  const [failed] = await device.queued();
  assert.equal(failed?.status, "failed");
  await device.session.retryOfflineMessage(failed!.mutationId);
  await device.sync();
  assert.deepEqual(host.stored.map((item) => [item.requestId, item.retireDraftThrough]), [["dr-1", "2026-10-03T08:00:00.000Z"]]);
  assert.deepEqual(await device.queued(), []);
});

test("only an active conversation on this device accepts an offline message; a malformed request is refused", async (t) => {
  const { device } = await setup(t);
  t.after(() => { try { device.close(); } catch { /* closed */ } });
  await assert.rejects(device.session.enqueueOfflineMessageMutation(buildOfflineMessageMutation({ requestId: "x-1", conversationId: "relationship-conversation:other", body: "没有这个对话", qualificationVersion: "qv_1", retireDraftThrough: null, createdAt: new Date(T0).toISOString() })), /active conversation/);
  const forged = { ...write("改过的正文", "x-2"), patch: { body: "别的正文" } };
  await assert.rejects(device.session.enqueueOfflineMessageMutation(forged), /not eligible/);
  assert.throws(() => write("   ", "x-3"), /invalid/);
  assert.throws(() => buildOfflineMessageMutation({ requestId: "x-4", conversationId: CID, body: "a".repeat(10_001), qualificationVersion: "qv_1", retireDraftThrough: null, createdAt: new Date(T0).toISOString() }), /invalid/);
  assert.deepEqual(await device.queued(), []);
});

test("clearing with a non-empty queue keeps queued messages: the vault round trip restores the frozen send, which then uploads once", async (t) => {
  const { host, device } = await setup(t);
  t.after(() => { try { device.close(); } catch { /* closed */ } });
  host.offline = true;
  await device.session.enqueueOfflineMessageMutation(write("清空前排队的", "vault-1", null, 1));
  const { archivePendingWrites, restorePendingWrites } = await import("../src/data/sync/pending-write-vault");
  const vault = new NodeTestDatabase();
  t.after(() => vault.close());
  await initializeLocalSyncDatabase(vault);
  const hash = async (text: string) => createHash("sha256").update(text).digest("hex");
  const archived = await archivePendingWrites({ source: device.database, vault, identityDigest: "c".repeat(64), now: new Date(T0).toISOString(), hash });
  assert.equal(archived.mutationCount, 1);
  await device.database.run("DELETE FROM sync_outbox");
  assert.deepEqual(await device.queued(), []);
  const restored = await restorePendingWrites({ source: device.database, vault, identityDigest: "c".repeat(64), now: new Date(T0 + 1000).toISOString(), hash });
  assert.equal(restored.status, "restored");
  assert.deepEqual((await device.queued()).map((item) => [item.body, item.status]), [["清空前排队的", "pending"]]);
  host.offline = false;
  await device.sync();
  assert.deepEqual(host.stored.map((item) => item.requestId), ["vault-1"]);
  assert.deepEqual(await device.queued(), []);
});
