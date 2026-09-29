require("tsx/cjs");

const { parentPort, workerData } = require("node:worker_threads");
const { Pool } = require("pg");
const { createNoteRepository } = require("../../features/notes/repository.ts");
const { createNoteService, NoteServiceError } = require("../../features/notes/service.ts");
const { createPostgresLiveRecordStore } = require("../../shared/storage/postgres-live-record-store.ts");

if (!parentPort) throw new Error("Note update worker requires a parent port");

let releaseRead;
let paused = false;
const readBarrier = new Promise((resolve) => { releaseRead = resolve; });
parentPort.on("message", (message) => {
  if (message.type === "continue") releaseRead();
});

async function run() {
  const pool = new Pool({
    connectionString: workerData.connectionString,
    max: 1,
    options: `-c search_path=${workerData.schema}`,
  });
  const client = {
    async query(sql, values) {
      const isConcurrentCreateInsert = workerData.operation === "create" && /^\s*with\b[\s\S]*\binsert\s+into\s+orbit_records\b|^\s*insert\s+into\s+orbit_records\b/i.test(sql);
      if (!paused && isConcurrentCreateInsert) {
        paused = true;
        parentPort.postMessage({ type: "read-ready" });
        await readBarrier;
      }
      const result = await pool.query(sql, values ? [...values] : undefined);
      if (!paused && /^\s*select\b/i.test(sql) && /\borbit_records\b/i.test(sql)) {
        paused = true;
        parentPort.postMessage({ type: "read-ready" });
        await readBarrier;
      }
      return { rows: result.rows };
    },
  };
  try {
    const store = createPostgresLiveRecordStore({ client });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId: workerData.workspaceId }) });
    if (workerData.operation === "create") {
      const created = await notes.create({
        actorId: workerData.actorId,
        title: workerData.title,
        body: workerData.label,
        idempotencyKey: workerData.idempotencyKey,
        now: "2026-09-18T03:01:00.000Z",
      });
      parentPort.postMessage({ type: "result", status: "fulfilled", id: created.id, body: created.body });
    } else {
      const updated = await notes.update({
        actorId: workerData.actorId,
        noteId: workerData.noteId,
        body: workerData.label,
        expectedVersion: 1,
        idempotencyKey: workerData.idempotencyKey ?? `update:${workerData.label}`,
        now: "2026-09-18T03:01:00.000Z",
      });
      parentPort.postMessage({ type: "result", status: "fulfilled", version: updated.version, body: updated.body });
    }
  } catch (error) {
    parentPort.postMessage({
      type: "result",
      status: "rejected",
      ...(error instanceof NoteServiceError ? { code: error.code } : { code: "UNEXPECTED_ERROR" }),
    });
  } finally {
    await pool.end();
  }
}

void run();
