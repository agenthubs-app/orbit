import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Pool } from "pg";

import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";

import {
  SYNC_CURSOR_TTL_MS,
  SYNC_CURSOR_MAX_BYTES,
  SyncCursorError,
  createSyncCursorCodec,
} from "../../features/sync/cursor";
import {
  SYNC_DEFAULT_LIMIT,
  SYNC_MAX_LIMIT,
  SYNC_MAX_PAGE_BYTES,
  SYNC_MAX_PAYLOAD_BYTES,
  SyncReadError,
  createIncrementalSyncReadService,
  type SyncReadRow,
  type SyncSqlClient,
} from "../../features/sync/read-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const actorId = "account:sync-owner";
const workspaceId = "workspace:sync";
const secret = "test-only-sync-cursor-secret-with-sufficient-length";
const now = "2026-09-16T08:00:00.000Z";

function row(input: {
  collectionName: "notes" | "tasks" | "personal_schedule_items";
  id: string;
  revision: number;
  actor?: string;
  lifecycleState?: "active" | "deleted";
  payload?: Record<string, unknown>;
}): SyncReadRow {
  const owner = input.actor ?? actorId;
  const updatedAt = `2026-09-16T08:${String(Math.floor(input.revision / 60)).padStart(2, "0")}:${String(input.revision % 60).padStart(2, "0")}.000Z`;
  const payload = input.payload ?? (input.collectionName === "notes"
    ? {
      schemaVersion: 2,
      note: {
        id: input.id,
        accountId: owner,
        ownerUserId: owner,
        title: `Note ${input.id}`,
        body: "Allowed note body",
        manualContactIds: [],
        mentions: [],
        contactIds: [],
        eventIds: [],
        version: 1,
        createdAt: updatedAt,
        updatedAt,
        providerToken: "must-not-leak",
      },
      operations: [{
        idempotencyKey: "private-receipt",
        kind: "create",
        fingerprint: "private-fingerprint",
        resultVersion: 1,
      }],
      attachmentBytes: "must-not-leak",
    }
    : input.collectionName === "tasks"
      ? {
        version: 1,
        task: {
          id: input.id,
          accountId: owner,
          ownerUserId: owner,
          title: `Task ${input.id}`,
          status: "open",
          category: "work",
          priority: "normal",
          source: "manual",
          notes: "Allowed task notes",
          createdAt: updatedAt,
          updatedAt,
          authToken: "must-not-leak",
        },
        activities: [],
        reminders: [{ providerToken: "must-not-leak" }],
      }
      : {
        id: input.id,
        accountId: owner,
        ownerUserId: owner,
        title: `Schedule ${input.id}`,
        kind: "personal",
        category: "personal",
        startsAt: updatedAt,
        state: "upcoming",
        sourceId: input.id,
        evidenceIds: [],
        createdAt: updatedAt,
        updatedAt,
      });
  return {
    collection_name: input.collectionName,
    deleted_at: input.lifecycleState === "deleted" ? updatedAt : null,
    lifecycle_state: input.lifecycleState ?? "active",
    payload,
    record_id: input.id,
    sync_revision: String(input.revision),
    updated_at: updatedAt,
    user_id: owner,
    workspace_id: workspaceId,
  };
}

function relationshipTaskRow(id: string, revision: number): SyncReadRow {
  const base = row({ collectionName: "tasks", id, revision });
  return {
    ...base,
    payload: {
      accountId: actorId,
      id,
      title: `Follow up ${id}`,
      status: "open",
      contactId: "contact:a",
      connectionId: "connection:a",
      dueAt: base.updated_at,
      source: {
        type: "agent_action",
        id,
        label: "Orbit Agent confirmed follow-up",
      },
      evidenceIds: ["evidence:a"],
      createdAt: base.updated_at,
      updatedAt: base.updated_at,
    },
  };
}

class MemorySyncSqlClient implements SyncSqlClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];

  constructor(readonly rows: SyncReadRow[]) {}

  async query<TRow = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.calls.push({ text, values });
    const scopeRows = this.rows.filter((candidate) =>
      candidate.workspace_id === values[0]
      && candidate.user_id === values[1]
      && ["notes", "tasks", "personal_schedule_items"].includes(candidate.collection_name),
    );
    if (text.includes("sync:high-watermark")) {
      return { rows: [{ high_watermark: String(Math.max(0, ...scopeRows.map((candidate) => Number(candidate.sync_revision)))) }] as TRow[] };
    }
    if (text.includes("sync:page")) {
      const after = Number(values[2]);
      const high = Number(values[3]);
      const limit = Number(values[4]);
      const selected = scopeRows
        .filter((candidate) => Number(candidate.sync_revision) > after && Number(candidate.sync_revision) <= high)
        .sort((left, right) => Number(left.sync_revision) - Number(right.sync_revision))
        .slice(0, limit);
      return { rows: selected as TRow[] };
    }
    throw new Error(`Unexpected sync SQL: ${text.slice(0, 40)}`);
  }
}

function service(client: SyncSqlClient) {
  return createIncrementalSyncReadService({ client, cursorSecret: secret, now: () => now });
}

test("v1 freezes cursor/page/payload limits", () => {
  assert.equal(SYNC_CURSOR_TTL_MS, 24 * 60 * 60 * 1_000);
  assert.equal(SYNC_CURSOR_MAX_BYTES, 2_048);
  assert.equal(SYNC_DEFAULT_LIMIT, 100);
  assert.equal(SYNC_MAX_LIMIT, 200);
  assert.equal(SYNC_MAX_PAYLOAD_BYTES, 256 * 1_024);
  assert.equal(SYNC_MAX_PAGE_BYTES, 1_024 * 1_024);
});

test("bootstrap returns authenticated workspace and paginates against one high watermark in unique revision order", async () => {
  const client = new MemorySyncSqlClient([
    row({ collectionName: "notes", id: "note:3", revision: 3 }),
    row({ collectionName: "tasks", id: "task:1", revision: 1 }),
    row({ collectionName: "personal_schedule_items", id: "schedule:2", revision: 2 }),
  ]);
  const reader = service(client);
  const first = await reader.readPage({ actorId, workspaceId, limit: 2 });
  assert.equal(first.workspaceId, workspaceId);
  assert.deepEqual(first.changes.map((change) => change.revision), ["1", "2"]);
  assert.equal(first.highWatermark, "3");
  assert.equal(first.hasMore, true);

  client.rows.push(row({ collectionName: "notes", id: "note:concurrent", revision: 4 }));
  const second = await reader.readPage({ actorId, workspaceId, cursor: first.nextCursor, limit: 2 });
  assert.deepEqual(second.changes.map((change) => change.revision), ["3"]);
  assert.equal(second.highWatermark, "3");
  assert.equal(second.hasMore, false);

  const delta = await reader.readPage({ actorId, workspaceId, cursor: second.nextCursor, limit: 2 });
  assert.deepEqual(delta.changes.map((change) => change.id), ["note:concurrent"]);
  assert.equal(delta.highWatermark, "4");
});

test("schema v1 notes use the canonical parser fallback title", async () => {
  const legacy = row({ collectionName: "notes", id: "note:v1", revision: 1 });
  legacy.payload = {
    schemaVersion: 1,
    note: {
      id: legacy.record_id,
      accountId: actorId,
      ownerUserId: actorId,
      body: "Legacy first line\nLegacy body",
      contactIds: [],
      version: 1,
      createdAt: legacy.updated_at,
      updatedAt: legacy.updated_at,
    },
    operations: [],
  };

  const page = await service(new MemorySyncSqlClient([legacy])).readPage({
    actorId,
    workspaceId,
    limit: 1,
  });

  assert.equal(page.changes.length, 1);
  assert.equal((page.changes[0]?.payload as Record<string, unknown>).title, "Legacy first line");
});

test("an unmappable active row fails the page and retrying the same cursor rereads it", async () => {
  const invalid = row({ collectionName: "notes", id: "note:invalid", revision: 2 });
  invalid.payload = { schemaVersion: 2, note: { id: invalid.record_id }, operations: [] };
  const client = new MemorySyncSqlClient([
    row({ collectionName: "notes", id: "note:first", revision: 1 }),
    invalid,
  ]);
  const reader = service(client);
  const first = await reader.readPage({ actorId, workspaceId, limit: 1 });

  await assert.rejects(
    reader.readPage({ actorId, workspaceId, cursor: first.nextCursor, limit: 1 }),
    (error: unknown) => error instanceof SyncReadError && error.code === "SYNC_INVALID_RECORD",
  );

  invalid.payload = row({ collectionName: "notes", id: invalid.record_id, revision: 2 }).payload;
  const retried = await reader.readPage({ actorId, workspaceId, cursor: first.nextCursor, limit: 1 });
  assert.deepEqual(retried.changes.map((change) => change.id), [invalid.record_id]);
});

test("canonical validators reject invalid mentions, task enums, and schedule timestamps", async () => {
  const invalidMention = row({ collectionName: "notes", id: "note:bad-mention", revision: 1 });
  const note = (invalidMention.payload as Record<string, unknown>).note as Record<string, unknown>;
  note.manualContactIds = [];
  note.contactIds = ["contact:bad"];
  note.mentions = [{ contactId: "contact:bad", start: 0, end: 7, displayText: "mismatch" }];

  const invalidTask = row({ collectionName: "tasks", id: "task:bad-category", revision: 1 });
  ((invalidTask.payload as Record<string, unknown>).task as Record<string, unknown>).category = "invented";

  const invalidSchedule = row({ collectionName: "personal_schedule_items", id: "schedule:bad-time", revision: 1 });
  (invalidSchedule.payload as Record<string, unknown>).startsAt = "tomorrow";

  for (const candidate of [invalidMention, invalidTask, invalidSchedule]) {
    await assert.rejects(
      service(new MemorySyncSqlClient([candidate])).readPage({ actorId, workspaceId, limit: 1 }),
      (error: unknown) => error instanceof SyncReadError && error.code === "SYNC_INVALID_RECORD",
      candidate.record_id,
    );
  }
});

test("an invalid database high watermark fails visibly", async () => {
  const client: SyncSqlClient = {
    async query<TRow>(text: string) {
      if (text.includes("sync:high-watermark")) {
        return { rows: [{ high_watermark: "not-a-revision" }] as TRow[] };
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    service(client).readPage({ actorId, workspaceId, limit: 1 }),
    (error: unknown) => error instanceof SyncReadError && error.code === "SYNC_INVALID_HIGH_WATERMARK",
  );
});

test("a row updated after page one moves above the snapshot and arrives in the immediate next delta", async () => {
  const client = new MemorySyncSqlClient([
    row({ collectionName: "notes", id: "note:1", revision: 1 }),
    row({ collectionName: "notes", id: "note:moving", revision: 2 }),
    row({ collectionName: "notes", id: "note:3", revision: 3 }),
  ]);
  const reader = service(client);
  const first = await reader.readPage({ actorId, workspaceId, limit: 1 });
  const moving = client.rows.find((candidate) => candidate.record_id === "note:moving")!;
  moving.sync_revision = "4";
  moving.updated_at = "2026-09-16T09:00:00.000Z";

  const second = await reader.readPage({ actorId, workspaceId, cursor: first.nextCursor, limit: 2 });
  assert.deepEqual(second.changes.map((change) => change.id), ["note:3"]);
  assert.equal(second.hasMore, false);

  const delta = await reader.readPage({ actorId, workspaceId, cursor: second.nextCursor, limit: 2 });
  assert.deepEqual(delta.changes.map((change) => [change.id, change.revision]), [["note:moving", "4"]]);
});

test("identical business timestamps are ordered only by unique sync revision", async () => {
  const rows = [
    row({ collectionName: "notes", id: "note:second", revision: 2 }),
    row({ collectionName: "tasks", id: "task:first", revision: 1 }),
  ];
  rows[0]!.updated_at = now;
  rows[1]!.updated_at = now;
  const page = await service(new MemorySyncSqlClient(rows)).readPage({
    actorId,
    workspaceId,
    limit: 200,
  });
  assert.deepEqual(page.changes.map((change) => change.revision), ["1", "2"]);
  assert.ok(page.changes.every((change) => change.updatedAt === now));
});

test("deletions emit payload-free tombstones and every tasks row remains kind=task", async () => {
  const client = new MemorySyncSqlClient([
    row({ collectionName: "notes", id: "note:deleted", revision: 1, lifecycleState: "deleted" }),
    relationshipTaskRow("followup-shaped-task:1", 2),
  ]);
  const page = await service(client).readPage({ actorId, workspaceId, limit: 200 });
  assert.deepEqual(page.changes[0], {
    aiVisibility: "available_when_synced",
    id: "note:deleted",
    kind: "note",
    operation: "delete",
    revision: "1",
    updatedAt: "2026-09-16T08:00:01.000Z",
  });
  assert.equal(page.changes[1]?.kind, "task");
  assert.equal((page.changes[1]?.payload as Record<string, unknown>).category, "relationship");
  assert.equal((page.changes[1]?.payload as Record<string, unknown>).relatedContactId, "contact:a");
  assert.equal((page.changes[1]?.payload as Record<string, unknown>).source, "ai_confirmed");
  assert.equal(page.changes.some((change) => String(change.kind) === "relationship_followup"), false);
});

test("canonical note deletion becomes one payload-free sync tombstone", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
  const created = await notes.create({
    actorId,
    body: "Delete through the canonical note service",
    idempotencyKey: "sync-note:create",
    now,
  });
  await notes.delete({
    actorId,
    noteId: created.id,
    expectedVersion: 1,
    idempotencyKey: "sync-note:delete",
    now: "2026-09-16T08:01:00.000Z",
  });
  const tombstone = await store.getRecord({
    workspaceId,
    collectionName: "notes",
    recordId: created.id,
    includeDeleted: true,
  });
  assert.ok(tombstone);

  const page = await service(new MemorySyncSqlClient([{
    collection_name: "notes",
    deleted_at: tombstone.deletedAt ?? null,
    lifecycle_state: tombstone.lifecycleState,
    payload: tombstone.payload,
    record_id: tombstone.recordId,
    sync_revision: "2",
    updated_at: tombstone.updatedAt,
    user_id: tombstone.userId ?? null,
    workspace_id: tombstone.workspaceId,
  }])).readPage({ actorId, workspaceId, limit: 200 });

  assert.deepEqual(page.changes, [{
    aiVisibility: "available_when_synced",
    id: created.id,
    kind: "note",
    operation: "delete",
    revision: "2",
    updatedAt: "2026-09-16T08:01:00.000Z",
  }]);
});

test("domain mappers emit allowlisted entity payloads without secrets, activities, reminders, or storage receipts", async () => {
  const client = new MemorySyncSqlClient([
    row({ collectionName: "notes", id: "note:1", revision: 1 }),
    row({ collectionName: "tasks", id: "task:2", revision: 2 }),
    row({ collectionName: "personal_schedule_items", id: "schedule:3", revision: 3 }),
  ]);
  const page = await service(client).readPage({ actorId, workspaceId, limit: 200 });
  const serialized = JSON.stringify(page);
  for (const denied of ["providerToken", "attachmentBytes", "authToken", "rawAttachment", "operations", "activities", "reminders"]) {
    assert.equal(serialized.includes(denied), false, denied);
  }
  assert.equal((page.changes[0]?.payload as Record<string, unknown>).body, "Allowed note body");
  assert.equal((page.changes[1]?.payload as Record<string, unknown>).notes, "Allowed task notes");
});

test("foreign rows never enter the actor-scoped stream", async () => {
  const client = new MemorySyncSqlClient([
    row({ collectionName: "notes", id: "owned", revision: 1 }),
    row({ collectionName: "notes", id: "foreign", revision: 2, actor: "account:foreign" }),
  ]);
  const page = await service(client).readPage({ actorId, workspaceId, limit: 200 });
  assert.deepEqual(page.changes.map((change) => change.id), ["owned"]);
  assert.deepEqual(client.calls.at(-1)?.values.slice(0, 2), [workspaceId, actorId]);
  assert.match(client.calls.at(-1)?.text ?? "", /order by sync_revision asc/i);
});

test("cursor signatures bind version/actor/workspace and enforce the 24-hour TTL and 2048-byte cap", () => {
  const codec = createSyncCursorCodec({ secret });
  const token = codec.encode({ actorId, workspaceId, afterRevision: "2", highWatermark: "5" }, Date.parse(now));
  assert.deepEqual(codec.decode(token, { actorId, workspaceId }, Date.parse(now) + SYNC_CURSOR_TTL_MS - 1), {
    actorId,
    workspaceId,
    afterRevision: "2",
    highWatermark: "5",
  });
  for (const operation of [
    () => codec.decode(`${token}x`, { actorId, workspaceId }, Date.parse(now)),
    () => createSyncCursorCodec({ secret: `${secret}-rotated` }).decode(
      token,
      { actorId, workspaceId },
      Date.parse(now),
    ),
    () => codec.decode(token, { actorId: "account:foreign", workspaceId }, Date.parse(now)),
    () => codec.decode(token, { actorId, workspaceId }, Date.parse(now) + SYNC_CURSOR_TTL_MS),
    () => codec.decode("x".repeat(SYNC_CURSOR_MAX_BYTES + 1), { actorId, workspaceId }, Date.parse(now)),
    () => codec.encode({ actorId: "a".repeat(3_000), workspaceId, afterRevision: "0", highWatermark: "0" }, Date.parse(now)),
  ]) {
    assert.throws(operation, (error: unknown) => error instanceof SyncCursorError && error.code === "SYNC_RESET_REQUIRED");
  }
});

test("a correctly signed cursor with a non-v1 version still requires reset", () => {
  const payload = Buffer.from(JSON.stringify({
    version: 2,
    actorId,
    workspaceId,
    afterRevision: "2",
    highWatermark: "5",
    issuedAt: Date.parse(now),
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  const token = `${payload}.${signature}`;

  assert.throws(
    () => createSyncCursorCodec({ secret }).decode(token, { actorId, workspaceId }, Date.parse(now)),
    (error: unknown) => error instanceof SyncCursorError && error.code === "SYNC_RESET_REQUIRED",
  );
});

test("cursor secrets require at least 32 UTF-8 bytes", () => {
  assert.throws(
    () => createSyncCursorCodec({ secret: "x".repeat(31) }),
    (error: unknown) => error instanceof SyncCursorError && error.code === "SYNC_CURSOR_SECRET_MISSING",
  );
  assert.doesNotThrow(() => createSyncCursorCodec({ secret: "密".repeat(11) }));
});

test("non-canonical base64url signature spellings are rejected", () => {
  const codec = createSyncCursorCodec({ secret });
  const token = codec.encode({ actorId, workspaceId, afterRevision: "2", highWatermark: "5" }, Date.parse(now));
  const [payload, signature] = token.split(".") as [string, string];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const lastIndex = alphabet.indexOf(signature.at(-1) ?? "");
  assert.equal(lastIndex % 4, 0);
  const alias = `${signature.slice(0, -1)}${alphabet[lastIndex + 1]}`;
  assert.deepEqual(Buffer.from(alias, "base64url"), Buffer.from(signature, "base64url"));

  assert.throws(
    () => codec.decode(`${payload}.${alias}`, { actorId, workspaceId }, Date.parse(now)),
    (error: unknown) => error instanceof SyncCursorError && error.code === "SYNC_RESET_REQUIRED",
  );
});

test("cursor configuration fails closed when the server secret is missing", () => {
  assert.throws(
    () => createSyncCursorCodec({ secret: "" }),
    (error: unknown) => error instanceof SyncCursorError && error.code === "SYNC_CURSOR_SECRET_MISSING",
  );
});

test("oversized mapped records and success envelopes fail explicitly without truncation", async () => {
  const huge = row({ collectionName: "notes", id: "note:huge", revision: 1 });
  const hugePayload = huge.payload as Record<string, unknown>;
  (hugePayload.note as Record<string, unknown>).body = "界".repeat(Math.ceil(SYNC_MAX_PAYLOAD_BYTES / 3) + 1);
  await assert.rejects(
    service(new MemorySyncSqlClient([huge])).readPage({ actorId, workspaceId, limit: 1 }),
    (error: unknown) => error instanceof SyncReadError && error.code === "SYNC_PAYLOAD_TOO_LARGE",
  );

  const many = Array.from({ length: 200 }, (_, index) => {
    const candidate = row({ collectionName: "notes", id: `note:${index}`, revision: index + 1 });
    const payload = candidate.payload as Record<string, unknown>;
    (payload.note as Record<string, unknown>).body = "x".repeat(6_000);
    return candidate;
  });
  await assert.rejects(
    service(new MemorySyncSqlClient(many)).readPage({ actorId, workspaceId, limit: 200 }),
    (error: unknown) => error instanceof SyncReadError && error.code === "SYNC_PAGE_TOO_LARGE",
  );
});

const databaseUrl = process.env.ORBIT_SYNC_TEST_DATABASE_URL;

type WorkerMessage = {
  code?: string;
  message?: string;
  note?: { version?: number };
  type: "at_write" | "error" | "result";
};

function startNoteMutationWorker(input: {
  actorId: string;
  noteId: string;
  operation: "delete" | "update";
  schema: string;
  workspaceId: string;
}): ChildProcess {
  return fork(fileURLToPath(new URL("../fixtures/note-mutation-worker.ts", import.meta.url)), [], {
    env: {
      ...process.env,
      ORBIT_NOTE_TEST_ACTOR_ID: input.actorId,
      ORBIT_NOTE_TEST_NOTE_ID: input.noteId,
      ORBIT_NOTE_TEST_OPERATION: input.operation,
      ORBIT_NOTE_TEST_SCHEMA: input.schema,
      ORBIT_NOTE_TEST_WORKSPACE_ID: input.workspaceId,
    },
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

function nextWorkerMessage(worker: ChildProcess, type?: WorkerMessage["type"]): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Note mutation worker exited before ${type ?? "a message"}: ${code}`));
    };
    const onMessage = (message: WorkerMessage) => {
      if (type && message.type !== type) return;
      cleanup();
      resolve(message);
    };
    const cleanup = () => {
      worker.off("exit", onExit);
      worker.off("message", onMessage);
    };
    worker.on("exit", onExit);
    worker.on("message", onMessage);
  });
}

test("real PostgreSQL CAS prevents a stale update instance from reviving a deleted note", {
  skip: databaseUrl ? false : "ORBIT_SYNC_TEST_DATABASE_URL is not configured",
}, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_note_cas_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
  const connection = (max: number) => new Pool({
    connectionString: databaseUrl,
    max,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  const seedPool = connection(1);
  let updateWorker: ChildProcess | undefined;
  let deleteWorker: ChildProcess | undefined;
  try {
    await admin.query(`create schema ${schema}`);
    await seedPool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const seeded = createNoteService({
      repository: createNoteRepository({
        store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: seedPool }),
        workspaceId,
      }),
    });
    const createCommand = {
      actorId,
      body: "Never resurrect this note",
      idempotencyKey: "pg-note-cas:create",
      now,
    } as const;
    const created = await seeded.create(createCommand);

    updateWorker = startNoteMutationWorker({
      actorId,
      noteId: created.id,
      operation: "update",
      schema,
      workspaceId,
    });
    await nextWorkerMessage(updateWorker, "at_write");
    deleteWorker = startNoteMutationWorker({
      actorId,
      noteId: created.id,
      operation: "delete",
      schema,
      workspaceId,
    });
    const deletion = await nextWorkerMessage(deleteWorker);
    assert.equal(deletion.type, "result");
    updateWorker.send({ type: "release" });
    const staleUpdate = await nextWorkerMessage(updateWorker);

    assert.deepEqual(staleUpdate, {
      code: "NOTE_NOT_FOUND",
      message: `Note ${created.id} was not found`,
      type: "error",
    });
    assert.equal(deletion.note?.version, 2);
    assert.equal(await seeded.get({ actorId, noteId: created.id }), null);
    assert.equal((await seedPool.query<{ lifecycle_state: string; body: string }>(`
      select lifecycle_state, payload -> 'note' ->> 'body' as body
      from orbit_records
      where workspace_id = $1 and collection_name = 'notes' and record_id = $2
    `, [workspaceId, created.id])).rows[0]?.lifecycle_state, "deleted");
    assert.deepEqual(await seeded.create({ ...createCommand, now: "2026-09-16T08:03:00.000Z" }), {
      ...created,
      updatedAt: "2026-09-16T08:02:00.000Z",
      version: 2,
    });
    assert.equal(await seeded.get({ actorId, noteId: created.id }), null);
  } finally {
    updateWorker?.kill();
    deleteWorker?.kill();
    await seedPool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});

test("real PostgreSQL note deletion advances revision once and reads as one tombstone", {
  skip: databaseUrl ? false : "ORBIT_SYNC_TEST_DATABASE_URL is not configured",
}, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_note_delete_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: pool });
    const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
    const created = await notes.create({
      actorId,
      body: "PostgreSQL delete revision",
      idempotencyKey: "pg-note:create",
      now,
    });
    const inserted = await pool.query<{ sync_revision: string }>(`
      select sync_revision::text from orbit_records
      where workspace_id = $1 and collection_name = 'notes' and record_id = $2
    `, [workspaceId, created.id]);
    const deleted = await notes.delete({
      actorId,
      noteId: created.id,
      expectedVersion: 1,
      idempotencyKey: "pg-note:delete",
      now: "2026-09-16T08:01:00.000Z",
    });
    const persisted = await pool.query<{
      last_operation_kind: string;
      lifecycle_state: string;
      operation_count: string;
      sync_revision: string;
    }>(`
      select lifecycle_state,
        payload -> 'operations' -> -1 ->> 'kind' as last_operation_kind,
        jsonb_array_length(payload -> 'operations')::text as operation_count,
        sync_revision::text
      from orbit_records
      where workspace_id = $1 and collection_name = 'notes' and record_id = $2
    `, [workspaceId, created.id]);
    assert.equal(deleted.version, 2);
    assert.equal(persisted.rows[0]?.lifecycle_state, "deleted");
    assert.equal(persisted.rows[0]?.last_operation_kind, "delete");
    assert.equal(persisted.rows[0]?.operation_count, "2");
    assert.ok(BigInt(persisted.rows[0]!.sync_revision) > BigInt(inserted.rows[0]!.sync_revision));

    assert.deepEqual(await notes.delete({
      actorId,
      noteId: created.id,
      expectedVersion: 1,
      idempotencyKey: "pg-note:delete",
      now: "2026-09-16T08:02:00.000Z",
    }), deleted);
    const replayed = await pool.query<{ sync_revision: string }>(`
      select sync_revision::text from orbit_records
      where workspace_id = $1 and collection_name = 'notes' and record_id = $2
    `, [workspaceId, created.id]);
    assert.equal(replayed.rows[0]?.sync_revision, persisted.rows[0]?.sync_revision);

    const page = await service(pool).readPage({ actorId, workspaceId, limit: 200 });
    assert.deepEqual(page.changes, [{
      aiVisibility: "available_when_synced",
      id: created.id,
      kind: "note",
      operation: "delete",
      revision: persisted.rows[0]!.sync_revision,
      updatedAt: "2026-09-16T08:01:00.000Z",
    }]);
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
