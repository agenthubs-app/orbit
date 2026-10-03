import type { SyncChangeKind, SyncRecord } from "../../api/contract/sync";
import type { OrbitApiClient } from "../../api/client";
import type { DomainManifest, OfflineReadEnvelope, ReadScope } from "../../api/contract/universal-read";
import { evaluateOfflineRead } from "../../api/offline-read-session";
import { offlineReadEnvelopeSchema } from "../../api/schema/universal-read";
import type { LocalSyncDatabase } from "./local-sync-database";
import type { PayloadCodec } from "./payload-codec";
import {
  createLocalSyncRepository,
  type LocalSyncCursor,
  type LocalSyncOutboxMutation,
  type LocalSyncQueuedMutation,
} from "./local-sync-repository";
import type { SyncSessionScope } from "./sync-database-key";
import {
  type SyncClient,
  SyncResetRequiredError,
} from "./sync-client";
import { findPageCopyDefinition, PAGE_COPY_DEFINITIONS, type PageCopy } from "./page-copies";
import { isOfflineEligible } from "./mutation-adapters";
import { parseOfflineNoteRequest } from "./note-outbox-mutation";
import { isOfflineTaskCategory, parseOfflineTaskRequest } from "./task-outbox-mutation";
import { isOfflineScheduleEditable, localNoteIdsOfSchedule, parseOfflineScheduleRequest } from "./schedule-outbox-mutation";
import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { kindOfSyncDomain, KNOWN_SYNC_DOMAINS, PARTITIONED_SYNC_DOMAINS, syncDomainOfKind } from "./sync-domains";
import {
  shouldSynchronize,
  type SyncRefreshReason,
} from "./sync-freshness";

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_RUN = 100;

// Sprint 0113: the server's lease decides which domains sync (one grant binds one read
// scope); KNOWN_SYNC_DOMAINS says which of them this build can store, and a
// platform may narrow that further. Unknown grants are ignored.
/** True only when the manifest entry for this bound scope matches the complete cursor's watermark and generation. */
function manifestProvesUnchanged(manifest: DomainManifest | null, readScope: ReadScope, stored: LocalSyncCursor): boolean {
  if (!manifest || stored.bootstrapState !== "complete" || stored.highWatermark === null || stored.generation === null) return false;
  const entry = manifest.domains.find((candidate) => candidate.domainId === readScope.domainId && candidate.workspaceId === readScope.workspaceId);
  return Boolean(entry && entry.authorizationEpoch === readScope.authorizationEpoch && entry.generation === stored.generation && entry.watermark === stored.highWatermark);
}

/** An epoch value no server ever issues: retiring against it drops every epoch of a domain. */
const REVOKED_EPOCH = "__revoked__";

export interface SyncCoordinatorLifecycle {
  /** Domains this platform may mirror; defaults to every domain this build knows. The browser lists a narrower set. */
  registeredDomainIds?: readonly string[];
  /** At-rest codec for payload_json; the browser mirror encrypts per record, native relies on SQLCipher. */
  payloadCodec?: PayloadCodec;
  /** Sprint 0131: page copies this platform may keep; defaults to every registered copy. The browser lists its whitelist. */
  registeredPageCopyIds?: readonly string[];
  setScope(scope: SyncSessionScope | null): Promise<boolean>;
  withDatabase<T>(
    scope: SyncSessionScope | null,
    operation: (
      database: LocalSyncDatabase,
      activeScope: Readonly<SyncSessionScope>,
    ) => Promise<T>,
  ): Promise<T | null>;
}

/**
 * Sprint 0087: `unsynced` is the initial state, and it is not `local-ready`.
 * Without it "we have not read yet" and "we read and there is nothing" are the
 * same value, which is how the tasks page came to show 暂无待办 and the syncing
 * label at the same time on a cold open.
 */
export type SyncedCollectionStatus =
  | "unsynced"
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
  /** Product write transport, absent in sync-only fixtures and online-only platforms. */
  writeClient?: Pick<OrbitApiClient, "post" | "patch" | "delete">;
  /** Offline identity may read a renewed lease, but must never upload queued writes. */
  offlineMode?: boolean;
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
    options?: { records?: boolean },
  ): Promise<SyncedCollectionSnapshot<TPayload> | null>;
  /** Sprint 0131: the named rows of a kind from the device (at most 200); null without a mirror or grant. */
  readRecordsById<TPayload = unknown>(kind: SyncChangeKind, ids: readonly string[]): Promise<readonly SyncRecord<TPayload>[] | null>;
  /** Server mirror overlaid with queued writes for a single authenticated sync scope. */
  readOutboxOverlay(kind: SyncChangeKind): Promise<{ serverRecords: readonly SyncRecord[]; queuedMutations: readonly LocalSyncQueuedMutation[] } | null>;
  synchronize<TPayload = unknown>(
    kind: SyncChangeKind,
    options?: SyncOptions & { records?: boolean },
  ): SyncRequest<TPayload>;
  /** Sprint 0118: the device opened an AI session (its messages sync from now on); null without a mirror. */
  openAiSession(sessionId: string): Promise<{ opened: string[]; evicted: string[]; added: boolean } | null>;
  readAiSessionCards(sessionId: string): Promise<unknown | null>;
  saveAiSessionCards(sessionId: string, cards: unknown): Promise<void>;
  /**
   * Sprint 0131: the last successful online read of a registered page, bound to
   * the accepted lease (workspace, authorization epoch). Null without an accepted
   * lease, a mirror, or a copy; saving without one is a no-op.
   */
  readPageCopy<TData = unknown>(id: string, variant: string): Promise<PageCopy<TData> | null>;
  savePageCopy(id: string, variant: string, data: unknown): Promise<void>;
  /** Resolve an acknowledged local note id through the active actor/workspace alias table. */
  resolveNoteAlias(localId: string): Promise<string | null>;
  /** Test-only queue insertion; product domains remain closed until their own Sprint adapter exists. */
  enqueueTestOutboxMutation(mutation: LocalSyncOutboxMutation): Promise<void>;
  /** Sprint 0132: private note writes admitted to the native offline outbox. */
  enqueueOfflineNoteMutation(mutation: OfflineNoteMutationInput): Promise<void>;
  /** Sprint 0133: private personal task writes admitted to the native offline outbox. */
  enqueueOfflineTaskMutation(mutation: OfflineTaskMutationInput): Promise<void>;
  /** Sprint 0134: non-recurring personal schedule writes admitted to the native offline outbox. */
  enqueueOfflineScheduleMutation(mutation: OfflineScheduleMutationInput): Promise<void>;
  /** Sprint 0132: resolve only a conflict row inside the currently accepted notes lease. */
  resolveNoteConflict?(input: {
    mutationId: string;
    resolution: "server" | "replace";
    replacement?: OfflineNoteMutationInput;
  }): Promise<void>;
  /** Sprint 0133: resolve only a conflict row inside the currently accepted tasks lease. */
  resolveTaskConflict?(input: {
    mutationId: string;
    resolution: "server" | "replace";
    replacement?: OfflineTaskMutationInput;
  }): Promise<void>;
  /** Sprint 0134: resolve only a conflict row inside the currently accepted personal-schedule lease. */
  resolveScheduleConflict?(input: {
    mutationId: string;
    resolution: "server" | "replace";
    replacement?: OfflineScheduleMutationInput;
  }): Promise<void>;
}

export type OfflineNoteMutationInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId">;
export type OfflineTaskMutationInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId" | "kind" | "operation"> & {
  kind: "task";
  operation: "create" | "update" | "complete" | "reopen" | "cancel" | "delete";
};
/** Sprint 0134: a non-recurring personal schedule write admitted to the native offline outbox. */
export type OfflineScheduleMutationInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId" | "kind" | "operation"> & {
  kind: "personal_schedule";
  operation: "create" | "update" | "delete";
};

interface ActiveScope extends SyncScopeInput {
  /** The last accepted server lease; read scopes derive from its grants. */
  lease: OfflineReadEnvelope | null;
  abortController: AbortController | null;
  flight: SyncFlight | null;
  invalidated: boolean;
  leases: number;
  ready: Promise<void>;
  superseded: boolean;
  teardownVersion: number;
  workspaceId: string | null;
  onOutboxQueued?: () => void;
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

function replaceExactValue(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map(item => replaceExactValue(item, from, to));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExactValue(item, from, to)]));
  return value;
}

export function createSyncCoordinator(input: {
  lifecycle: SyncCoordinatorLifecycle;
  now?: () => number;
  /** SHA-256 hex of a serialized payload; required by the v2 mirror for every applied record. */
  hashPayload?: (serialized: string) => Promise<string>;
  /** Runs queued writes only after a valid online lease and before mirrored server rows are pulled. */
  uploadOutbox?: (scope: {
    actorId: string;
    baseUrl: string;
    workspaceId: string;
    signal: AbortSignal;
    repository: ReturnType<typeof createLocalSyncRepository>;
    syncClient: SyncClient;
    writeClient?: Pick<OrbitApiClient, "post" | "patch" | "delete">;
  }) => Promise<void>;
  /** Explicit queue namespaces used only by test fixtures; not registered in the app coordinator. */
  testOnlyOutboxDomains?: readonly string[];
  /** A manifest failure is not a sync failure: every domain is pulled as before, and this hears why. */
  onManifestUnavailable?: (error: unknown) => void;
}) {
  const now = input.now ?? Date.now;
  let active: ActiveScope | null = null;

  function isCurrent(scope: ActiveScope): boolean {
    return active === scope && !scope.superseded;
  }

  // Known to this build and allowed on this platform; the lease picks from these.
  const registeredDomainIds: readonly string[] = (input.lifecycle.registeredDomainIds ?? Object.keys(KNOWN_SYNC_DOMAINS))
    .filter((domainId) => kindOfSyncDomain(domainId) !== null);

  const registeredPageCopyIds: readonly string[] = (input.lifecycle.registeredPageCopyIds ?? PAGE_COPY_DEFINITIONS.map((definition) => definition.id))
    .filter((id) => findPageCopyDefinition(id) !== null);

  /** Sprint 0131: page copies are bound to the accepted lease's workspace and authorization epoch (one per actor and workspace). */
  function pageCopyBinding(scope: ActiveScope): { workspaceId: string; authorizationEpoch: string } | null {
    const grant = scope.lease?.grants[0];
    return grant ? { workspaceId: grant.workspaceId, authorizationEpoch: grant.authorizationEpoch } : null;
  }

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
    const domainId = syncDomainOfKind(kind);
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
            onOutboxQueued: () => scope.onOutboxQueued?.(),
            ...(input.testOnlyOutboxDomains ? { testOnlyOutboxDomains: input.testOnlyOutboxDomains } : {}),
          }),
        ),
      }),
    );
    if (result === null) {
      throw new LocalMirrorUnavailableError();
    }
    return result.value;
  }

  async function initializeScope(scope: ActiveScope): Promise<void> {
    const baseScope = { baseUrl: scope.baseUrl, actorId: scope.actorId };
    if (!(await input.lifecycle.setScope(baseScope)) || !isCurrent(scope)) {
      return;
    }
    try {
      const { workspaceId, storedLease } = await withRepository(scope, async (repository) => {
        await repository.recoverInterruptedOutboxAttempts();
        return {
          workspaceId: await repository.getLastWorkspaceId(),
          storedLease: await repository.getLease(),
        };
      });
      if (!isCurrent(scope)) return;
      scope.lease = acceptedLease(scope, storedLease);
      scope.workspaceId = scope.lease?.grants[0]?.workspaceId ?? workspaceId;
      if (workspaceId !== null) {
        await input.lifecycle.setScope({ ...baseScope, workspaceId });
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
      const kind = kindOfSyncDomain(grant.domainId);
      // A grant outside this platform's whitelist is never bound, so it never has a cursor and must not force a sync.
      if (!kind || !registeredDomainIds.includes(grant.domainId)) continue;
      const cursor = await readDomainCursor(scope, kind);
      if (!cursor) return null;
      if (!oldest || cursor.lastSyncedAt < oldest.lastSyncedAt) oldest = cursor;
    }
    return oldest;
  }

  async function readCollection<TPayload>(
    scope: ActiveScope,
    kind: SyncChangeKind,
    withRecords = true,
  ): Promise<SyncedCollectionSnapshot<TPayload> | null> {
    await scope.ready;
    if (!isCurrent(scope)) return null;
    const readScope = readScopeFor(scope, kind);
    if (scope.workspaceId === null || !readScope) {
      return {
        error: null,
        lastSyncedAt: null,
        records: [],
        status: "unsynced",
        workspaceId: scope.workspaceId,
      };
    }
    try {
      const value = await withRepository(scope, async (repository) => ({
        cursor: await repository.getScopeCursor(readScope),
        // Sprint 0131: a consumer that reads rows by id (a conversation's page) needs only the sync state.
        records: withRecords ? await repository.listRecords({
          workspaceId: scope.workspaceId!,
          kind,
        }) : [],
      }));
      if (!isCurrent(scope)) return null;
      return {
        error: null,
        lastSyncedAt: value.cursor?.lastSyncedAt ?? null,
        records: value.records as readonly SyncRecord<TPayload>[],
        status: value.cursor ? "local-ready" : "unsynced",
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
    withRecords = true,
  ): Promise<SyncedCollectionSnapshot<TPayload> | null> {
    const mirror = await readCollection<TPayload>(scope, kind, withRecords);
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
      // No mirror (online-only browser, missing SQLite): nothing to advance, so no network either.
      await withRepository(scope, async () => undefined);
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
        // Sprint 0131: page copies of any other epoch go with the rotation; a lease without grants keeps none.
        await withRepository(scope, (repository) => repository.retirePageCopies(pageCopyBinding(scope)));
        if (!isCurrent(scope) || flight.abandoned) return null;
        if (!workspaceId) return { error: null };

        // Revocation drops every epoch of the domain; rotation keeps only the granted one.
        // Driven by the lease: every mirrored domain granted now or in the previous lease.
        const leasedDomainIds = [...new Set([...accepted.grants, ...previousGrants].map((candidate) => candidate.domainId))]
          .filter((domainId) => registeredDomainIds.includes(domainId));
        for (const domainId of leasedDomainIds) {
          const grant = accepted.grants.find((candidate) => candidate.domainId === domainId);
          await withRepository(scope, (repository) =>
            repository.retireEpochs(workspaceId, domainId, grant?.authorizationEpoch ?? REVOKED_EPOCH),
          );
          if (!isCurrent(scope) || flight.abandoned) return null;
        }

        if (input.uploadOutbox && !scope.offlineMode && !controller.signal.aborted) {
          await withRepository(scope, repository => input.uploadOutbox!({
            actorId: scope.actorId,
            baseUrl: scope.baseUrl,
            workspaceId,
            signal: controller.signal,
            repository,
            syncClient: scope.client,
            ...(scope.writeClient ? { writeClient: scope.writeClient } : {}),
          }));
          if (!isCurrent(scope) || flight.abandoned) return null;
        }

        // One manifest decides which domains moved; an unchanged, complete domain costs no page.
        let manifest: DomainManifest | null = null;
        try {
          manifest = await scope.client.getManifest({ signal: controller.signal });
        } catch (error) {
          if (!isCurrent(scope) || flight.abandoned) return null;
          input.onManifestUnavailable?.(error);
        }
        if (!isCurrent(scope) || flight.abandoned) return null;

        let pageCount = 0;
        for (const readScope of readScopesOf(scope)) {
          const stored = await withRepository(scope, (repository) => repository.getScopeCursor(readScope));
          // Sprint 0118: a partitioned domain (the opened AI sessions' messages) names its
          // partitions on every page; a newly opened session must be fetched even when the
          // manifest says the domain did not move, so the walk also compares the set it named.
          const partitions = PARTITIONED_SYNC_DOMAINS.includes(readScope.domainId)
            ? await withRepository(scope, (repository) => repository.getOpenedAiSessions(readScope.workspaceId))
            : undefined;
          const partitionKey = partitions ? JSON.stringify([...partitions].sort()) : null;
          const partitionsUnchanged = partitionKey === null
            || (await withRepository(scope, (repository) => repository.getPartitionKey(readScope))) === partitionKey;
          if (stored && partitionsUnchanged && manifestProvesUnchanged(manifest, readScope, stored)) {
            await withRepository(scope, (repository) => repository.confirmScopeCursor(readScope, new Date(now()).toISOString()));
            if (!isCurrent(scope) || flight.abandoned) return null;
            continue;
          }
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
                ...(partitions?.length ? { sessions: partitions } : {}),
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
            if (!page.hasMore) {
              if (partitionKey !== null) await withRepository(scope, (repository) => repository.setPartitionKey(readScope, partitionKey));
              break;
            }
            if (flight.stopAfterCurrent) break;
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
      if (scopeInput.writeClient) active.writeClient = scopeInput.writeClient;
      else delete active.writeClient;
      active.offlineMode = Boolean(scopeInput.offlineMode);
    } else {
      if (active) supersede(active);
      const next = {
        ...scopeInput,
        lease: null,
        abortController: null,
        flight: null,
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
    const session: SyncCoordinatorSession = {
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
      readCollection<TPayload = unknown>(kind: SyncChangeKind, options: { records?: boolean } = {}) {
        return readCollection<TPayload>(bound, kind, options.records ?? true);
      },
      async readRecordsById<TPayload = unknown>(kind: SyncChangeKind, ids: readonly string[]) {
        if (ids.length > 200) throw new TypeError("row id reads take at most 200 ids");
        await bound.ready;
        const readScope = readScopeFor(bound, kind);
        if (!isCurrent(bound) || bound.workspaceId === null || !readScope) return null;
        const workspaceId = bound.workspaceId;
        try { return await withRepository(bound, (repository) => repository.listRecordsByIds({ workspaceId, kind, ids })) as readonly SyncRecord<TPayload>[]; } catch (error) { if (error instanceof LocalMirrorUnavailableError) return null; throw error; }
      },
      async readOutboxOverlay(kind: SyncChangeKind) {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null || !readScopeFor(bound, kind)) return null;
        try {
          return await withRepository(bound, repository => repository.readOutboxOverlay({ workspaceId: bound.workspaceId!, kind }));
        } catch (error) {
          if (error instanceof LocalMirrorUnavailableError) return null;
          throw error;
        }
      },
      async openAiSession(sessionId: string) {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null) return null;
        const workspaceId = bound.workspaceId;
        try { return await withRepository(bound, (repository) => repository.openAiSession(workspaceId, sessionId)); } catch (error) { if (error instanceof LocalMirrorUnavailableError) return null; throw error; }
      },
      async readAiSessionCards(sessionId: string) {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null) return null;
        const workspaceId = bound.workspaceId;
        try { return await withRepository(bound, (repository) => repository.getAiSessionCards(workspaceId, sessionId)); } catch (error) { if (error instanceof LocalMirrorUnavailableError) return null; throw error; }
      },
      async saveAiSessionCards(sessionId: string, cards: unknown) {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null) return;
        const workspaceId = bound.workspaceId;
        try { await withRepository(bound, (repository) => repository.setAiSessionCards(workspaceId, sessionId, cards)); } catch (error) { if (!(error instanceof LocalMirrorUnavailableError)) throw error; }
      },
      async readPageCopy<TData = unknown>(id: string, variant: string): Promise<PageCopy<TData> | null> {
        await bound.ready;
        const binding = pageCopyBinding(bound);
        if (!isCurrent(bound) || !binding || !registeredPageCopyIds.includes(id)) return null;
        try { return await withRepository(bound, (repository) => repository.getPageCopy(binding, id, variant)) as PageCopy<TData> | null; } catch (error) { if (error instanceof LocalMirrorUnavailableError) return null; throw error; }
      },
      async savePageCopy(id: string, variant: string, data: unknown): Promise<void> {
        if (!findPageCopyDefinition(id)) throw new TypeError("page copy is not registered");
        await bound.ready;
        const binding = pageCopyBinding(bound);
        if (!isCurrent(bound) || !binding || !registeredPageCopyIds.includes(id)) return;
        try { await withRepository(bound, (repository) => repository.setPageCopy(binding, id, variant, { data, syncedAt: new Date(now()).toISOString() })); } catch (error) { if (!(error instanceof LocalMirrorUnavailableError)) throw error; }
      },
      async resolveNoteAlias(localId: string): Promise<string | null> {
        await bound.ready;
        const readScope = readScopeFor(bound, "note");
        if (!isCurrent(bound) || !readScope || !localId.startsWith("local:")) return null;
        return withRepository(bound, repository => repository.resolveAlias({
          workspaceId: readScope.workspaceId,
          domainId: "notes",
          localId,
          now: new Date(now()).toISOString(),
        }));
      },
      async enqueueTestOutboxMutation(mutation: LocalSyncOutboxMutation): Promise<void> {
        await bound.ready;
        if (!input.testOnlyOutboxDomains?.includes(mutation.domainId ?? "")) throw new TypeError("only a registered test-only outbox domain may be enqueued in this Sprint");
        if (!isCurrent(bound) || mutation.actorId !== bound.actorId || mutation.workspaceId !== bound.workspaceId) {
          throw new TypeError("outbox mutation is outside the active actor/workspace");
        }
        await withRepository(bound, repository => repository.enqueueOutboxMutation(mutation));
      },
      async enqueueOfflineNoteMutation(mutation: Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId">): Promise<void> {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null) {
          throw new TypeError("outbox mutation is outside the active actor/workspace");
        }
        const noteScope = readScopeFor(bound, "note");
        const currentLease = bound.lease ? acceptedLease(bound, bound.lease) : null;
        const hasCurrentNotesGrant = Boolean(noteScope && currentLease?.grants.some(grant =>
          grant.workspaceId === noteScope.workspaceId && grant.domainId === noteScope.domainId &&
          grant.authorizationEpoch === noteScope.authorizationEpoch));
        if (!hasCurrentNotesGrant || mutation.domainId !== "notes" || mutation.kind !== "note" || !mutation.requestJson) {
          throw new TypeError("note mutation is not eligible");
        }
        let parsed: ReturnType<typeof parseOfflineNoteRequest>;
        try {
          parsed = parseOfflineNoteRequest(mutation);
        } catch {
          throw new TypeError("note mutation is not eligible");
        }
        const { mutation: request } = parsed;
        if (!isOfflineEligible(request.kind, request.operation, {
          actorPrivate: true,
          confirmed: true,
          connectionActive: isCurrent(bound),
        }) || request.mutationId !== mutation.mutationId || request.entityId !== mutation.id ||
            request.operation !== mutation.operation || request.baseRevision !== mutation.baseRevision ||
            JSON.stringify(request.patch) !== JSON.stringify(mutation.patch)) {
          throw new TypeError("note mutation is not eligible");
        }
        await withRepository(bound, async repository => {
          let dependsOn = mutation.dependsOn ?? null;
          if (mutation.operation === "update" && mutation.id.startsWith("local:")) {
            const pending = await repository.readOutboxOverlay({ workspaceId: bound.workspaceId!, kind: "note" });
            const attemptedCreate = pending.queuedMutations.find(item =>
              item.id === mutation.id && item.operation === "create" && (item.state === "queued" || item.state === "sending"));
            if (mutation.baseRevision === null && !attemptedCreate) {
              throw new TypeError("local note update requires its queued create");
            }
            if (!dependsOn && attemptedCreate?.attemptCount) {
              dependsOn = attemptedCreate.mutationId;
            }
          }
          await repository.enqueueOutboxMutation({
            ...mutation,
            actorId: bound.actorId,
            workspaceId: bound.workspaceId!,
            dependsOn,
          }, { notify: !mutation.requestAttemptedAt });
        });
      },
      async enqueueOfflineTaskMutation(mutation: OfflineTaskMutationInput): Promise<void> {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null) throw new TypeError("outbox mutation is outside the active actor/workspace");
        const taskScope = readScopeFor(bound, "task");
        const currentLease = bound.lease ? acceptedLease(bound, bound.lease) : null;
        const hasCurrentTasksGrant = Boolean(taskScope && currentLease?.grants.some(grant =>
          grant.workspaceId === taskScope.workspaceId && grant.domainId === taskScope.domainId &&
          grant.authorizationEpoch === taskScope.authorizationEpoch));
        if (!hasCurrentTasksGrant || mutation.domainId !== "tasks" || mutation.kind !== "task" || !mutation.requestJson) {
          throw new TypeError("task mutation is not eligible");
        }
        let parsed: ReturnType<typeof parseOfflineTaskRequest>;
        try { parsed = parseOfflineTaskRequest(mutation); } catch { throw new TypeError("task mutation is not eligible"); }
        const request = parsed.mutation;
        if (!isOfflineEligible(request.kind, request.operation, { actorPrivate: true, confirmed: true, connectionActive: isCurrent(bound) }) ||
            request.mutationId !== mutation.mutationId || request.entityId !== mutation.id || request.operation !== mutation.operation ||
            request.baseRevision !== mutation.baseRevision || JSON.stringify(request.patch) !== JSON.stringify(mutation.patch)) {
          throw new TypeError("task mutation is not eligible");
        }
        await withRepository(bound, async repository => {
          let dependsOn = mutation.dependsOn ?? null;
          const pending = await repository.readOutboxOverlay({ workspaceId: bound.workspaceId!, kind: "task" });
          const sameTask = pending.queuedMutations.filter(item => item.id === mutation.id && item.kind === "task")
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.mutationId.localeCompare(b.mutationId));
          const prior = sameTask.at(-1);
          if (mutation.operation !== "create") {
            if (mutation.id.startsWith("local:")) {
              const localCreate = sameTask.find(item => item.operation === "create");
              let isPersonalCreate = false;
              if (localCreate?.actorId === bound.actorId) {
                try {
                  const parsedCreate = parseOfflineTaskRequest({ ...localCreate, kind: "task", operation: "create" });
                  isPersonalCreate = isOfflineTaskCategory(parsedCreate.mutation.patch.category);
                } catch { /* Stored queue data is untrusted until its frozen request is revalidated. */ }
              }
              if (!isPersonalCreate) {
                throw new TypeError("local task mutation requires its queued personal create");
              }
            } else {
              const record = await repository.getRecord({ workspaceId: bound.workspaceId!, kind: "task", id: mutation.id });
              const task = record?.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : null;
              if (!record || record.deletedAt !== null || record.actorId !== bound.actorId || task?.ownerUserId !== bound.actorId || !isOfflineTaskCategory(task.category)) {
                throw new TypeError("offline task mutation requires a mirrored personal task");
              }
            }
          }
          if (prior && !dependsOn) dependsOn = prior.mutationId;
          await repository.enqueueOutboxMutation({ ...mutation, actorId: bound.actorId, workspaceId: bound.workspaceId!, dependsOn }, { notify: !mutation.requestAttemptedAt });
        });
      },
      async enqueueOfflineScheduleMutation(mutation: OfflineScheduleMutationInput): Promise<void> {
        await bound.ready;
        if (!isCurrent(bound) || bound.workspaceId === null) throw new TypeError("outbox mutation is outside the active actor/workspace");
        const scheduleScope = readScopeFor(bound, "personal_schedule");
        const currentLease = bound.lease ? acceptedLease(bound, bound.lease) : null;
        const hasCurrentGrant = Boolean(scheduleScope && currentLease?.grants.some(grant =>
          grant.workspaceId === scheduleScope.workspaceId && grant.domainId === scheduleScope.domainId &&
          grant.authorizationEpoch === scheduleScope.authorizationEpoch));
        if (!hasCurrentGrant || mutation.domainId !== "personal-schedule" || mutation.kind !== "personal_schedule" || !mutation.requestJson ||
            mutation.requestAttemptedAt) {
          throw new TypeError("schedule mutation is not eligible");
        }
        let parsed: ReturnType<typeof parseOfflineScheduleRequest>;
        try { parsed = parseOfflineScheduleRequest(mutation); } catch { throw new TypeError("schedule mutation is not eligible"); }
        if (!isOfflineEligible("personal_schedule", mutation.operation, { actorPrivate: true, confirmed: true, connectionActive: isCurrent(bound) })) {
          throw new TypeError("schedule mutation is not eligible");
        }
        await withRepository(bound, async repository => {
          const workspaceId = bound.workspaceId!;
          const pending = await repository.readOutboxOverlay({ workspaceId, kind: "personal_schedule" });
          const sameItem = pending.queuedMutations.filter(item => item.id === mutation.id);
          if (mutation.operation !== "create") {
            if (mutation.id.startsWith("local:")) {
              const localCreate = sameItem.find(item => item.operation === "create" && item.state !== "failed");
              let validCreate = false;
              if (localCreate) {
                try { parseOfflineScheduleRequest({ ...localCreate, kind: "personal_schedule", operation: "create" }); validCreate = true; } catch { /* untrusted stored row */ }
              }
              if (!validCreate) throw new TypeError("local schedule mutation requires its queued create");
            } else {
              const record = await repository.getRecord({ workspaceId, kind: "personal_schedule", id: mutation.id });
              const item = record?.payload && typeof record.payload === "object" ? record.payload as PersonalScheduleContract : null;
              if (!record || record.deletedAt !== null || record.actorId !== bound.actorId || !isOfflineScheduleEditable(item, bound.actorId)) {
                throw new TypeError("offline schedule mutation requires a mirrored non-recurring personal schedule");
              }
            }
          }
          // Links to notes created offline: an acknowledged note is linked by its formal id; an unacknowledged
          // one must still be queued, and the schedule uploader waits for it (design step 4).
          let { requestJson, patch } = { requestJson: mutation.requestJson!, patch: parsed.patch as Record<string, unknown> };
          const localNotes = localNoteIdsOfSchedule(mutation);
          if (localNotes.length) {
            const notes = await repository.readOutboxOverlay({ workspaceId, kind: "note" });
            for (const localId of localNotes) {
              const formal = await repository.resolveAlias({ workspaceId, domainId: "notes", localId, now: new Date(now()).toISOString() });
              if (formal) {
                requestJson = JSON.stringify(replaceExactValue(JSON.parse(requestJson), localId, formal));
                patch = replaceExactValue(patch, localId, formal) as Record<string, unknown>;
                continue;
              }
              if (!notes.queuedMutations.some(item => item.id === localId && item.operation === "create" && item.state !== "failed")) {
                throw new TypeError("schedule links an unsaved note");
              }
            }
          }
          const prior = sameItem.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.mutationId.localeCompare(b.mutationId)).at(-1);
          const dependsOn = mutation.dependsOn ?? prior?.mutationId ?? null;
          await repository.enqueueOutboxMutation({ ...mutation, requestJson, patch, actorId: bound.actorId, workspaceId, dependsOn });
        });
      },
      async resolveScheduleConflict(input: {
        mutationId: string;
        resolution: "server" | "replace";
        replacement?: OfflineScheduleMutationInput;
      }): Promise<void> {
        await bound.ready;
        const scheduleScope = readScopeFor(bound, "personal_schedule");
        const currentLease = bound.lease ? acceptedLease(bound, bound.lease) : null;
        const hasCurrentGrant = Boolean(scheduleScope && currentLease?.grants.some(grant =>
          grant.workspaceId === scheduleScope.workspaceId && grant.domainId === scheduleScope.domainId &&
          grant.authorizationEpoch === scheduleScope.authorizationEpoch));
        if (!isCurrent(bound) || !scheduleScope || !hasCurrentGrant) throw new TypeError("schedule conflict is outside the active lease");
        if (input.replacement) {
          try { parseOfflineScheduleRequest(input.replacement); } catch { throw new TypeError("schedule conflict replacement is invalid"); }
          if (localNoteIdsOfSchedule(input.replacement).length) throw new TypeError("schedule conflict replacement is invalid");
        }
        await withRepository(bound, repository => repository.resolveScheduleConflict({
          workspaceId: scheduleScope.workspaceId,
          mutationId: input.mutationId,
          resolution: input.resolution,
          ...(input.replacement ? { replacement: { ...input.replacement, actorId: bound.actorId, workspaceId: scheduleScope.workspaceId } } : {}),
        }));
      },
      async resolveNoteConflict(input: {
        mutationId: string;
        resolution: "server" | "replace";
        replacement?: OfflineNoteMutationInput;
      }): Promise<void> {
        await bound.ready;
        const noteScope = readScopeFor(bound, "note");
        const currentLease = bound.lease ? acceptedLease(bound, bound.lease) : null;
        const hasCurrentNotesGrant = Boolean(noteScope && currentLease?.grants.some(grant =>
          grant.workspaceId === noteScope.workspaceId && grant.domainId === noteScope.domainId &&
          grant.authorizationEpoch === noteScope.authorizationEpoch));
        if (!isCurrent(bound) || !noteScope || !hasCurrentNotesGrant) throw new TypeError("note conflict is outside the active lease");
        await withRepository(bound, repository => repository.resolveNoteConflict({
          workspaceId: noteScope.workspaceId,
          mutationId: input.mutationId,
          resolution: input.resolution,
          ...(input.replacement ? { replacement: { ...input.replacement, actorId: bound.actorId, workspaceId: noteScope.workspaceId } } : {}),
        }));
        if (input.resolution === "replace") bound.onOutboxQueued?.();
      },
      async resolveTaskConflict(input: {
        mutationId: string;
        resolution: "server" | "replace";
        replacement?: OfflineTaskMutationInput;
      }): Promise<void> {
        await bound.ready;
        const taskScope = readScopeFor(bound, "task");
        const currentLease = bound.lease ? acceptedLease(bound, bound.lease) : null;
        const hasCurrentTasksGrant = Boolean(taskScope && currentLease?.grants.some(grant =>
          grant.workspaceId === taskScope.workspaceId && grant.domainId === taskScope.domainId &&
          grant.authorizationEpoch === taskScope.authorizationEpoch));
        if (!isCurrent(bound) || !taskScope || !hasCurrentTasksGrant) throw new TypeError("task conflict is outside the active lease");
        if (input.replacement) {
          let parsed: ReturnType<typeof parseOfflineTaskRequest>;
          try { parsed = parseOfflineTaskRequest(input.replacement); } catch { throw new TypeError("task conflict replacement is invalid"); }
          if (input.replacement.domainId !== "tasks" || input.replacement.kind !== "task" || input.replacement.requestAttemptedAt ||
              parsed.mutation.entityId !== input.replacement.id || parsed.mutation.mutationId !== input.replacement.mutationId ||
              parsed.mutation.operation !== input.replacement.operation || parsed.mutation.baseRevision !== input.replacement.baseRevision ||
              JSON.stringify(parsed.mutation.patch) !== JSON.stringify(input.replacement.patch) ||
              !isOfflineEligible(parsed.mutation.kind, parsed.mutation.operation, { actorPrivate: true, confirmed: true, connectionActive: true })) {
            throw new TypeError("task conflict replacement is invalid");
          }
        }
        await withRepository(bound, repository => repository.resolveTaskConflict({
          workspaceId: taskScope.workspaceId,
          mutationId: input.mutationId,
          resolution: input.resolution,
          ...(input.replacement ? { replacement: { ...input.replacement, actorId: bound.actorId, workspaceId: taskScope.workspaceId } } : {}),
        }));
        if (input.resolution === "replace") bound.onOutboxQueued?.();
      },
      synchronize<TPayload = unknown>(
        kind: SyncChangeKind,
        options: SyncOptions & { records?: boolean } = {},
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
              : finalSnapshot<TPayload>(bound, kind, result, options.records ?? true),
          ),
          started: flight.started,
        };
      },
    };
    bound.onOutboxQueued = () => {
      if (!isCurrent(bound)) return;
      const request = session.synchronize("note", { reason: "explicit" });
      void request.promise.catch(() => undefined);
    };
    return session;
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
