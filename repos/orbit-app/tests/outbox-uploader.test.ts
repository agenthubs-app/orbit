import assert from "node:assert/strict";
import test from "node:test";

import type { SyncRecord } from "../src/api/contract/sync";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { NodeTestDatabase } from "./helpers/node-sync-database";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";

const queued = (overrides: Partial<LocalSyncQueuedMutation> = {}): LocalSyncQueuedMutation => ({
  actorId: "actor-a", workspaceId: "workspace-a", domainId: "test-only", mutationId: "m1", kind: "note",
  id: "record-1", operation: "create", patch: { value: 1 }, requestJson: '{"mutationId":"m1","value":1}',
  baseRevision: null, dependsOn: null, createdAt: "2026-09-16T00:00:00.000Z", retryCount: 0,
  nextRetryAt: null, lastErrorCode: null, state: "queued", attemptCount: 0, firstAttemptAt: null,
  serverSnapshot: null, ...overrides,
});

const serverRecord = (id: string): SyncRecord => ({
  actorId: "actor-a", workspaceId: "workspace-a", kind: "note", id, revision: "r1",
  updatedAt: "2026-09-16T00:00:00.000Z", deletedAt: null, payload: { value: 1 },
  syncState: "synced", aiVisibility: "excluded",
});

function harness(initial: LocalSyncQueuedMutation[]) {
  const rows = new Map(initial.map(row => [row.mutationId, { ...row }]));
  const sent: string[] = [];
  const order: string[] = [];
  const sleeps: number[] = [];
  let now = 0;
  let maxActive = 0;
  let active = 0;
  let online = true;
  let send: (row: LocalSyncQueuedMutation, signal: AbortSignal) => Promise<UploadResponse> = async row => ({ status: 200, record: serverRecord(row.id) });
  const repository = {
    async listQueuedMutations() { return [...rows.values()].map(row => ({ ...row })); },
    async beginOutboxMutationAttempt({ mutationId, attemptedAt }: { mutationId: string; attemptedAt: string }) {
      const row = rows.get(mutationId);
      if (!row || row.state !== "queued") return null;
      const claimed = { ...row, state: "sending" as const, attemptCount: row.attemptCount + 1, retryCount: row.retryCount + 1, firstAttemptAt: row.firstAttemptAt ?? attemptedAt };
      rows.set(mutationId, claimed);
      return claimed;
    },
    async acknowledgeOutboxMutation({ mutationId }: { mutationId: string }) {
      rows.delete(mutationId);
      for (const [id, row] of rows) if (row.dependsOn === mutationId) rows.set(id, { ...row, dependsOn: null });
    },
    async markOutboxMutationFailure(input: { mutationId: string; state: "queued" | "conflict" | "failed"; nextRetryAt: string | null; errorCode: string; serverSnapshot?: unknown }) {
      const row = rows.get(input.mutationId);
      if (row) rows.set(row.mutationId, { ...row, state: input.state, nextRetryAt: input.nextRetryAt, lastErrorCode: input.errorCode, serverSnapshot: input.serverSnapshot ?? null });
    },
  };
  const createUploader = () => import("../src/data/sync/outbox-uploader").then(({ createOutboxUploader }) => createOutboxUploader({
    repository: repository as never,
    workspaceId: "workspace-a",
    confirmOnline: async () => { order.push("online"); return online; },
    uploadOne: async (row, signal) => { active += 1; maxActive = Math.max(maxActive, active); sent.push(row.requestJson ?? ""); order.push(row.mutationId); try { return await send(row, signal); } finally { active -= 1; } },
    pull: async () => { order.push("pull"); },
    now: () => now,
    random: () => 0.5,
    sleep: async (ms: number) => { sleeps.push(ms); now += ms; },
  }));
  return {
    rows, sent, order,
    sleeps,
    get maxActive() { return maxActive; },
    set online(value: boolean) { online = value; },
    set sendFn(value: typeof send) { send = value; },
    advance(ms: number) { now += ms; },
    async uploader() { return createUploader(); },
  };
}

interface UploadResponse {
  status: number;
  record?: SyncRecord;
  snapshot?: unknown;
  retryAfterMs?: number | null;
}

test("uploader confirms online before sending and pulls only after upload", async () => {
  const setup = harness([queued()]);
  const uploader = await setup.uploader();
  const result = await uploader.run();
  assert.deepEqual(setup.order, ["online", "m1", "pull"]);
  assert.equal(result.sent, 1);
});

test("offline confirmation sends nothing and never pulls", async () => {
  const setup = harness([queued()]);
  setup.online = false;
  const uploader = await setup.uploader();
  const result = await uploader.run();
  assert.deepEqual(setup.order, ["online"]);
  assert.equal(result.status, "offline");
});

test("uploader retries retryable responses with injected full-jitter delay and freezes request bytes", async () => {
  const setup = harness([queued()]);
  let calls = 0;
  setup.sendFn = async () => ++calls === 1 ? { status: 503 } : { status: 200, record: serverRecord("record-1") };
  const uploader = await setup.uploader();
  const result = await uploader.run();
  assert.equal(result.sent, 2);
  assert.deepEqual(setup.sent, ['{"mutationId":"m1","value":1}', '{"mutationId":"m1","value":1}']);
});

test("uploader respects conflict and permanent-failure classifications", async () => {
  const setup = harness([queued({ mutationId: "conflict" }), queued({ mutationId: "invalid", id: "record-2" })]);
  setup.sendFn = async row => row.mutationId === "conflict"
    ? { status: 409, snapshot: { revision: "r2" } }
    : { status: 422 };
  const uploader = await setup.uploader();
  const result = await uploader.run();
  assert.equal(result.conflicts, 1);
  assert.equal(result.failed, 1);
  assert.equal(setup.rows.get("conflict")?.state, "conflict");
  assert.deepEqual(setup.rows.get("conflict")?.serverSnapshot, { revision: "r2" });
  assert.equal(setup.rows.get("invalid")?.state, "failed");
});

test("retry-after is capped at five minutes and attempt rounds stop after five sends", async () => {
  const retryAfter = harness([queued()]);
  retryAfter.sendFn = async () => ({ status: 429, retryAfterMs: 500_000 });
  const retryAfterResult = await (await retryAfter.uploader()).run();
  assert.equal(retryAfterResult.sent, 1);
  assert.equal(Date.parse(retryAfter.rows.get("m1")?.nextRetryAt ?? "") - Date.parse("1970-01-01T00:00:00.000Z"), 300_000);

  const capped = harness([queued()]);
  capped.sendFn = async () => ({ status: 503 });
  const cappedResult = await (await capped.uploader()).run();
  assert.equal(cappedResult.sent, 5);
  assert.equal(cappedResult.retrying, 5);
  assert.ok(capped.rows.has("m1"));
});

test("401 stops the round without pulling and 403 pauses only that domain", async () => {
  const unauthorized = harness([queued()]);
  unauthorized.sendFn = async () => ({ status: 401 });
  const unauthorizedResult = await (await unauthorized.uploader()).run();
  assert.equal(unauthorizedResult.status, "unauthorized");
  assert.equal(unauthorized.order.includes("pull"), false);

  const forbidden = harness([queued({ mutationId: "forbidden", domainId: "restricted" }), queued({ mutationId: "allowed", domainId: "test-only", id: "record-2" })]);
  forbidden.sendFn = async row => row.domainId === "restricted" ? { status: 403 } : { status: 200, record: serverRecord(row.id) };
  const forbiddenResult = await (await forbidden.uploader()).run();
  assert.equal(forbidden.rows.get("forbidden")?.state, "queued");
  assert.equal(forbidden.rows.has("allowed"), false);
  assert.equal(forbiddenResult.acknowledged, 1);
});

test("dependent writes fail only when their parent fails permanently, not on conflict", async () => {
  const child = queued({ mutationId: "child", id: "record-child", dependsOn: "parent" });
  const permanent = harness([queued({ mutationId: "parent" }), child]);
  permanent.sendFn = async row => row.mutationId === "parent" ? { status: 422 } : { status: 200, record: serverRecord(row.id) };
  const permanentResult = await (await permanent.uploader()).run();
  assert.equal(permanentResult.failed, 2);
  assert.equal(permanent.rows.get("child")?.state, "failed");
  assert.equal(permanent.sent.some(body => body.includes("child")), false);

  const conflict = harness([queued({ mutationId: "parent" }), child]);
  conflict.sendFn = async () => ({ status: 409, snapshot: { revision: "r2" } });
  const conflictResult = await (await conflict.uploader()).run();
  assert.equal(conflictResult.conflicts, 1);
  assert.equal(conflict.rows.get("child")?.state, "queued");
  assert.equal(conflict.sent.length, 1);
});

test("same-record FIFO and dependency ordering are preserved with bounded parallelism", async () => {
  const setup = harness([
    queued({ mutationId: "parent", id: "record-1", createdAt: "2026-09-16T00:00:00.000Z" }),
    queued({ mutationId: "dependent", id: "record-2", dependsOn: "parent", createdAt: "2026-09-16T00:00:01.000Z" }),
    queued({ mutationId: "next-same-record", id: "record-1", createdAt: "2026-09-16T00:00:02.000Z" }),
    ...[3, 4, 5, 6].map(index => queued({ mutationId: `other-${index}`, id: `record-${index}` })),
  ]);
  const uploader = await setup.uploader();
  await uploader.run();
  assert.deepEqual(setup.order.filter(item => item !== "online" && item !== "pull"), ["parent", "other-3", "other-4", "other-5", "dependent", "next-same-record", "other-6"]);
  assert.ok(setup.order.indexOf("parent") < setup.order.indexOf("dependent"));
  assert.ok(setup.order.indexOf("parent") < setup.order.indexOf("next-same-record"));
  assert.ok(setup.maxActive <= 4);
});

test("concurrent triggers share one active upload round", async () => {
  const setup = harness([queued()]);
  let release!: () => void;
  setup.sendFn = async () => new Promise(resolve => { release = () => resolve({ status: 200, record: serverRecord("record-1") }); });
  const uploader = await setup.uploader();
  const first = uploader.run();
  await new Promise(resolve => setImmediate(resolve));
  const second = uploader.run();
  release();
  assert.deepEqual(await Promise.all([first, second]), await Promise.all([Promise.resolve().then(() => first), Promise.resolve().then(() => second)]));
  assert.equal(setup.order.filter(item => item === "online").length, 1);
});

test("cancel aborts in-flight transport and leaves the mutation queued without pulling", async () => {
  const setup = harness([queued()]);
  setup.sendFn = async (_row, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  });
  const uploader = await setup.uploader();
  const flight = uploader.run();
  await new Promise(resolve => setImmediate(resolve));
  uploader.cancel();
  const result = await flight;
  assert.equal(result.status, "cancelled");
  assert.equal(setup.rows.get("m1")?.state, "queued");
  assert.equal(setup.order.includes("pull"), false);
});

test("a test-only mutation uploads and acknowledges in real SQLite without entering the product mirror", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repository = createLocalSyncRepository({ actorId: "actor-a", database, testOnlyOutboxDomains: ["test-offline-write"] });
  await repository.enqueueOutboxMutation(queued({ domainId: "test-offline-write", id: "local:record-1" }));
  const uploader = await import("../src/data/sync/outbox-uploader").then(({ createOutboxUploader }) => createOutboxUploader({
    repository,
    workspaceId: "workspace-a",
    confirmOnline: async () => true,
    uploadOne: async () => ({ status: 200, record: serverRecord("canonical-1") }),
    pull: async () => undefined,
    now: () => Date.parse("2026-09-16T00:00:00.000Z"),
  }));
  const result = await uploader.run();
  assert.equal(result.acknowledged, 1);
  assert.deepEqual(await repository.listQueuedMutations({ workspaceId: "workspace-a" }), []);
  assert.equal((await database.get<{ count: number }>("SELECT COUNT(*) AS count FROM sync_records"))?.count, 0);
  assert.equal(await repository.resolveAlias({ workspaceId: "workspace-a", domainId: "test-offline-write", localId: "local:record-1", now: "2026-09-16T00:00:01.000Z" }), "canonical-1");
});
