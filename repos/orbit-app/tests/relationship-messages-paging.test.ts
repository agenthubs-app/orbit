import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { performance } from "node:perf_hooks";
import test, { type TestContext } from "node:test";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import type { PayloadCodec } from "../src/data/sync/payload-codec";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { relationshipMessagePageSeqs } from "../src/view-models/relationship-local";
import { localRelationshipMessagePage, relationshipDeviceConversations, relationshipDeviceMessages } from "../src/view-models/relationship-local";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// Sprint 0131 (coordinator item from 0119): a conversation's page is read from
// the device by row id (`${conversationId}/${seq}`) for one sequence range, not
// by loading the whole message domain into memory and filtering it. The
// browser decrypts every row it reads, so reading 31 rows instead of 5000 is
// what makes a long conversation open quickly. Timings for a 5000-message
// conversation are printed for the report (native ≈ the identity codec,
// browser ≈ AES-GCM per row like the web mirror's payload codec).
const baseUrl = "https://host.example";
const A = "account:a";
const B = "account:b";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const NOW = new Date(T0).toISOString();
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");
const CONVERSATION = "conversation:long";
const OTHER = "conversation:other";
const COUNT = 5000;

function lease(): OfflineReadEnvelope {
  return { version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0,
    grants: ["relationship-conversations", "relationship-messages"].map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: "e1" })), databaseKeyRef: "key-ref" };
}

function conversationChange(id: string, lastSeq: number): DomainChange {
  return { id, revision: String(lastSeq), operation: "upsert", payload: {
    conversationId: id, contactId: "contact:1", participantAccountIds: [A, B], participantDisplayNames: { [A]: "A", [B]: "B" },
    qualificationVersion: "qv_1", status: "active", createdAt: NOW, updatedAt: NOW, unreadCount: 0, readSeq: lastSeq, lastMessageSeq: lastSeq,
    lastMessage: { messageId: `${id}:m${lastSeq}`, senderAccountId: B, sentAt: NOW, bodyPreview: "最后一条" },
  } } as DomainChange;
}

function messageChange(conversationId: string, seq: number): DomainChange {
  return { id: `${conversationId}/${seq}`, revision: String(10_000 + seq), operation: "upsert", payload: {
    conversationId, seq, messageId: `${conversationId}:m${seq}`, senderAccountId: seq % 2 ? A : B, senderDisplayName: seq % 2 ? "A" : "B",
    body: `第 ${seq} 条消息：${"储能".repeat(seq % 7)}`, sentAt: new Date(T0 - (COUNT - seq) * 60_000).toISOString(),
  } } as DomainChange;
}

function client(log: Record<string, DomainChange[]>): SyncClient {
  return {
    async getLease() { return lease(); },
    async getManifest(): Promise<DomainManifest> { return { registryVersion: 2, domains: [] }; },
    async getDomainPage(input): Promise<DomainPage> {
      const all = log[input.domainId] ?? [];
      const from = input.cursor ? Number(input.cursor) : 0;
      const changes = all.slice(from, from + 1000);
      const next = from + changes.length;
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: "e1", changes, nextCursor: String(next), highWatermark: String(all.length), hasMore: next < all.length, generation: "g", serverTime: NOW };
    },
    async getPage() { throw new Error("legacy"); },
  };
}

function aesCodec(): PayloadCodec & { decodes: number } {
  const key = webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const codec = {
    decodes: 0,
    async encode(plain: string) {
      const iv = webcrypto.getRandomValues(new Uint8Array(12));
      const sealed = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, new TextEncoder().encode(plain)));
      return Buffer.from(iv).toString("base64") + "." + Buffer.from(sealed).toString("base64");
    },
    async decode(stored: string) {
      codec.decodes += 1;
      const [iv, body] = stored.split(".");
      return new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv!, "base64") }, await key, Buffer.from(body!, "base64")));
    },
  };
  return codec;
}

async function device(t: TestContext, payloadCodec?: PayloadCodec) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
    ...(payloadCodec ? { payloadCodec } : {}),
  };
  const log = {
    "relationship-conversations": [conversationChange(CONVERSATION, COUNT), conversationChange(OTHER, 3)],
    "relationship-messages": [...Array.from({ length: COUNT }, (_, index) => messageChange(CONVERSATION, index + 1)), ...[1, 2, 3].map((seq) => messageChange(OTHER, seq))],
  };
  const session = createSyncCoordinator({ lifecycle, now: () => T0, hashPayload }).openScope({ actorId: A, baseUrl, client: client(log), scopeKey: `k:${Math.random()}` });
  t.after(() => session.deactivate());
  const request = session.synchronize("relationship_conversation", { reason: "explicit" });
  await request.started;
  await request.promise;
  return session;
}

async function openPage(session: Awaited<ReturnType<typeof device>>, cursor: string | null) {
  const conversations = relationshipDeviceConversations(((await session.readCollection("relationship_conversation"))?.records ?? []) as never[], A);
  const conversation = conversations.find((row) => row.conversationId === CONVERSATION)!;
  const seqs = relationshipMessagePageSeqs(conversation, cursor);
  const rows = await session.readRecordsById("relationship_message", seqs.map((seq) => `${CONVERSATION}/${seq}`));
  return { page: localRelationshipMessagePage(conversations, relationshipDeviceMessages((rows ?? []) as never[], CONVERSATION), A, CONVERSATION, { cursor, asOf: NOW }), read: rows?.length ?? 0 };
}

test("a 5000-message conversation opens and pages back by row id, reading one window of rows each time", async (t) => {
  const session = await device(t);
  const started = performance.now();
  const newest = await openPage(session, null);
  const firstMs = performance.now() - started;
  assert.ok(newest.page);
  assert.equal(newest.read, 31, "30 messages and one more to know an older page exists");
  // The server's window: at most 30 messages and 96KB counting 4096 bytes per message (so 23 here).
  assert.equal(newest.page.items.length, 23);
  assert.equal(newest.page.items.at(-1)!.body.startsWith(`第 ${COUNT} 条`), true);
  assert.equal(newest.page.hasMore, true);
  let cursor = newest.page.nextCursor;
  let expectedLast = COUNT - 23;
  for (let pages = 0; cursor && pages < 3; pages += 1) {
    const older = await openPage(session, cursor);
    assert.ok(older.page);
    assert.ok(older.read <= 31);
    assert.ok(older.page.items.at(-1)!.body.startsWith(`第 ${expectedLast} 条`), "pages continue without a gap");
    expectedLast -= older.page.items.length;
    cursor = older.page.nextCursor;
  }
  // Paging back to the very first message works from the device alone.
  const first = await openPage(session, "local:10");
  assert.equal(first.page!.items[0]!.body.startsWith("第 1 条"), true);
  assert.equal(first.page!.hasMore, false);
  t.diagnostic(`native-like (identity codec): newest page of ${COUNT} in ${firstMs.toFixed(1)} ms`);
});

test("browser-like (AES-GCM per row): opening decrypts one window, not the whole history", async (t) => {
  const codec = aesCodec();
  const session = await device(t, codec);
  codec.decodes = 0;
  const started = performance.now();
  const newest = await openPage(session, null);
  const pageMs = performance.now() - started;
  const pageDecodes = codec.decodes;
  assert.equal(newest.page!.items.length, 23);
  assert.ok(pageDecodes <= 31 + 2, `decrypted ${pageDecodes} rows (the window plus the conversation rows)`);
  codec.decodes = 0;
  const wholeStarted = performance.now();
  const everything = await session.readCollection("relationship_message");
  const wholeMs = performance.now() - wholeStarted;
  assert.equal(everything?.records.length, COUNT + 3);
  assert.ok(codec.decodes >= COUNT, "the old path decrypted every message of the domain");
  t.diagnostic(`browser-like: newest page ${pageMs.toFixed(1)} ms (${pageDecodes} decrypts) vs whole domain ${wholeMs.toFixed(1)} ms (${codec.decodes} decrypts)`);
});

test("row-id reads never reach another epoch or another conversation", async (t) => {
  const session = await device(t);
  const rows = await session.readRecordsById("relationship_message", [`${OTHER}/1`, `${CONVERSATION}/1`, "not/there"]);
  assert.deepEqual(rows?.map((row) => row.id).sort(), [`${CONVERSATION}/1`, `${OTHER}/1`]);
  await assert.rejects(session.readRecordsById("relationship_message", Array.from({ length: 201 }, (_, index) => `x/${index}`)), /at most 200/);
});
