import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresContactPipelineReader } from "../../features/contacts/pipeline-page-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const at = "2026-09-26T00:00:00.000Z";
const secret = "contact-pipeline-page-local-test-secret-32-bytes";

function contactRecord(input: {
  id: string;
  stage: string;
  userId?: string;
  lifecycleInitialization?: string;
  displayName?: string;
  occurredAt?: string;
  updatedAt?: string;
}) {
  const updatedAt = input.updatedAt ?? at;
  return {
    workspaceId: "w",
    collectionName: "contacts",
    recordId: input.id,
    userId: input.userId ?? "a",
    sourceType: "manual",
    sourceId: "source:contact",
    evidenceIds: ["evidence:contact"],
    occurredAt: input.occurredAt ?? at,
    createdAt: at,
    updatedAt,
    lifecycleState: "active" as const,
    payload: {
      id: input.id,
      displayName: input.displayName ?? `联系人 ${input.id}`,
      organization: "Orbit",
      role: "Partner",
      stage: input.stage,
      ...(input.lifecycleInitialization ? { lifecycleInitialization: input.lifecycleInitialization } : {}),
      source: { type: "manual", id: "source:contact" },
      evidenceIds: ["evidence:contact"],
      createdAt: at,
      updatedAt,
      notes: "PRIVATE_CONTACT_HISTORY_".repeat(2000),
    },
  };
}

function connectionRecord(input: {
  id: string;
  contactId: string;
  stage: string;
  lifecycleInitialization?: string;
  userId?: string;
  updatedAt?: string;
  occurredAt?: string;
}) {
  const updatedAt = input.updatedAt ?? at;
  return {
    workspaceId: "w",
    collectionName: "connections",
    recordId: input.id,
    userId: input.userId ?? "a",
    sourceType: "manual",
    sourceId: "source:connection",
    evidenceIds: ["evidence:connection"],
    occurredAt: input.occurredAt ?? at,
    createdAt: at,
    updatedAt,
    lifecycleState: "active" as const,
    payload: {
      id: input.id,
      accountId: input.userId ?? "a",
      contactId: input.contactId,
      stage: input.stage,
      summary: "PRIVATE_CONNECTION_HISTORY_".repeat(2000),
      ...(input.lifecycleInitialization ? { lifecycleInitialization: input.lifecycleInitialization } : {}),
      source: { type: "manual", id: "source:connection" },
      evidenceIds: ["evidence:connection"],
      createdAt: at,
      updatedAt,
    },
  };
}

function taskRecord(input: {
  id: string;
  contactId: string;
  dueAt?: string;
  status?: string;
  userId?: string;
  title?: string;
}) {
  return {
    workspaceId: "w",
    collectionName: "tasks",
    recordId: input.id,
    userId: input.userId ?? "a",
    sourceType: "manual",
    sourceId: "source:task",
    evidenceIds: ["evidence:task"],
    createdAt: at,
    updatedAt: at,
    lifecycleState: "active" as const,
    payload: {
      version: 1,
      task: {
        id: input.id,
        accountId: input.userId ?? "a",
        ownerUserId: input.userId ?? "a",
        title: input.title ?? `Task ${input.id}`,
        status: input.status ?? "open",
        category: "relationship",
        priority: "normal",
        source: "manual",
        relatedContactId: input.contactId,
        ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
        ...(input.status === "completed" ? { completedAt: at, completedBy: input.userId ?? "a", completionSource: "user" } : {}),
        createdAt: at,
        updatedAt: at,
        notes: "PRIVATE_TASK_HISTORY_".repeat(3000),
      },
      activities: [{
        id: `${input.id}:created`,
        taskId: input.id,
        accountId: input.userId ?? "a",
        ownerUserId: input.userId ?? "a",
        type: "created",
        actorType: "user",
        occurredAt: at,
        taskSnapshot: { title: input.title ?? `Task ${input.id}`, category: "relationship", relatedContactId: input.contactId },
      }],
    },
  };
}

test("actor-owned pipeline counts, signed stage pages, and action summaries are bounded", { skip: !databaseUrl }, async () => {
  const schema = `contact_pipeline_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  let responseBytes = 0;
  let reads = 0;
  const client: LiveRecordSqlClient = {
    async query<T>(sql: string, values?: readonly unknown[]) {
      const result = await pool.query(sql, values ? [...values] : undefined);
      responseBytes += Buffer.byteLength(JSON.stringify(result.rows));
      reads += 1;
      return { rows: result.rows as T[] };
    },
  };

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    for (let index = 0; index < 25; index += 1) {
      const id = `to-${String(index).padStart(3, "0")}`;
      await store.upsertRecord(contactRecord({ id, stage: "captured", displayName: index === 0 ? "🙂林".repeat(200) : undefined }));
    }
    for (let index = 0; index < 23; index += 1) {
      await store.upsertRecord(contactRecord({ id: `active-${String(index).padStart(3, "0")}`, stage: "active" }));
    }
    for (let index = 0; index < 8; index += 1) {
      await store.upsertRecord(contactRecord({ id: `nurture-${String(index).padStart(3, "0")}`, stage: "nurture" }));
    }
    for (let index = 0; index < 3; index += 1) {
      await store.upsertRecord(contactRecord({ id: `archived-${String(index).padStart(3, "0")}`, stage: "archived" }));
    }
    await store.upsertRecord(contactRecord({ id: "pending-contact", stage: "active", lifecycleInitialization: "pending" }));
    await store.upsertRecord(contactRecord({ id: "stage-override", stage: "archived" }));
    await store.upsertRecord(contactRecord({ id: "foreign-contact", stage: "captured", userId: "b" }));
    await store.upsertRecord(connectionRecord({ id: "connection-override", contactId: "stage-override", stage: "active", lifecycleInitialization: "ready" }));

    const reader = createPostgresContactPipelineReader({ client, workspaceId: "w", cursorSecret: secret });
    responseBytes = 0;
    reads = 0;
    const first = await reader.page({ stage: "to_contact", limit: 20 }, "a");
    assert.equal(reads, 1);
    assert.deepEqual(first.stageCounts, { to_contact: 25, in_progress: 24, nurture: 8, archived: 3 });
    assert.equal(first.stage, "to_contact");
    assert.equal(first.items.length, 20);
    assert.equal(first.hasMore, true);
    assert.ok(first.nextCursor);
    assert.equal(first.items[0]?.id, "to-000");
    assert.equal(first.items.at(-1)?.id, "to-019");
    assert.deepEqual(Object.keys(first.items[0]!).sort(), ["displayName", "id", "organization", "role"]);
    assert.equal(Array.from(first.items[0]!.displayName).length, 128);
    assert.deepEqual(first.actions, []);
    assert.ok(responseBytes < 24_000, `one bounded response used ${responseBytes} bytes`);
    assert.doesNotMatch(JSON.stringify(first), /PRIVATE_CONTACT_HISTORY|PRIVATE_CONNECTION_HISTORY/u);

    const second = await reader.page({ stage: "to_contact", limit: 20, cursor: first.nextCursor! }, "a");
    assert.equal(second.items.length, 5);
    assert.equal(second.hasMore, false);
    assert.equal(second.nextCursor, null);
    assert.equal(second.items[0]?.id, "to-020");
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 25);

    const actions = [
      ["task-z", "pending-contact", "2026-10-03T00:00:00-09:00", "open"],
      ["task-a", "pending-contact", "2026-10-03T00:00:00+09:00", "open"],
      ["task-m", "active-000", "2026-10-02T10:00:00Z", "completed"],
      ["task-cancelled", "active-000", "2026-10-01T00:00:00Z", "cancelled"],
      ["task-ignored-no-date", "active-000", undefined, "open"],
      ["foreign-task", "foreign-contact", "2026-10-01T00:00:00Z", "open"],
    ] as const;
    for (const [id, contactId, dueAt, status] of actions) {
      await store.upsertRecord(taskRecord({ id, contactId, ...(dueAt ? { dueAt } : {}), status }));
    }
    await store.upsertRecord(taskRecord({ id: "task-e", contactId: "active-000", dueAt: "2026-10-02T15:00:00Z" }));
    await store.upsertRecord(taskRecord({ id: "task-b", contactId: "active-000", dueAt: "2026-10-03T00:00:00.100Z", title: "复核".repeat(300) }));
    await store.upsertRecord(taskRecord({ id: "foreign-owner-task", contactId: "foreign-contact", dueAt: "2026-10-01T00:00:00Z", userId: "b" }));
    responseBytes = 0;
    reads = 0;
    const withActions = await reader.page({ stage: "in_progress", limit: 20 }, "a");
    assert.deepEqual(withActions.actions.map((item) => item.taskId), ["task-e", "task-a", "task-b"]);
    assert.deepEqual(withActions.actions.map((item) => item.dueAt), ["2026-10-02T15:00:00Z", "2026-10-03T00:00:00+09:00", "2026-10-03T00:00:00.100Z"]);
    assert.equal(withActions.actions[2]?.title.length, 240);
    assert.equal(Array.from(withActions.actions[2]!.title).length, 240);
    assert.doesNotMatch(JSON.stringify(withActions.actions), /PRIVATE_TASK_HISTORY|foreign/u);
    assert.ok(responseBytes < 24_000, `action summary responses used ${responseBytes} bytes`);

    await assert.rejects(reader.page({ stage: "to_contact", limit: 20, cursor: `${first.nextCursor}x` }, "a"), /CONTACT_PIPELINE_CURSOR_INVALID/u);
    await assert.rejects(reader.page({ stage: "to_contact", limit: 20, cursor: first.nextCursor! }, "b"), /CONTACT_PIPELINE_CURSOR_INVALID/u);
    await assert.rejects(reader.page({ stage: "to_contact", limit: 21 }, "a"), /CONTACT_PIPELINE_INPUT_INVALID/u);
    const foreign = await reader.page({ stage: "to_contact", limit: 20 }, "b");
    assert.deepEqual(foreign.stageCounts, { to_contact: 1, in_progress: 0, nurture: 0, archived: 0 });
    assert.deepEqual(foreign.items.map((item) => item.id), ["foreign-contact"]);

    await store.upsertRecord(connectionRecord({
      id: "connection-override-duplicate",
      contactId: "stage-override",
      stage: "nurture",
      lifecycleInitialization: "ready",
    }));
    await assert.rejects(
      reader.page({ stage: "in_progress", limit: 20 }, "a"),
      /CONTACT_PIPELINE_CONNECTION_AMBIGUOUS/u,
    );

  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
