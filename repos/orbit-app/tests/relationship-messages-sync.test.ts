import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { SyncChangeKind } from "../src/api/contract/sync";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { KNOWN_SYNC_DOMAINS } from "../src/data/sync/sync-domains";
import { WEB_MIRROR_DOMAIN_IDS } from "../src/data/sync/web-mirror-storage";
import { NodeTestDatabase } from "./helpers/node-sync-database";
import {
  localConversationSummaryPage,
  localRelationshipMessagePage,
  localRelationshipUnreadTotal,
  relationshipDeviceConversations,
  relationshipDeviceMessages,
} from "../src/view-models/relationship-local";

// Sprint 0119 (offline 3b = message plan M3): the App side of the relationship
// message domains — the real coordinator and the real SQLite mirror
// (node:sqlite) against a scripted host that speaks the domain protocol. The
// server sends a conversation delete when the account's member row leaves
// (revocation); the repository removes that conversation's messages with it.
const baseUrl = "https://host.example";
const A = "account:a";
const B = "account:b";
const C = "account:c";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const NOW = "2026-10-02T09:00:00.000Z";
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");
const CONVERSATIONS = "relationship-conversations";
const MESSAGES = "relationship-messages";

interface Host { epoch: string; granted: string[]; log: Record<string, DomainChange[]>; calls: string[] }

function lease(host: Host): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0,
    grants: host.granted.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: host.epoch })), databaseKeyRef: "key-ref",
  };
}

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
      const from = input.cursor ? Number(input.cursor) : 0;
      // Three changes per page: a long history arrives over several pages.
      const changes = log.slice(from, from + 3);
      const next = from + changes.length;
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: host.epoch, changes, nextCursor: String(next), highWatermark: String(log.length), hasMore: next < log.length, generation: "g", serverTime: NOW };
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
    database,
    async sync() { const request = session.synchronize("relationship_conversation", { reason: "explicit" }); await request.started; return request.promise; },
    async records(kind: SyncChangeKind) { return ((await session.readCollection(kind))?.records ?? []) as never[]; },
    async storedMessageIds() { return (await database.all<{ record_id: string }>("SELECT record_id FROM sync_records WHERE domain_id = ? ORDER BY record_id", [MESSAGES])).map((row) => row.record_id); },
  };
}

const conversationId = (other: string) => `relationship-conversation:${other.replace(/\W/g, "")}`;
const conversation = (other: string, revision: number, fields: Record<string, unknown> = {}): DomainChange => ({
  id: conversationId(other), revision: String(revision), operation: "upsert", payload: {
    conversationId: conversationId(other), contactId: `contact:${other}`, participantAccountIds: [A, other], participantDisplayNames: { [A]: "Me", [other]: `Name ${other}` },
    qualificationVersion: "qv_1", status: "active", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: `2026-10-02T0${revision % 9}:00:00.000Z`,
    unreadCount: 0, readSeq: 0, lastMessageSeq: 0, lastMessage: null, ...fields,
  },
});
const message = (other: string, seq: number, revision: number, from = other): DomainChange => ({
  id: `${conversationId(other)}/${seq}`, revision: String(revision), operation: "upsert",
  payload: { conversationId: conversationId(other), seq, messageId: `m:${other}:${seq}`, senderAccountId: from, senderDisplayName: from === A ? "Me" : `Name ${other}`, body: `${other} says ${seq}`, sentAt: `2026-10-02T08:${String(seq).padStart(2, "0")}:00.000Z` },
});

test("the two message domains are known to this build and mirrored in the browser too", () => {
  assert.equal(KNOWN_SYNC_DOMAINS[CONVERSATIONS], "relationship_conversation");
  assert.equal(KNOWN_SYNC_DOMAINS[MESSAGES], "relationship_message");
  for (const domain of [CONVERSATIONS, MESSAGES]) assert.ok(WEB_MIRROR_DOMAIN_IDS.includes(domain), domain);
});

test("the pulled rows become the inbox list, the unread total and each conversation's full history, older pages included", async (t) => {
  const last = (other: string, seq: number, from = other) => ({ messageId: `m:${other}:${seq}`, senderAccountId: from, sentAt: `2026-10-02T08:${String(seq).padStart(2, "0")}:00.000Z`, bodyPreview: `${other} says ${seq}` });
  const history = Array.from({ length: 40 }, (_, index) => message(B, index + 1, 10 + index, index % 2 ? A : B));
  const host: Host = {
    epoch: "e1", granted: [CONVERSATIONS, MESSAGES], calls: [],
    log: {
      [CONVERSATIONS]: [conversation(B, 3, { unreadCount: 2, lastMessageSeq: 40, readSeq: 38, updatedAt: "2026-10-02T08:40:00.000Z", lastMessage: last(B, 40, A) }), conversation(C, 5, { unreadCount: 1, lastMessageSeq: 1, updatedAt: "2026-10-02T08:50:00.000Z", lastMessage: last(C, 1) })],
      [MESSAGES]: [...history, message(C, 1, 60)],
    },
  };
  const d = await device(t, host);
  assert.equal((await d.sync())?.error, null);
  assert.ok(host.calls.filter((call) => call === `page:${MESSAGES}`).length >= 14, "the history came over many pages");
  const rows = relationshipDeviceConversations(await d.records("relationship_conversation"), A);
  const page = localConversationSummaryPage(rows, A, NOW);
  assert.deepEqual(page?.items.map((item) => item.conversationId), [conversationId(C), conversationId(B)], "newest first");
  assert.equal(localRelationshipUnreadTotal(rows), 3);
  const messages = relationshipDeviceMessages(await d.records("relationship_message"));
  const latest = localRelationshipMessagePage(rows, messages, A, conversationId(B), { asOf: NOW });
  assert.equal(latest?.items.length, 23, "the server's page window (30 messages, 96KB)");
  assert.equal(latest?.items.at(-1)?.body, `${B} says 40`);
  const older = localRelationshipMessagePage(rows, messages, A, conversationId(B), { asOf: NOW, cursor: latest!.nextCursor });
  assert.deepEqual(older?.items.map((item) => item.body), Array.from({ length: 17 }, (_, index) => `${B} says ${index + 1}`), "paging back needs no network");
  assert.equal(older?.hasMore, false);
});

test("revocation: a conversation delete removes the conversation and every one of its messages from the device; another conversation stays", async (t) => {
  const host: Host = {
    epoch: "e1", granted: [CONVERSATIONS, MESSAGES], calls: [],
    log: { [CONVERSATIONS]: [conversation(B, 1), conversation(C, 2)], [MESSAGES]: [message(B, 1, 3), message(B, 2, 4), message(C, 1, 5), message(B, 3, 6)] },
  };
  const d = await device(t, host);
  await d.sync();
  assert.equal((await d.storedMessageIds()).length, 4);
  host.log[CONVERSATIONS]!.push({ id: conversationId(B), revision: "7", operation: "delete", payload: null });
  assert.equal((await d.sync())?.error, null);
  assert.deepEqual(relationshipDeviceConversations(await d.records("relationship_conversation"), A).map((row) => row.conversationId), [conversationId(C)]);
  assert.deepEqual(await d.storedMessageIds(), [`${conversationId(C)}/1`], "the revoked conversation's messages are gone from SQLite, not just hidden");
  assert.deepEqual(relationshipDeviceMessages(await d.records("relationship_message")).map((row) => row.body), [`${C} says 1`]);
  assert.equal(localRelationshipMessagePage(relationshipDeviceConversations(await d.records("relationship_conversation"), A), [], A, conversationId(B), { asOf: NOW }), null, "the chat has nothing to show");
});

test("a malformed or foreign row is skipped, not shown", async (t) => {
  const host: Host = {
    epoch: "e1", granted: [CONVERSATIONS, MESSAGES], calls: [],
    log: {
      [CONVERSATIONS]: [conversation(B, 1), { ...conversation(C, 2), payload: { ...conversation(C, 2).payload!, participantAccountIds: [B, C], participantDisplayNames: { [B]: "B", [C]: "C" } } }],
      [MESSAGES]: [message(B, 1, 3), { id: `${conversationId(B)}/9`, revision: "4", operation: "upsert", payload: { conversationId: conversationId(B), seq: 2, body: "wrong id" } }],
    },
  };
  const d = await device(t, host);
  await d.sync();
  assert.deepEqual(relationshipDeviceConversations(await d.records("relationship_conversation"), A).map((row) => row.conversationId), [conversationId(B)], "a conversation without the account is not shown");
  assert.deepEqual(relationshipDeviceMessages(await d.records("relationship_message")).map((row) => row.seq), [1]);
});
