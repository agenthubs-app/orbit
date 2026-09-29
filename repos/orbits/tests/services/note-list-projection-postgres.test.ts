import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { Pool } from "pg";
import { createNoteDetailHandlers } from "../../app/api/notes/[id]/handler";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Note lists only need `note`; the per-record operations log (idempotency receipts)
// must stay in storage on the list path and still be read on the get/mutation path.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const NOW = "2026-09-18T03:00:00.000Z";

test("note create and update pass strict sync revision guards; another actor cannot advance the row or sequence", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `note_strict_owner_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  const workspaceId = `workspace:${schema}`;
  const owner = "actor:note-owner";
  const other = "actor:other";
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await client.query(STRICT_SYNC_REVISION_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const handlers = createNoteDetailHandlers({ service: notes, resolveActor: async () => ({ id: other, workspaceId }), now: () => "2026-09-18T03:02:00.000Z" });

    const created = await notes.create({ actorId: owner, title: "Strict note", body: "Initial", idempotencyKey: "strict-create", now: NOW });
    const updated = await notes.update({ actorId: owner, noteId: created.id, body: "Updated under strict lock", expectedVersion: 1, idempotencyKey: "strict-update", now: "2026-09-18T03:01:00.000Z" });
    assert.equal(updated.version, 2);

    const before = await pool.query<{ user_id: string; payload: { note: { body: string; version: number }; operations: unknown[] }; sync_revision: string }>(
      "select user_id, payload, sync_revision::text from orbit_records where workspace_id=$1 and collection_name='notes' and record_id=$2",
      [workspaceId, created.id],
    );
    assert.equal(before.rows.length, 1);
    const sequenceBefore = (await pool.query<{ last_value: string; is_called: boolean }>("select last_value::text, is_called from orbit_records_sync_revision_seq")).rows[0];

    const response = await handlers.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Unauthorized edit", expectedVersion: 2, idempotencyKey: "other-actor-update" }),
    }), { params: Promise.resolve({ id: created.id }) });
    assert.equal(response.status, 404, "foreign note IDs are actor-scoped at the HTTP handler");

    const after = await pool.query<{ user_id: string; payload: { note: { body: string; version: number }; operations: unknown[] }; sync_revision: string }>(
      "select user_id, payload, sync_revision::text from orbit_records where workspace_id=$1 and collection_name='notes' and record_id=$2",
      [workspaceId, created.id],
    );
    const sequenceAfter = (await pool.query<{ last_value: string; is_called: boolean }>("select last_value::text, is_called from orbit_records_sync_revision_seq")).rows[0];
    assert.deepEqual(after.rows, before.rows, "the owner row and strict revision are unchanged");
    assert.deepEqual(sequenceAfter, sequenceBefore, "a rejected cross-actor request consumes no revision");
    assert.equal(after.rows[0]?.user_id, owner);
    assert.equal(after.rows[0]?.payload.note.body, "Updated under strict lock");
    assert.equal(after.rows[0]?.payload.note.version, 2);
    assert.equal(after.rows[0]?.payload.operations.length, 2);
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});

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

test("concurrent note updates in separate workers use the database version as the compare-and-swap", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_cas_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-cas";
  const actorId = "actor:note-owner";

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const created = await notes.create({
      actorId,
      body: "Before concurrent edit",
      idempotencyKey: "create:cas",
      now: NOW,
    });
    const workers = ["worker-a", "worker-b"].map((label) => new Worker(
      new URL("../support/note-update-worker.cjs", import.meta.url),
      {
        workerData: {
          connectionString: databaseUrl,
          schema,
          workspaceId,
          actorId,
          noteId: created.id,
          label,
        },
      },
    ));
    const ready = workers.map((worker) => new Promise<void>((resolve, reject) => {
      const onMessage = (message: { type?: string }) => {
        if (message.type === "read-ready") {
          worker.off("error", reject);
          resolve();
        }
      };
      worker.on("message", onMessage);
      worker.once("error", reject);
    }));
    const outcomes = workers.map((worker) => new Promise<{ status: string; code?: string }>((resolve, reject) => {
      worker.on("message", (message: { type?: string; status?: string; code?: string }) => {
        if (message.type === "result") resolve({ status: message.status ?? "missing", ...(message.code ? { code: message.code } : {}) });
      });
      worker.once("error", reject);
    }));

    try {
      await Promise.all(ready);
      for (const worker of workers) worker.postMessage({ type: "continue" });
      const results = await Promise.all(outcomes);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.deepEqual(results.filter((result) => result.status === "rejected").map((result) => result.code), ["NOTE_VERSION_CONFLICT"]);
      const final = await notes.get({ actorId, noteId: created.id });
      assert.equal(final?.version, 2);
      assert.ok(final?.body === "worker-a" || final?.body === "worker-b");
      const persisted = await store.getRecord({ workspaceId, collectionName: "notes", recordId: created.id, userId: actorId });
      assert.equal((persisted?.payload.operations as unknown[] | undefined)?.length, 2);
    } finally {
      for (const worker of workers) worker.postMessage({ type: "continue" });
      await Promise.all(workers.map((worker) => worker.terminate()));
    }
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("same update receipt is reread when its second worker loses the version compare-and-swap", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_update_replay_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-update-replay";
  const actorId = "actor:note-owner";
  const idempotencyKey = "update:race-identical-key";

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const created = await notes.create({ actorId, body: "Before replay race", idempotencyKey: "create:update-replay-race", now: NOW });
    const workers = ["same-update", "same-update"].map((label) => new Worker(
      new URL("../support/note-update-worker.cjs", import.meta.url),
      { workerData: { connectionString: databaseUrl, schema, workspaceId, actorId, noteId: created.id, label, idempotencyKey } },
    ));
    const ready = workers.map((worker) => new Promise<void>((resolve, reject) => {
      const onMessage = (message: { type?: string }) => {
        if (message.type === "read-ready") { worker.off("error", reject); resolve(); }
      };
      worker.on("message", onMessage);
      worker.once("error", reject);
    }));
    const outcomes = workers.map((worker) => new Promise<{ status: string; code?: string; version?: number }>((resolve, reject) => {
      worker.on("message", (message: { type?: string; status?: string; code?: string; version?: number }) => {
        if (message.type === "result") resolve({ status: message.status ?? "missing", ...(message.code ? { code: message.code } : {}), ...(message.version ? { version: message.version } : {}) });
      });
      worker.once("error", reject);
    }));

    try {
      await Promise.all(ready);
      for (const worker of workers) worker.postMessage({ type: "continue" });
      const results = await Promise.all(outcomes);
      assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"]);
      assert.deepEqual(results.map(result => result.version), [2, 2]);
      const persisted = await store.getRecord({ workspaceId, collectionName: "notes", recordId: created.id, userId: actorId });
      const payload = persisted?.payload as { note?: { body?: string; version?: number }; operations?: readonly { idempotencyKey?: string }[] } | undefined;
      assert.equal(payload?.note?.body, "same-update");
      assert.equal(payload?.note?.version, 2);
      assert.equal(payload?.operations?.filter(operation => operation.idempotencyKey === idempotencyKey).length, 1);
    } finally {
      for (const worker of workers) worker.postMessage({ type: "continue" });
      await Promise.all(workers.map((worker) => worker.terminate()));
    }
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("concurrent creates with one idempotency key reject a different frozen body across workers", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_create_race_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-create-race";
  const actorId = "actor:note-owner";
  const idempotencyKey = "create:race-same-key";

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const workers = ["candidate-a", "candidate-b"].map((label) => new Worker(
      new URL("../support/note-update-worker.cjs", import.meta.url),
      {
        workerData: {
          operation: "create",
          connectionString: databaseUrl,
          schema,
          workspaceId,
          actorId,
          idempotencyKey,
          title: "Raced idempotent create",
          label,
        },
      },
    ));
    const ready = workers.map((worker) => new Promise<void>((resolve, reject) => {
      const onMessage = (message: { type?: string }) => {
        if (message.type === "read-ready") {
          worker.off("error", reject);
          resolve();
        }
      };
      worker.on("message", onMessage);
      worker.once("error", reject);
    }));
    const outcomes = workers.map((worker) => new Promise<{ status: string; code?: string }>((resolve, reject) => {
      worker.on("message", (message: { type?: string; status?: string; code?: string }) => {
        if (message.type === "result") resolve({ status: message.status ?? "missing", ...(message.code ? { code: message.code } : {}) });
      });
      worker.once("error", reject);
    }));

    try {
      await Promise.all(ready);
      for (const worker of workers) worker.postMessage({ type: "continue" });
      const results = await Promise.all(outcomes);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.deepEqual(results.filter((result) => result.status === "rejected").map((result) => result.code), ["NOTE_IDEMPOTENCY_CONFLICT"]);
      const listed = await notes.list({ actorId });
      assert.equal(listed.length, 1);
      assert.ok(listed[0]?.body === "candidate-a" || listed[0]?.body === "candidate-b");
      const persisted = await store.getRecord({ workspaceId, collectionName: "notes", recordId: listed[0]!.id, userId: actorId });
      const payload = persisted?.payload as { operations?: readonly { idempotencyKey?: string }[] } | undefined;
      assert.equal(payload?.operations?.filter(operation => operation.idempotencyKey === idempotencyKey).length, 1);
    } finally {
      for (const worker of workers) worker.postMessage({ type: "continue" });
      await Promise.all(workers.map((worker) => worker.terminate()));
    }
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("concurrent creates with one idempotency key and identical body replay one durable receipt", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_create_replay_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-create-replay";
  const actorId = "actor:note-owner";
  const idempotencyKey = "create:race-identical-key";
  const workers = ["same-body", "same-body"].map((label) => new Worker(
    new URL("../support/note-update-worker.cjs", import.meta.url),
    {
      workerData: {
        operation: "create",
        connectionString: databaseUrl,
        schema,
        workspaceId,
        actorId,
        idempotencyKey,
        title: "Identical create request",
        label,
      },
    },
  ));

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const ready = workers.map((worker) => new Promise<void>((resolve, reject) => {
      const onMessage = (message: { type?: string }) => {
        if (message.type === "read-ready") { worker.off("error", reject); resolve(); }
      };
      worker.on("message", onMessage);
      worker.once("error", reject);
    }));
    const outcomes = workers.map((worker) => new Promise<{ status: string; id?: string }>((resolve, reject) => {
      worker.on("message", (message: { type?: string; status?: string; id?: string; code?: string }) => {
        if (message.type === "result") resolve({ status: message.status ?? "missing", ...(message.id ? { id: message.id } : {}), ...(message.code ? { status: message.code } : {}) });
      });
      worker.once("error", reject);
    }));

    try {
      await Promise.all(ready);
      for (const worker of workers) worker.postMessage({ type: "continue" });
      const results = await Promise.all(outcomes);
      assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"]);
      assert.equal(results[0]?.id, results[1]?.id);
      const listed = await notes.list({ actorId });
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.body, "same-body");
      const persisted = await store.getRecord({ workspaceId, collectionName: "notes", recordId: listed[0]!.id, userId: actorId });
      const payload = persisted?.payload as { note?: { version?: number }; operations?: readonly { idempotencyKey?: string }[] } | undefined;
      assert.equal(payload?.note?.version, 1);
      assert.equal(payload?.operations?.filter(operation => operation.idempotencyKey === idempotencyKey).length, 1);
    } finally {
      for (const worker of workers) worker.postMessage({ type: "continue" });
      await Promise.all(workers.map((worker) => worker.terminate()));
    }
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("note mutation receipts survive ninety days and reject a changed replay payload", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_receipt_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-receipt";
  const actorId = "actor:note-owner";

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const created = await notes.create({
      actorId,
      body: "Before replay",
      idempotencyKey: "create:receipt-retention",
      now: "2026-01-01T00:00:00.000Z",
    });
    const update = {
      actorId,
      noteId: created.id,
      body: "Committed before the response was lost",
      expectedVersion: 1,
      idempotencyKey: "update:receipt-retention",
      now: "2026-01-02T00:00:00.000Z",
    } as const;

    await notes.update(update); // The caller loses this response and retries the frozen request later.
    const replay = await notes.update({ ...update, now: "2026-04-03T00:00:00.000Z" });
    assert.equal(replay.body, "Committed before the response was lost");
    assert.equal(replay.version, 2);

    await assert.rejects(
      notes.update({ ...update, body: "Different payload, same mutation id", now: "2026-04-03T00:00:01.000Z" }),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "NOTE_IDEMPOTENCY_CONFLICT",
    );
    const persisted = await store.getRecord({ workspaceId, collectionName: "notes", recordId: created.id, userId: actorId });
    const payload = persisted?.payload as { note?: { body?: string; version?: number }; operations?: readonly { idempotencyKey: string }[] } | undefined;
    assert.equal(payload?.note?.body, "Committed before the response was lost");
    assert.equal(payload?.note?.version, 2);
    assert.equal(payload?.operations?.filter((operation) => operation.idempotencyKey === update.idempotencyKey).length, 1);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("note version compare-and-swap permits edits within the same millisecond", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_same_ms_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-same-ms";
  const actorId = "actor:note-owner";

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const sameMillisecond = "2026-09-18T03:00:00.123Z";
    const created = await notes.create({ actorId, body: "Initial", idempotencyKey: "create:same-ms", now: sameMillisecond });
    const first = await notes.update({
      actorId,
      noteId: created.id,
      body: "First edit",
      expectedVersion: 1,
      idempotencyKey: "update:same-ms:first",
      now: sameMillisecond,
    });
    const second = await notes.update({
      actorId,
      noteId: created.id,
      body: "Second edit",
      expectedVersion: first.version,
      idempotencyKey: "update:same-ms:second",
      now: sameMillisecond,
    });

    assert.equal(second.version, 3);
    assert.equal(second.updatedAt, sameMillisecond);
    assert.equal(second.body, "Second edit");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("note version compare-and-swap matches the persisted PostgreSQL microsecond timestamp", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `note_microsecond_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const workspaceId = "workspace:note-microsecond";
  const actorId = "actor:note-owner";
  const storedInstant = "2026-09-18T03:00:00.123456Z";

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const created = await notes.create({ actorId, body: "Initial", idempotencyKey: "create:microsecond", now: storedInstant });
    assert.equal(created.updatedAt, storedInstant);
    const saved = await notes.update({
      actorId,
      noteId: created.id,
      body: "Edit on stored precision",
      expectedVersion: created.version,
      idempotencyKey: "update:microsecond",
      now: storedInstant,
    });

    assert.equal(saved.version, created.version + 1);
    assert.equal(saved.updatedAt, storedInstant);
    const row = await pool.query<{ updated_at: Date; payload: { note: { updatedAt: string } } }>(
      "select updated_at, payload from orbit_records where workspace_id=$1 and collection_name='notes' and record_id=$2",
      [workspaceId, created.id],
    );
    assert.equal(row.rows[0]?.payload.note.updatedAt, storedInstant);
    assert.equal(row.rows[0]?.updated_at.toISOString(), "2026-09-18T03:00:00.123Z");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});
