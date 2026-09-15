import { Pool } from "pg";

import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_SYNC_TEST_DATABASE_URL;
const schema = process.env.ORBIT_NOTE_TEST_SCHEMA;
const operation = process.env.ORBIT_NOTE_TEST_OPERATION;
const actorId = process.env.ORBIT_NOTE_TEST_ACTOR_ID;
const workspaceId = process.env.ORBIT_NOTE_TEST_WORKSPACE_ID;
const noteId = process.env.ORBIT_NOTE_TEST_NOTE_ID;

if (!databaseUrl || !schema || !operation || !actorId || !workspaceId || !noteId) {
  throw new Error("Note mutation worker configuration is incomplete");
}

function pauseMutation<TStore extends object>(store: TStore): TStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if ((property === "upsertRecord" || property === "compareAndSwapRecord") && typeof value === "function") {
        return async (...args: unknown[]) => {
          process.send?.({ type: "at_write" });
          await new Promise<void>((resolve) => {
            process.once("message", (message) => {
              if ((message as { type?: unknown })?.type === "release") resolve();
            });
          });
          return Reflect.apply(value, target, args);
        };
      }
      return value;
    },
  });
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });

  try {
    const base = createPostgresLiveRecordStore<Record<string, unknown>>({ client: pool });
    const store = operation === "update" ? pauseMutation(base) : base;
    const service = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const note = operation === "update"
      ? await service.update({
        actorId,
        noteId,
        body: "Stale writer tried to restore it",
        expectedVersion: 1,
        idempotencyKey: "pg-note-cas:update",
        now: "2026-09-16T08:01:00.000Z",
      })
      : await service.delete({
        actorId,
        noteId,
        expectedVersion: 1,
        idempotencyKey: "pg-note-cas:delete",
        now: "2026-09-16T08:02:00.000Z",
      });
    process.send?.({ note, type: "result" });
  } catch (error) {
    process.send?.({
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
      message: error instanceof Error ? error.message : String(error),
      type: "error",
    });
  } finally {
    await pool.end();
    process.disconnect?.();
  }
}

void main();
