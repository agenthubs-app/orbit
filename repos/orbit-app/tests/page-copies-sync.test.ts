import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import type { PayloadCodec } from "../src/data/sync/payload-codec";
import { PAGE_COPY_DEFINITIONS } from "../src/data/sync/page-copies";
import { WEB_MIRROR_PAGE_COPY_IDS } from "../src/data/sync/web-mirror-storage";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// Sprint 0131: page copies — the last successful online read of a
// server-computed page — on the real coordinator and the real SQLite mirror.
// A copy is bound to the accepted offline read lease: stored under its
// (workspace, authorization epoch), dropped on epoch rotation or revocation,
// unreadable once the lease expires, bounded in size and in opened items.
const baseUrl = "https://host.example";
const A = "account:a";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

interface Host { epoch: string; granted: string[] }

function lease(host: Host, issuedAt = T0): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: issuedAt + 30 * 86_400_000, offlineReadExpiresAt: issuedAt + 7 * 86_400_000, lastVerifiedAt: issuedAt,
    grants: host.granted.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: host.epoch })), databaseKeyRef: "key-ref",
  };
}

function client(host: Host): SyncClient {
  return {
    async getLease() { return lease(host); },
    async getManifest(): Promise<DomainManifest> {
      return { registryVersion: 2, domains: host.granted.map((domainId) => ({ domainId, schemaVersion: 2, workspaceId: W, authorizationEpoch: host.epoch, generation: "g", watermark: "0", history: "complete", membershipCursor: null })) };
    },
    async getDomainPage(input): Promise<DomainPage> {
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: host.epoch, changes: [], nextCursor: "0", highWatermark: "0", hasMore: false, generation: "g", serverTime: new Date(T0).toISOString() };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

const xorCodec: PayloadCodec = {
  async encode(plain) { return "enc:" + Buffer.from(Buffer.from(plain, "utf8").map((byte) => byte ^ 0x5a)).toString("base64"); },
  async decode(stored) {
    if (!stored.startsWith("enc:")) throw new Error("not encoded");
    return Buffer.from(Buffer.from(stored.slice(4), "base64").map((byte) => byte ^ 0x5a)).toString("utf8");
  },
};

async function device(t: TestContext, host: Host, options: { database?: NodeTestDatabase; now?: number; payloadCodec?: PayloadCodec; registeredPageCopyIds?: readonly string[] } = {}) {
  const database = options.database ?? new NodeTestDatabase();
  if (!options.database) {
    t.after(() => database.close());
    await initializeLocalSyncDatabase(database);
  }
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
    ...(options.payloadCodec ? { payloadCodec: options.payloadCodec } : {}),
    ...(options.registeredPageCopyIds ? { registeredPageCopyIds: options.registeredPageCopyIds } : {}),
  };
  const session = createSyncCoordinator({ lifecycle, now: () => options.now ?? T0, hashPayload }).openScope({ actorId: A, baseUrl, client: client(host), scopeKey: `k:${Math.random()}` });
  t.after(() => session.deactivate());
  return {
    database,
    session,
    async sync() { const request = session.synchronize("task", { reason: "explicit" }); await request.started; return request.promise; },
    async storedKeys() { return (await database.all<{ key: string; value: string }>("SELECT key, value FROM sync_meta WHERE key LIKE 'page_copy%' ORDER BY key")); },
  };
}

test("a copy needs an accepted lease: nothing is stored or read before the first sync", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks"] };
  const phone = await device(t, host);
  await phone.session.savePageCopy("self-profile", "main", { displayName: "A" });
  assert.equal(await phone.session.readPageCopy("self-profile", "main"), null);
  assert.deepEqual(await phone.storedKeys(), []);
  await phone.sync();
  await phone.session.savePageCopy("self-profile", "main", { displayName: "A" });
  const copy = await phone.session.readPageCopy("self-profile", "main");
  assert.deepEqual(copy?.data, { displayName: "A" });
  assert.equal(copy?.syncedAt, new Date(T0).toISOString());
});

test("epoch rotation and revocation drop every copy of the old epoch", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks"] };
  const phone = await device(t, host);
  await phone.sync();
  await phone.session.savePageCopy("agent-actions", "main", { actions: [1] });
  await phone.session.savePageCopy("public-events", "main", { events: [1] });
  host.epoch = "e2";
  await phone.sync();
  assert.equal(await phone.session.readPageCopy("agent-actions", "main"), null);
  assert.equal(await phone.session.readPageCopy("public-events", "main"), null);
  assert.deepEqual(await phone.storedKeys(), []);
  await phone.session.savePageCopy("agent-actions", "main", { actions: [2] });
  assert.deepEqual((await phone.session.readPageCopy("agent-actions", "main"))?.data, { actions: [2] });
  host.granted = [];
  await phone.sync();
  assert.equal(await phone.session.readPageCopy("agent-actions", "main"), null);
  assert.deepEqual(await phone.storedKeys(), []);
});

test("an expired lease locks copies: a device opened eight days later cannot read them", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks"] };
  const phone = await device(t, host);
  await phone.sync();
  await phone.session.savePageCopy("today-page", "main", { total: 3 });
  const later = await device(t, host, { database: phone.database, now: T0 + 8 * 86_400_000 });
  assert.equal(await later.session.readPageCopy("today-page", "main"), null);
  const soon = await device(t, host, { database: phone.database, now: T0 + 86_400_000 });
  assert.deepEqual((await soon.session.readPageCopy("today-page", "main"))?.data, { total: 3 });
});

test("keyed copies keep the 20 most recently opened items; oversize and unregistered copies are refused", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks"] };
  const phone = await device(t, host);
  await phone.sync();
  for (let index = 0; index < 21; index += 1) await phone.session.savePageCopy("meeting-details", `meeting-${index}`, { index });
  assert.equal(await phone.session.readPageCopy("meeting-details", "meeting-0"), null);
  assert.deepEqual((await phone.session.readPageCopy("meeting-details", "meeting-1"))?.data, { index: 1 });
  assert.deepEqual((await phone.session.readPageCopy("meeting-details", "meeting-20"))?.data, { index: 20 });
  // Re-saving an item moves it to the front, so it survives the next eviction.
  await phone.session.savePageCopy("meeting-details", "meeting-1", { index: 1, again: true });
  await phone.session.savePageCopy("meeting-details", "meeting-21", { index: 21 });
  assert.deepEqual((await phone.session.readPageCopy("meeting-details", "meeting-1"))?.data, { index: 1, again: true });
  assert.equal(await phone.session.readPageCopy("meeting-details", "meeting-2"), null);
  const copies = (await phone.storedKeys()).filter((row) => row.key.startsWith("page_copy:"));
  assert.equal(copies.length, 20);

  const huge = { text: "x".repeat(PAGE_COPY_DEFINITIONS.find((entry) => entry.id === "task-suggestions")!.maxBytes) };
  await phone.session.savePageCopy("task-suggestions", "main", huge);
  assert.equal(await phone.session.readPageCopy("task-suggestions", "main"), null);
  await assert.rejects(phone.session.savePageCopy("not-a-copy", "main", {}), /not registered/);
  assert.equal(await phone.session.readPageCopy("not-a-copy", "main"), null);
});

test("the browser mirror encrypts every copy and stores only whitelisted ids", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks"] };
  const phone = await device(t, host, { payloadCodec: xorCodec, registeredPageCopyIds: WEB_MIRROR_PAGE_COPY_IDS.filter((id) => id !== "agent-ledger") });
  await phone.sync();
  await phone.session.savePageCopy("self-profile", "main", { displayName: "Secret Name" });
  await phone.session.savePageCopy("agent-ledger", "page-1", { entries: ["x"] });
  const stored = await phone.storedKeys();
  assert.equal(stored.some((row) => row.value.includes("Secret Name")), false);
  assert.equal(stored.some((row) => row.key.includes("agent-ledger")), false);
  assert.deepEqual((await phone.session.readPageCopy("self-profile", "main"))?.data, { displayName: "Secret Name" });
  assert.equal(await phone.session.readPageCopy("agent-ledger", "page-1"), null);
  // Every registered copy is argued in the threat model and whitelisted for the browser.
  assert.deepEqual([...WEB_MIRROR_PAGE_COPY_IDS].sort(), PAGE_COPY_DEFINITIONS.map((entry) => entry.id).sort());
});
