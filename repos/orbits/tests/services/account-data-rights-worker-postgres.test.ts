import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { unzipSync, strFromU8 } from "fflate";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("worker builds a private ZIP, reports real stages, and queues one notification", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const { createAccountExportRecordStore } = await import("../../features/account/data-rights/records");
    const { runAccountExportOnce } = await import("../../features/account/data-rights/worker");
    const records = createAccountExportRecordStore({ db, workspaceId: "w", now: () => new Date("2026-10-20T10:00:00.000Z") });
    const created = await records.create("actor", { scope: ["contacts", "notes"], idempotencyKey: "worker" });
    assert.equal(created.kind, "accepted");
    const objects = new Map<string, Buffer>();
    const writes: string[] = [];
    const storage = {
      async put(actorId: string, exportId: string, bytes: Buffer) { const key = `${actorId}/${exportId}`; writes.push(key); objects.set(key, bytes); return key; },
      async get(_actorId: string, key: string) { return objects.get(key) ?? null; },
      async delete(_actorId: string, key: string) { objects.delete(key); },
    };
    const result = await runAccountExportOnce({ records, storage, now: () => new Date("2026-10-20T10:00:00.000Z"),
      read: async (_actorId, scope) => [{ id: scope, displayName: "mine", title: scope }],
    });
    assert.equal(result.kind, "ready");
    assert.equal(writes.length, 1);
    const saved = await records.get("actor", created.export!.id);
    assert.equal(saved?.completedItems, 2);
    assert.equal(saved?.status, "ready");
    assert.equal(saved?.fileSizeBytes, objects.get(writes[0]!)?.byteLength);
    assert.deepEqual(Object.keys(unzipSync(objects.get(writes[0]!)!)).sort(), ["contacts.csv", "manifest.json", "notes.csv"]);
    assert.equal(JSON.parse(strFromU8(unzipSync(objects.get(writes[0]!)!)["manifest.json"]!)).files.length, 2);
    assert.equal((await runAccountExportOnce({ records, storage, now: () => new Date(), read: async () => [] })).kind, "idle");
    assert.equal(writes.length, 1);
    const outbox = await db.query(`select record_id from orbit_records where collection_name='account_rights_outbox'`);
    assert.equal(outbox.rows.length, 1);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
