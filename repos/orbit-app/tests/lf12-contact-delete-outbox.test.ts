import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";

import type { SyncRecord } from "../src/api/contract/sync";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { buildOfflineContactDelete } from "../src/data/sync/contact-outbox-mutation";
import { createContactOutboxUploader } from "../src/data/sync/contact-outbox-upload";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { uploadAllOutboxes } from "../src/data/sync/upload-outboxes";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// LF12: a contact deleted offline waits in the sync outbox (not a separate AsyncStorage list): it is sent by every sync
// round, 2xx and 404 tombstone the mirror row, a network failure retries, an auth refusal stops the round, another
// refusal fails it (the contact shows again), and 元に戻す before the send drops it.
const at = "2026-10-21T09:00:00.000Z";
const mirror: SyncRecord = { actorId: "actor-1", workspaceId: "workspace-1", kind: "contact", id: "record-1", revision: "7", updatedAt: at, deletedAt: null, payload: { id: "record-1" }, syncState: "synced", aiVisibility: "available_when_synced" };

function uploaderFixture(status: number) {
  const mutation = buildOfflineContactDelete({ mutationId: "del-1", recordId: "record-1", contactId: "contact-1", createdAt: at });
  let row: LocalSyncQueuedMutation | null = { ...mutation, actorId: "actor-1", workspaceId: "workspace-1", state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, dependsOn: null };
  const seen = { acknowledged: null as SyncRecord | null, failure: null as { state: string; errorCode: string } | null, paths: [] as string[] };
  const repository = {
    async listQueuedMutations(query: { domainId?: string }) { return row && query.domainId === "contacts" ? [row] : []; },
    async beginOutboxMutationAttempt() { return row; },
    async acknowledgeOutboxMutation(input: { record: SyncRecord }) { seen.acknowledged = input.record; row = null; },
    async markOutboxMutationFailure(input: { state: string; errorCode: string }) { seen.failure = input; row = null; },
    async getRecord() { return mirror; },
  };
  const writeClient = { async delete(path: string) { seen.paths.push(path); return status === 0 ? { success: false, status: 0, error: { code: "ORBIT_APP_NETWORK_ERROR" } } : status < 300 ? { success: true, status, data: {} } : { success: false, status, error: { code: "X" } }; } };
  return { seen, uploader: createContactOutboxUploader({ actorId: "actor-1", workspaceId: "workspace-1", repository: repository as never, writeClient: writeClient as never, now: () => Date.parse(at) }) };
}

test("2xx and 404 tombstone the mirror row; the API is called with the contact's id", async () => {
  for (const status of [200, 404]) {
    const { seen, uploader } = uploaderFixture(status);
    await uploader.run();
    assert.deepEqual(seen.paths, ["/api/contacts/contact-1"]);
    assert.equal(seen.acknowledged?.id, "record-1");
    assert.equal(seen.acknowledged?.deletedAt, at);
    assert.equal(seen.acknowledged?.payload, null);
  }
});

test("a network failure retries, an auth refusal stops the round, another refusal fails the delete", async () => {
  assert.equal((await (async () => { const f = uploaderFixture(0); await f.uploader.run(); return f.seen.failure?.state; })()), "queued");
  const unauthorized = uploaderFixture(401);
  assert.equal((await unauthorized.uploader.run()).status, "unauthorized");
  assert.equal(unauthorized.seen.acknowledged, null);
  const refused = uploaderFixture(400);
  await refused.uploader.run();
  assert.equal(refused.seen.failure?.state, "failed");
});

// The coordinator flow on the real SQLite mirror: the contact arrives by sync, the delete is queued, 元に戻す drops it,
// a queued delete is sent by the next sync round and the row leaves the device.
const baseUrl = "https://host.example";
const A = "actor-a", W = "workspace-host";
const T0 = Date.parse(at);
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");
const contactChange: DomainChange = { id: "record-1", revision: "1", operation: "upsert", payload: {
  id: "record-1", tags: [], detail: null,
  card: { id: "contact-1", displayName: "高橋 美咲", organization: "青葉", role: "", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: at },
  search: { text: "高橋 美咲 青葉", occurredAt: at, updatedAt: at, error: null },
} };
function syncClient(): SyncClient {
  const lease: OfflineReadEnvelope = { version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0, grants: [{ workspaceId: W, domainId: "contacts", authorizationEpoch: "e1" }], databaseKeyRef: "key-ref" };
  return {
    async getLease() { return lease; },
    async getManifest(): Promise<DomainManifest> { return { registryVersion: 2, domains: [{ domainId: "contacts", schemaVersion: 2, workspaceId: W, authorizationEpoch: "e1", generation: "g", watermark: "1", history: "complete", membershipCursor: null }] }; },
    async getDomainPage(input): Promise<DomainPage> {
      const changes = input.cursor ? [] : [contactChange];
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: "e1", changes, nextCursor: "1", highWatermark: "1", hasMore: false, generation: "g", serverTime: at };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}
async function device(t: TestContext, deletes: string[]) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  // Like sync-lifecycle.ts, every access to the device database runs one at a time (a queued delete starts an upload round).
  let lane: Promise<unknown> = Promise.resolve();
  const lifecycle: SyncCoordinatorLifecycle = { async setScope() { return true; }, withDatabase(scope, operation) {
    const run = lane.then(() => operation(database, scope ?? { baseUrl, actorId: A }));
    lane = run.catch(() => undefined);
    return run;
  } };
  const writeClient = { async delete(path: string) { deletes.push(path); return { success: true, status: 200, data: {} }; }, async post() { throw new Error("no post"); }, async patch() { throw new Error("no patch"); } };
  const session = createSyncCoordinator({ lifecycle, now: () => T0, hashPayload, uploadOutbox: uploadAllOutboxes }).openScope({ actorId: A, baseUrl, client: syncClient(), scopeKey: "k", writeClient: writeClient as never });
  t.after(() => session.deactivate());
  const sync = async () => { const request = session.synchronize("contact", { reason: "explicit" }); await request.started; return request.promise; };
  return { session, sync, database };
}
const visible = async (session: Awaited<ReturnType<typeof device>>["session"]) => ((await session.readCollection("contact"))?.records ?? []).map((record) => record.id);
const queued = async (session: Awaited<ReturnType<typeof device>>["session"]) => ((await session.readOutboxOverlay("contact"))?.queuedMutations ?? []).map((row) => `${row.id}:${row.state}`);

test("queue → 元に戻す drops it before any send; a second delete of the same contact is a no-op", async (t) => {
  const deletes: string[] = [];
  const { session, sync } = await device(t, deletes);
  await sync();
  assert.deepEqual(await visible(session), ["record-1"]);
  const mutation = () => buildOfflineContactDelete({ mutationId: `m-${Math.random()}`, recordId: "record-1", contactId: "contact-1", createdAt: at });
  await session.enqueueOfflineContactDelete(mutation());
  await session.enqueueOfflineContactDelete(mutation());
  assert.deepEqual(await queued(session), ["record-1:queued"]);
  assert.equal(await session.cancelOfflineContactDelete("contact-1"), true);
  assert.deepEqual(await queued(session), []);
  assert.equal(await session.cancelOfflineContactDelete("contact-1"), false, "nothing left to cancel");
  assert.deepEqual(deletes, []);
});

test("the next sync round sends the queued delete and the contact leaves the device", async (t) => {
  const deletes: string[] = [];
  const { session, sync } = await device(t, deletes);
  await sync();
  await session.enqueueOfflineContactDelete(buildOfflineContactDelete({ mutationId: "m-1", recordId: "record-1", contactId: "contact-1", createdAt: at }));
  await sync();
  assert.deepEqual(deletes, ["/api/contacts/contact-1"]);
  assert.deepEqual(await queued(session), []);
  assert.deepEqual(await visible(session), []);
});

test("a contact that is not on the device cannot be queued", async (t) => {
  const { session, sync } = await device(t, []);
  await sync();
  await assert.rejects(session.enqueueOfflineContactDelete(buildOfflineContactDelete({ mutationId: "m-2", recordId: "record-x", contactId: "contact-x", createdAt: at })));
});
