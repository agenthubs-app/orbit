import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { OrbitApiClient } from "../src/api/client";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { buildOfflineNoteMutation } from "../src/data/sync/note-outbox-mutation";
import { createNoteOutboxUploader } from "../src/data/sync/note-outbox-upload";
import type { SyncClient } from "../src/data/sync/sync-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";

test("note create ACK resolves the returned canonical id from the real mirror page", async (t) => {
  const actorId = "actor-a";
  const workspaceId = "workspace-a";
  const authorizationEpoch = "notes-e1";
  const baseUrl = "https://notes.example";
  const localId = "local:123e4567-e89b-42d3-a456-426614174000";
  const mutationId = "123e4567-e89b-42d3-a456-426614174001";
  const canonicalId = "note:server-canonical";
  const now = Date.parse("2026-09-29T00:00:00.000Z");
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repository = createLocalSyncRepository({
    actorId,
    database,
    baseUrl,
    hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"),
    registeredDomainIds: ["notes"],
    activeReadScopes: () => [{ baseUrl, actorId, workspaceId, domainId: "notes", authorizationEpoch }],
  });
  await repository.setLease({
    version: 2, baseUrl, actorId, subject: "fixture-user", sessionExpiresAt: now + 30 * 86_400_000,
    offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now,
    grants: [{ workspaceId, domainId: "notes", authorizationEpoch }], databaseKeyRef: "fixture-key",
  });
  const requestBody = {
    title: "Canonical note", body: "The server assigned this identifier", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: mutationId,
  };
  await repository.enqueueOutboxMutation({
    ...buildOfflineNoteMutation({ mutationId, entityId: localId, operation: "create", baseRevision: null, requestBody, createdAt: new Date(now).toISOString() }),
    actorId, workspaceId,
  });

  const serverNote = {
    id: canonicalId, accountId: actorId, ownerUserId: actorId, title: requestBody.title, body: requestBody.body,
    manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
  const syncClient: SyncClient = {
    async getLease() { throw new Error("not used"); },
    async getManifest() { throw new Error("not used"); },
    async getPage() { throw new Error("not used"); },
    async getDomainPage() {
      return {
        domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
        changes: [{ id: canonicalId, revision: "opaque-notes-revision-1", operation: "upsert", payload: serverNote }],
        nextCursor: "notes:e1:1", highWatermark: "1", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now).toISOString(),
      };
    },
  };
  const sent: unknown[] = [];
  const writeClient = {
    async post(path: string, options: { body: unknown }) {
      sent.push({ path, body: options.body });
      return { success: true as const, status: 201, data: { note: serverNote }, meta: {} };
    },
    async patch() { throw new Error("create must use POST"); },
  } as unknown as Pick<OrbitApiClient, "post" | "patch">;
  const uploader = createNoteOutboxUploader({ actorId, baseUrl, repository, syncClient, writeClient, workspaceId, now: () => now });
  const result = await uploader.run();

  assert.equal(result.acknowledged, 1, `the mirror lookup must use the canonical ID returned by POST: ${JSON.stringify({ result, sent, queued: await repository.listQueuedMutations({ workspaceId }) })}`);
  assert.deepEqual(sent, [{ path: "/api/notes", body: requestBody }]);
  assert.equal((await repository.listQueuedMutations({ workspaceId })).length, 0);
  assert.equal(await repository.resolveAlias({ workspaceId, domainId: "notes", localId, now: new Date(now).toISOString() }), canonicalId);
  const canonical = await repository.listRecordsByIds({ workspaceId, kind: "note", ids: [canonicalId] });
  assert.equal(canonical[0]?.id, canonicalId);
  assert.deepEqual(canonical[0]?.payload, serverNote);
});

test("a replay ACKs from the real canonical mirror when the delta cursor already advanced", async (t) => {
  const actorId = "actor-a";
  const workspaceId = "workspace-a";
  const authorizationEpoch = "notes-e1";
  const baseUrl = "https://notes.example";
  const localId = "local:123e4567-e89b-42d3-a456-426614174010";
  const mutationId = "123e4567-e89b-42d3-a456-426614174011";
  const canonicalId = "note:server-canonical-replay";
  const now = Date.parse("2026-09-29T00:00:00.000Z");
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repository = createLocalSyncRepository({
    actorId,
    database,
    baseUrl,
    hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"),
    registeredDomainIds: ["notes"],
    activeReadScopes: () => [{ baseUrl, actorId, workspaceId, domainId: "notes", authorizationEpoch }],
  });
  const serverNote = {
    id: canonicalId, accountId: actorId, ownerUserId: actorId, title: "Already mirrored", body: "Response was lost after page apply",
    manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
  await repository.setLease({
    version: 2, baseUrl, actorId, subject: "fixture-user", sessionExpiresAt: now + 30 * 86_400_000,
    offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now,
    grants: [{ workspaceId, domainId: "notes", authorizationEpoch }], databaseKeyRef: "fixture-key",
  });
  const scope = { actorId, baseUrl, workspaceId, domainId: "notes", authorizationEpoch };
  await repository.applyDomainPage(scope, {
    domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
    changes: [{ id: canonicalId, revision: "opaque-notes-revision-1", operation: "upsert", payload: serverNote }],
    nextCursor: "notes:e1:1", highWatermark: "1", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now).toISOString(),
  });
  const requestBody = {
    title: serverNote.title, body: serverNote.body, manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: mutationId,
  };
  await repository.enqueueOutboxMutation({
    ...buildOfflineNoteMutation({ mutationId, entityId: localId, operation: "create", baseRevision: null, requestBody, createdAt: new Date(now).toISOString() }),
    actorId, workspaceId,
  });
  let pageCalls = 0;
  const syncClient: SyncClient = {
    async getLease() { throw new Error("not used"); },
    async getManifest() { throw new Error("not used"); },
    async getPage() { throw new Error("not used"); },
    async getDomainPage({ cursor }) {
      pageCalls += 1;
      assert.equal(cursor, "notes:e1:1", "the already-applied page advanced the durable cursor");
      return {
        domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch, changes: [],
        nextCursor: "notes:e1:1", highWatermark: "1", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now).toISOString(),
      };
    },
  };
  const writeClient = {
    async post() { return { success: true as const, status: 201, data: { note: serverNote }, meta: {} }; },
    async patch() { throw new Error("create must use POST"); },
  } as unknown as Pick<OrbitApiClient, "post" | "patch">;
  const result = await createNoteOutboxUploader({ actorId, baseUrl, repository, syncClient, writeClient, workspaceId, now: () => now }).run();

  assert.equal(pageCalls, 1, "the retry observes the empty delta after the durable cursor already advanced");
  assert.equal(result.acknowledged, 1);
  assert.equal((await repository.listQueuedMutations({ workspaceId })).length, 0);
  assert.equal(await repository.resolveAlias({ workspaceId, domainId: "notes", localId, now: new Date(now).toISOString() }), canonicalId);
});

test("parallel note PATCH acknowledgements cannot overwrite a newer mirror row from a shared cursor delta", async (t) => {
  const actorId = "actor-a";
  const workspaceId = "workspace-a";
  const authorizationEpoch = "notes-e1";
  const baseUrl = "https://notes.example";
  const now = Date.parse("2026-09-29T00:00:00.000Z");
  let clock = now;
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repository = createLocalSyncRepository({
    actorId, database, baseUrl, hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"),
    registeredDomainIds: ["notes"],
    activeReadScopes: () => [{ baseUrl, actorId, workspaceId, domainId: "notes", authorizationEpoch }],
  });
  await repository.setLease({
    version: 2, baseUrl, actorId, subject: "fixture-user", sessionExpiresAt: now + 30 * 86_400_000,
    offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now,
    grants: [{ workspaceId, domainId: "notes", authorizationEpoch }], databaseKeyRef: "fixture-key",
  });
  const originalNotes = ["note:a", "note:b"].map((id, index) => ({
    id, accountId: actorId, ownerUserId: actorId, title: `Original ${id}`, body: `Original body ${id}`,
    manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    index,
  }));
  const scope = { actorId, baseUrl, workspaceId, domainId: "notes", authorizationEpoch };
  await repository.applyDomainPage(scope, {
    domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
    changes: originalNotes.map(note => ({ id: note.id, revision: "opaque-revision-1", operation: "upsert" as const, payload: note })),
    nextCursor: "notes:e1:1", highWatermark: "1", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now).toISOString(),
  });
  const updatedNotes = originalNotes.map(note => ({
    ...note, title: `Updated ${note.id}`, body: `Updated body ${note.id}`, version: 2, updatedAt: new Date(now + 1000).toISOString(),
  }));
  for (const [index, note] of updatedNotes.entries()) {
    const mutationId = `123e4567-e89b-42d3-a456-42661417400${index + 2}`;
    const requestBody = {
      title: note.title, body: note.body, manualContactIds: [], mentions: [], eventIds: [], expectedVersion: 1, idempotencyKey: mutationId,
    };
    await repository.enqueueOutboxMutation({
      ...buildOfflineNoteMutation({ mutationId, entityId: note.id, operation: "update", baseRevision: "opaque-revision-1", requestBody, createdAt: new Date(now + index).toISOString() }),
      actorId, workspaceId,
    });
  }

  let capturedOldB!: () => void;
  const oldBRead = new Promise<void>(resolve => { capturedOldB = resolve; });
  let releaseB!: () => void;
  const releaseBRead = new Promise<void>(resolve => { releaseB = resolve; });
  let bWasCaptured = false;
  let transactionTail: Promise<void> = Promise.resolve();
  const serializeTransaction = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = transactionTail.then(operation);
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  };
  const coordinatedRepository = new Proxy(repository, {
    get(target, key) {
      if (key === "beginOutboxMutationAttempt" || key === "acknowledgeOutboxMutation" || key === "markOutboxMutationFailure") {
        const operation = Reflect.get(target, key, target) as (...args: unknown[]) => Promise<unknown>;
        return (...args: unknown[]) => serializeTransaction(() => operation.apply(target, args));
      }
      if (key === "getRecord") return async (input: { workspaceId: string; kind: "note"; id: string }) => {
        const record = await target.getRecord(input);
        if (input.id === "note:b" && !bWasCaptured) {
          bWasCaptured = true;
          capturedOldB();
          await releaseBRead;
        }
        return record;
      };
      if (key === "applyDomainPage") return (readScope: typeof scope, page: Parameters<typeof repository.applyDomainPage>[1]) => serializeTransaction(async () => {
        await target.applyDomainPage(readScope, page);
        if (page.changes.some(change => change.id === "note:b")) releaseB();
      });
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const requestedCursors: string[] = [];
  const syncClient: SyncClient = {
    async getLease() { throw new Error("not used"); },
    async getManifest() { throw new Error("not used"); },
    async getPage() { throw new Error("not used"); },
    async getDomainPage({ cursor }) {
      requestedCursors.push(cursor ?? "<none>");
      if (cursor === "notes:e1:1") {
        await oldBRead;
        return {
          domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
          changes: updatedNotes.map(note => ({ id: note.id, revision: "opaque-revision-2", operation: "upsert" as const, payload: note })),
          nextCursor: "notes:e1:2", highWatermark: "2", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now + 1000).toISOString(),
        };
      }
      return {
        domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch, changes: [],
        nextCursor: cursor ?? "notes:e1:2", highWatermark: "2", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now + 1000).toISOString(),
      };
    },
  };
  const writeClient = {
    async post() { throw new Error("update must use PATCH"); },
    async patch(path: string) {
      const id = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
      const note = updatedNotes.find(item => item.id === id);
      assert.ok(note);
      return { success: true as const, status: 200, data: { note }, meta: {} };
    },
  } as unknown as Pick<OrbitApiClient, "post" | "patch">;
  const uploader = createNoteOutboxUploader({ actorId, baseUrl, repository: coordinatedRepository, syncClient, writeClient, workspaceId, now: () => clock });
  const result = await uploader.run();

  const finalRecords = await repository.listRecordsByIds({ workspaceId, kind: "note", ids: ["note:a", "note:b"] });
  assert.ok(result.acknowledged >= 1);
  assert.deepEqual(finalRecords.map(record => (record.payload as { version: number }).version), [2, 2]);
  assert.deepEqual(finalRecords.map(record => (record.payload as { body: string }).body), ["Updated body note:a", "Updated body note:b"]);
  const retry = await repository.listQueuedMutations({ workspaceId, domainId: "notes" });
  assert.ok(retry.length <= 1);
  if (retry.length) {
    assert.equal(retry[0]?.id, "note:b");
    assert.equal(retry[0]?.state, "queued");
    clock += 60_000;
    const replay = await uploader.run();
    assert.equal(replay.acknowledged, 1, "the replay validates its PATCH receipt against the already-current canonical mirror");
    assert.equal((await repository.listQueuedMutations({ workspaceId, domainId: "notes" })).length, 0);
  }
  assert.deepEqual(requestedCursors.slice(0, 2), ["notes:e1:1", "notes:e1:2"], "the controlled readers observed the original then advanced shared cursor");
});

test("a 409 conflict stores the latest server version when another note advances the shared cursor", async (t) => {
  const actorId = "actor-conflict";
  const workspaceId = "workspace-conflict";
  const authorizationEpoch = "notes-conflict-e1";
  const baseUrl = "https://notes.example";
  const now = Date.parse("2026-09-29T00:00:00.000Z");
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repository = createLocalSyncRepository({
    actorId, database, baseUrl, hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"),
    registeredDomainIds: ["notes"],
    activeReadScopes: () => [{ baseUrl, actorId, workspaceId, domainId: "notes", authorizationEpoch }],
  });
  await repository.setLease({
    version: 2, baseUrl, actorId, subject: "fixture-user", sessionExpiresAt: now + 30 * 86_400_000,
    offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now,
    grants: [{ workspaceId, domainId: "notes", authorizationEpoch }], databaseKeyRef: "fixture-key",
  });
  const originalNotes = ["note:a", "note:b"].map(id => ({
    id, accountId: actorId, ownerUserId: actorId, title: `Original ${id}`, body: `Original body ${id}`,
    manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  }));
  const scope = { actorId, baseUrl, workspaceId, domainId: "notes", authorizationEpoch };
  await repository.applyDomainPage(scope, {
    domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
    changes: originalNotes.map(note => ({ id: note.id, revision: "opaque-revision-1", operation: "upsert" as const, payload: note })),
    nextCursor: "notes:conflict:1", highWatermark: "1", hasMore: false, generation: "notes-conflict-gen", serverTime: new Date(now).toISOString(),
  });
  for (const [index, note] of originalNotes.entries()) {
    const mutationId = `123e4567-e89b-42d3-a456-42661417410${index}`;
    const requestBody = {
      title: `Local ${note.id}`, body: `Local body ${note.id}`, manualContactIds: [], mentions: [], eventIds: [], expectedVersion: 1, idempotencyKey: mutationId,
    };
    await repository.enqueueOutboxMutation({
      ...buildOfflineNoteMutation({ mutationId, entityId: note.id, operation: "update", baseRevision: "opaque-revision-1", requestBody, createdAt: new Date(now + index).toISOString() }),
      actorId, workspaceId,
    });
  }

  let capturedOldB!: () => void;
  const oldBRead = new Promise<void>(resolve => { capturedOldB = resolve; });
  let releaseB!: () => void;
  const releaseBRead = new Promise<void>(resolve => { releaseB = resolve; });
  let bWasCaptured = false;
  let transactionTail: Promise<void> = Promise.resolve();
  const serializeTransaction = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = transactionTail.then(operation);
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  };
  const coordinatedRepository = new Proxy(repository, {
    get(target, key) {
      if (key === "beginOutboxMutationAttempt" || key === "acknowledgeOutboxMutation" || key === "markOutboxMutationFailure") {
        const operation = Reflect.get(target, key, target) as (...args: unknown[]) => Promise<unknown>;
        return (...args: unknown[]) => serializeTransaction(() => operation.apply(target, args));
      }
      if (key === "getRecord") return async (input: { workspaceId: string; kind: "note"; id: string }) => {
        const record = await target.getRecord(input);
        if (input.id === "note:b" && !bWasCaptured) {
          bWasCaptured = true;
          capturedOldB();
          await releaseBRead;
        }
        return record;
      };
      if (key === "applyDomainPage") return (readScope: typeof scope, page: Parameters<typeof repository.applyDomainPage>[1]) => serializeTransaction(async () => {
        await target.applyDomainPage(readScope, page);
        if (page.changes.some(change => change.id === "note:b")) releaseB();
      });
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const latestNotes = originalNotes.map(note => ({
    ...note, title: `Server ${note.id}`, body: `Server body ${note.id}`, version: 2, updatedAt: new Date(now + 1000).toISOString(),
  }));
  const syncClient: SyncClient = {
    async getLease() { throw new Error("not used"); },
    async getManifest() { throw new Error("not used"); },
    async getPage() { throw new Error("not used"); },
    async getDomainPage({ cursor }) {
      if (cursor === "notes:conflict:1") {
        await oldBRead;
        return {
          domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
          changes: latestNotes.map(note => ({ id: note.id, revision: "opaque-revision-2", operation: "upsert" as const, payload: note })),
          nextCursor: "notes:conflict:2", highWatermark: "2", hasMore: false, generation: "notes-conflict-gen", serverTime: new Date(now + 1000).toISOString(),
        };
      }
      assert.equal(cursor, "notes:conflict:2", "the overlapping read must observe the cursor advanced by the other note's pull");
      return {
        domainId: "notes", schemaVersion: 1, registryVersion: 1, authorizationEpoch, changes: [],
        nextCursor: "notes:conflict:2", highWatermark: "2", hasMore: false, generation: "notes-conflict-gen", serverTime: new Date(now + 1000).toISOString(),
      };
    },
  };
  const writeClient = {
    async post() { throw new Error("updates must use PATCH"); },
    async patch(path: string) {
      const id = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
      if (id === "note:b") return { success: false as const, status: 409, error: { code: "CONFLICT", message: "stale version" }, meta: {} };
      const note = latestNotes.find(item => item.id === id);
      assert.ok(note);
      return { success: true as const, status: 200, data: { note }, meta: {} };
    },
  } as unknown as Pick<OrbitApiClient, "post" | "patch">;

  const result = await createNoteOutboxUploader({ actorId, baseUrl, repository: coordinatedRepository, syncClient, writeClient, workspaceId, now: () => now }).run();

  assert.equal(result.conflicts, 1, JSON.stringify({ result, bWasCaptured, queued: await repository.listQueuedMutations({ workspaceId, domainId: "notes" }) }));
  const [conflict] = await repository.listQueuedMutations({ workspaceId, domainId: "notes" });
  assert.equal(conflict?.id, "note:b");
  assert.equal(conflict?.state, "conflict");
  assert.equal((conflict?.serverSnapshot as { version?: number } | null)?.version, 2,
    "the conflict must retain the latest canonical server version, not the row captured before the shared cursor advanced");
});
