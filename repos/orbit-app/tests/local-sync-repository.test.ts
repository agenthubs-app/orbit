import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import type { SyncRecord } from "../src/api/contract/sync";
import {
  initializeLocalSyncDatabase,
  type LocalSyncDatabase,
  type LocalSyncSqlValue,
} from "../src/data/sync/local-sync-database";
import { getLocalSyncDatabaseCapability } from "../src/data/sync/local-sync-database.web";
import {
  createLocalSyncRepository,
  type LocalSyncOutboxMutation,
} from "../src/data/sync/local-sync-repository";

class NodeTestDatabase implements LocalSyncDatabase {
  readonly database = new DatabaseSync(":memory:");
  statementCount = 0;
  failWhenSqlIncludes: string | null = null;

  async execute(source: string): Promise<void> {
    this.noteStatement(source);
    this.database.exec(source);
  }

  async run(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<{ changes: number }> {
    this.noteStatement(source);
    const result = this.database.prepare(source).run(...parameters);
    return { changes: Number(result.changes) };
  }

  async get<TRow>(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<TRow | null> {
    this.noteStatement(source);
    return (this.database.prepare(source).get(...parameters) as TRow) ?? null;
  }

  async all<TRow>(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<TRow[]> {
    this.noteStatement(source);
    return this.database.prepare(source).all(...parameters) as TRow[];
  }

  async transaction<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  private noteStatement(source: string): void {
    this.statementCount += 1;
    if (this.failWhenSqlIncludes && source.includes(this.failWhenSqlIncludes)) {
      this.failWhenSqlIncludes = null;
      throw new Error("injected SQL failure");
    }
  }
}

function record(
  overrides: Partial<SyncRecord<Record<string, unknown>>> = {},
): SyncRecord<Record<string, unknown>> {
  return {
    actorId: "actor-a",
    workspaceId: "workspace-a",
    kind: "note",
    id: "note-a",
    revision: "revision-1",
    updatedAt: "2026-09-16T00:00:00.000Z",
    deletedAt: null,
    payload: { title: "first" },
    syncState: "synced",
    aiVisibility: "available_when_synced",
    ...overrides,
  };
}

async function repository(
  actorId = "actor-a",
): Promise<{
  database: NodeTestDatabase;
  repository: ReturnType<typeof createLocalSyncRepository>;
}> {
  const database = new NodeTestDatabase();
  await initializeLocalSyncDatabase(database);
  return {
    database,
    repository: createLocalSyncRepository({ actorId, database }),
  };
}

test("schema v1 creates the sync tables and records encrypted metadata", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());

  await initializeLocalSyncDatabase(database);

  const tables = await database.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = ? AND name LIKE ? ORDER BY name",
    ["table", "sync_%"],
  );
  assert.deepEqual(
    tables.map(({ name }) => name),
    ["sync_cursors", "sync_meta", "sync_outbox", "sync_records"],
  );
  const metadata = await database.all<{ key: string; value: string }>(
    "SELECT key, value FROM sync_meta ORDER BY key",
  );
  assert.deepEqual(
    metadata.map(({ key, value }) => ({ key, value })),
    [
      { key: "encryption_state", value: "encrypted" },
      { key: "migration_checkpoint", value: "1" },
      { key: "schema_version", value: "1" },
    ],
  );
});

test("page records and its cursor roll back together when cursor storage fails", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  setup.database.failWhenSqlIncludes = "INSERT INTO sync_cursors";

  await assert.rejects(
    setup.repository.applyPage({
      workspaceId: "workspace-a",
      records: [record()],
      cursor: "cursor-1",
      syncedAt: "2026-09-16T00:01:00.000Z",
      bootstrapState: "complete",
    }),
    /injected SQL failure/,
  );

  assert.deepEqual(
    await setup.repository.listRecords({
      workspaceId: "workspace-a",
      kind: "note",
      includeDeleted: true,
    }),
    [],
  );
  assert.equal(await setup.repository.getCursor("workspace-a"), null);
});

test("queries records newest-first with a stable id tie-break and retains tombstones", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());

  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [
      record({ id: "note-b", updatedAt: "2026-09-16T00:02:00.000Z" }),
      record({ id: "note-a", updatedAt: "2026-09-16T00:02:00.000Z" }),
      record({
        id: "note-deleted",
        revision: "revision-deleted",
        updatedAt: "2026-09-16T00:03:00.000Z",
        deletedAt: "2026-09-16T00:03:00.000Z",
        payload: null,
      }),
      record({ id: "note-old", updatedAt: "2026-09-16T00:01:00.000Z" }),
    ],
    cursor: "cursor-1",
    syncedAt: "2026-09-16T00:04:00.000Z",
    bootstrapState: "complete",
  });

  assert.deepEqual(
    (
      await setup.repository.listRecords({
        workspaceId: "workspace-a",
        kind: "note",
      })
    ).map(({ id }) => id),
    ["note-a", "note-b", "note-old"],
  );
  const tombstone = await setup.repository.getRecord({
    workspaceId: "workspace-a",
    kind: "note",
    id: "note-deleted",
  });
  assert.equal(tombstone?.deletedAt, "2026-09-16T00:03:00.000Z");
  assert.equal(tombstone?.payload, null);
});

test("record and outbox ordering compares timestamp instants across offsets", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [
      record({ id: "note-z", updatedAt: "2026-09-16T01:00:00.000Z" }),
      record({
        id: "note-a",
        updatedAt: "2026-09-16T10:00:00.000+09:00",
      }),
      record({
        id: "note-earlier",
        updatedAt: "2026-09-16T09:30:00.000+09:00",
      }),
    ],
    cursor: "cursor-offsets",
    syncedAt: "2026-09-16T02:00:00.000Z",
    bootstrapState: "complete",
  });
  const outboxBase: Omit<LocalSyncOutboxMutation, "mutationId" | "createdAt"> = {
    actorId: "actor-a",
    workspaceId: "workspace-a",
    kind: "task",
    id: "task-a",
    operation: "update",
    patch: { title: "ordered" },
    baseRevision: "revision-1",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  };
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-z",
    createdAt: "2026-09-16T09:30:00.000+09:00",
  });
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-later",
    createdAt: "2026-09-16T01:00:00.000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-a",
    createdAt: "2026-09-16T00:30:00.000Z",
  });

  assert.deepEqual(
    (
      await setup.repository.listRecords({
        workspaceId: "workspace-a",
        kind: "note",
      })
    ).map(({ id }) => id),
    ["note-a", "note-z", "note-earlier"],
  );
  assert.deepEqual(
    (await setup.repository.listOutboxMutations("workspace-a")).map(
      ({ mutationId }) => mutationId,
    ),
    ["mutation-a", "mutation-z", "mutation-later"],
  );
});

test("canonical pages do not overwrite pending or conflicted local records", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.putRecord(
    record({
      id: "pending-note",
      revision: "base-revision",
      payload: { title: "local pending" },
      syncState: "pending",
      aiVisibility: "excluded",
    }),
  );
  await setup.repository.putRecord(
    record({
      id: "conflicted-note",
      revision: "base-revision",
      payload: { title: "local conflict" },
      syncState: "conflicted",
      aiVisibility: "excluded",
    }),
  );

  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [
      record({
        id: "pending-note",
        revision: "server-revision",
        payload: { title: "server" },
      }),
      record({
        id: "conflicted-note",
        revision: "server-revision",
        payload: { title: "server" },
      }),
    ],
    cursor: "cursor-2",
    syncedAt: "2026-09-16T00:05:00.000Z",
    bootstrapState: "complete",
  });

  assert.deepEqual(
    await setup.repository.getRecord({
      workspaceId: "workspace-a",
      kind: "note",
      id: "pending-note",
    }),
    record({
      id: "pending-note",
      revision: "base-revision",
      payload: { title: "local pending" },
      syncState: "pending",
      aiVisibility: "excluded",
    }),
  );
  assert.deepEqual(
    await setup.repository.getRecord({
      workspaceId: "workspace-a",
      kind: "note",
      id: "conflicted-note",
    }),
    record({
      id: "conflicted-note",
      revision: "base-revision",
      payload: { title: "local conflict" },
      syncState: "conflicted",
      aiVisibility: "excluded",
    }),
  );
  assert.equal((await setup.repository.getCursor("workspace-a"))?.cursor, "cursor-2");
});

test("replaying a canonical revision is idempotent while the cursor advances", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [record()],
    cursor: "cursor-1",
    syncedAt: "2026-09-16T00:01:00.000Z",
    bootstrapState: "pending",
  });

  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [record({ payload: { title: "impossible same-revision rewrite" } })],
    cursor: "cursor-2",
    syncedAt: "2026-09-16T00:02:00.000Z",
    bootstrapState: "complete",
  });

  assert.deepEqual(
    await setup.repository.getRecord({
      workspaceId: "workspace-a",
      kind: "note",
      id: "note-a",
    }),
    record(),
  );
  assert.deepEqual(await setup.repository.getCursor("workspace-a"), {
    workspaceId: "workspace-a",
    cursor: "cursor-2",
    lastSyncedAt: "2026-09-16T00:02:00.000Z",
    bootstrapState: "complete",
  });
});

test("actor databases, server databases, and workspace rows stay isolated", async (t) => {
  const serverOneActorA = await repository("actor-a");
  const serverTwoActorA = await repository("actor-a");
  const serverOneActorB = await repository("actor-b");
  t.after(() => {
    serverOneActorA.database.close();
    serverTwoActorA.database.close();
    serverOneActorB.database.close();
  });

  await serverOneActorA.repository.putRecord(record());
  await serverOneActorA.repository.putRecord(
    record({ workspaceId: "workspace-b", payload: { title: "workspace b" } }),
  );

  assert.equal(
    (await serverOneActorA.repository.listRecords({
      workspaceId: "workspace-a",
      kind: "note",
    })).length,
    1,
  );
  assert.equal(
    (await serverOneActorA.repository.listRecords({
      workspaceId: "workspace-b",
      kind: "note",
    })).length,
    1,
  );
  assert.deepEqual(
    await serverTwoActorA.repository.listRecords({
      workspaceId: "workspace-a",
      kind: "note",
    }),
    [],
  );
  assert.deepEqual(
    await serverOneActorB.repository.listRecords({
      workspaceId: "workspace-a",
      kind: "note",
    }),
    [],
  );
});

test("invalid or cross-actor records are rejected before any SQL runs", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  setup.database.statementCount = 0;

  await assert.rejects(
    setup.repository.putRecord(record({ actorId: "actor-b" })),
    /actorId does not match/,
  );
  await assert.rejects(
    setup.repository.putRecord({
      ...record(),
      kind: "meeting",
    } as unknown as SyncRecord),
    /kind is invalid/,
  );
  await assert.rejects(
    setup.repository.putRecord(
      record({
        deletedAt: "2026-09-16T00:03:00.000Z",
        payload: { title: "not a tombstone" },
      }),
    ),
    /tombstone payload must be null/,
  );
  await assert.rejects(
    setup.repository.putRecord(record({ payload: { actorId: "actor-a" } })),
    /payload must not contain actor identity/,
  );
  await assert.rejects(
    setup.repository.applyPage({
      workspaceId: "workspace-a",
      records: [
        record({
          syncState: "pending",
          aiVisibility: "excluded",
        }),
      ],
      cursor: "cursor-1",
      syncedAt: "2026-09-16T00:05:00.000Z",
      bootstrapState: "complete",
    }),
    /canonical page records must be synced/,
  );
  await assert.rejects(
    setup.repository.enqueueOutboxMutation({
      actorId: "actor-a",
      workspaceId: "workspace-a",
      mutationId: "mutation-with-actor",
      kind: "note",
      id: "note-a",
      operation: "update",
      patch: { nested: { actor_id: "actor-a" } },
      baseRevision: "revision-1",
      createdAt: "2026-09-16T00:05:00.000Z",
      retryCount: 0,
      nextRetryAt: null,
      lastErrorCode: null,
    }),
    /patch must not contain actor identity/,
  );
  assert.equal(setup.database.statementCount, 0);
});

test("contract identifiers, timestamps, live payloads, and JSON are validated before SQL", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  setup.database.statementCount = 0;
  const invalidRecords: Array<{
    value: SyncRecord;
    message: RegExp;
  }> = [
    { value: record({ revision: "   " }), message: /revision is invalid/ },
    { value: record({ id: " note-a" }), message: /id is invalid/ },
    {
      value: record({ workspaceId: "workspace\u0000a" }),
      message: /workspaceId is invalid/,
    },
    {
      value: record({ updatedAt: "2026-09-16 00:00:00Z" }),
      message: /updatedAt is invalid/,
    },
    {
      value: record({ deletedAt: "not-a-timestamp", payload: null }),
      message: /deletedAt is invalid/,
    },
    {
      value: record({ payload: null }),
      message: /live record payload must not be null/,
    },
    {
      value: record({
        payload: { nested: { missing: undefined } },
      }),
      message: /payload must be plain JSON/,
    },
    {
      value: record({ payload: { score: Number.NaN } }),
      message: /payload must be plain JSON/,
    },
  ];

  for (const invalid of invalidRecords) {
    await assert.rejects(
      setup.repository.putRecord(invalid.value),
      invalid.message,
    );
  }
  assert.equal(setup.database.statementCount, 0);
});

test("serialization hooks cannot inject actor identity into records or outbox patches", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  const payload = Object.assign(
    Object.create({
      toJSON: () => ({ actorId: "injected-record-actor" }),
    }) as Record<string, unknown>,
    { safe: "record-value" },
  );
  const patch = Object.assign(
    Object.create({
      toJSON: () => ({ actor_id: "injected-outbox-actor" }),
    }) as Record<string, unknown>,
    { safe: "patch-value" },
  );

  await setup.repository.putRecord(record({ payload }));
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a",
    workspaceId: "workspace-a",
    mutationId: "mutation-hook",
    kind: "note",
    id: "note-a",
    operation: "update",
    patch,
    baseRevision: "revision-1",
    createdAt: "2026-09-16T00:05:00.000Z",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  });

  assert.deepEqual(
    (
      await setup.repository.getRecord({
        workspaceId: "workspace-a",
        kind: "note",
        id: "note-a",
      })
    )?.payload,
    { safe: "record-value" },
  );
  assert.deepEqual(
    (await setup.repository.listOutboxMutations("workspace-a"))[0]?.patch,
    { safe: "patch-value" },
  );
});

test("outbox storage is stable, ordered, and workspace-isolated", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  const mutations: LocalSyncOutboxMutation[] = [
    {
      actorId: "actor-a",
      workspaceId: "workspace-a",
      mutationId: "mutation-b",
      kind: "task",
      id: "task-b",
      operation: "update",
      patch: { title: "later" },
      baseRevision: "revision-1",
      createdAt: "2026-09-16T00:02:00.000Z",
      retryCount: 0,
      nextRetryAt: null,
      lastErrorCode: null,
    },
    {
      actorId: "actor-a",
      workspaceId: "workspace-a",
      mutationId: "mutation-a",
      kind: "task",
      id: "task-a",
      operation: "update",
      patch: { title: "earlier" },
      baseRevision: "revision-1",
      createdAt: "2026-09-16T00:01:00.000Z",
      retryCount: 0,
      nextRetryAt: null,
      lastErrorCode: null,
    },
    {
      actorId: "actor-a",
      workspaceId: "workspace-b",
      mutationId: "mutation-workspace-b",
      kind: "task",
      id: "task-a",
      operation: "delete",
      patch: null,
      baseRevision: "revision-1",
      createdAt: "2026-09-16T00:00:00.000Z",
      retryCount: 1,
      nextRetryAt: "2026-09-16T00:10:00.000Z",
      lastErrorCode: "network",
    },
  ];
  for (const mutation of mutations) {
    await setup.repository.enqueueOutboxMutation(mutation);
  }

  assert.deepEqual(
    (await setup.repository.listOutboxMutations("workspace-a")).map(
      ({ mutationId }) => mutationId,
    ),
    ["mutation-a", "mutation-b"],
  );
  assert.deepEqual(await setup.repository.listOutboxMutations("workspace-b"), [
    mutations[2],
  ]);
});

test("Web explicitly reports online-only without opening a database", async () => {
  assert.deepEqual(await getLocalSyncDatabaseCapability(), {
    mode: "online-only",
    reason: "web-has-no-local-sync-database",
  });
});
