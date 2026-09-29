import assert from "node:assert/strict";
import test from "node:test";

import type { SyncRecord } from "../src/api/contract/sync";
import {
  initializeLocalSyncDatabase,
} from "../src/data/sync/local-sync-database";
import { getLocalSyncDatabaseCapability } from "../src/data/sync/local-sync-database.web";
import {
  createLocalSyncRepository,
  type LocalSyncOutboxMutation,
} from "../src/data/sync/local-sync-repository";
import { NodeTestDatabase } from "./helpers/node-sync-database";


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
    repository: createLocalSyncRepository({ actorId, database, baseUrl: "https://fixture.example", registeredDomainIds: ["notes"], activeReadScopes: () => ["workspace-a", "workspace-b", "  workspace-a  ", "workspace-server"].map(workspaceId => ({ baseUrl: "https://fixture.example", actorId, workspaceId, domainId: "notes", authorizationEpoch: "fixture-e1" })) }),
  };
}

test("schema v4 creates the sync tables and records encrypted metadata", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());

  await initializeLocalSyncDatabase(database);

  const tables = await database.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = ? AND name LIKE ? ORDER BY name",
    ["table", "sync_%"],
  );
  assert.deepEqual(
    tables.map(({ name }) => name),
    ["sync_aliases", "sync_cursors", "sync_meta", "sync_outbox", "sync_records"],
  );
  const metadata = await database.all<{ key: string; value: string }>(
    "SELECT key, value FROM sync_meta ORDER BY key",
  );
  assert.deepEqual(
    metadata.map(({ key, value }) => ({ key, value })),
    [
      { key: "encryption_state", value: "encrypted" },
      { key: "migration_checkpoint", value: "4" },
      { key: "schema_version", value: "4" },
    ],
  );
});

test("outbox enqueue notifies its owner after the queued row commits", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  let queuedCountAtNotification = 0;
  const repo = createLocalSyncRepository({
    actorId: "actor-a",
    database,
    onOutboxQueued: async () => {
      queuedCountAtNotification = Number((await database.get<{ count: number }>("SELECT COUNT(*) AS count FROM sync_outbox"))?.count ?? 0);
    },
  });
  await repo.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "test-offline-write", mutationId: "trigger-me",
    kind: "note", id: "note-a", operation: "create", patch: { title: "queued" },
    requestJson: '{"mutationId":"trigger-me","title":"queued"}', baseRevision: null,
    createdAt: "2026-09-16T00:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  assert.equal(queuedCountAtNotification, 1);
});

test("schema v3 migration preserves queued mutations and adds offline-write lifecycle columns", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());

  await database.execute(`CREATE TABLE sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`);
  await database.run("INSERT INTO sync_meta(key, value) VALUES('schema_version', '3')");
  await database.execute(`CREATE TABLE sync_outbox (
    mutation_id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN (
      'contact', 'note', 'task', 'relationship_followup', 'personal_schedule', 'inbox_item'
    )),
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    patch_json TEXT,
    base_revision TEXT,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    next_retry_at TEXT,
    last_error_code TEXT
  )`);
  await database.run(`INSERT INTO sync_outbox (
    mutation_id, workspace_id, kind, record_id, operation, patch_json, base_revision, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    "mutation-existing", "workspace-a", "note", "note-a", "update", '{"title":"saved"}', "r1", "2026-09-16T00:00:00.000Z",
  ]);

  await initializeLocalSyncDatabase(database);

  const columns = await database.all<{ name: string }>("PRAGMA table_info(sync_outbox)");
  assert.deepEqual(
    ["domain_id", "state", "request_json", "depends_on", "attempt_count", "first_attempt_at", "server_snapshot_json"]
      .filter((name) => !columns.some((column) => column.name === name)),
    [],
  );
  const migratedRow = await database.get<Record<string, string>>(
    "SELECT mutation_id, workspace_id, kind, record_id, patch_json, base_revision FROM sync_outbox WHERE mutation_id = ?",
    ["mutation-existing"],
  );
  assert.deepEqual(migratedRow && { ...migratedRow }, {
    mutation_id: "mutation-existing",
    workspace_id: "workspace-a",
    kind: "note",
    record_id: "note-a",
    patch_json: '{"title":"saved"}',
    base_revision: "r1",
  });
});

test("opaque nonblank identifiers are accepted and preserved exactly", async (t) => {
  const setup = await repository("  actor-a  ");
  t.after(() => setup.database.close());
  assert.throws(
    () =>
      createLocalSyncRepository({
        actorId: "   ",
        database: setup.database,
      }),
    /actorId is invalid/,
  );
  const opaqueRecord = record({
    actorId: "  actor-a  ",
    workspaceId: "  workspace-a  ",
    id: "  note-a  ",
    revision: "  opaque server value  ",
  });

  await setup.repository.putRecord(opaqueRecord);

  assert.deepEqual(
    await setup.repository.getRecord({
      workspaceId: "  workspace-a  ",
      kind: "note",
      id: "  note-a  ",
    }),
    opaqueRecord,
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
    id: "task-z",
    createdAt: "2026-09-16T09:30:00.000+09:00",
  });
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-later",
    id: "task-later",
    createdAt: "2026-09-16T01:00:00.000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-a",
    id: "task-a",
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

test("record and outbox ordering preserves sub-millisecond precision", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [
      record({
        id: "note-z-later",
        updatedAt: "2026-09-16T09:00:00.000000001+09:00",
      }),
      record({
        id: "note-a-earlier",
        updatedAt: "2026-09-16T00:00:00.000000000Z",
      }),
    ],
    cursor: "cursor-nanoseconds",
    syncedAt: "2026-09-16T00:01:00.000Z",
    bootstrapState: "complete",
  });
  const outboxBase: Omit<LocalSyncOutboxMutation, "mutationId" | "createdAt"> = {
    actorId: "actor-a",
    workspaceId: "workspace-a",
    kind: "task",
    id: "task-a",
    operation: "update",
    patch: { title: "precisely ordered" },
    baseRevision: "revision-1",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  };
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-z-earlier",
    id: "task-z-earlier",
    createdAt: "2026-09-16T00:00:00.000000000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    ...outboxBase,
    mutationId: "mutation-a-later",
    id: "task-a-later",
    createdAt: "2026-09-16T09:00:00.000000001+09:00",
  });

  assert.deepEqual(
    (
      await setup.repository.listRecords({
        workspaceId: "workspace-a",
        kind: "note",
      })
    ).map(({ id }) => id),
    ["note-z-later", "note-a-earlier"],
  );
  assert.deepEqual(
    (await setup.repository.listOutboxMutations("workspace-a")).map(
      ({ mutationId }) => mutationId,
    ),
    ["mutation-z-earlier", "mutation-a-later"],
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
    generation: null,
    highWatermark: null,
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
    { value: record({ id: "   " }), message: /id is invalid/ },
    {
      value: record({ workspaceId: "   " }),
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

test("an unattempted mutation merges with the later patch while retaining its base revision", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  const base = {
    actorId: "actor-a",
    workspaceId: "workspace-a",
    kind: "note" as const,
    id: "note-merge",
    operation: "update" as const,
    baseRevision: "revision-original",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  };

  await setup.repository.enqueueOutboxMutation({
    ...base,
    mutationId: "mutation-original",
    patch: { title: "before", body: "kept" },
    createdAt: "2026-09-16T00:01:00.000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    ...base,
    mutationId: "mutation-later",
    patch: { title: "after" },
    baseRevision: "revision-later",
    createdAt: "2026-09-16T00:02:00.000Z",
  });

  const rows = await setup.database.all<{
    mutation_id: string;
    patch_json: string;
    base_revision: string;
    state: string;
    attempt_count: number;
  }>(`SELECT mutation_id, patch_json, base_revision, state, attempt_count
      FROM sync_outbox WHERE workspace_id = ? AND record_id = ?`, ["workspace-a", "note-merge"]);
  assert.deepEqual(rows.map(({ mutation_id, patch_json, base_revision, state, attempt_count }) => ({
    mutationId: mutation_id,
    patch: JSON.parse(patch_json),
    baseRevision: base_revision,
    state,
    attemptCount: attempt_count,
  })), [{
    mutationId: "mutation-original",
    patch: { title: "after", body: "kept" },
    baseRevision: "revision-original",
    state: "queued",
    attemptCount: 0,
  }]);
});

test("canceling an unattempted create preserves dependent content as failed", async t => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "notes", mutationId: "create-parent",
    kind: "note", id: "local:note-cancelled", operation: "create", patch: { title: "draft" },
    baseRevision: null, createdAt: "2026-09-16T00:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "notes", mutationId: "dependent-edit",
    kind: "note", id: "other-note", operation: "update", patch: { links: ["local:note-cancelled"] },
    requestJson: '{"links":["local:note-cancelled"]}', dependsOn: "create-parent", baseRevision: "r1",
    createdAt: "2026-09-16T00:01:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "notes", mutationId: "cancel-create",
    kind: "note", id: "local:note-cancelled", operation: "delete", patch: null, baseRevision: null,
    createdAt: "2026-09-16T00:02:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  const dependent = await setup.repository.listQueuedMutations({ workspaceId: "workspace-a", domainId: "notes" });
  assert.equal(dependent.length, 1);
  assert.equal(dependent[0]?.state, "failed");
  assert.equal(dependent[0]?.lastErrorCode, "DEPENDENCY_CANCELLED");
  assert.equal(dependent[0]?.dependsOn, null);
  assert.deepEqual(dependent[0]?.patch, { links: ["local:note-cancelled"] });
});

test("merging full unattempted requests keeps the latest body and retargets dependents", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  const base = {
    actorId: "actor-a",
    workspaceId: "workspace-a",
    domainId: "test-offline-write",
    kind: "note" as const,
    operation: "update" as const,
    baseRevision: "revision-original",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  };
  await setup.repository.enqueueOutboxMutation({
    ...base,
    mutationId: "mutation-original",
    id: "note-request",
    patch: { title: "before", body: "kept" },
    requestJson: '{"mutationId":"mutation-original","title":"before","body":"kept"}',
    createdAt: "2026-09-16T00:01:00.000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    ...base,
    mutationId: "mutation-dependent",
    id: "note-dependent",
    operation: "create",
    patch: { noteId: "local:request" },
    requestJson: '{"mutationId":"mutation-dependent","noteId":"local:request"}',
    dependsOn: "mutation-original",
    createdAt: "2026-09-16T00:01:30.000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    ...base,
    mutationId: "mutation-merged",
    id: "note-request",
    patch: { title: "after" },
    requestJson: '{"mutationId":"mutation-merged","title":"after","body":"kept"}',
    createdAt: "2026-09-16T00:02:00.000Z",
  });

  const rows = await setup.database.all<{
    mutation_id: string;
    request_json: string;
    base_revision: string;
    depends_on: string | null;
  }>(`SELECT mutation_id, request_json, base_revision, depends_on
      FROM sync_outbox ORDER BY created_at, mutation_id`);
  assert.deepEqual(rows.map(row => ({ ...row })), [
    {
      mutation_id: "mutation-merged",
      request_json: '{"mutationId":"mutation-merged","title":"after","body":"kept"}',
      base_revision: "revision-original",
      depends_on: null,
    },
    {
      mutation_id: "mutation-dependent",
      request_json: '{"mutationId":"mutation-dependent","noteId":"local:request"}',
      base_revision: "revision-original",
      depends_on: "mutation-merged",
    },
  ]);
});

test("an outbox mutation persists the exact request body before its first attempt", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a",
    workspaceId: "workspace-a",
    domainId: "test-offline-write",
    mutationId: "mutation-frozen",
    kind: "note",
    id: "note-frozen",
    operation: "create",
    patch: { title: "frozen" },
    requestJson: '{"mutationId":"mutation-frozen","title":"frozen"}',
    baseRevision: null,
    dependsOn: null,
    createdAt: "2026-09-16T00:01:00.000Z",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  } as LocalSyncOutboxMutation);

  const row = await setup.database.get<{ domain_id: string; request_json: string; depends_on: string | null }>(
    "SELECT domain_id, request_json, depends_on FROM sync_outbox WHERE mutation_id = ?",
    ["mutation-frozen"],
  );
  assert.deepEqual(row && { ...row }, {
    domain_id: "test-offline-write",
    request_json: '{"mutationId":"mutation-frozen","title":"frozen"}',
    depends_on: null,
  });

  type BeginAttempt = (input: { mutationId: string; attemptedAt: string }) => Promise<{
    mutationId: string;
    requestJson: string;
    state: string;
    attemptCount: number;
    firstAttemptAt: string | null;
  } | null>;
  const beginAttempt = (setup.repository as unknown as { beginOutboxMutationAttempt?: BeginAttempt })
    .beginOutboxMutationAttempt;
  assert.equal(typeof beginAttempt, "function");
  const firstAttempt = await beginAttempt!.call(setup.repository, {
    mutationId: "mutation-frozen",
    attemptedAt: "2026-09-16T00:02:00.000Z",
  });
  assert.equal(await beginAttempt!.call(setup.repository, {
    mutationId: "mutation-frozen",
    attemptedAt: "2026-09-16T00:02:01.000Z",
  }), null, "a sending mutation cannot be claimed twice concurrently");
  assert.deepEqual(firstAttempt && {
    mutationId: firstAttempt.mutationId,
    requestJson: firstAttempt.requestJson,
    state: firstAttempt.state,
    attemptCount: firstAttempt.attemptCount,
    firstAttemptAt: firstAttempt.firstAttemptAt,
  }, {
    mutationId: "mutation-frozen",
    requestJson: '{"mutationId":"mutation-frozen","title":"frozen"}',
    state: "sending",
    attemptCount: 1,
    firstAttemptAt: "2026-09-16T00:02:00.000Z",
  });
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a",
    workspaceId: "workspace-a",
    domainId: "test-offline-write",
    mutationId: "mutation-later-edit",
    kind: "note",
    id: "note-frozen",
    operation: "update",
    patch: { title: "later" },
    requestJson: '{"mutationId":"mutation-later-edit","title":"later"}',
    baseRevision: "revision-after-frozen",
    dependsOn: null,
    createdAt: "2026-09-16T00:03:00.000Z",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  });
  const frozenRows = await setup.database.all<{ mutation_id: string; request_json: string }>(
    "SELECT mutation_id, request_json FROM sync_outbox WHERE record_id = ? ORDER BY created_at",
    ["note-frozen"],
  );
  assert.deepEqual(frozenRows.map(row => ({ ...row })), [
    { mutation_id: "mutation-frozen", request_json: '{"mutationId":"mutation-frozen","title":"frozen"}' },
    { mutation_id: "mutation-later-edit", request_json: '{"mutationId":"mutation-later-edit","title":"later"}' },
  ]);

  type MarkFailure = (input: {
    mutationId: string;
    state: "queued" | "conflict" | "failed";
    nextRetryAt: string | null;
    errorCode: string;
    serverSnapshot?: unknown;
  }) => Promise<void>;
  const markFailure = (setup.repository as unknown as { markOutboxMutationFailure?: MarkFailure })
    .markOutboxMutationFailure;
  assert.equal(typeof markFailure, "function");
  await markFailure!.call(setup.repository, {
    mutationId: "mutation-frozen",
    state: "queued",
    nextRetryAt: "2026-09-16T00:02:02.000Z",
    errorCode: "NETWORK_ERROR",
  });
  const retry = await beginAttempt!.call(setup.repository, {
    mutationId: "mutation-frozen",
    attemptedAt: "2026-09-16T00:02:02.000Z",
  });
  assert.equal(retry?.requestJson, '{"mutationId":"mutation-frozen","title":"frozen"}');
  assert.equal(retry?.attemptCount, 2);
  assert.equal(retry?.firstAttemptAt, "2026-09-16T00:02:00.000Z");
});

test("outbox overlay returns server truth and unconfirmed edits separately", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [record({ id: "note-overlay", payload: { title: "server" } })],
    cursor: "cursor-overlay",
    syncedAt: "2026-09-16T00:00:00.000Z",
    bootstrapState: "complete",
  });
  await setup.repository.putRecord(record({
    id: "note-noncanonical",
    revision: "local-pending",
    payload: { title: "must not enter the server overlay" },
    syncState: "pending",
    aiVisibility: "excluded",
  }));
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a",
    workspaceId: "workspace-a",
    domainId: "notes",
    mutationId: "mutation-overlay",
    kind: "note",
    id: "note-overlay",
    operation: "update",
    patch: { title: "local" },
    requestJson: '{"mutationId":"mutation-overlay","title":"local"}',
    baseRevision: "revision-1",
    createdAt: "2026-09-16T00:01:00.000Z",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  });

  type ReadOverlay = (query: { workspaceId: string; kind: "note" }) => Promise<{
    serverRecords: SyncRecord[];
    queuedMutations: Array<{ mutationId: string; patch: unknown; state: string }>;
  }>;
  const readOverlay = (setup.repository as unknown as { readOutboxOverlay?: ReadOverlay })
    .readOutboxOverlay;
  assert.equal(typeof readOverlay, "function");
  const result = await readOverlay!.call(setup.repository, { workspaceId: "workspace-a", kind: "note" });
  assert.deepEqual(result.serverRecords.map(item => ({ payload: item.payload, syncState: item.syncState })), [
    { payload: { title: "server" }, syncState: "synced" },
  ]);
  assert.deepEqual(result.queuedMutations.map(({ mutationId, patch, state }) => ({ mutationId, patch, state })), [{
    mutationId: "mutation-overlay",
    patch: { title: "local" },
    state: "queued",
  }]);
});

test("acknowledgement atomically writes the server row, alias, and dependent references", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "notes",
    mutationId: "mutation-parent", kind: "note", id: "local:note-1", operation: "create",
    patch: { title: "offline" }, requestJson: '{"mutationId":"mutation-parent","title":"offline"}',
    baseRevision: null, createdAt: "2026-09-16T00:01:00.000Z", retryCount: 0,
    nextRetryAt: null, lastErrorCode: null,
  });
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "notes",
    mutationId: "mutation-child", kind: "note", id: "note-child", operation: "create",
    patch: { links: ["local:note-1"], text: "see local:note-1" },
    requestJson: '{"mutationId":"mutation-child","noteIds":["local:note-1"]}',
    baseRevision: null, dependsOn: "mutation-parent", createdAt: "2026-09-16T00:02:00.000Z",
    retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });

  type Acknowledge = (input: {
    mutationId: string;
    record: SyncRecord;
    localId?: string;
    acknowledgedAt: string;
  }) => Promise<void>;
  const acknowledge = (setup.repository as unknown as { acknowledgeOutboxMutation?: Acknowledge })
    .acknowledgeOutboxMutation;
  assert.equal(typeof acknowledge, "function");
  await acknowledge!.call(setup.repository, {
    mutationId: "mutation-parent",
    localId: "local:note-1",
    acknowledgedAt: "2026-09-16T00:03:00.000Z",
    record: record({ id: "note-canonical", revision: "revision-server", payload: { title: "offline" } }),
  });

  const stored = await setup.repository.getRecord({ workspaceId: "workspace-a", kind: "note", id: "note-canonical" });
  assert.equal(stored?.syncState, "synced");
  assert.deepEqual(stored?.payload, { title: "offline" });
  const aliasResolver = (setup.repository as unknown as { resolveAlias?: (input: {
    workspaceId: string; domainId: string; localId: string; now: string;
  }) => Promise<string | null> }).resolveAlias;
  assert.equal(typeof aliasResolver, "function");
  assert.equal(await aliasResolver!.call(setup.repository, {
    workspaceId: "workspace-a", domainId: "notes", localId: "local:note-1", now: "2026-09-16T00:03:01.000Z",
  }), "note-canonical");
  const remaining = await setup.repository.listQueuedMutations({ workspaceId: "workspace-a", domainId: "notes" });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.dependsOn, null);
  assert.deepEqual(remaining[0]?.patch, { links: ["note-canonical"], text: "see local:note-1" });
  assert.equal(remaining[0]?.requestJson, '{"mutationId":"mutation-child","noteIds":["note-canonical"]}');
  assert.equal(await aliasResolver!.call(setup.repository, {
    workspaceId: "workspace-a", domainId: "notes", localId: "local:note-1", now: "2026-10-27T00:03:00.000Z",
  }), null);
});

test("acknowledgement rolls back the canonical row and outbox when alias persistence fails", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", domainId: "notes",
    mutationId: "mutation-parent", kind: "note", id: "local:note-rollback", operation: "create",
    patch: { title: "offline" }, requestJson: '{"title":"offline"}', baseRevision: null,
    createdAt: "2026-09-16T00:01:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  setup.database.failWhenSqlIncludes = "INSERT INTO sync_aliases";
  await assert.rejects(setup.repository.acknowledgeOutboxMutation({
    mutationId: "mutation-parent", localId: "local:note-rollback", acknowledgedAt: "2026-09-16T00:03:00.000Z",
    record: record({ id: "note-canonical-rollback", payload: { title: "offline" } }),
  }), /injected SQL failure/);
  assert.equal(await setup.repository.getRecord({ workspaceId: "workspace-a", kind: "note", id: "note-canonical-rollback" }), null);
  assert.equal((await setup.repository.listQueuedMutations({ workspaceId: "workspace-a", domainId: "notes" })).length, 1);
});

test("a page stores its server workspace with records and cursor in one transaction", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());

  await setup.repository.applyPage({
    workspaceId: "workspace-server",
    records: [record({ workspaceId: "workspace-server" })],
    cursor: "cursor-server",
    syncedAt: "2026-09-16T00:06:00.000Z",
    bootstrapState: "complete",
  });
  assert.equal(
    await setup.repository.getLastWorkspaceId(),
    "workspace-server",
  );

  const rollback = await repository();
  t.after(() => rollback.database.close());
  rollback.database.failWhenSqlIncludes = "INSERT INTO sync_meta";
  await assert.rejects(
    rollback.repository.applyPage({
      workspaceId: "workspace-server",
      records: [record({ workspaceId: "workspace-server" })],
      cursor: "cursor-server",
      syncedAt: "2026-09-16T00:06:00.000Z",
      bootstrapState: "complete",
    }),
    /injected SQL failure/,
  );
  assert.equal(await rollback.repository.getLastWorkspaceId(), null);
  assert.equal(await rollback.repository.getCursor("workspace-server"), null);
  assert.deepEqual(
    await rollback.repository.listRecords({
      workspaceId: "workspace-server",
      kind: "note",
    }),
    [],
  );
});

test("workspace reset removes only synced rows and cursor", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  const preservedStates = ["pending", "conflicted", "failed"] as const;

  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [record({ id: "synced-a" })],
    cursor: "cursor-a",
    syncedAt: "2026-09-16T00:06:00.000Z",
    bootstrapState: "complete",
  });
  await setup.repository.applyPage({
    workspaceId: "workspace-b",
    records: [record({ workspaceId: "workspace-b", id: "synced-b" })],
    cursor: "cursor-b",
    syncedAt: "2026-09-16T00:06:00.000Z",
    bootstrapState: "complete",
  });
  for (const syncState of preservedStates) {
    await setup.repository.putRecord(
      record({
        id: `${syncState}-a`,
        syncState,
        aiVisibility: "excluded",
      }),
    );
  }
  await setup.repository.enqueueOutboxMutation({
    actorId: "actor-a",
    workspaceId: "workspace-a",
    mutationId: "mutation-a",
    kind: "note",
    id: "pending-a",
    operation: "update",
    patch: { title: "device draft stays external too" },
    baseRevision: "revision-1",
    createdAt: "2026-09-16T00:07:00.000Z",
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  });
  await setup.database.run(
    "INSERT INTO legacy_api_snapshots (path, payload, status, synced_at) VALUES (?, ?, ?, ?)",
    ["/api/notes", "{}", 200, "2026-09-16T00:07:00.000Z"],
  );

  await setup.repository.resetWorkspace("workspace-a");

  assert.deepEqual(
    (
      await setup.repository.listRecords({
        workspaceId: "workspace-a",
        kind: "note",
        includeDeleted: true,
      })
    ).map(({ id, syncState }) => ({ id, syncState })),
    [
      { id: "conflicted-a", syncState: "conflicted" },
      { id: "failed-a", syncState: "failed" },
      { id: "pending-a", syncState: "pending" },
    ],
  );
  assert.equal(await setup.repository.getCursor("workspace-a"), null);
  assert.equal(
    (
      await setup.repository.listRecords({
        workspaceId: "workspace-b",
        kind: "note",
      })
    )[0]?.id,
    "synced-b",
  );
  assert.equal(
    (await setup.repository.getCursor("workspace-b"))?.cursor,
    "cursor-b",
  );
  assert.equal(
    (await setup.repository.listOutboxMutations("workspace-a"))[0]?.mutationId,
    "mutation-a",
  );
  assert.equal(
    (
      await setup.database.all<{ path: string }>(
        "SELECT path FROM legacy_api_snapshots",
      )
    )[0]?.path,
    "/api/notes",
  );
});

test("workspace reset rolls its row deletion back when cursor deletion fails", async (t) => {
  const setup = await repository();
  t.after(() => setup.database.close());
  await setup.repository.applyPage({
    workspaceId: "workspace-a",
    records: [record({ id: "synced-a" })],
    cursor: "cursor-a",
    syncedAt: "2026-09-16T00:06:00.000Z",
    bootstrapState: "complete",
  });
  setup.database.failWhenSqlIncludes = "DELETE FROM sync_cursors";

  await assert.rejects(
    setup.repository.resetWorkspace("workspace-a"),
    /injected SQL failure/,
  );

  assert.equal(
    (
      await setup.repository.listRecords({
        workspaceId: "workspace-a",
        kind: "note",
      })
    )[0]?.id,
    "synced-a",
  );
  assert.equal(
    (await setup.repository.getCursor("workspace-a"))?.cursor,
    "cursor-a",
  );
});

test("Web reports online-only with the missing capability, and local-mirror with its whitelist", async () => {
  assert.deepEqual(await getLocalSyncDatabaseCapability(), { mode: "online-only", reason: "insecure-context" });
  const capable = { isSecureContext: true, storage: { getDirectory: async () => ({}) as FileSystemDirectoryHandle }, indexedDB: {} as IDBFactory, subtle: {} as SubtleCrypto, hasWorker: true };
  assert.deepEqual(await getLocalSyncDatabaseCapability(capable), { mode: "local-mirror", domains: ["notes", "tasks", "personal-schedule", "event-registrations", "registered-events", "event-published-results", "contacts", "dashboard-graph", "inbox-notifications", "ai-sessions", "ai-session-messages", "relationship-conversations", "relationship-messages"] });
  assert.deepEqual(await getLocalSyncDatabaseCapability({ ...capable, storage: undefined }), { mode: "online-only", reason: "no-opfs" });
});

// ---------------------------------------------------------------------------
// payloadCodec: the browser mirror encrypts payload_json at rest. The codec is
// applied at the repository boundary only; SQL, hashes and reads are unchanged.
// ---------------------------------------------------------------------------
const tracingCodec = { encode: async (s: string) => `enc:${Buffer.from(s, "utf8").toString("base64")}`, decode: async (s: string) => {
  if (!s.startsWith("enc:")) throw new Error("PAYLOAD_CODEC_UNRECOGNIZED");
  return Buffer.from(s.slice(4), "base64").toString("utf8");
} };
const codecScope = { baseUrl: "https://host.example", actorId: "actor-a", workspaceId: "workspace-a", domainId: "tasks", authorizationEpoch: "epoch-a" };
const sha256 = async (json: string) => (await import("node:crypto")).createHash("sha256").update(json).digest("hex");

test("payloadCodec encodes every stored payload_json and decodes it on read; hashes cover the plaintext", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repo = createLocalSyncRepository({
    actorId: "actor-a", database, baseUrl: codecScope.baseUrl, registeredDomainIds: ["tasks"],
    activeReadScopes: () => [codecScope], hashPayload: sha256, payloadCodec: tracingCodec,
  });
  await repo.putRecord(record({ kind: "task", id: "legacy-task", payload: { title: "legacy secret" } }));
  await repo.applyPage({ workspaceId: "workspace-a", records: [record({ kind: "task", id: "page-task", payload: { title: "page secret" } })], cursor: "c1", syncedAt: "2026-09-16T00:06:00.000Z", bootstrapState: "complete" });
  await repo.applyDomainPage(codecScope, {
    domainId: "tasks", authorizationEpoch: "epoch-a", schemaVersion: 1, registryVersion: 1,
    changes: [{ id: "domain-task", revision: "r1", operation: "upsert", payload: { id: "domain-task", title: "domain secret" } }],
    nextCursor: "cursor:tasks", highWatermark: "hw1", hasMore: false, generation: "g1", serverTime: "2026-09-18T01:00:00Z",
  });

  const rows = await database.all<{ record_id: string; payload_json: string; payload_hash: string | null }>(
    "SELECT record_id, payload_json, payload_hash FROM sync_records ORDER BY record_id",
  );
  assert.deepEqual(rows.map((row) => row.record_id), ["domain-task", "legacy-task", "page-task"]);
  for (const row of rows) {
    assert.ok(row.payload_json.startsWith("enc:"), `${row.record_id} stored plaintext`);
    assert.ok(!row.payload_json.includes("secret"), `${row.record_id} leaked plaintext`);
  }
  const domainRow = rows.find((row) => row.record_id === "domain-task")!;
  assert.equal(domainRow.payload_hash, await sha256(JSON.stringify({ id: "domain-task", title: "domain secret" })));

  const listed = await repo.listRecords({ workspaceId: "workspace-a", kind: "task" });
  assert.deepEqual(listed.map((r) => [r.id, (r.payload as { title: string }).title]).sort(), [
    ["domain-task", "domain secret"], ["legacy-task", "legacy secret"], ["page-task", "page secret"],
  ]);
  assert.equal(((await repo.getRecord({ workspaceId: "workspace-a", kind: "task", id: "legacy-task" }))?.payload as { title: string }).title, "legacy secret");

  // A repository without the codec cannot read the rows: encryption is not optional once applied.
  const plain = createLocalSyncRepository({ actorId: "actor-a", database, baseUrl: codecScope.baseUrl, registeredDomainIds: ["tasks"], activeReadScopes: () => [codecScope] });
  await assert.rejects(plain.listRecords({ workspaceId: "workspace-a", kind: "task" }));
});
