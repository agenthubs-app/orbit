import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createContactDeleteService } from "../../features/contacts/delete/service";
import { createPostgresContactCardReader } from "../../features/contacts/storage/contact-list-postgres-reader";
import { createContactDeleteHandlers } from "../../app/api/contacts/[id]/delete-handler";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { AppError } from "../../shared/errors/app-error";

// R11a SC-10（代定 9）：软删除 → 列表消失、メモ（详情状态）原样；30 天内恢复 → 回到列表；过期 / 别人的 → NOT_FOUND。
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const T = "2026-10-01T00:00:00.000Z";

test("R11a: soft delete hides the contact, keeps its memos, restores within 30 days", { skip: !databaseUrl }, async () => {
  const schema = `contact_delete_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const client: LiveRecordSqlClient = { async query<R>(sql: string, values?: readonly unknown[]) { return { rows: (await pool.query(sql, values ? [...values] : undefined)).rows as R[] }; } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const common = { workspaceId: "w", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: T, updatedAt: T, lifecycleState: "active" as const };
    for (const [id, user] of [["c1", "a"], ["c2", "a"], ["cb", "b"]] as const) {
      await store.upsertRecord({ ...common, userId: user, collectionName: "contacts", recordId: id, payload: { id, displayName: `n ${id}`, stage: "active", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: T, updatedAt: T } });
    }
    await store.upsertRecord({ ...common, userId: "a", collectionName: "contact_detail_states", recordId: "contact-detail:a:c1", payload: { actorId: "a", contactId: "c1", status: "active", updatedAt: T, notes: [{ id: "n1", body: "メモ" }] } });
    const revision = async () => (await pool.query("select updated_at::text as r from orbit_records where record_id = 'c1' and collection_name = 'contacts'")).rows[0]?.r as string | undefined;
    let clock = new Date("2026-10-18T00:00:00.000Z");
    const service = createContactDeleteService({ client, workspaceId: "w", now: () => clock });
    const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-test-secret-".repeat(3) });
    const listed = async () => (await reader.page({ limit: 50 }, "a")).items.map((item) => item.id).sort();

    const before = await revision();
    const deleted = await service.remove("a", "c1");
    assert.deepEqual(deleted, { contactId: "c1", deletedAt: "2026-10-18T00:00:00.000Z", restorableUntil: "2026-11-17T00:00:00.000Z" });
    assert.deepEqual(await listed(), ["c2"], "gone from the list");
    if (before !== undefined) assert.notEqual(await revision(), before, "the write touches the row (sync_revision moves with every orbit_records write: the device gets a tombstone)");
    const memo = (await pool.query("select lifecycle_state, payload from orbit_records where record_id = 'contact-detail:a:c1'")).rows[0];
    assert.equal(memo.lifecycle_state, "active", "memos are not moved or changed");
    assert.equal(memo.payload.notes[0].body, "メモ");
    assert.deepEqual(await service.remove("a", "c1"), deleted, "replayed delete (offline queue) is idempotent");
    await assert.rejects(service.remove("a", "cb"), (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND", "someone else's contact");
    await assert.rejects(service.remove("a", "nope"), (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND");

    clock = new Date("2026-10-18T00:00:05.000Z");
    assert.deepEqual(await service.restore("a", "c1"), { contactId: "c1", restoredAt: "2026-10-18T00:00:05.000Z" });
    assert.deepEqual(await listed(), ["c1", "c2"], "back in the list");
    assert.equal((await service.restore("a", "c1")).contactId, "c1", "replayed restore is idempotent");

    await service.remove("a", "c2");
    clock = new Date("2026-11-17T00:00:06.000Z");
    await assert.rejects(service.restore("a", "c2"), (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND", "past 30 days");
    await assert.rejects(service.restore("b", "c1"), (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND");
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});

test("R11a: delete / restore routes need sign-in, refuse demo ids and map errors", async () => {
  const actor = { id: "a", accountId: "a", userId: "u", workspaceId: "w", name: "T", email: "a@example.test" };
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  assert.equal((await createContactDeleteHandlers({ resolveActor: async () => null }).DELETE(new Request("http://x"), context("c1"))).status, 401);
  const calls: string[] = [];
  const handlers = createContactDeleteHandlers({ resolveActor: async () => actor, service: () => ({
    remove: async (actorId, id) => { calls.push(`remove:${actorId}:${id}`); if (id === "gone") throw new AppError("NOT_FOUND", "x"); return { contactId: id, deletedAt: "2026-10-18T00:00:00.000Z", restorableUntil: "2026-11-17T00:00:00.000Z" }; },
    restore: async (actorId, id) => { calls.push(`restore:${actorId}:${id}`); return { contactId: id, restoredAt: "2026-10-18T00:00:01.000Z" }; },
  }) });
  const ok = await handlers.DELETE(new Request("http://x", { method: "DELETE" }), context("c1"));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.restorableUntil, "2026-11-17T00:00:00.000Z");
  assert.equal((await handlers.DELETE(new Request("http://x"), context("gone"))).status, 404);
  assert.equal((await handlers.RESTORE(new Request("http://x", { method: "POST" }), context("c1"))).status, 200);
  assert.deepEqual(calls, ["remove:a:c1", "remove:a:gone", "restore:a:c1"]);
});
