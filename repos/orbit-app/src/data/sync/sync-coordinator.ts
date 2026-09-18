import type { SyncChangeKind, SyncRecord } from "../../api/contract/sync";
import type { OfflineReadEnvelope, ReadScope } from "../../api/contract/universal-read";
import { evaluateOfflineRead } from "../../api/offline-read-session";
import { offlineReadEnvelopeSchema } from "../../api/schema/universal-read";
import type { LocalSyncDatabase } from "./local-sync-database";
import type { PayloadCodec } from "./payload-codec";
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

// Registry v1 mirrors the server's SYNC_DOMAINS; a lease grant per domain binds the read scope.
const REGISTERED_DOMAIN_IDS = ["notes", "tasks", "personal-schedule"] as const;
const DOMAIN_OF_KIND: Partial<Record<SyncChangeKind, string>> = {
  note: "notes",
  task: "tasks",
  personal_schedule: "personal-schedule",
};
/** An epoch value no server ever issues: retiring against it drops every epoch of a domain. */
const REVOKED_EPOCH = "__revoked__";

export interface SyncCoordinatorLifecycle {
  /** Domains this platform may mirror; defaults to the full registry. The browser lists a narrower set. */
  registeredDomainIds?: readonly string[];
  /** At-rest codec for payload_json; the browser mirror encrypts per record, native relies on SQLCipher. */
  payloadCodec?: PayloadCodec;
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
  cancel(options?: { abandon?: boolean }): void;
  promise: Promise<SyncedCollectionSnapshot<TPayload> | null>;
  started: Promise<boolean>;
}

export interface SyncCoordinatorSession {
  deactivate(): void;
  invalidate(): void;
  isCurrent(): boolean;
  readCollection<TPayload = unknown>(
    kind: SyncChangeKind,
  ): Promise<SyncedCollectionSnapshot<TPayload> | null>;
  synchronize<TPayload = unknown>(
    kind: SyncChangeKind,
    options?: SyncOptions,
  ): SyncRequest<TPayload>;
}

interface ActiveScope extends SyncScopeInput {
  /** The last accepted server lease; read scopes derive from its grants. */
  lease: OfflineReadEnvelope | null;
  abortController: AbortController | null;
  databaseAvailable: boolean;
  flight: SyncFlight | null;
  generation: number;
  invalidated: boolean;
  leases: number;
  ready: Promise<void>;
  superseded: boolean;
  teardownVersion: number;
  workspaceId: string | null;
}

interface SyncFlight {
  abandoned: boolean;
  backgroundDurationMs: number;
  promise: Promise<SyncRunResult | null>;
  reason: SyncRefreshReason;
  resolveStarted(started: boolean): void;
  started: Promise<boolean>;
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
  /** SHA-256 hex of a serialized payload; required by the v2 mirror for every applied record. */
  hashPayload?: (serialized: string) => Promise<string>;
}) {
  const now = input.now ?? Date.now;
  let generation = 0;
  let active: ActiveScope | null = null;

  function isCurrent(scope: ActiveScope): boolean {
    return active === scope && !scope.superseded;
  }

  const registeredDomainIds: readonly string[] = input.lifecycle.registeredDomainIds ?? REGISTERED_DOMAIN_IDS;

  function readScopesOf(scope: ActiveScope): ReadScope[] {
    if (!scope.lease) return [];
    // Grants outside this platform's whitelist are never bound: they are neither stored nor pulled.
    return scope.lease.grants.filter((grant) => registeredDomainIds.includes(grant.domainId)).map((grant) => ({
      baseUrl: scope.baseUrl,
      actorId: scope.actorId,
      workspaceId: grant.workspaceId,
      domainId: grant.domainId,
      authorizationEpoch: grant.authorizationEpoch,
    }));
  }

  function readScopeFor(scope: ActiveScope, kind: SyncChangeKind): ReadScope | null {
    const domainId = DOMAIN_OF_KIND[kind];
    return readScopesOf(scope).find((candidate) => candidate.domainId === domainId) ?? null;
  }

  /** A stored lease is only trusted while its own rules hold for this actor and base URL. */
  function acceptedLease(scope: ActiveScope, value: unknown): OfflineReadEnvelope | null {
    const parsed = offlineReadEnvelopeSchema.safeParse(value);
    if (!parsed.success) return null;
    const state = evaluateOfflineRead(parsed.data, scope.baseUrl, now(), { actorId: scope.actorId, subject: parsed.data.subject });
    return state === "local-read" ? parsed.data : null;
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
          createLocalSyncRepository({
            actorId: scope.actorId,
            database,
            baseUrl: scope.baseUrl,
            registeredDomainIds,
            activeReadScopes: () => readScopesOf(scope),
            ...(input.hashPayload ? { hashPayload: input.hashPayload } : {}),
            ...(input.lifecycle.payloadCodec ? { payloadCodec: input.lifecycle.payloadCodec } : {}),
          }),
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
      const { workspaceId, storedLease } = await withRepository(scope, async (repository) => ({
        workspaceId: await repository.getLastWorkspaceId(),
        storedLease: await repository.getLease(),
      }));
      if (!isCurrent(scope)) return;
      scope.lease = acceptedLease(scope, storedLease);
      scope.workspaceId = scope.lease?.grants[0]?.workspaceId ?? workspaceId;
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

  async function readDomainCursor(scope: ActiveScope, kind: SyncChangeKind): Promise<LocalSyncCursor | null> {
    const readScope = readScopeFor(scope, kind);
    if (!readScope) return null;
    return withRepository(scope, (repository) => repository.getScopeCursor(readScope));
  }

  /** The oldest domain cursor drives the refresh decision; a domain without one forces a sync. */
  async function readCursor(scope: ActiveScope): Promise<LocalSyncCursor | null> {
    if (scope.workspaceId === null || !scope.lease) return null;
    let oldest: LocalSyncCursor | null = null;
    for (const grant of scope.lease.grants) {
      const kind = (Object.keys(DOMAIN_OF_KIND) as SyncChangeKind[]).find((candidate) => DOMAIN_OF_KIND[candidate] === grant.domainId);
      if (!kind) continue;
      const cursor = await readDomainCursor(scope, kind);
      if (!cursor) return null;
      if (!oldest || cursor.lastSyncedAt < oldest.lastSyncedAt) oldest = cursor;
    }
    return oldest;
  }

  async function readCollection<TPayload>(
    scope: ActiveScope,
    kind: SyncChangeKind,
  ): Promise<SyncedCollectionSnapshot<TPayload> | null> {
    await scope.ready;
    if (!isCurrent(scope)) return null;
    const readScope = readScopeFor(scope, kind);
    if (scope.workspaceId === null || !readScope) {
      return {
        error: null,
        lastSyncedAt: null,
        records: [],
        status: "local-ready",
        workspaceId: scope.workspaceId,
      };
    }
    try {
      const value = await withRepository(scope, async (repository) => ({
        cursor: await repository.getScopeCursor(readScope),
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
    const cursor = scope.workspaceId === null ? null : await readDomainCursor(scope, kind);
    if (!isCurrent(scope)) return null;
    return {
      ...mirror,
      lastSyncedAt: cursor?.lastSyncedAt ?? mirror.lastSyncedAt,
      status: cursor?.bootstrapState === "complete" ? "fresh" : "local-ready",
    };
  }

  /**
   * Lease first, then every granted domain: retire other epochs (rotation) or
   * every epoch (revocation), then walk the domain's pages under its bound scope.
   */
  async function runSync(
    scope: ActiveScope,
    flight: SyncFlight,
  ): Promise<SyncRunResult | null> {
    try {
      await scope.ready;
      if (!isCurrent(scope) || flight.abandoned) return null;
      const cursor = await readCursor(scope);
      if (!isCurrent(scope) || flight.abandoned) return null;
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
      if (flight.abandoned) return null;
      if (flight.stopAfterCurrent) return { error: null };

      flight.resolveStarted(true);
      const controller = new AbortController();
      scope.abortController = controller;
      try {
        const lease = await scope.client.getLease({ baseUrl: scope.baseUrl, signal: controller.signal });
        if (!isCurrent(scope) || flight.abandoned) return null;
        const accepted = acceptedLease(scope, lease);
        if (!accepted) throw new Error("服务器签发的离线读取租约无效。");
        const previousGrants = scope.lease?.grants ?? [];
        scope.lease = accepted;
        const workspaceId = accepted.grants[0]?.workspaceId ?? scope.workspaceId;
        await withRepository(scope, async (repository) => {
          await repository.setLease(accepted);
          if (workspaceId) await repository.rememberWorkspace(workspaceId);
        });
        if (workspaceId && workspaceId !== scope.workspaceId) {
          if (!(await input.lifecycle.setScope({ baseUrl: scope.baseUrl, actorId: scope.actorId, workspaceId })) || !isCurrent(scope)) {
            throw new LocalMirrorUnavailableError();
          }
          scope.workspaceId = workspaceId;
        }
        if (!workspaceId) return { error: null };

        // Revocation drops every epoch of the domain; rotation keeps only the granted one.
        for (const domainId of registeredDomainIds) {
          const grant = accepted.grants.find((candidate) => candidate.domainId === domainId);
          const previous = previousGrants.find((candidate) => candidate.domainId === domainId);
          if (!grant && !previous) continue;
          await withRepository(scope, (repository) =>
            repository.retireEpochs(workspaceId, domainId, grant?.authorizationEpoch ?? REVOKED_EPOCH),
          );
          if (!isCurrent(scope) || flight.abandoned) return null;
        }

        let pageCount = 0;
        for (const readScope of readScopesOf(scope)) {
          const stored = await withRepository(scope, (repository) => repository.getScopeCursor(readScope));
          let requestCursor = stored?.cursor;
          let resetAttempted = false;
          for (;;) {
            if (pageCount >= MAX_PAGES_PER_RUN) throw new Error("单次同步页数超过安全上限。");
            pageCount += 1;
            let page;
            try {
              page = await scope.client.getDomainPage({
                domainId: readScope.domainId,
                ...(requestCursor === undefined ? {} : { cursor: requestCursor }),
                limit: PAGE_LIMIT,
                signal: controller.signal,
              });
            } catch (error) {
              if (!isCurrent(scope) || flight.abandoned) return null;
              if (error instanceof SyncResetRequiredError && !resetAttempted) {
                await withRepository(scope, (repository) => repository.resetDomain(readScope));
                resetAttempted = true;
                requestCursor = undefined;
                continue;
              }
              throw error;
            }
            if (!isCurrent(scope) || flight.abandoned) return null;
            if (page.authorizationEpoch !== readScope.authorizationEpoch) {
              scope.invalidated = true;
              throw new Error("授权纪元已变化，下次同步将重建该域。");
            }
            if (page.hasMore && page.nextCursor === requestCursor) throw new Error("同步游标没有前进。");
            await withRepository(scope, (repository) => repository.applyDomainPage(readScope, page));
            if (!isCurrent(scope) || flight.abandoned) return null;
            requestCursor = page.nextCursor;
            if (!page.hasMore || flight.stopAfterCurrent) break;
          }
          if (flight.stopAfterCurrent) return { error: null };
        }
        scope.invalidated = false;
        return { error: null };
      } finally {
        if (scope.abortController === controller) scope.abortController = null;
      }
    } catch (error) {
      if (!isCurrent(scope) || flight.abandoned) return null;
      return { error: errorMessage(error) };
    } finally {
      flight.resolveStarted(false);
    }
  }

  function supersede(scope: ActiveScope): void {
    scope.superseded = true;
    scope.flight && (scope.flight.stopAfterCurrent = true);
    scope.abortController?.abort();
  }

  function openScope(scopeInput: SyncScopeInput): SyncCoordinatorSession {
    assertScope(scopeInput);
    if (
      active &&
      !active.superseded &&
      active.scopeKey === scopeInput.scopeKey &&
      active.baseUrl === scopeInput.baseUrl &&
      active.actorId === scopeInput.actorId
    ) {
      active.client = scopeInput.client;
    } else {
      if (active) supersede(active);
      const next = {
        ...scopeInput,
        lease: null,
        abortController: null,
        databaseAvailable: true,
        flight: null,
        generation: ++generation,
        invalidated: false,
        leases: 0,
        ready: Promise.resolve(),
        superseded: false,
        teardownVersion: 0,
        workspaceId: null,
      } satisfies ActiveScope;
      next.ready = initializeScope(next);
      active = next;
    }
    const bound = active;
    bound.teardownVersion += 1;
    bound.leases += 1;
    let deactivated = false;

    return {
      deactivate(): void {
        if (deactivated) return;
        deactivated = true;
        bound.leases = Math.max(0, bound.leases - 1);
        if (bound.leases === 0 && isCurrent(bound)) {
          const teardownVersion = ++bound.teardownVersion;
          queueMicrotask(() => {
            if (
              bound.leases !== 0 ||
              bound.teardownVersion !== teardownVersion ||
              !isCurrent(bound)
            ) {
              return;
            }
            supersede(bound);
            active = null;
          });
        }
      },
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
          return {
            cancel() {},
            promise: Promise.resolve(null),
            started: Promise.resolve(false),
          };
        }
        let flight = bound.flight;
        if (!flight) {
          const startSignal = deferredBoolean();
          const nextFlight: SyncFlight = {
            abandoned: false,
            backgroundDurationMs: options.backgroundDurationMs ?? 0,
            promise: Promise.resolve({ error: null }),
            reason: options.reason ?? "mount",
            resolveStarted: startSignal.resolve,
            started: startSignal.promise,
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
          cancel(cancelOptions = {}): void {
            if (cancelled) return;
            cancelled = true;
            flight!.subscribers -= 1;
            if (flight!.subscribers === 0) {
              flight!.stopAfterCurrent = true;
              if (cancelOptions.abandon) {
                flight!.abandoned = true;
                if (bound.flight === flight) bound.flight = null;
                bound.abortController?.abort();
                bound.abortController = null;
              }
            }
          },
          promise: flight.promise.then((result) =>
            result === null
              ? null
              : finalSnapshot<TPayload>(bound, kind, result),
          ),
          started: flight.started,
        };
      },
    };
  }

  return { openScope };
}

function deferredBoolean(): {
  promise: Promise<boolean>;
  resolve(value: boolean): void;
} {
  let settled = false;
  let resolvePromise!: (value: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
  };
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
