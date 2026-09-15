import type { SyncChangeKind, SyncRecord } from "../../api/contract/sync";
import type { LocalSyncDatabase } from "./local-sync-database";
import {
  createLocalSyncRepository,
  type LocalSyncCursor,
} from "./local-sync-repository";
import type { SyncSessionScope } from "./sync-database-key";
import {
  type SyncClient,
  SyncResetRequiredError,
} from "./sync-client";
import {
  shouldSynchronize,
  type SyncRefreshReason,
} from "./sync-freshness";

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_RUN = 100;

export interface SyncCoordinatorLifecycle {
  setScope(scope: SyncSessionScope | null): Promise<boolean>;
  withDatabase<T>(
    scope: SyncSessionScope | null,
    operation: (
      database: LocalSyncDatabase,
      activeScope: Readonly<SyncSessionScope>,
    ) => Promise<T>,
  ): Promise<T | null>;
}

export type SyncedCollectionStatus =
  | "local-ready"
  | "syncing"
  | "fresh"
  | "stale"
  | "failure";

export interface SyncedCollectionSnapshot<TPayload = unknown> {
  error: string | null;
  lastSyncedAt: string | null;
  records: readonly SyncRecord<TPayload>[];
  status: SyncedCollectionStatus;
  workspaceId: string | null;
}

export interface SyncScopeInput {
  actorId: string;
  baseUrl: string;
  client: SyncClient;
  scopeKey: string;
}

export interface SyncOptions {
  backgroundDurationMs?: number;
  reason?: SyncRefreshReason;
}

export interface SyncRequest<TPayload = unknown> {
  cancel(): void;
  promise: Promise<SyncedCollectionSnapshot<TPayload> | null>;
}

interface ActiveScope extends SyncScopeInput {
  abortController: AbortController | null;
  databaseAvailable: boolean;
  flight: SyncFlight | null;
  generation: number;
  invalidated: boolean;
  ready: Promise<void>;
  superseded: boolean;
  workspaceId: string | null;
}

interface SyncFlight {
  backgroundDurationMs: number;
  promise: Promise<SyncRunResult | null>;
  reason: SyncRefreshReason;
  stopAfterCurrent: boolean;
  subscribers: number;
}

interface SyncRunResult {
  error: string | null;
}

class LocalMirrorUnavailableError extends Error {
  constructor() {
    super("本地同步镜像暂不可用。");
    this.name = "LocalMirrorUnavailableError";
  }
}

export function createSyncCoordinator(input: {
  lifecycle: SyncCoordinatorLifecycle;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  let generation = 0;
  let active: ActiveScope | null = null;

  function isCurrent(scope: ActiveScope): boolean {
    return active === scope && !scope.superseded;
  }

  async function withRepository<T>(
    scope: ActiveScope,
    operation: (
      repository: ReturnType<typeof createLocalSyncRepository>,
    ) => Promise<T>,
  ): Promise<T> {
    const result = await input.lifecycle.withDatabase(
      { baseUrl: scope.baseUrl, actorId: scope.actorId },
      async (database) => ({
        value: await operation(
          createLocalSyncRepository({ actorId: scope.actorId, database }),
        ),
      }),
    );
    if (result === null) {
      scope.databaseAvailable = false;
      throw new LocalMirrorUnavailableError();
    }
    scope.databaseAvailable = true;
    return result.value;
  }

  async function initializeScope(scope: ActiveScope): Promise<void> {
    const baseScope = { baseUrl: scope.baseUrl, actorId: scope.actorId };
    if (!(await input.lifecycle.setScope(baseScope)) || !isCurrent(scope)) {
      scope.databaseAvailable = false;
      return;
    }
    try {
      const workspaceId = await withRepository(scope, (repository) =>
        repository.getLastWorkspaceId(),
      );
      if (!isCurrent(scope)) return;
      scope.workspaceId = workspaceId;
      if (
        workspaceId !== null &&
        !(await input.lifecycle.setScope({ ...baseScope, workspaceId }))
      ) {
        scope.databaseAvailable = false;
      }
    } catch (error) {
      if (!(error instanceof LocalMirrorUnavailableError)) throw error;
    }
  }

  async function readCursor(scope: ActiveScope): Promise<LocalSyncCursor | null> {
    if (scope.workspaceId === null) return null;
    return withRepository(scope, (repository) =>
      repository.getCursor(scope.workspaceId!),
    );
  }

  async function readCollection<TPayload>(
    scope: ActiveScope,
    kind: SyncChangeKind,
  ): Promise<SyncedCollectionSnapshot<TPayload> | null> {
    await scope.ready;
    if (!isCurrent(scope)) return null;
    if (scope.workspaceId === null) {
      return {
        error: null,
        lastSyncedAt: null,
        records: [],
        status: "local-ready",
        workspaceId: null,
      };
    }
    try {
      const value = await withRepository(scope, async (repository) => ({
        cursor: await repository.getCursor(scope.workspaceId!),
        records: await repository.listRecords({
          workspaceId: scope.workspaceId!,
          kind,
        }),
      }));
      if (!isCurrent(scope)) return null;
      return {
        error: null,
        lastSyncedAt: value.cursor?.lastSyncedAt ?? null,
        records: value.records as readonly SyncRecord<TPayload>[],
        status: "local-ready",
        workspaceId: scope.workspaceId,
      };
    } catch (error) {
      if (!isCurrent(scope)) return null;
      return {
        error: errorMessage(error),
        lastSyncedAt: null,
        records: [],
        status: "failure",
        workspaceId: scope.workspaceId,
      };
    }
  }

  async function finalSnapshot<TPayload>(
    scope: ActiveScope,
    kind: SyncChangeKind,
    result: SyncRunResult,
  ): Promise<SyncedCollectionSnapshot<TPayload> | null> {
    const mirror = await readCollection<TPayload>(scope, kind);
    if (mirror === null) return null;
    if (result.error !== null) {
      return {
        ...mirror,
        error: result.error,
        status: mirror.records.length > 0 ? "stale" : "failure",
      };
    }
    const cursor = scope.workspaceId === null ? null : await readCursor(scope);
    if (!isCurrent(scope)) return null;
    return {
      ...mirror,
      lastSyncedAt: cursor?.lastSyncedAt ?? mirror.lastSyncedAt,
      status: cursor?.bootstrapState === "complete" ? "fresh" : "local-ready",
    };
  }

  async function resetKnownWorkspace(
    scope: ActiveScope,
    cursor: LocalSyncCursor | null,
  ): Promise<void> {
    if (!cursor) {
      throw new Error("同步游标缺失，不能执行 reset。");
    }
    await withRepository(scope, (repository) =>
      repository.resetWorkspace(cursor.workspaceId, () => isCurrent(scope)),
    );
  }

  async function applyPage(
    scope: ActiveScope,
    response: Awaited<ReturnType<SyncClient["getPage"]>>,
  ): Promise<void> {
    const applied = await withRepository(scope, (repository) =>
      repository.applyPage({
        workspaceId: response.workspaceId,
        records: response.records,
        cursor: response.nextCursor,
        syncedAt: new Date(now()).toISOString(),
        bootstrapState: response.hasMore ? "pending" : "complete",
        canCommit: () => isCurrent(scope),
      }),
    );
    if (!applied || !isCurrent(scope)) return;
    const serverScope = {
      baseUrl: scope.baseUrl,
      actorId: scope.actorId,
      workspaceId: response.workspaceId,
    };
    if (!(await input.lifecycle.setScope(serverScope)) || !isCurrent(scope)) {
      throw new LocalMirrorUnavailableError();
    }
    scope.workspaceId = response.workspaceId;
  }

  async function runSync(
    scope: ActiveScope,
    flight: SyncFlight,
  ): Promise<SyncRunResult | null> {
    try {
      await scope.ready;
      if (!isCurrent(scope)) return null;
      let cursor = await readCursor(scope);
      if (!isCurrent(scope)) return null;
      const reason = scope.invalidated ? "invalidated" : flight.reason;
      if (
        !shouldSynchronize({
          backgroundDurationMs: flight.backgroundDurationMs,
          cursor,
          now: now(),
          reason,
        })
      ) {
        return { error: null };
      }
      if (flight.stopAfterCurrent) return { error: null };

      let resetAttempted = false;
      let pageCount = 0;
      let requestCursor = cursor?.cursor;
      while (pageCount < MAX_PAGES_PER_RUN) {
        pageCount += 1;
        const controller = new AbortController();
        scope.abortController = controller;
        let response;
        try {
          response = await scope.client.getPage({
            actorId: scope.actorId,
            ...(requestCursor === undefined ? {} : { cursor: requestCursor }),
            limit: PAGE_LIMIT,
            signal: controller.signal,
          });
        } catch (error) {
          if (!isCurrent(scope)) return null;
          if (error instanceof SyncResetRequiredError && !resetAttempted) {
            await resetKnownWorkspace(scope, cursor);
            if (!isCurrent(scope)) return null;
            resetAttempted = true;
            cursor = null;
            requestCursor = undefined;
            continue;
          }
          throw error;
        } finally {
          if (scope.abortController === controller) {
            scope.abortController = null;
          }
        }
        if (!isCurrent(scope)) return null;
        if (response.hasMore && response.nextCursor === requestCursor) {
          throw new Error("同步游标没有前进。");
        }
        await applyPage(scope, response);
        if (!isCurrent(scope)) return null;
        cursor = {
          workspaceId: response.workspaceId,
          cursor: response.nextCursor,
          lastSyncedAt: new Date(now()).toISOString(),
          bootstrapState: response.hasMore ? "pending" : "complete",
        };
        requestCursor = response.nextCursor;
        if (!response.hasMore || flight.stopAfterCurrent) {
          if (!response.hasMore) scope.invalidated = false;
          return { error: null };
        }
      }
      throw new Error("单次同步页数超过安全上限。");
    } catch (error) {
      if (!isCurrent(scope)) return null;
      return { error: errorMessage(error) };
    }
  }

  function supersede(scope: ActiveScope): void {
    scope.superseded = true;
    scope.flight && (scope.flight.stopAfterCurrent = true);
    scope.abortController?.abort();
  }

  function openScope(scopeInput: SyncScopeInput) {
    assertScope(scopeInput);
    if (
      active &&
      active.scopeKey === scopeInput.scopeKey &&
      active.baseUrl === scopeInput.baseUrl &&
      active.actorId === scopeInput.actorId
    ) {
      active.client = scopeInput.client;
    } else {
      if (active) supersede(active);
      const next = {
        ...scopeInput,
        abortController: null,
        databaseAvailable: true,
        flight: null,
        generation: ++generation,
        invalidated: false,
        ready: Promise.resolve(),
        superseded: false,
        workspaceId: null,
      } satisfies ActiveScope;
      next.ready = initializeScope(next);
      active = next;
    }
    const bound = active;

    return {
      invalidate(): void {
        if (isCurrent(bound)) bound.invalidated = true;
      },
      isCurrent(): boolean {
        return isCurrent(bound);
      },
      readCollection<TPayload = unknown>(kind: SyncChangeKind) {
        return readCollection<TPayload>(bound, kind);
      },
      synchronize<TPayload = unknown>(
        kind: SyncChangeKind,
        options: SyncOptions = {},
      ): SyncRequest<TPayload> {
        if (!isCurrent(bound)) {
          return { cancel() {}, promise: Promise.resolve(null) };
        }
        let flight = bound.flight;
        if (!flight) {
          const nextFlight: SyncFlight = {
            backgroundDurationMs: options.backgroundDurationMs ?? 0,
            promise: Promise.resolve({ error: null }),
            reason: options.reason ?? "mount",
            stopAfterCurrent: false,
            subscribers: 0,
          };
          nextFlight.promise = Promise.resolve().then(() =>
            runSync(bound, nextFlight),
          );
          bound.flight = nextFlight;
          void nextFlight.promise.finally(() => {
            if (bound.flight === nextFlight) bound.flight = null;
          });
          flight = nextFlight;
        } else {
          if (
            options.reason === "explicit" ||
            options.reason === "invalidated"
          ) {
            flight.reason = options.reason;
          }
          flight.backgroundDurationMs = Math.max(
            flight.backgroundDurationMs,
            options.backgroundDurationMs ?? 0,
          );
        }
        if (flight.subscribers === 0) flight.stopAfterCurrent = false;
        flight.subscribers += 1;
        let cancelled = false;
        return {
          cancel(): void {
            if (cancelled) return;
            cancelled = true;
            flight!.subscribers -= 1;
            if (flight!.subscribers === 0) flight!.stopAfterCurrent = true;
          },
          promise: flight.promise.then((result) =>
            result === null
              ? null
              : finalSnapshot<TPayload>(bound, kind, result),
          ),
        };
      },
    };
  }

  return { openScope };
}

function assertScope(scope: SyncScopeInput): void {
  if (
    !scope.scopeKey.trim() ||
    !scope.baseUrl.trim() ||
    !scope.actorId.trim()
  ) {
    throw new TypeError("同步 scope 无效。");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "同步失败。";
}
