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
  await store.markReady("actor-1", submitted[0]!.export!.id, { fileKey: "account-exports/actor/export-1.zip", checksum: "sha256:first", fileName: "export-1.zip", fileSizeBytes: 10 });
  for (const key of ["second", "third"]) {
    const made = await store.create("actor-1", { scope: ["notes"], idempotencyKey: key });
    assert.equal(made.kind, "accepted");
    await store.markReady("actor-1", made.export!.id, { fileKey: `account-exports/actor/${key}.zip`, checksum: `sha256:${key}`, fileName: `${key}.zip`, fileSizeBytes: 11 });
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
  assert.equal(await store.markReady("actor-2", a.export!.id, { fileKey: "other.zip", checksum: "wrong", fileName: "wrong.zip", fileSizeBytes: 1 }), false);
  assert.equal(await store.markFailed("actor-1", a.export!.id, "system"), true);
  const b = await store.create("actor-1", { scope: ["notes"], idempotencyKey: "two" });
  assert.equal(b.kind, "accepted");
  assert.equal(await store.markFailed("actor-1", b.export!.id, "content"), true);
  const c = await store.create("actor-1", { scope: ["events"], idempotencyKey: "three" });
  assert.equal(c.kind, "accepted");
  assert.equal(await store.markFailed("actor-1", c.export!.id, "content"), true);
  const d = await store.create("actor-1", { scope: ["tasks"], idempotencyKey: "four" });
  assert.equal(d.kind, "accepted", "the system failure refunded one of three daily slots");
  assert.equal((await store.create("actor-1", { scope: ["plans"], idempotencyKey: "five" })).kind, "active");
  assert.equal((await store.create("actor-1", { scope: ["plans"], idempotencyKey: "four" })).kind, "existing");
  await store.markReady("actor-1", d.export!.id, { fileKey: "account-exports/actor/four.zip", checksum: "sha256:four", fileName: "four.zip", fileSizeBytes: 2 });
  assert.equal((await store.create("actor-1", { scope: ["plans"], idempotencyKey: "five" })).kind, "quota");
}));
