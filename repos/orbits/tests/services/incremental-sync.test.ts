import assert from "node:assert/strict";
import test from "node:test";

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
      operations: [{ idempotencyKey: "private-receipt" }],
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
        activities: [{ rawAttachment: "must-not-leak" }],
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
        providerToken: "must-not-leak",
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
