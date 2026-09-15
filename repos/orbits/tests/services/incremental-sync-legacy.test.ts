import assert from "node:assert/strict";
import test from "node:test";

import {
  createIncrementalSyncReadService,
  SyncReadError,
  type SyncReadRow,
  type SyncSqlClient,
} from "../../features/sync/read-service";

const actorId = "account:legacy-owner";
const workspaceId = "workspace:legacy-sync";

function legacyRow(fraction = "123456"): SyncReadRow {
  const time = `2026-09-16T08:00:00.${fraction}+09:00`;
  return {
    workspace_id: workspaceId,
    user_id: actorId,
    collection_name: "tasks",
    record_id: "task:legacy",
    lifecycle_state: "active",
    deleted_at: null,
    sync_revision: "1",
    updated_at: "2026-09-16T00:00:00.000Z",
    payload: {
      id: "task:legacy",
      title: "Synthetic legacy follow-up",
      status: "open",
      contactId: "contact:synthetic",
      connectionId: "connection:synthetic",
      dueAt: "2026-09-18T00:00:00.000Z",
      source: { type: "agent_action", id: "source:synthetic" },
      evidenceIds: ["evidence:synthetic"],
      createdAt: time,
      updatedAt: time,
      version: 1,
    },
  };
}

function read(candidate: SyncReadRow) {
  // Return even foreign rows to exercise the service's storage-boundary check.
  const client: SyncSqlClient = {
    async query<TRow>(sql: string, values: readonly unknown[] = []) {
      assert.deepEqual(values.slice(0, 2), [workspaceId, actorId]);
      const rows = sql.includes("sync:high-watermark")
        ? [{ high_watermark: "1" }]
        : [candidate];
      return { rows: rows as TRow[] };
    },
  };
  return createIncrementalSyncReadService({
    client,
    cursorSecret: "synthetic-legacy-sync-secret-at-least-32-bytes",
  }).readPage({ actorId, workspaceId, limit: 1 });
}

for (const fraction of ["1", "123", "123456"]) {
  test(`legacy tasks without payload owners retain ${fraction.length}-digit timestamps`, async () => {
    const page = await read(legacyRow(fraction));
    assert.equal(page.changes.length, 1);
    assert.equal(page.changes[0].kind, "task");
    const payload = page.changes[0].payload as Record<string, unknown>;
    assert.equal(payload.accountId, actorId);
    assert.equal(payload.ownerUserId, actorId);
    assert.equal(payload.category, "relationship");
    assert.equal(payload.createdAt, `2026-09-16T08:00:00.${fraction}+09:00`);
    assert.equal(payload.updatedAt, `2026-09-16T08:00:00.${fraction}+09:00`);
  });
}

for (const field of ["accountId", "ownerUserId"]) {
  test(`legacy tasks reject conflicting or malformed ${field}`, async () => {
    for (const value of ["account:foreign", null, 1, ""]) {
      const candidate = legacyRow("123");
      Object.assign(candidate.payload, { accountId: actorId });
      (candidate.payload as Record<string, unknown>)[field] = value;
      await assert.rejects(read(candidate), (error: unknown) =>
        error instanceof SyncReadError && error.code === "SYNC_INVALID_RECORD");
    }
  });
}

test("matching explicit legacy owners remain accepted", async () => {
  const candidate = legacyRow();
  Object.assign(candidate.payload, { accountId: actorId, ownerUserId: actorId });
  assert.equal((await read(candidate)).changes.length, 1);
});

for (const field of ["workspace_id", "user_id"] as const) {
  test(`legacy ownership fallback rejects a foreign ${field}`, async () => {
    const candidate = legacyRow("123");
    Object.assign(candidate.payload, { accountId: actorId });
    candidate[field] = "foreign:scope";
    await assert.rejects(read(candidate), (error: unknown) =>
      error instanceof SyncReadError && error.code === "SYNC_SCOPE_MISMATCH");
  });
}

test("legacy timestamps still reject excessive precision, missing timezone, and invalid dates", async () => {
  for (const timestamp of [
    "2026-09-16T08:00:00.1234567+09:00",
    "2026-09-16T08:00:00.123456",
    "2026-13-16T08:00:00.123456+09:00",
  ]) {
    const candidate = legacyRow();
    Object.assign(candidate.payload, { createdAt: timestamp, updatedAt: timestamp });
    await assert.rejects(read(candidate), (error: unknown) =>
      error instanceof SyncReadError && error.code === "SYNC_INVALID_RECORD");
  }
});

test("legacy compatibility keeps enum, optional field, and evidence validation closed", async () => {
  for (const patch of [
    { status: "unknown" }, { source: { type: "unknown", id: "source:synthetic" } },
    { source: null }, { evidenceIds: [] }, { evidenceIds: [1] },
    { contactId: null }, { connectionId: null }, { dueAt: null },
    { id: "task:wrong" },
  ]) {
    const candidate = legacyRow();
    Object.assign(candidate.payload, patch);
    await assert.rejects(read(candidate), (error: unknown) =>
      error instanceof SyncReadError && error.code === "SYNC_INVALID_RECORD");
  }
});
