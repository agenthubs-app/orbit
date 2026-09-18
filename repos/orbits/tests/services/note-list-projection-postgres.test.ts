import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

// Note lists only need `note`; the per-record operations log (idempotency receipts)
// must stay in storage on the list path and still be read on the get/mutation path.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const NOW = "2026-09-18T03:00:00.000Z";

test("note list projection leaves the operations log in storage while idempotent replay still reads it", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_projection_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const listed: Record<string, unknown>[] = [];
  let capture = false;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    if (capture) listed.push(...(result.rows as Record<string, unknown>[]));
    return { rows: result.rows as T[] };
  } };
  const workspaceId = "workspace:note-projection";
  const actorId = "actor:owner";
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const created = [];
    for (let index = 0; index < 3; index += 1) {
      created.push(await notes.create({ actorId, title: `Note ${index}`, body: `Body ${index}`, idempotencyKey: `create:${index}`, now: NOW }));
    }

    capture = true;
    const items = await notes.list({ actorId });
    capture = false;
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((note) => note.id).sort(), created.map((note) => note.id).sort());
    assert.ok(listed.length >= 3, "the list path must have read rows through the captured client");
    for (const row of listed) {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload as Record<string, unknown>;
      assert.ok(!("operations" in payload), `operations must not leave storage on the list path: ${Object.keys(payload).join(",")}`);
      assert.ok("note" in payload && "schemaVersion" in payload, "list projection keeps note and schemaVersion");
    }

    // Replaying the same idempotency key returns the stored note instead of creating a duplicate.
    const replay = await notes.create({ actorId, title: "Note 0", body: "Body 0", idempotencyKey: "create:0", now: NOW });
    assert.equal(replay.id, created[0]!.id);
    assert.equal((await notes.list({ actorId })).length, 3);
    // The get path still carries the receipts the replay relied on.
    const full = await store.getRecord({ workspaceId, collectionName: "notes", recordId: created[0]!.id, userId: actorId });
    assert.ok(Array.isArray(full?.payload.operations) && full.payload.operations.length === 1);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
