import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { OrbitApiClient } from "../src/api/client";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { buildOfflineTaskMutation } from "../src/data/sync/task-outbox-mutation";
import { createTaskOutboxUploader } from "../src/data/sync/task-outbox-upload";
import type { SyncClient } from "../src/data/sync/sync-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";

test("task create, edit, and complete replay in order under one server ID", async t => {
  const actorId = "actor-a", workspaceId = "workspace-a", baseUrl = "https://tasks.example", authorizationEpoch = "tasks-e1";
  const localId = "local:123e4567-e89b-42d3-a456-426614174000", formalId = "task:server-1";
  const now = Date.parse("2026-09-20T00:00:00.000Z");
  const directory = mkdtempSync(join(tmpdir(), "orbit-task-outbox-"));
  const databasePath = join(directory, "sync.sqlite");
  let database = new NodeTestDatabase(databasePath);
  t.after(() => { try { database.close(); } catch {} rmSync(directory, { recursive: true, force: true }); });
  await initializeLocalSyncDatabase(database);
  let repository = createLocalSyncRepository({ actorId, database, baseUrl, hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"), registeredDomainIds: ["tasks"], activeReadScopes: () => [{ baseUrl, actorId, workspaceId, domainId: "tasks", authorizationEpoch }] });
  await repository.setLease({ version: 2, baseUrl, actorId, subject: "fixture", sessionExpiresAt: now + 86400000, offlineReadExpiresAt: now + 86400000,
    lastVerifiedAt: now, grants: [{ workspaceId, domainId: "tasks", authorizationEpoch }], databaseKeyRef: "fixture" });
  const createdAt = new Date(now).toISOString();
  const createBody = { title: "Renew passport", category: "personal", idempotencyKey: "task-create" };
  const updateBody = { action: "update", expectedUpdatedAt: createdAt, idempotencyKey: "task-update", patch: { title: "Renew passport this week" } };
  const completeBody = { action: "complete", idempotencyKey: "task-complete" };
  await repository.enqueueOutboxMutation({ ...buildOfflineTaskMutation({ mutationId: "task-create", entityId: localId, operation: "create", baseRevision: null, requestBody: createBody, createdAt }), actorId, workspaceId });
  await repository.enqueueOutboxMutation({ ...buildOfflineTaskMutation({ mutationId: "task-update", entityId: localId, operation: "update", baseRevision: null, requestBody: updateBody, createdAt: new Date(now + 1).toISOString() }), actorId, workspaceId, dependsOn: "task-create" });
  await repository.enqueueOutboxMutation({ ...buildOfflineTaskMutation({ mutationId: "task-complete", entityId: localId, operation: "complete", baseRevision: null, requestBody: completeBody, createdAt: new Date(now + 2).toISOString() }), actorId, workspaceId, dependsOn: "task-update" });

  // Abruptly close and reopen the SQLite database to model app termination and restore.
  database.close();
  database = new NodeTestDatabase(databasePath);
  await initializeLocalSyncDatabase(database);
  repository = createLocalSyncRepository({ actorId, database, baseUrl, hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"), registeredDomainIds: ["tasks"], activeReadScopes: () => [{ baseUrl, actorId, workspaceId, domainId: "tasks", authorizationEpoch }] });
  await repository.setLease({ version: 2, baseUrl, actorId, subject: "fixture", sessionExpiresAt: now + 86400000, offlineReadExpiresAt: now + 86400000,
    lastVerifiedAt: now, grants: [{ workspaceId, domainId: "tasks", authorizationEpoch }], databaseKeyRef: "fixture" });
  assert.equal((await repository.listQueuedMutations({ workspaceId, domainId: "tasks" })).length, 3, "the three frozen writes survive process restart");

  let currentTask: Record<string, unknown> | null = null;
  let revision = 0;
  const syncClient: SyncClient = {
    async getLease() { throw new Error("unused"); }, async getManifest() { throw new Error("unused"); }, async getPage() { throw new Error("unused"); },
    async getDomainPage() {
      if (!currentTask) throw new Error("task response missing");
      revision += 1;
      return { domainId: "tasks", schemaVersion: 1, registryVersion: 1, authorizationEpoch,
        changes: [{ id: formalId, revision: `r${revision}`, operation: "upsert" as const, payload: currentTask }],
        nextCursor: `tasks:e1:${revision}`, highWatermark: String(revision), hasMore: false, generation: "tasks-gen-1", serverTime: new Date(now + revision * 1000).toISOString() };
    },
  };
  const sent: Array<{ method: string; body: unknown }> = [];
  const resultTask = (status: string, title: string, updatedAt: string) => ({ id: formalId, accountId: actorId, ownerUserId: actorId, title, category: "personal", status, priority: "normal", source: "manual", createdAt, updatedAt });
  const writeClient = {
    async post(_path: string, options: { body: unknown }) { sent.push({ method: "POST", body: options.body }); currentTask = resultTask("open", "Renew passport", createdAt); return { success: true as const, status: 201, data: { task: currentTask }, meta: {} }; },
    async patch(_path: string, options: { body: unknown }) {
      const body = options.body as Record<string, unknown>; sent.push({ method: "PATCH", body });
      currentTask = body.action === "update" ? resultTask("open", "Renew passport this week", new Date(now + 1000).toISOString()) : resultTask("completed", "Renew passport this week", new Date(now + 2000).toISOString());
      return { success: true as const, status: 200, data: { task: currentTask }, meta: {} };
    },
    async delete() { throw new Error("unused"); },
  } as unknown as Pick<OrbitApiClient, "post" | "patch" | "delete">;
  const uploader = createTaskOutboxUploader({ actorId, baseUrl, repository, syncClient, writeClient, workspaceId, now: () => now + 10_000 });
  const uploaded = await uploader.run();

  assert.equal(uploaded.acknowledged, 3, JSON.stringify({ uploaded, sent, queued: await repository.listQueuedMutations({ workspaceId, domainId: "tasks" }) }));
  assert.deepEqual(sent.map(item => item.method), ["POST", "PATCH", "PATCH"]);
  assert.equal((sent[1]?.body as Record<string, unknown>).expectedUpdatedAt, createdAt, "create ACK must replace the local expected version before edit replay");
  assert.equal((await repository.listQueuedMutations({ workspaceId, domainId: "tasks" })).length, 0);
  const formal = await repository.listRecordsByIds({ workspaceId, kind: "task", ids: [formalId] });
  assert.equal(formal[0]?.payload && (formal[0].payload as Record<string, unknown>).status, "completed");
  assert.deepEqual(await repository.listRecordsByIds({ workspaceId, kind: "task", ids: [localId] }), []);
  assert.equal(await repository.resolveAlias({ workspaceId, domainId: "tasks", localId, now: new Date(now + 10_000).toISOString() }), formalId);
});
