import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test";
  } catch { return false; }
})();

async function withRecords(run: (context: { db: ReturnType<typeof createTransactionalPostgresClient>; workspaceId: string }) => Promise<void>) {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await run({ db, workspaceId: `workspace:${schema}` });
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
}

test("one idempotency key creates one export under concurrent POSTs and quota follows Tokyo midnight", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => withRecords(async ({ db, workspaceId }) => {
  const module = await import("../../features/account/data-rights/records").catch(() => null);
  assert.ok(module, "R18c export record store is missing");
  let instant = new Date("2026-10-20T14:59:00.000Z");
  const store = module.createAccountExportRecordStore({ db, workspaceId, now: () => instant });
  const input = { scope: ["contacts"] as const, idempotencyKey: "first" };
  const submitted = await Promise.all(Array.from({ length: 8 }, () => store.create("actor-1", input)));
  assert.equal(submitted.filter(result => result.kind === "accepted").length, 1);
  assert.equal(new Set(submitted.map(result => result.export?.id)).size, 1);
  assert.equal((await store.list("actor-1")).length, 1);
  assert.equal((await store.create("actor-1", { scope: ["notes"], idempotencyKey: "blocked" })).kind, "active");
  const firstClaim = await store.claimNext();
  assert.ok(firstClaim);
  await store.markReady("actor-1", submitted[0]!.export!.id, firstClaim.leaseToken, { fileKey: "account-exports/actor/export-1.zip", checksum: "sha256:first", fileName: "export-1.zip", fileSizeBytes: 10 });
  for (const key of ["second", "third"]) {
    const made = await store.create("actor-1", { scope: ["notes"], idempotencyKey: key });
    assert.equal(made.kind, "accepted");
    const claim = await store.claimNext();
    assert.ok(claim);
    await store.markReady("actor-1", made.export!.id, claim.leaseToken, { fileKey: `account-exports/actor/${key}.zip`, checksum: `sha256:${key}`, fileName: `${key}.zip`, fileSizeBytes: 11 });
  }
  assert.equal((await store.create("actor-1", { scope: ["events"], idempotencyKey: "fourth" })).kind, "quota");
  assert.equal((await store.create("actor-2", { scope: ["events"], idempotencyKey: "fourth" })).kind, "accepted");
  instant = new Date("2026-10-20T15:01:00.000Z");
  assert.equal((await store.create("actor-1", { scope: ["events"], idempotencyKey: "next-day" })).kind, "accepted");
}));

test("only system failures refund quota and a different actor cannot read or finish another export", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => withRecords(async ({ db, workspaceId }) => {
  const module = await import("../../features/account/data-rights/records").catch(() => null);
  assert.ok(module, "R18c export record store is missing");
  const store = module.createAccountExportRecordStore({ db, workspaceId, now: () => new Date("2026-10-20T10:00:00.000Z") });
  const a = await store.create("actor-1", { scope: ["contacts"], idempotencyKey: "one" });
  assert.equal(a.kind, "accepted");
  assert.equal(await store.get("actor-2", a.export!.id), null);
  const firstClaim = await store.claimNext();
  assert.ok(firstClaim);
  assert.equal(await store.markReady("actor-2", a.export!.id, firstClaim.leaseToken, { fileKey: "other.zip", checksum: "wrong", fileName: "wrong.zip", fileSizeBytes: 1 }), false);
  assert.equal(await store.markFailed("actor-1", a.export!.id, firstClaim.leaseToken, "system"), true);
  const b = await store.create("actor-1", { scope: ["notes"], idempotencyKey: "two" });
  assert.equal(b.kind, "accepted");
  const secondClaim = await store.claimNext();
  assert.ok(secondClaim);
  assert.equal(await store.markFailed("actor-1", b.export!.id, secondClaim.leaseToken, "content"), true);
  const c = await store.create("actor-1", { scope: ["events"], idempotencyKey: "three" });
  assert.equal(c.kind, "accepted");
  const thirdClaim = await store.claimNext();
  assert.ok(thirdClaim);
  assert.equal(await store.markFailed("actor-1", c.export!.id, thirdClaim.leaseToken, "content"), true);
  const d = await store.create("actor-1", { scope: ["tasks"], idempotencyKey: "four" });
  assert.equal(d.kind, "accepted", "the system failure refunded one of three daily slots");
  assert.equal((await store.create("actor-1", { scope: ["plans"], idempotencyKey: "five" })).kind, "active");
  assert.equal((await store.create("actor-1", { scope: ["plans"], idempotencyKey: "four" })).kind, "existing");
  const fourthClaim = await store.claimNext();
  assert.ok(fourthClaim);
  await store.markReady("actor-1", d.export!.id, fourthClaim.leaseToken, { fileKey: "account-exports/actor/four.zip", checksum: "sha256:four", fileName: "four.zip", fileSizeBytes: 2 });
  assert.equal((await store.create("actor-1", { scope: ["plans"], idempotencyKey: "five" })).kind, "quota");
}));

test("expired worker lease is reclaimable and the old worker cannot publish", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => withRecords(async ({ db, workspaceId }) => {
  const { createAccountExportRecordStore } = await import("../../features/account/data-rights/records");
  let instant = new Date("2026-10-20T10:00:00.000Z");
  const store = createAccountExportRecordStore({ db, workspaceId, now: () => instant });
  const created = await store.create("actor", { scope: ["contacts", "notes"], idempotencyKey: "lease" });
  assert.equal(created.kind, "accepted");
  const first = await store.claimNext();
  assert.ok(first);
  assert.equal((await store.get("actor", created.export!.id))?.status, "running");
  assert.equal(await store.claimNext(), null);
  instant = new Date("2026-10-20T10:03:00.000Z");
  const second = await store.claimNext();
  assert.ok(second);
  assert.notEqual(second.leaseToken, first.leaseToken);
  assert.equal(await store.markProgress("actor", created.export!.id, first.leaseToken, 1), false);
  assert.equal(await store.markReady("actor", created.export!.id, first.leaseToken, { fileKey: "old", checksum: "old", fileName: "old.zip", fileSizeBytes: 1 }), false);
  assert.equal(await store.markProgress("actor", created.export!.id, second.leaseToken, 1), true);
  assert.equal((await store.get("actor", created.export!.id))?.completedItems, 1);
  assert.equal(await store.markReady("actor", created.export!.id, second.leaseToken, { fileKey: "new", checksum: "new", fileName: "new.zip", fileSizeBytes: 2 }), true);
  assert.equal((await store.get("actor", created.export!.id))?.status, "ready");
  const notifications = await db.query<{ payload: Record<string, unknown> }>(`select payload from orbit_records where workspace_id=$1 and collection_name='account_rights_outbox'`, [workspaceId]);
  assert.equal(notifications.rows.length, 1);
  assert.equal(notifications.rows[0]?.payload.exportId, created.export!.id);
  assert.ok(!JSON.stringify(notifications.rows).includes('"new"'));
}));

test("ready expiry starts at completion and transitions only after private file cleanup", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => withRecords(async ({ db, workspaceId }) => {
  const { createAccountExportRecordStore } = await import("../../features/account/data-rights/records");
  let instant = new Date("2026-10-20T00:00:00.000Z");
  const store = createAccountExportRecordStore({ db, workspaceId, now: () => instant });
  const created = await store.create("actor", { scope: ["contacts"], idempotencyKey: "expiry" });
  assert.equal(created.kind, "accepted");
  instant = new Date("2026-10-21T00:00:00.000Z");
  const claim = await store.claimNext();
  assert.ok(claim);
  await store.markReady("actor", created.export!.id, claim.leaseToken, { fileKey: "private.zip", checksum: "sha256:x", fileName: "a.zip", fileSizeBytes: 1 });
  assert.equal((await store.get("actor", created.export!.id))?.expiresAt, "2026-10-28T00:00:00.000Z");
  instant = new Date("2026-10-27T23:59:59.999Z");
  assert.equal((await store.listExpiredReady()).length, 0);
  instant = new Date("2026-10-28T00:00:00.000Z");
  assert.equal((await store.listExpiredReady()).length, 1);
  assert.equal(await store.markExpired("other", created.export!.id), false);
  const { reapExpiredAccountExports } = await import("../../features/account/data-rights/expiry");
  let attempts = 0;
  const storage = { async delete() { attempts++; if (attempts === 1) throw new Error("storage down"); } };
  assert.equal((await reapExpiredAccountExports({ records: store, storage })).failed, 1);
  assert.equal((await store.get("actor", created.export!.id))?.status, "ready");
  assert.equal((await reapExpiredAccountExports({ records: store, storage })).expired, 1);
  assert.equal((await store.get("actor", created.export!.id))?.status, "expired");
  assert.equal((await store.listExpiredReady()).length, 0);
}));
