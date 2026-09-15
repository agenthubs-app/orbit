import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { SyncPage, SyncRecord } from "../src/api/contract/sync";
import type { OrbitApiClient } from "../src/api/client";
import {
  createSyncClient,
  SyncRequestError,
  SyncResetRequiredError,
} from "../src/data/sync/sync-client";
import {
  createSyncCoordinator,
  type SyncCoordinatorLifecycle,
} from "../src/data/sync/sync-coordinator";
import {
  initializeLocalSyncDatabase,
  type LocalSyncDatabase,
  type LocalSyncSqlValue,
} from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import type { SyncSessionScope } from "../src/data/sync/sync-database-key";
import { subscribeToSyncAppState } from "../src/data/sync/sync-freshness";

const META = {
  featureMode: null,
  privacy: null,
  runtimeBoundary: null,
};
const BASE_URL = "http://127.0.0.1:3000";
const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const require = createRequire(import.meta.url);

class NodeTestDatabase implements LocalSyncDatabase {
  readonly database = new DatabaseSync(":memory:");
  beforeRun: ((source: string) => Promise<void>) | null = null;

  async execute(source: string): Promise<void> {
    this.database.exec(source);
  }

  async run(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<{ changes: number }> {
    await this.beforeRun?.(source);
    const result = this.database.prepare(source).run(...parameters);
    return { changes: Number(result.changes) };
  }

  async get<TRow>(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<TRow | null> {
    return (this.database.prepare(source).get(...parameters) as TRow) ?? null;
  }

  async all<TRow>(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<TRow[]> {
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
}

class TestLifecycle implements SyncCoordinatorLifecycle {
  currentScope: SyncSessionScope | null = null;

  constructor(readonly database: LocalSyncDatabase) {}

  async setScope(scope: SyncSessionScope | null): Promise<boolean> {
    this.currentScope = scope;
    return true;
  }

  async withDatabase<T>(
    scope: SyncSessionScope | null,
    operation: (
      database: LocalSyncDatabase,
      activeScope: Readonly<SyncSessionScope>,
    ) => Promise<T>,
  ): Promise<T | null> {
    const active = this.currentScope;
    if (!active || !scope) return null;
    if (active.baseUrl !== scope.baseUrl || active.actorId !== scope.actorId) {
      return null;
    }
    if (
      scope.workspaceId !== undefined &&
      active.workspaceId !== scope.workspaceId
    ) {
      return null;
    }
    return operation(this.database, active);
  }
}

function success(data: unknown) {
  return { success: true as const, data, meta: META, status: 200 };
}

function failure(input: {
  code: string;
  context?: Readonly<Record<string, string>>;
  status: number;
}) {
  return {
    success: false as const,
    error: {
      code: input.code,
      message: "request failed",
      ...(input.context ? { context: input.context } : {}),
    },
    meta: META,
    status: input.status,
  };
}

function apiClient(
  get: (
    path: string,
    options?: Parameters<OrbitApiClient["get"]>[1],
  ) => Promise<ReturnType<typeof success> | ReturnType<typeof failure>>,
): Pick<OrbitApiClient, "get"> {
  return { get: get as OrbitApiClient["get"] };
}

function page(overrides: Partial<SyncPage> = {}): SyncPage {
  return {
    workspaceId: "workspace-a",
    changes: [],
    nextCursor: "cursor-1",
    hasMore: false,
    highWatermark: "10",
    serverTime: "2026-09-16T12:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function setup() {
  const database = new NodeTestDatabase();
  await initializeLocalSyncDatabase(database);
  const lifecycle = new TestLifecycle(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => NOW });
  return { coordinator, database, lifecycle };
}

test("sync client uses only GET /api/sync cursor+limit and maps canonical records", async () => {
  const requests: Array<{
    path: string;
    signal: AbortSignal | undefined;
  }> = [];
  const abortController = new AbortController();
  const client = createSyncClient(
    apiClient(async (path, options) => {
      requests.push({ path, signal: options?.signal });
      return success(
        page({
          changes: [
            {
              kind: "task",
              id: "task-a",
              revision: "revision-1",
              operation: "upsert",
              updatedAt: "2026-09-16T11:59:00.000Z",
              payload: { title: "relationship", category: "relationship" },
              aiVisibility: "available_when_synced",
            },
            {
              kind: "note",
              id: "note-deleted",
              revision: "revision-2",
              operation: "delete",
              updatedAt: "2026-09-16T12:00:00.000Z",
              aiVisibility: "excluded",
            },
          ],
        }),
      );
    }),
  );

  const response = await client.getPage({
    actorId: "actor-a",
    cursor: "opaque + / =",
    limit: 100,
    signal: abortController.signal,
  });

  assert.deepEqual(requests, [
    {
      path: "/api/sync?cursor=opaque+%2B+%2F+%3D&limit=100",
      signal: abortController.signal,
    },
  ]);
  assert.deepEqual(response.records, [
    {
      actorId: "actor-a",
      workspaceId: "workspace-a",
      kind: "task",
      id: "task-a",
      revision: "revision-1",
      updatedAt: "2026-09-16T11:59:00.000Z",
      deletedAt: null,
      payload: { title: "relationship", category: "relationship" },
      syncState: "synced",
      aiVisibility: "available_when_synced",
    },
    {
      actorId: "actor-a",
      workspaceId: "workspace-a",
      kind: "note",
      id: "note-deleted",
      revision: "revision-2",
      updatedAt: "2026-09-16T12:00:00.000Z",
      deletedAt: "2026-09-16T12:00:00.000Z",
      payload: null,
      syncState: "synced",
      aiVisibility: "excluded",
    },
  ] satisfies SyncRecord[]);
});

test("sync client rejects malformed runtime data and recognizes only exact reset envelope", async () => {
  const malformed = [
    page({ workspaceId: " " }),
    page({ changes: [{ kind: "relationship_followup" }] as never }),
    page({
      changes: [
        {
          kind: "note",
          id: "note-a",
          revision: "revision-1",
          operation: "upsert",
          updatedAt: "2026-09-16T12:00:00.000Z",
          aiVisibility: "available_when_synced",
        },
      ],
    }),
    { ...page(), actorId: "leaked-authority" },
  ];
  for (const value of malformed) {
    const client = createSyncClient(apiClient(async () => success(value)));
    await assert.rejects(
      client.getPage({ limit: 100, actorId: "actor-a" }),
      /invalid sync page/,
    );
  }

  const reset = createSyncClient(
    apiClient(async () =>
      failure({
        code: "CONFLICT",
        context: { syncErrorCode: "SYNC_RESET_REQUIRED" },
        status: 409,
      }),
    ),
  );
  await assert.rejects(
    reset.getPage({ limit: 100, actorId: "actor-a" }),
    SyncResetRequiredError,
  );

  for (const result of [
    failure({
      code: "CONFLICT",
      context: { syncErrorCode: "SYNC_RESET_REQUIRED" },
      status: 400,
    }),
    failure({ code: "CONFLICT", status: 409 }),
    failure({
      code: "VALIDATION_ERROR",
      context: { syncErrorCode: "SYNC_RESET_REQUIRED" },
      status: 409,
    }),
  ]) {
    const client = createSyncClient(apiClient(async () => result));
    await assert.rejects(
      client.getPage({ limit: 100, actorId: "actor-a" }),
      (error: unknown) =>
        error instanceof SyncRequestError &&
        !(error instanceof SyncResetRequiredError),
    );
  }
});

test("sync client rejects a success page carried by a non-success HTTP status", async () => {
  const client = createSyncClient(
    apiClient(async () => ({
      ...success(page()),
      status: 503,
    })),
  );

  await assert.rejects(
    client.getPage({ limit: 100, actorId: "actor-a" }),
    /invalid sync response status/,
  );
});

test("cold bootstrap pulls pages sequentially and completes only the final cursor", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const paths: string[] = [];
  const pages = [
    page({
      changes: [
        {
          kind: "note",
          id: "note-a",
          revision: "revision-1",
          operation: "upsert",
          updatedAt: "2026-09-16T11:58:00.000Z",
          payload: { title: "first" },
          aiVisibility: "available_when_synced",
        },
      ],
      nextCursor: "cursor-1",
      hasMore: true,
    }),
    page({
      changes: [
        {
          kind: "task",
          id: "task-a",
          revision: "revision-2",
          operation: "upsert",
          updatedAt: "2026-09-16T11:59:00.000Z",
          payload: { title: "second" },
          aiVisibility: "available_when_synced",
        },
      ],
      nextCursor: "cursor-2",
      hasMore: false,
    }),
  ];
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    client: createSyncClient(
      apiClient(async (path) => {
        paths.push(path);
        return success(pages.shift());
      }),
    ),
    scopeKey: "session-a",
  });

  assert.deepEqual(await session.readCollection("note"), {
    error: null,
    lastSyncedAt: null,
    records: [],
    status: "local-ready",
    workspaceId: null,
  });
  const result = await session.synchronize("note").promise;

  assert.equal(result?.status, "fresh");
  assert.equal(result?.records[0]?.id, "note-a");
  assert.deepEqual(paths, [
    "/api/sync?limit=100",
    "/api/sync?cursor=cursor-1&limit=100",
  ]);
  const repository = createLocalSyncRepository({
    actorId: "actor-a",
    database: f.database,
  });
  assert.deepEqual(await repository.getCursor("workspace-a"), {
    workspaceId: "workspace-a",
    cursor: "cursor-2",
    lastSyncedAt: "2026-09-16T12:00:00.000Z",
    bootstrapState: "complete",
  });
  assert.equal(await repository.getLastWorkspaceId(), "workspace-a");
});

test("encrypted last workspace restores mirror and a cursor resumes the delta", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const repository = createLocalSyncRepository({
    actorId: "actor-a",
    database: f.database,
  });
  await repository.applyPage({
    workspaceId: "workspace-last",
    records: [
      {
        actorId: "actor-a",
        workspaceId: "workspace-last",
        kind: "note",
        id: "note-cached",
        revision: "revision-1",
        updatedAt: "2026-09-16T11:00:00.000Z",
        deletedAt: null,
        payload: { title: "offline" },
        syncState: "synced",
        aiVisibility: "available_when_synced",
      },
    ],
    cursor: "cursor-last",
    syncedAt: "2026-09-16T11:00:00.000Z",
    bootstrapState: "complete",
  });
  const paths: string[] = [];
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    client: createSyncClient(
      apiClient(async (path) => {
        paths.push(path);
        return success(page({ workspaceId: "workspace-last", nextCursor: "cursor-next" }));
      }),
    ),
    scopeKey: "session-a",
  });

  const mirror = await session.readCollection("note");
  assert.equal(mirror?.records[0]?.id, "note-cached");
  assert.equal(mirror?.status, "local-ready");
  assert.equal(f.lifecycle.currentScope?.workspaceId, "workspace-last");

  await session.synchronize("note", { reason: "explicit" }).promise;
  assert.deepEqual(paths, [
    "/api/sync?cursor=cursor-last&limit=100",
  ]);
});

test("same-scope subscribers share one request and one cancellation does not stop it", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const pending = deferred<ReturnType<typeof success>>();
  let calls = 0;
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    client: createSyncClient(
      apiClient(async () => {
        calls += 1;
        return pending.promise;
      }),
    ),
    scopeKey: "session-a",
  });

  const noteRequest = session.synchronize("note");
  const taskRequest = session.synchronize("task");
  noteRequest.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  pending.resolve(success(page()));
  assert.equal((await taskRequest.promise)?.status, "fresh");
  assert.equal((await noteRequest.promise)?.status, "fresh");
  assert.equal(calls, 1);
});

test("a replacement subscriber resumes a flight after the last subscriber cancels", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const firstPage = deferred<ReturnType<typeof success>>();
  const paths: string[] = [];
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    client: createSyncClient(
      apiClient(async (path) => {
        paths.push(path);
        if (paths.length === 1) return firstPage.promise;
        return success(page({ nextCursor: "cursor-final" }));
      }),
    ),
    scopeKey: "session-a",
  });

  const abandoned = session.synchronize("note");
  await new Promise((resolve) => setImmediate(resolve));
  abandoned.cancel();
  const replacement = session.synchronize("note");
  firstPage.resolve(
    success(page({ hasMore: true, nextCursor: "cursor-first" })),
  );

  assert.equal((await replacement.promise)?.status, "fresh");
  assert.deepEqual(paths, [
    "/api/sync?limit=100",
    "/api/sync?cursor=cursor-first&limit=100",
  ]);
});

test("AppState lifecycle counts an already-background mount and removes its listener", () => {
  let currentState = "background";
  let now = 1_000;
  let listener: ((state: string) => void) | null = null;
  let removed = 0;
  const foregroundDurations: number[] = [];
  const emit = (state: string) => listener?.(state);
  const cleanup = subscribeToSyncAppState({
    appState: {
      get currentState() {
        return currentState;
      },
      addEventListener(_event, nextListener) {
        listener = nextListener;
        return {
          remove() {
            removed += 1;
            listener = null;
          },
        };
      },
    },
    now: () => now,
    onForeground: (durationMs) => foregroundDurations.push(durationMs),
  });

  now = 61_000;
  currentState = "active";
  emit("active");
  emit("active");
  cleanup();
  currentState = "background";
  emit("background");

  assert.deepEqual(foregroundDurations, [60_000]);
  assert.equal(removed, 1);
});

test("ordinary reads honor TTL while explicit refresh always requests", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const repository = createLocalSyncRepository({ actorId: "actor-a", database: f.database });
  await repository.applyPage({
    workspaceId: "workspace-a",
    records: [],
    cursor: "cursor-fresh",
    syncedAt: "2026-09-16T12:00:00.000Z",
    bootstrapState: "complete",
  });
  let calls = 0;
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    client: createSyncClient(apiClient(async () => {
      calls += 1;
      return success(page({ nextCursor: "cursor-refreshed" }));
    })),
    scopeKey: "session-a",
  });

  assert.equal((await session.synchronize("note").promise)?.status, "fresh");
  assert.equal(calls, 0);
  assert.equal(
    (await session.synchronize("note", { reason: "explicit" }).promise)?.status,
    "fresh",
  );
  assert.equal(calls, 1);
});

test("partial page failure keeps the committed page and pending cursor as stale", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  let call = 0;
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    client: createSyncClient(apiClient(async () => {
      call += 1;
      if (call === 1) {
        return success(page({
          changes: [{
            kind: "note",
            id: "note-first-page",
            revision: "revision-1",
            operation: "upsert",
            updatedAt: "2026-09-16T11:59:00.000Z",
            payload: { title: "kept" },
            aiVisibility: "available_when_synced",
          }],
          hasMore: true,
          nextCursor: "cursor-partial",
        }));
      }
      return failure({ code: "SERVICE_UNAVAILABLE", status: 503 });
    })),
    scopeKey: "session-a",
  });

  const result = await session.synchronize("note").promise;
  assert.equal(result?.status, "stale");
  assert.equal(result?.records[0]?.id, "note-first-page");
  assert.match(result?.error ?? "", /request failed/);
  const repository = createLocalSyncRepository({ actorId: "actor-a", database: f.database });
  assert.deepEqual(await repository.getCursor("workspace-a"), {
    workspaceId: "workspace-a",
    cursor: "cursor-partial",
    lastSyncedAt: "2026-09-16T12:00:00.000Z",
    bootstrapState: "pending",
  });
});

test("reset-required clears only canonical synced state and retries bootstrap once", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const repository = createLocalSyncRepository({ actorId: "actor-a", database: f.database });
  await repository.applyPage({
    workspaceId: "workspace-a",
    records: [{
      actorId: "actor-a", workspaceId: "workspace-a", kind: "note", id: "old",
      revision: "revision-old", updatedAt: "2026-09-16T11:00:00.000Z", deletedAt: null,
      payload: { title: "old" }, syncState: "synced", aiVisibility: "available_when_synced",
    }],
    cursor: "cursor-old",
    syncedAt: "2026-09-16T11:00:00.000Z",
    bootstrapState: "complete",
  });
  await repository.putRecord({
    actorId: "actor-a", workspaceId: "workspace-a", kind: "note", id: "pending",
    revision: "revision-base", updatedAt: "2026-09-16T11:30:00.000Z", deletedAt: null,
    payload: { title: "pending" }, syncState: "pending", aiVisibility: "excluded",
  });
  await repository.enqueueOutboxMutation({
    actorId: "actor-a", workspaceId: "workspace-a", mutationId: "outbox-a", kind: "note",
    id: "pending", operation: "update", patch: { title: "pending" }, baseRevision: "revision-base",
    createdAt: "2026-09-16T11:31:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  });
  const paths: string[] = [];
  const session = f.coordinator.openScope({
    actorId: "actor-a", baseUrl: BASE_URL, scopeKey: "session-a",
    client: createSyncClient(apiClient(async (path) => {
      paths.push(path);
      return paths.length === 1
        ? failure({ code: "CONFLICT", context: { syncErrorCode: "SYNC_RESET_REQUIRED" }, status: 409 })
        : success(page({ changes: [{
          kind: "note", id: "new", revision: "revision-new", operation: "upsert",
          updatedAt: "2026-09-16T12:00:00.000Z", payload: { title: "new" },
          aiVisibility: "available_when_synced",
        }], nextCursor: "cursor-new" }));
    })),
  });

  const result = await session.synchronize("note", { reason: "explicit" }).promise;
  assert.deepEqual(paths, [
    "/api/sync?cursor=cursor-old&limit=100",
    "/api/sync?limit=100",
  ]);
  assert.deepEqual(result?.records.map(({ id }) => id), ["new", "pending"]);
  assert.equal(await repository.getRecord({ workspaceId: "workspace-a", kind: "note", id: "old" }), null);
  assert.equal((await repository.listOutboxMutations("workspace-a"))[0]?.mutationId, "outbox-a");
});

test("a second reset-required response fails visibly without resetting twice", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const repository = createLocalSyncRepository({
    actorId: "actor-a",
    database: f.database,
  });
  await repository.applyPage({
    workspaceId: "workspace-a",
    records: [
      {
        actorId: "actor-a",
        workspaceId: "workspace-a",
        kind: "note",
        id: "old",
        revision: "revision-old",
        updatedAt: "2026-09-16T11:00:00.000Z",
        deletedAt: null,
        payload: { title: "old" },
        syncState: "synced",
        aiVisibility: "available_when_synced",
      },
    ],
    cursor: "cursor-old",
    syncedAt: "2026-09-16T11:00:00.000Z",
    bootstrapState: "complete",
  });
  let resetDeletes = 0;
  f.database.beforeRun = async (source) => {
    if (source.includes("DELETE FROM sync_records")) resetDeletes += 1;
  };
  const paths: string[] = [];
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    scopeKey: "session-a",
    client: createSyncClient(
      apiClient(async (path) => {
        paths.push(path);
        return failure({
          code: "CONFLICT",
          context: { syncErrorCode: "SYNC_RESET_REQUIRED" },
          status: 409,
        });
      }),
    ),
  });

  const result = await session.synchronize("note", { reason: "explicit" }).promise;

  assert.deepEqual(paths, [
    "/api/sync?cursor=cursor-old&limit=100",
    "/api/sync?limit=100",
  ]);
  assert.equal(resetDeletes, 1);
  assert.equal(result?.status, "failure");
  assert.match(result?.error ?? "", /request failed/);
});

test("last-subscriber cancellation stops after the issued page", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const pending = deferred<ReturnType<typeof success>>();
  let calls = 0;
  const session = f.coordinator.openScope({
    actorId: "actor-a", baseUrl: BASE_URL, scopeKey: "session-a",
    client: createSyncClient(apiClient(async () => {
      calls += 1;
      return pending.promise;
    })),
  });
  const request = session.synchronize("note");
  await new Promise((resolve) => setImmediate(resolve));
  request.cancel();
  pending.resolve(success(page({ changes: [{
    kind: "note", id: "note-current", revision: "revision-1", operation: "upsert",
    updatedAt: "2026-09-16T12:00:00.000Z", payload: { title: "current" },
    aiVisibility: "available_when_synced",
  }], hasMore: true, nextCursor: "cursor-current" })));
  await request.promise;

  assert.equal(calls, 1);
  const repository = createLocalSyncRepository({ actorId: "actor-a", database: f.database });
  assert.equal((await repository.getCursor("workspace-a"))?.bootstrapState, "pending");
  assert.equal((await repository.listRecords({ workspaceId: "workspace-a", kind: "note" }))[0]?.id, "note-current");
});

test("scope switch makes an old response perform zero apply and return no UI state", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const oldResponse = deferred<ReturnType<typeof success>>();
  let oldSignal: AbortSignal | undefined;
  const oldSession = f.coordinator.openScope({
    actorId: "actor-a", baseUrl: BASE_URL, scopeKey: "session-a",
    client: createSyncClient(apiClient(async (_path, options) => {
      oldSignal = options?.signal;
      return oldResponse.promise;
    })),
  });
  const oldRequest = oldSession.synchronize("note");
  await new Promise((resolve) => setImmediate(resolve));

  const nextSession = f.coordinator.openScope({
    actorId: "actor-b", baseUrl: BASE_URL, scopeKey: "session-b",
    client: createSyncClient(apiClient(async () => success(page({ workspaceId: "workspace-b" })) )),
  });
  assert.equal((await nextSession.synchronize("note").promise)?.workspaceId, "workspace-b");
  oldResponse.resolve(success(page({ changes: [{
    kind: "note", id: "stale", revision: "revision-stale", operation: "upsert",
    updatedAt: "2026-09-16T12:00:00.000Z", payload: { title: "must not apply" },
    aiVisibility: "available_when_synced",
  }] })));

  assert.equal(await oldRequest.promise, null);
  assert.equal(oldSignal?.aborted, true);
  const row = await f.database.get<{ record_id: string }>(
    "SELECT record_id FROM sync_records WHERE record_id = ?",
    ["stale"],
  );
  assert.equal(row, null);
});

test("scope generation change during a local page transaction rolls it back", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const transactionReachedCursor = deferred<void>();
  const releaseTransaction = deferred<void>();
  f.database.beforeRun = async (source) => {
    if (source.includes("INSERT INTO sync_cursors")) {
      transactionReachedCursor.resolve();
      await releaseTransaction.promise;
    }
  };
  const oldSession = f.coordinator.openScope({
    actorId: "actor-a", baseUrl: BASE_URL, scopeKey: "session-a",
    client: createSyncClient(apiClient(async () => success(page({ changes: [{
      kind: "note", id: "mid-transaction-stale", revision: "revision-stale", operation: "upsert",
      updatedAt: "2026-09-16T12:00:00.000Z", payload: { title: "must roll back" },
      aiVisibility: "available_when_synced",
    }] })))),
  });
  const oldRequest = oldSession.synchronize("note");
  await transactionReachedCursor.promise;

  f.coordinator.openScope({
    actorId: "actor-b", baseUrl: BASE_URL, scopeKey: "session-b",
    client: createSyncClient(apiClient(async () => success(page({ workspaceId: "workspace-b" })) )),
  });
  releaseTransaction.resolve();

  assert.equal(await oldRequest.promise, null);
  assert.equal(
    await f.database.get<{ record_id: string }>(
      "SELECT record_id FROM sync_records WHERE record_id = ?",
      ["mid-transaction-stale"],
    ),
    null,
  );
});

test("authenticated server workspace replaces the restored workspace", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const repository = createLocalSyncRepository({ actorId: "actor-a", database: f.database });
  await repository.applyPage({
    workspaceId: "workspace-old", records: [], cursor: "cursor-old",
    syncedAt: "2026-09-16T11:00:00.000Z", bootstrapState: "complete",
  });
  const session = f.coordinator.openScope({
    actorId: "actor-a", baseUrl: BASE_URL, scopeKey: "session-a",
    client: createSyncClient(apiClient(async () => success(page({
      workspaceId: "workspace-new", nextCursor: "cursor-new", changes: [{
        kind: "note", id: "new-workspace-note", revision: "revision-new", operation: "upsert",
        updatedAt: "2026-09-16T12:00:00.000Z", payload: { title: "new workspace" },
        aiVisibility: "available_when_synced",
      }],
    })) )),
  });

  const result = await session.synchronize("note", { reason: "explicit" }).promise;
  assert.equal(result?.workspaceId, "workspace-new");
  assert.equal(await repository.getLastWorkspaceId(), "workspace-new");
  assert.equal(f.lifecycle.currentScope?.workspaceId, "workspace-new");
});

test("network failure with no mirror is failure, not an empty success", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const session = f.coordinator.openScope({
    actorId: "actor-a", baseUrl: BASE_URL, scopeKey: "session-a",
    client: createSyncClient(apiClient(async () => failure({ code: "SERVICE_UNAVAILABLE", status: 503 }))),
  });
  const result = await session.synchronize("note").promise;
  assert.equal(result?.status, "failure");
  assert.deepEqual(result?.records, []);
  assert.match(result?.error ?? "", /request failed/);
});

test("network failure with an existing mirror preserves it as stale", async (t) => {
  const f = await setup();
  t.after(() => f.database.close());
  const repository = createLocalSyncRepository({
    actorId: "actor-a",
    database: f.database,
  });
  await repository.applyPage({
    workspaceId: "workspace-a",
    records: [
      {
        actorId: "actor-a",
        workspaceId: "workspace-a",
        kind: "note",
        id: "cached",
        revision: "revision-cached",
        updatedAt: "2026-09-16T11:00:00.000Z",
        deletedAt: null,
        payload: { title: "offline" },
        syncState: "synced",
        aiVisibility: "available_when_synced",
      },
    ],
    cursor: "cursor-cached",
    syncedAt: "2026-09-16T11:00:00.000Z",
    bootstrapState: "complete",
  });
  const session = f.coordinator.openScope({
    actorId: "actor-a",
    baseUrl: BASE_URL,
    scopeKey: "session-a",
    client: createSyncClient(
      apiClient(async () =>
        failure({ code: "SERVICE_UNAVAILABLE", status: 503 }),
      ),
    ),
  });

  const result = await session.synchronize("note", { reason: "explicit" }).promise;

  assert.equal(result?.status, "stale");
  assert.equal(result?.records[0]?.id, "cached");
  assert.match(result?.error ?? "", /request failed/);
});

const hookFixture = `
import { useSyncExternalStore } from "react";
let revision = 0;
const subscribers = new Set();
const appStateListeners = new Set();
const meta = { featureMode: null, privacy: null, runtimeBoundary: null };
const state = window.fixture = {
  actorId: "actor-a", signedIn: true, ready: true, baseUrlReady: true,
  baseUrl: "https://orbit.example", sessionRevision: 0, mounted: true,
  componentCount: 1, appState: "active", requests: [], replies: [],
  records: [], cursor: null, workspaceId: null, applies: 0, scopeOpens: 0,
  renders: [], cursorReads: 0, holdSyncCursor: false, releaseCursor: null,
  ...window.initialFixture,
  update(patch) {
    Object.assign(state, patch);
    revision += 1;
    subscribers.forEach(listener => listener());
  },
  reply(index, id) {
    state.replies[index]({
      success: true,
      data: {
        workspaceId: "workspace-a",
        changes: [{
          kind: "note", id, revision: "revision-" + id,
          operation: "upsert", updatedAt: "2026-09-16T12:00:00.000Z",
          payload: { title: id }, aiVisibility: "available_when_synced"
        }],
        nextCursor: "cursor-" + id, hasMore: false, highWatermark: "1",
        serverTime: "2026-09-16T12:00:00.000Z"
      },
      meta,
      status: 200
    });
  },
};
const observe = () => useSyncExternalStore(
  listener => { subscribers.add(listener); return () => subscribers.delete(listener); },
  () => revision,
  () => revision,
);
const apiClient = {
  get(path, options) {
    const index = state.requests.length;
    state.requests.push({ path, signal: options?.signal });
    return new Promise(resolve => { state.replies[index] = resolve; });
  }
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => {
  observe();
  return {
    actorId: state.actorId,
    cookieHeader: "",
    notificationSessionRevision: state.sessionRevision,
    ready: state.ready,
    signedIn: state.signedIn,
  };
};
export const useOrbitApiBaseUrl = () => {
  observe();
  return { baseUrl: state.baseUrl, ready: state.baseUrlReady };
};
export const useOrbitApiClient = () => apiClient;
export const AppState = {
  get currentState() { return state.appState; },
  addEventListener(_event, listener) {
    appStateListeners.add(listener);
    return { remove() { appStateListeners.delete(listener); } };
  },
};
export const syncLifecycle = {
  async setScope() { state.scopeOpens += 1; return true; },
  async withDatabase(_scope, operation) { return operation({}, {}); },
};
export function createLocalSyncRepository() {
  return {
    async getLastWorkspaceId() { return state.workspaceId; },
    async getCursor() {
      state.cursorReads += 1;
      if (state.holdSyncCursor && state.cursorReads === 2) {
        await new Promise(resolve => { state.releaseCursor = resolve; });
      }
      return state.cursor;
    },
    async listRecords() { return state.records; },
    async applyPage(input) {
      if (input.canCommit && !input.canCommit()) return false;
      state.applies += 1;
      state.records = input.records;
      state.workspaceId = input.workspaceId;
      state.cursor = {
        workspaceId: input.workspaceId,
        cursor: input.cursor,
        lastSyncedAt: input.syncedAt,
        bootstrapState: input.bootstrapState,
      };
      if (input.canCommit && !input.canCommit()) {
        state.applies -= 1;
        state.records = [];
        state.workspaceId = null;
        state.cursor = null;
        return false;
      }
      return true;
    },
    async resetWorkspace() { state.records = []; state.cursor = null; return true; },
  };
}
`;

let hookBrowser: Browser;
let hookScript: string;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useFixture } from "fixture";
import { useSyncedCollection } from "./src/hooks/useSyncedCollection";
function Probe({ index }) {
  const state = useSyncedCollection({ kind: "note" });
  const fixture = useFixture();
  fixture.renders.push(state.status);
  return <output data-probe={index}>{state.status + ":" + state.records.map(record => record.id).join(",")}</output>;
}
function App() {
  const fixture = useFixture();
  return fixture.mounted
    ? <>{Array.from({ length: fixture.componentCount }, (_, index) => <Probe index={index} key={index} />)}</>
    : null;
}
window.renderAbandoned = () => renderToString(<Probe index="abandoned" />);
createRoot(document.getElementById("root")).render(<App />);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"test"',
      "process.env": "{}",
      __DEV__: "false",
    },
    plugins: [
      {
        name: "synced-collection-hook-boundaries",
        setup(plugin) {
          plugin.onResolve(
            {
              filter:
                /^(fixture|react-native)$|\/(ApiBaseUrlProvider|AuthSessionProvider|useOrbitApiClient|sync-lifecycle|local-sync-repository)$/,
            },
            () => ({ path: "fixture", namespace: "sync-hook" }),
          );
          plugin.onLoad({ filter: /.*/, namespace: "sync-hook" }, () => ({
            contents: hookFixture,
            loader: "jsx",
            resolveDir: process.cwd(),
          }));
          plugin.onResolve({ filter: /^react-native-web$/ }, () => ({
            path: require.resolve("react-native-web"),
          }));
        },
      },
    ],
  });
  hookScript = result.outputFiles[0]!.text;
  hookBrowser = await chromium.launch({
    headless: true,
    ...(process.env.ORBIT_TEST_CHROME_PATH
      ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH }
      : {}),
  });
});

test.after(async () => {
  await hookBrowser?.close();
});

async function settleHook(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function openHook(
  t: { after(fn: () => Promise<void>): void },
  patch: Record<string, unknown> = {},
): Promise<Page> {
  const page = await hookBrowser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    await page.close();
    assert.deepEqual(errors, []);
  });
  page.setDefaultTimeout(3_000);
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate((initial) => {
    (window as unknown as { initialFixture: unknown }).initialFixture = initial;
  }, patch);
  await page.addScriptTag({ content: hookScript });
  await settleHook(page);
  return page;
}

async function updateHook(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((next) => {
    (window as unknown as { fixture: { update(value: unknown): void } }).fixture.update(next);
  }, patch);
  await settleHook(page);
}

test("an abandoned React render does not open a coordinator scope", async (t) => {
  const page = await openHook(t, { mounted: false });
  await page.evaluate(() => {
    (window as unknown as { renderAbandoned(): void }).renderAbandoned();
  });
  assert.equal(
    await page.evaluate(() =>
      (window as unknown as { fixture: { scopeOpens: number } }).fixture.scopeOpens,
    ),
    0,
  );
});

test("signout and same-actor relogin reject the prior hook generation", async (t) => {
  const page = await openHook(t);
  await page.waitForFunction(() =>
    (window as unknown as { fixture: { requests: unknown[] } }).fixture.requests.length === 1,
  );
  await updateHook(page, { actorId: null, signedIn: false });
  assert.equal(
    await page.evaluate(() => {
      const request = (window as unknown as {
        fixture: { requests: Array<{ signal?: AbortSignal }> };
      }).fixture.requests[0];
      return request?.signal?.aborted;
    }),
    true,
  );
  await updateHook(page, { actorId: "actor-a", signedIn: true });
  await page.waitForFunction(() =>
    (window as unknown as { fixture: { requests: unknown[] } }).fixture.requests.length === 2,
  );

  await page.evaluate(() => {
    (window as unknown as { fixture: { reply(index: number, id: string): void } }).fixture.reply(0, "old");
  });
  await settleHook(page);
  assert.equal(
    await page.evaluate(() =>
      (window as unknown as { fixture: { applies: number } }).fixture.applies,
    ),
    0,
  );
  assert.doesNotMatch(await page.locator("output").innerText(), /old/);

  await page.evaluate(() => {
    (window as unknown as { fixture: { reply(index: number, id: string): void } }).fixture.reply(1, "new");
  });
  await page.getByText("fresh:new", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      (window as unknown as { fixture: { applies: number } }).fixture.applies,
    ),
    1,
  );
});

test("two committed hook consumers share one flight and one cleanup does not revoke it", async (t) => {
  const page = await openHook(t, { componentCount: 2 });
  await page.waitForFunction(() =>
    (window as unknown as { fixture: { requests: unknown[] } }).fixture.requests.length === 1,
  );
  assert.equal(
    await page.locator('output[data-probe="0"]').innerText(),
    "syncing:",
  );
  await updateHook(page, { componentCount: 1 });
  assert.equal(
    await page.evaluate(() =>
      (window as unknown as { fixture: { requests: unknown[] } }).fixture.requests.length,
    ),
    1,
  );
  await page.evaluate(() => {
    (window as unknown as { fixture: { reply(index: number, id: string): void } }).fixture.reply(0, "shared");
  });
  await page.getByText("fresh:shared", { exact: true }).waitFor();
});

test("a TTL hit never publishes a synthetic syncing render", async (t) => {
  const lastSyncedAt = new Date().toISOString();
  const page = await openHook(t, {
    cursor: {
      workspaceId: "workspace-a",
      cursor: "cursor-fresh",
      lastSyncedAt,
      bootstrapState: "complete",
    },
    workspaceId: "workspace-a",
    holdSyncCursor: true,
    records: [{
      actorId: "actor-a", workspaceId: "workspace-a", kind: "note", id: "cached",
      revision: "revision-cached", updatedAt: lastSyncedAt, deletedAt: null,
      payload: { title: "cached" }, syncState: "synced",
      aiVisibility: "available_when_synced",
    }],
  });
  await page.waitForFunction(() =>
    (window as unknown as { fixture: { cursorReads: number } }).fixture.cursorReads === 2,
  );
  assert.equal(
    await page.evaluate(() => {
      const fixture = (window as unknown as {
        fixture: { renders: string[]; requests: unknown[] };
      }).fixture;
      return fixture.renders.includes("syncing");
    }),
    false,
  );
  await page.evaluate(() => {
    (window as unknown as { fixture: { releaseCursor(): void } }).fixture.releaseCursor();
  });
  await page.getByText("fresh:cached", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      (window as unknown as { fixture: { requests: unknown[] } }).fixture.requests.length,
    ),
    0,
  );
});
