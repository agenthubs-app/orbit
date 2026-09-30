import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { SyncRecord } from "../src/api/contract/sync";
import type { DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createOutboxUploader } from "../src/data/sync/outbox-uploader";
import { buildOfflineNoteMutation } from "../src/data/sync/note-outbox-mutation";
import { buildOfflineTaskMutation } from "../src/data/sync/task-outbox-mutation";
import { createSyncCoordinator, type OfflineNoteMutationInput, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import { SyncResetRequiredError, type SyncClient } from "../src/data/sync/sync-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";

// The production path useSyncedCollection walks: lease → mirror scopes → domain pages → reads.
const baseUrl = "https://host.example";
const A = "actor-a";
const W = "workspace-host";
const T0 = Date.parse("2026-09-18T10:00:00.000Z");
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

interface HostState {
  epoch: string;
  grantedDomains: string[];
  rows: Record<string, { id: string; revision: string; payload: Record<string, unknown> }[]>;
  calls: string[];
  now: number;
  /** When set, getManifest throws instead of describing the host. */
  manifestFailure?: Error;
  /** Server registry version (sprint 0113); it is part of every generation and cursor. */
  registry?: number;
}

/** Cursor scope as the server binds it: epoch, plus the registry version once it is not 1. */
function cursorScope(state: HostState): string {
  return (state.registry ?? 1) === 1 ? state.epoch : `${state.epoch}@r${state.registry}`;
}

function lease(state: HostState): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a",
    sessionExpiresAt: state.now + 30 * 86_400_000, offlineReadExpiresAt: state.now + 7 * 86_400_000, lastVerifiedAt: state.now,
    grants: state.grantedDomains.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: state.epoch })),
    databaseKeyRef: "key-ref",
  };
}

function client(state: HostState): SyncClient {
  return {
    async getLease() { state.calls.push("lease"); return lease(state); },
    async getManifest(): Promise<DomainManifest> {
      state.calls.push("manifest");
      if (state.manifestFailure) throw state.manifestFailure;
      return {
        registryVersion: state.registry ?? 1,
        domains: state.grantedDomains.map((domainId) => ({
          domainId, schemaVersion: 1, workspaceId: W, authorizationEpoch: state.epoch, generation: `gen-${cursorScope(state)}`,
          watermark: String((state.rows[domainId] ?? []).length), history: "complete", membershipCursor: null,
        })),
      };
    },
    async getDomainPage(input): Promise<DomainPage> {
      state.calls.push(`page:${input.domainId}:${input.cursor ?? "-"}`);
      if (!state.grantedDomains.includes(input.domainId)) throw new Error(`page for an ungranted domain ${input.domainId}`);
      if (input.cursor && !input.cursor.startsWith(`${cursorScope(state)}:`)) throw new SyncResetRequiredError({ context: { syncErrorCode: "SYNC_RESET_REQUIRED" }, message: "reset" });
      const rows = state.rows[input.domainId] ?? [];
      const after = input.cursor ? Number(input.cursor.split(":")[1]) : 0;
      const slice = rows.slice(after, after + 2);
      const next = after + slice.length;
      return {
        domainId: input.domainId, schemaVersion: 1, registryVersion: state.registry ?? 1, authorizationEpoch: state.epoch,
        changes: slice.map((row) => ({ id: row.id, revision: row.revision, operation: "upsert", payload: row.payload })),
        nextCursor: `${cursorScope(state)}:${next}`, highWatermark: String(rows.length), hasMore: next < rows.length,
        generation: `gen-${cursorScope(state)}`, serverTime: new Date(state.now).toISOString(),
      };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

function device(t: TestContext, database = new NodeTestDatabase()) {
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
  };
  t.after(() => { try { database.close(); } catch { /* closed by a later device */ } });
  return { database, lifecycle };
}

async function ready(database: NodeTestDatabase) { await initializeLocalSyncDatabase(database); }

async function sync(session: ReturnType<ReturnType<typeof createSyncCoordinator>["openScope"]>, kind: "task" | "note") {
  const request = session.synchronize(kind, { reason: "explicit" });
  await request.started;
  return request.promise;
}

function queuedNoteMutation(id = "local:123e4567-e89b-42d3-a456-426614174000"): OfflineNoteMutationInput {
  const mutationId = "123e4567-e89b-42d3-a456-426614174001";
  const createdAt = new Date(T0).toISOString();
  const request = { mutationId, kind: "note", entityId: id, operation: "create", baseRevision: null, patch: { title: "Offline", body: "Private" }, createdAt };
  return {
    domainId: "notes", mutationId, kind: "note", id, operation: "create", patch: request.patch,
    requestJson: JSON.stringify(request), baseRevision: null, createdAt, retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  };
}

test("lease → bound scopes → domain pages → readable mirror, without the legacy /api/sync page", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks", "personal-schedule"], calls: [], now: T0, rows: {
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }, { id: "t2", revision: "r2", payload: { id: "t2" } }, { id: "t3", revision: "r3", payload: { id: "t3" } }],
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  const before = await session.readCollection("task");
  assert.deepEqual(before?.records, [], "nothing readable before the first lease");
  const result = await sync(session, "task");
  assert.equal(result?.error, null, `sync error: ${result?.error}`);
  assert.equal(state.calls[0], "lease");
  assert.ok(state.calls.some((call) => call.startsWith("page:tasks:")) && state.calls.some((call) => call.startsWith("page:notes:")));
  assert.equal(result?.status, "fresh", "the sync result reports a complete bootstrap");
  const tasks = await session.readCollection("task");
  assert.deepEqual(tasks?.records.map((record) => record.id).sort(), ["t1", "t2", "t3"]);
  assert.equal(tasks?.status, "local-ready", "a mirror read reports local-ready; freshness is the sync result's");
  assert.equal((await session.readCollection("note"))?.records.length, 1);
  const stored = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'offline_read_lease'");
  assert.ok(stored, "the lease is kept with the mirror");
  session.deactivate();
});

test("offline task writes require the accepted tasks lease and only enqueue frozen personal requests", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [
    { id: "task:1", revision: "r1", payload: { id: "task:1" } },
    { id: "task:followup", revision: "r2", payload: { id: "task:followup", accountId: A, ownerUserId: A, title: "Follow up", status: "open", category: "relationship", priority: "normal", source: "manual", createdAt: new Date(T0).toISOString(), updatedAt: new Date(T0).toISOString() } },
  ] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "task-outbox" });
  assert.equal((await sync(session, "task"))?.error, null);
  const mutationId = "123e4567-e89b-42d3-a456-426614174001";
  const mutation = buildOfflineTaskMutation({
    mutationId, entityId: "local:123e4567-e89b-42d3-a456-426614174000", operation: "create", baseRevision: null,
    requestBody: { idempotencyKey: mutationId, title: "Private task", category: "personal" }, createdAt: new Date(T0).toISOString(),
  });
  await session.enqueueOfflineTaskMutation(mutation);
  const overlay = await session.readOutboxOverlay("task");
  assert.deepEqual(overlay?.queuedMutations.map(({ actorId, workspaceId, id, operation }) => ({ actorId, workspaceId, id, operation })), [
    { actorId: A, workspaceId: W, id: mutation.id, operation: "create" },
  ]);
  assert.throws(() => buildOfflineTaskMutation({
    mutationId: "123e4567-e89b-42d3-a456-426614174002", entityId: "local:123e4567-e89b-42d3-a456-426614174003", operation: "create", baseRevision: null,
    requestBody: { idempotencyKey: "123e4567-e89b-42d3-a456-426614174002", title: "Follow up", category: "relationship" }, createdAt: new Date(T0 + 1).toISOString(),
  }), /category/u);
  const followupComplete = buildOfflineTaskMutation({
    mutationId: "123e4567-e89b-42d3-a456-426614174004", entityId: "task:followup", operation: "complete", baseRevision: "r2",
    requestBody: { action: "complete", idempotencyKey: "123e4567-e89b-42d3-a456-426614174004" }, createdAt: new Date(T0 + 2).toISOString(),
  });
  await assert.rejects(session.enqueueOfflineTaskMutation(followupComplete), /mirrored personal task/u);
  await database.run("UPDATE sync_outbox SET request_json = ? WHERE mutation_id = ?", [
    JSON.stringify({ idempotencyKey: mutationId, title: "Private task", category: "relationship" }), mutationId,
  ]);
  const localEditId = "123e4567-e89b-42d3-a456-426614174005";
  const localEdit = buildOfflineTaskMutation({
    mutationId: localEditId, entityId: mutation.id, operation: "update", baseRevision: null,
    requestBody: { action: "update", expectedUpdatedAt: new Date(T0).toISOString(), idempotencyKey: localEditId, patch: { title: "edited" } },
    createdAt: new Date(T0 + 3).toISOString(),
  });
  await assert.rejects(session.enqueueOfflineTaskMutation(localEdit), /queued personal create/u,
    "a stored local create is revalidated before a dependent write trusts its privacy category");
  session.deactivate();
});

test("a confirmed notes sync scope can enqueue only a schema-valid private note mutation", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes"], calls: [], now: T0, rows: { notes: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "notes-product-outbox" });
  await sync(session, "note");
  const request = { title: "Offline note", body: "Private body", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: "123e4567-e89b-42d3-a456-426614174001" };
  const mutation = buildOfflineNoteMutation({
    mutationId: request.idempotencyKey, entityId: "local:123e4567-e89b-42d3-a456-426614174000",
    operation: "create", baseRevision: null, requestBody: request, createdAt: new Date(T0).toISOString(),
  });
  await session.enqueueOfflineNoteMutation(mutation);
  const repository = createLocalSyncRepository({ actorId: A, database });
  const queued = await repository.listQueuedMutations({ workspaceId: W });
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.domainId, "notes");
  assert.equal(queued[0]?.requestJson, JSON.stringify(request));
  const overlay = await session.readOutboxOverlay("note");
  assert.equal(overlay?.queuedMutations.length, 1);
  assert.equal(overlay?.queuedMutations[0]?.patch && (overlay.queuedMutations[0].patch as { body?: string }).body, "Private body");
  await assert.rejects(session.enqueueOfflineNoteMutation({
    domainId: "notes", mutationId: "delete-denied",
    kind: "note", id: "canonical-note", operation: "delete", patch: {}, requestJson: "{}",
    baseRevision: "r1", createdAt: new Date(T0).toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  }), /note mutation is not eligible/);
  session.deactivate();
});

test("a note create with an unknown online outcome stays frozen and later edits depend on it", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes"], calls: [], now: T0, rows: { notes: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  let uploadCalls = 0;
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload, uploadOutbox: async () => { uploadCalls += 1; } });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "uncertain-create-result" });
  await sync(session, "note");
  uploadCalls = 0;

  const mutationId = "123e4567-e89b-42d3-a456-426614174011";
  const localId = "local:123e4567-e89b-42d3-a456-426614174010";
  const attemptedAt = new Date(T0).toISOString();
  const createBody = { title: "Before timeout", body: "Frozen request", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: mutationId };
  const uncertainCreate = {
    ...buildOfflineNoteMutation({ mutationId, entityId: localId, operation: "create", baseRevision: null, requestBody: createBody, createdAt: attemptedAt }),
    requestAttemptedAt: attemptedAt,
  } as OfflineNoteMutationInput;
  await session.enqueueOfflineNoteMutation(uncertainCreate);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(uploadCalls, 0, "the screen owns the first request after durably queueing it; do not race the outbox uploader");

  const editedId = "123e4567-e89b-42d3-a456-426614174012";
  const editBody = { title: "After timeout", body: "Latest local text", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: editedId };
  await session.enqueueOfflineNoteMutation(
    buildOfflineNoteMutation({ mutationId: editedId, entityId: localId, operation: "update", baseRevision: "local-v2", requestBody: editBody, createdAt: new Date(T0 + 1).toISOString() }),
  );

  const rows = await createLocalSyncRepository({ actorId: A, database }).listQueuedMutations({ workspaceId: W });
  assert.equal(rows.length, 2, "an attempted create is immutable; later edit is a dependent request");
  assert.equal(rows[0]?.mutationId, mutationId);
  assert.equal(rows[0]?.operation, "create");
  assert.equal(rows[0]?.requestJson, JSON.stringify(createBody));
  assert.equal(rows[0]?.attemptCount, 1);
  assert.equal(rows[0]?.firstAttemptAt, attemptedAt);
  assert.equal(rows[1]?.mutationId, editedId);
  assert.equal(rows[1]?.operation, "update");
  assert.equal(rows[1]?.dependsOn, mutationId);
  assert.equal(rows[1]?.requestJson, JSON.stringify(editBody));

  const retries: { mutationId: string; requestJson: string | null; attemptCount: number }[] = [];
  const uploadRepository = createLocalSyncRepository({
    actorId: A,
    database,
    baseUrl,
    registeredDomainIds: ["notes"],
    activeReadScopes: () => [{ baseUrl, actorId: A, workspaceId: W, domainId: "notes", authorizationEpoch: state.epoch }],
  });
  const uploader = createOutboxUploader({
    repository: uploadRepository,
    workspaceId: W,
    confirmOnline: async () => true,
    uploadOne: async row => {
      retries.push({ mutationId: row.mutationId, requestJson: row.requestJson, attemptCount: row.attemptCount });
      return {
        status: 200,
        record: {
          actorId: A, workspaceId: W, kind: "note", id: "note:canonical-create", revision: `server-${row.mutationId}`,
          updatedAt: new Date(T0).toISOString(), deletedAt: null, payload: { body: "accepted" },
          syncState: "synced", aiVisibility: "excluded",
        },
      };
    },
    pull: async () => undefined,
    now: () => state.now,
    random: () => 0,
    sleep: async () => undefined,
  });
  const upload = await uploader.run();
  assert.equal(upload.acknowledged, 2);
  assert.deepEqual(retries, [
    { mutationId, requestJson: JSON.stringify(createBody), attemptCount: 2 },
    { mutationId: editedId, requestJson: JSON.stringify(editBody), attemptCount: 1 },
  ]);
  assert.deepEqual(await createLocalSyncRepository({ actorId: A, database }).listQueuedMutations({ workspaceId: W }), []);
  session.deactivate();
});

test("note outbox rejects a cached workspace when the accepted lease has no notes grant", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "notes-outbox-no-grant" });
  await sync(session, "task");
  assert.equal((await session.readCollection("task"))?.workspaceId, W, "other grants can retain the workspace identity");
  await assert.rejects(session.enqueueOfflineNoteMutation(queuedNoteMutation()), /note mutation is not eligible/);
  const queued = await createLocalSyncRepository({ actorId: A, database }).listQueuedMutations({ workspaceId: W });
  assert.equal(queued.length, 0);
  session.deactivate();
});

test("note outbox rejects an expired stored lease even when initialize retained its workspace id", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes"], calls: [], now: T0, rows: { notes: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const first = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const original = first.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "notes-outbox-valid-first" });
  await sync(original, "note");
  original.deactivate();

  state.now += 8 * 86_400_000;
  const offline: SyncClient = { ...client(state), async getLease() { throw new Error("offline"); }, async getDomainPage() { throw new Error("offline"); } };
  const second = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const expired = second.openScope({ actorId: A, baseUrl, client: offline, scopeKey: "notes-outbox-expired" });
  assert.equal((await expired.readCollection("note"))?.workspaceId, W, "initialization retains workspace metadata although the lease no longer binds a read scope");
  await assert.rejects(expired.enqueueOfflineNoteMutation(queuedNoteMutation("local:123e4567-e89b-42d3-a456-426614174002")), /note mutation is not eligible/);
  const queued = await createLocalSyncRepository({ actorId: A, database }).listQueuedMutations({ workspaceId: W });
  assert.equal(queued.length, 0);
  expired.deactivate();
});

test("an active notes lease expiring in place cannot admit a queued write", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes"], calls: [], now: T0, rows: { notes: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "notes-outbox-expiry-in-place" });
  await sync(session, "note");
  state.now = T0 + 8 * 86_400_000;
  await assert.rejects(session.enqueueOfflineNoteMutation(queuedNoteMutation()), /note mutation is not eligible/);
  const queued = await createLocalSyncRepository({ actorId: A, database }).listQueuedMutations({ workspaceId: W });
  assert.equal(queued.length, 0);
  session.deactivate();
});

test("a superseded actor scope cannot enqueue against the replacement session", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes"], calls: [], now: T0, rows: { notes: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const first = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "scope-before-switch" });
  await sync(first, "note");
  const replacement = coordinator.openScope({ actorId: "actor-b", baseUrl, client: client(state), scopeKey: "scope-after-switch" });
  await assert.rejects(first.enqueueOfflineNoteMutation(queuedNoteMutation()), /outbox mutation is outside the active actor\/workspace/);
  const queued = await createLocalSyncRepository({ actorId: A, database }).listQueuedMutations({ workspaceId: W });
  assert.equal(queued.length, 0);
  first.deactivate();
  replacement.deactivate();
});

test("online sync triggers the outbox after lease confirmation and before pulling", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const order: string[] = [];
  const coordinator = createSyncCoordinator({
    lifecycle,
    now: () => state.now,
    hashPayload,
    uploadOutbox: async ({ actorId, baseUrl: uploadBaseUrl, workspaceId }) => {
      assert.equal(actorId, A);
      assert.equal(uploadBaseUrl, baseUrl);
      assert.equal(workspaceId, W);
      order.push("upload");
    },
  });
  const host = client(state);
  const session = coordinator.openScope({ actorId: A, baseUrl, client: {
    ...host,
    async getLease(input) { order.push("lease"); return host.getLease(input); },
    async getManifest(input) { order.push("manifest"); return host.getManifest(input); },
  }, scopeKey: "outbox-trigger" });
  const result = await sync(session, "task");
  assert.equal(result?.error, null);
  assert.deepEqual(order, ["lease", "upload", "manifest"]);
  session.deactivate();
});

test("offline identity can refresh its read lease but never uploads the outbox", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  let uploads = 0;
  const coordinator = createSyncCoordinator({
    lifecycle,
    now: () => state.now,
    hashPayload,
    uploadOutbox: async () => { uploads += 1; },
  });
  const session = coordinator.openScope({
    actorId: A, baseUrl, client: client(state), scopeKey: "offline-identity",
    offlineMode: true,
  });
  const result = await sync(session, "task");
  assert.equal(result?.error, null, "online reads can still refresh the lease and mirror");
  assert.equal(uploads, 0, "offline identity must not upload even when reachability returns");
  session.deactivate();
});

test("enqueue in the active test scope starts one online upload→pull cycle", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const order: string[] = [];
  let uploaded!: () => void;
  let uploadStarted = new Promise<void>(resolve => { uploaded = resolve; });
  const localRepository = createLocalSyncRepository({ actorId: A, database, testOnlyOutboxDomains: ["test-offline-write"] });
  const coordinator = createSyncCoordinator({
    lifecycle,
    now: () => state.now,
    hashPayload,
    testOnlyOutboxDomains: ["test-offline-write"],
    uploadOutbox: async ({ signal }) => {
      order.push("upload");
      const uploader = createOutboxUploader({
        repository: localRepository,
        workspaceId: W,
        confirmOnline: async () => true,
        uploadOne: async row => {
          order.push(`send:${row.mutationId}`);
          const record: SyncRecord = {
            actorId: A, workspaceId: W, kind: row.kind, id: "canonical-test-record", revision: "server-r1",
            updatedAt: new Date(T0).toISOString(), deletedAt: null, payload: { title: "test" },
            syncState: "synced", aiVisibility: "excluded",
          };
          return { status: 200, record };
        },
        pull: async () => undefined,
        now: () => state.now,
      });
      signal.addEventListener("abort", () => uploader.cancel(), { once: true });
      const result = await uploader.run();
      if (result.acknowledged) uploaded();
    },
  });
  const host = client(state);
  const session = coordinator.openScope({ actorId: A, baseUrl, client: {
    ...host,
    async getLease(input) { order.push("lease"); return host.getLease(input); },
    async getManifest(input) { order.push("manifest"); return host.getManifest(input); },
  }, scopeKey: "outbox-enqueue-trigger" });
  assert.equal((await sync(session, "task"))?.error, null);
  order.length = 0;
  uploadStarted = new Promise<void>(resolve => { uploaded = resolve; });
  await session.enqueueTestOutboxMutation({
    actorId: A, workspaceId: W, domainId: "test-offline-write", mutationId: "enqueue-trigger",
    kind: "note", id: "local:queued", operation: "create", patch: { title: "test" },
    requestJson: '{"mutationId":"enqueue-trigger","title":"test"}', baseRevision: null,
    createdAt: new Date(T0).toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  await uploadStarted;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order.slice(0, 3), ["lease", "upload", "send:enqueue-trigger"]);
  assert.deepEqual(await localRepository.listQueuedMutations({ workspaceId: W }), []);
  assert.equal(await localRepository.resolveAlias({ workspaceId: W, domainId: "test-offline-write", localId: "local:queued", now: new Date(T0 + 1).toISOString() }), "canonical-test-record");
  assert.equal((await database.get<{ count: number }>("SELECT COUNT(*) AS count FROM sync_records"))?.count, 0);
  session.deactivate();
});

test("an offline cold start rebinds scopes from the stored lease and reads the mirror without the network", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const first = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = first.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  assert.equal((await sync(session, "task"))?.error, null);
  session.deactivate();
  // New process, network down, one hour later.
  state.now = T0 + 3_600_000;
  const offline: SyncClient = { ...client(state), async getLease() { throw new Error("offline"); }, async getDomainPage() { throw new Error("offline"); } };
  const second = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const cold = second.openScope({ actorId: A, baseUrl, client: offline, scopeKey: "k2" });
  const mirror = await cold.readCollection("task");
  assert.deepEqual(mirror?.records.map((record) => record.id), ["t1"], "mirror readable from the stored lease");
  const attempt = await sync(cold, "task");
  assert.match(attempt?.error ?? "", /offline/);
  assert.equal((await cold.readCollection("task"))?.records.length, 1, "a failed refresh leaves the mirror readable");
  // Past the lease's offline window the stored lease no longer binds anything.
  state.now = T0 + 8 * 86_400_000;
  const expired = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload }).openScope({ actorId: A, baseUrl, client: offline, scopeKey: "k3" });
  assert.deepEqual((await expired.readCollection("task"))?.records, [], "an expired lease binds no scope");
});

test("an epoch rotation retires the old epoch and rebuilds the domain in full; revocation empties it", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks"], calls: [], now: T0, rows: {
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }, { id: "t2", revision: "r2", payload: { id: "t2" } }],
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const session = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload }).openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  assert.equal((await sync(session, "task"))?.error, null);
  const count = async (epoch: string) => (await database.get<{ n: number }>("SELECT COUNT(*) AS n FROM sync_records WHERE domain_id='tasks' AND authorization_epoch=?", [epoch]))!.n;
  assert.equal(await count("e1"), 2);
  // Rotation: the server issues e2 and a different row set.
  state.epoch = "e2";
  state.rows.tasks = [{ id: "t2", revision: "r2", payload: { id: "t2" } }, { id: "t9", revision: "r9", payload: { id: "t9" } }];
  state.calls.length = 0;
  assert.equal((await sync(session, "task"))?.error, null);
  assert.equal(await count("e1"), 0, "old epoch rows are gone");
  assert.equal(await count("e2"), 2);
  assert.ok(state.calls.includes("page:tasks:-"), "the new epoch starts from a full pull, not an old cursor");
  assert.deepEqual((await session.readCollection("task"))?.records.map((record) => record.id).sort(), ["t2", "t9"]);
  // Revocation: tasks disappears from the grants.
  state.grantedDomains = ["notes"];
  assert.equal((await sync(session, "task"))?.error, null);
  assert.equal(await count("e2"), 0, "revoked domain has no rows left");
  assert.deepEqual((await session.readCollection("task"))?.records, []);
  assert.equal((await session.readCollection("note"))?.records.length, 1, "other domains untouched");
});

test("manifest gating: an unchanged domain costs lease + manifest and no page; a moved domain pulls only its delta", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks", "personal-schedule"], calls: [], now: T0, rows: {
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }],
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ baseUrl, actorId: A, scopeKey: "s", client: client(state) });
  assert.equal((await sync(session, "task"))?.error, null);
  assert.ok(state.calls.filter((call) => call.startsWith("page:")).length >= 3, "the first sync pulls every domain");

  // Nothing moved: the second explicit sync verifies through the manifest only.
  state.now += 60_000;
  state.calls.length = 0;
  const unchanged = await sync(session, "task");
  assert.equal(unchanged?.error, null);
  assert.deepEqual(state.calls, ["lease", "manifest"], "no domain page when every watermark matches");
  assert.equal(unchanged?.status, "fresh");
  assert.equal(unchanged?.lastSyncedAt, new Date(state.now).toISOString(), "an unchanged domain is confirmed fresh as of the manifest");

  // Only tasks moved: notes and personal-schedule stay untouched.
  state.rows.tasks!.push({ id: "t2", revision: "r2", payload: { id: "t2" } });
  state.now += 60_000;
  state.calls.length = 0;
  const moved = await sync(session, "task");
  assert.equal(moved?.error, null);
  assert.deepEqual(state.calls.filter((call) => call.startsWith("page:")).map((call) => call.split(":")[1]), ["tasks"]);
  assert.deepEqual(moved?.records.map((record) => record.id).sort(), ["t1", "t2"]);
});

test("manifest gating: a manifest failure is reported and every domain is pulled as before", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const reported: unknown[] = [];
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload, onManifestUnavailable: (error) => reported.push(error) });
  const session = coordinator.openScope({ baseUrl, actorId: A, scopeKey: "s", client: client(state) });
  assert.equal((await sync(session, "task"))?.error, null);
  state.manifestFailure = new Error("manifest down");
  state.now += 60_000;
  state.calls.length = 0;
  const result = await sync(session, "task");
  assert.equal(result?.error, null, "a manifest outage never fails the sync");
  assert.deepEqual(state.calls, ["lease", "manifest", "page:tasks:e1:1"], "without a manifest the stored cursor is replayed");
  assert.equal(reported.length, 1);
});

test("a grant outside the platform whitelist never forces a sync: a fresh mount after a complete sync makes no request", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks"], calls: [], now: T0, rows: { tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle: { ...lifecycle, registeredDomainIds: ["tasks"] }, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ baseUrl, actorId: A, scopeKey: "s", client: client(state) });
  assert.equal((await sync(session, "task"))?.error, null);
  assert.deepEqual(state.calls, ["lease", "manifest", "page:tasks:-"], "notes is granted but not bound in this platform");
  state.calls.length = 0;
  state.now += 1_000;
  const request = session.synchronize("task", { reason: "mount" });
  assert.equal(await request.started, false, "within the freshness window a mount does not start a sync");
  assert.deepEqual((await request.promise)?.records.map((record) => record.id), ["t1"]);
  assert.deepEqual(state.calls, []);
});

test("without a mirror the coordinator makes no network request at all", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: {} };
  const lifecycle: SyncCoordinatorLifecycle = { async setScope() { return true; }, async withDatabase() { return null; } };
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ baseUrl, actorId: A, scopeKey: "s", client: client(state) });
  const result = await sync(session, "task");
  assert.equal(result?.status, "failure");
  assert.deepEqual(state.calls, [], "no lease is fetched for a mirror that cannot store it");
  void t;
});

test("the lease decides which domains sync: an unknown granted domain is ignored, a newly granted known domain starts syncing (0113)", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "future-events"], calls: [], now: T0, rows: {
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
    "future-events": [{ id: "x1", revision: "r1", payload: { id: "x1" } }],
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const session = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload }).openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  const first = await sync(session, "note");
  assert.equal(first?.error, null, "an unknown grant does not fail the sync");
  assert.ok(!state.calls.some((call) => call.startsWith("page:future-events")), "no page is pulled for a domain this build does not know");
  const unknownRows = await database.get<{ n: number }>("SELECT COUNT(*) AS n FROM sync_records WHERE domain_id = 'future-events'");
  assert.equal(unknownRows?.n, 0, "nothing is stored for it");
  assert.ok(!state.calls.some((call) => call.startsWith("page:tasks")), "tasks is not granted yet, so it is not pulled");
  assert.deepEqual((await session.readCollection("task"))?.records, []);
  // The server starts granting tasks: the next sync pulls it without any App change.
  state.grantedDomains = ["notes", "tasks", "future-events"];
  state.now += 60_000;
  state.calls.length = 0;
  assert.equal((await sync(session, "task"))?.error, null);
  assert.ok(state.calls.includes("page:tasks:-"), "a newly granted domain starts from a full pull");
  assert.deepEqual((await session.readCollection("task"))?.records.map((record) => record.id), ["t1"]);
  session.deactivate();
});

test("a server registry version change rebuilds each domain once and keeps pending local rows and the outbox (0113)", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks", "personal-schedule"], calls: [], now: T0, registry: 1, rows: {
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1", title: "server" } }, { id: "t2", revision: "r2", payload: { id: "t2" } }],
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const session = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload }).openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  assert.equal((await sync(session, "task"))?.error, null);
  // A local edit waiting for upload: a pending row and its outbox mutation.
  const scope = { baseUrl, actorId: A, workspaceId: W, domainId: "tasks", authorizationEpoch: "e1" };
  const local = createLocalSyncRepository({ actorId: A, database, baseUrl, registeredDomainIds: ["tasks"], activeReadScopes: () => [scope] });
  await local.putRecord({ actorId: A, workspaceId: W, kind: "task", id: "t1", revision: "r1", updatedAt: new Date(T0).toISOString(), deletedAt: null, payload: { id: "t1", title: "edited offline" }, syncState: "pending", aiVisibility: "excluded" });
  await local.enqueueOutboxMutation({ mutationId: "m1", actorId: A, workspaceId: W, kind: "task", id: "t1", operation: "update", patch: { title: "edited offline" }, baseRevision: "r1", createdAt: new Date(T0).toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null });
  // Deploy: registry v2. Generations change and old cursors are refused (SYNC_RESET_REQUIRED).
  state.registry = 2;
  state.rows.tasks!.push({ id: "t3", revision: "r3", payload: { id: "t3" } });
  state.now += 60_000;
  state.calls.length = 0;
  const rebuilt = await sync(session, "task");
  assert.equal(rebuilt?.error, null, `sync error: ${rebuilt?.error}`);
  const pages = state.calls.filter((call) => call.startsWith("page:"));
  for (const domainId of ["notes", "tasks", "personal-schedule"]) {
    assert.ok(pages.includes(`page:${domainId}:-`), `${domainId} rebuilds from a full pull`);
  }
  const tasks = await session.readCollection("task");
  assert.deepEqual(tasks?.records.map((record) => record.id).sort(), ["t1", "t2", "t3"]);
  const kept = tasks?.records.find((record) => record.id === "t1");
  assert.equal(kept?.syncState, "pending", "the pending local row survives the rebuild");
  assert.deepEqual(kept?.payload, { id: "t1", title: "edited offline" }, "and is not overwritten by the server copy");
  assert.deepEqual((await local.listOutboxMutations(W)).map((mutation) => mutation.mutationId), ["m1"], "the outbox is untouched");
  // Once rebuilt, an unchanged registry costs no page.
  state.now += 60_000;
  state.calls.length = 0;
  assert.equal((await sync(session, "task"))?.error, null);
  assert.deepEqual(state.calls, ["lease", "manifest"]);
  session.deactivate();
});
