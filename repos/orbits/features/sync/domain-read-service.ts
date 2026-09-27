import { createHash } from "node:crypto";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../../shared/contract/universal-read";
import { resolveAuthorizationEpoch, type AuthorizationEpoch, type AuthorizationEpochSqlClient } from "./authorization-epoch";
import { createDomainCursorCodec, type DomainCursorScope } from "./domain-cursor";
import { findSyncDomain, SYNC_DOMAIN_SCHEMA_VERSION, SYNC_DOMAINS, SYNC_REGISTRY_VERSION, type SyncDomainDefinition } from "./domain-registry";
import { issueOfflineReadLease } from "./offline-read-lease";
import { changeFromRow, SYNC_MAX_LIMIT, SYNC_MAX_PAGE_BYTES, SyncReadError, type SyncReadRow } from "./read-service";

/**
 * Per-domain sync protocol: lease (grants), manifest (watermarks) and pages.
 * Everything is keyed by the derived authorization epoch, so the App's mirror
 * can bind its read scopes to a real server-issued grant.
 */
export interface DomainReadServiceOptions {
  client: AuthorizationEpochSqlClient;
  cursorSecret: string;
  now?: () => string;
}

export class DomainNotAuthorizedError extends Error {
  constructor(readonly domainId: string) {
    super(`Actor is not authorized for domain ${domainId}.`);
    this.name = "DomainNotAuthorizedError";
  }
}

export class DomainUnknownError extends Error {
  constructor(readonly domainId: string) {
    super(`Unknown sync domain ${domainId}.`);
    this.name = "DomainUnknownError";
  }
}

const HIGH_WATERMARK_SQL = `
  /* sync:domain:high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from orbit_records
  where workspace_id = $1 and user_id = $2 and collection_name = $3
`;

// Registry v1 mirrors canonical records only. Legacy-shaped task rows (no nested
// `task`) are invisible to /api/tasks and cannot be mutated through it; mirroring
// them would show tasks the product cannot act on. The v1 /api/sync page keeps
// its legacy compatibility untouched.
const PAGE_SQL = `
  /* sync:domain:page */
  select workspace_id, collection_name, record_id, user_id, lifecycle_state,
    payload, updated_at, deleted_at, sync_revision::text as sync_revision
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and collection_name = $3
    and sync_revision > $4::bigint
    and sync_revision <= $5::bigint
    and (collection_name <> 'tasks' or payload ? 'task')
  order by sync_revision asc
  limit $6
`;

// A recurring series' occurrence exceptions live in their own collection. Every
// exception write also rewrites the series row (new revision), so sending the
// exceptions with the series keeps the device complete. Exceptions for
// occurrences that ended before this page was issued are left out: the device
// never shows those, and the series payload would otherwise grow forever.
const SCHEDULE_EXCEPTIONS_SQL = `
  /* sync:domain:schedule-exceptions */
  select source_id, payload
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and collection_name = 'personal_schedule_occurrence_exceptions'
    and source_id = any($3::text[])
    and lifecycle_state <> 'deleted'
    and (payload ->> 'occurrenceDate' >= $4 or left(payload -> 'patch' ->> 'startsAt', 10) >= $4)
  order by source_id, record_id
`;

type ScheduleException = { occurrenceDate: string; cancelled: boolean; patch: Record<string, unknown> };

async function scheduleExceptions(client: AuthorizationEpochSqlClient, input: { workspaceId: string; actorId: string; seriesIds: readonly string[]; issuedAt: number }): Promise<Map<string, ScheduleException[]>> {
  const bySeries = new Map<string, ScheduleException[]>();
  if (input.seriesIds.length === 0) return bySeries;
  const cutoff = new Date(input.issuedAt - 2 * 86_400_000).toISOString().slice(0, 10);
  const result = await client.query<{ source_id: string; payload: Record<string, unknown> }>(SCHEDULE_EXCEPTIONS_SQL, [input.workspaceId, input.actorId, [...input.seriesIds], cutoff]);
  for (const row of result.rows) {
    const { occurrenceDate, cancelled, patch } = row.payload;
    if (typeof occurrenceDate !== "string" || typeof cancelled !== "boolean" || !patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new SyncReadError("SYNC_INVALID_RECORD", "A schedule occurrence exception is invalid.");
    }
    const list = bySeries.get(row.source_id) ?? [];
    list.push({ occurrenceDate, cancelled, patch: patch as Record<string, unknown> });
    bySeries.set(row.source_id, list);
  }
  return bySeries;
}

export function domainGeneration(epoch: string): string {
  return createHash("sha256").update(JSON.stringify([epoch, SYNC_REGISTRY_VERSION, SYNC_DOMAIN_SCHEMA_VERSION])).digest("hex").slice(0, 16);
}

function domainChange(change: ReturnType<typeof changeFromRow>): DomainChange {
  return {
    id: change.id,
    revision: change.revision,
    operation: change.operation,
    payload: change.operation === "upsert" ? (change.payload as Record<string, unknown>) : null,
  };
}

export function createDomainReadService({ client, cursorSecret, now = () => new Date().toISOString() }: DomainReadServiceOptions) {
  const cursors = createDomainCursorCodec({ secret: cursorSecret });

  async function epochFor(actorId: string, workspaceId: string): Promise<AuthorizationEpoch> {
    if (!actorId.trim() || !workspaceId.trim()) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Authenticated sync scope is required.");
    return resolveAuthorizationEpoch({ client, actorId, workspaceId });
  }

  async function highWatermark(actorId: string, workspaceId: string, domain: SyncDomainDefinition): Promise<string> {
    const result = await client.query<{ high_watermark: string }>(HIGH_WATERMARK_SQL, [workspaceId, actorId, domain.collectionName]);
    const value = result.rows[0]?.high_watermark;
    if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
    return value;
  }

  return {
    /** Grants for every registered domain, or none when the actor has no authorization rows. */
    async lease(input: { actorId: string; subject: string; workspaceId: string; baseUrl: string; sessionExpiresAt: number; offlineMaxAgeMs: number; nowMs: number }): Promise<OfflineReadEnvelope> {
      const epoch = await epochFor(input.actorId, input.workspaceId);
      const databaseKeyRef = createHash("sha256").update(JSON.stringify([input.baseUrl, input.actorId, input.subject, input.workspaceId])).digest("hex").slice(0, 32);
      return issueOfflineReadLease(
        { actorId: input.actorId, subject: input.subject, workspaceId: input.workspaceId, expiresAt: input.sessionExpiresAt, baseUrl: input.baseUrl, databaseKeyRef },
        input.nowMs,
        input.offlineMaxAgeMs,
        {
          registeredDomainIds: SYNC_DOMAINS.map((domain) => domain.domainId),
          authorizer: {
            // One statement, one snapshot: the epoch above is the durable authority for every grant.
            async readAtomicSnapshot(context) {
              return {
                actorId: context.actorId, subject: context.subject, workspaceId: context.workspaceId,
                consistency: "atomic", epochAuthority: "durable",
                coveredDomainIds: SYNC_DOMAINS.map((domain) => domain.domainId),
                grants: epoch.authorized
                  ? SYNC_DOMAINS.map((domain) => ({ workspaceId: context.workspaceId, domainId: domain.domainId, authorizationEpoch: epoch.epoch }))
                  : [],
              };
            },
          },
        },
      );
    },

    async manifest(input: { actorId: string; workspaceId: string }): Promise<DomainManifest> {
      const epoch = await epochFor(input.actorId, input.workspaceId);
      if (!epoch.authorized) return { registryVersion: SYNC_REGISTRY_VERSION, domains: [] };
      const domains = await Promise.all(SYNC_DOMAINS.map(async (domain) => ({
        domainId: domain.domainId,
        schemaVersion: SYNC_DOMAIN_SCHEMA_VERSION,
        workspaceId: input.workspaceId,
        authorizationEpoch: epoch.epoch,
        generation: domainGeneration(epoch.epoch),
        watermark: await highWatermark(input.actorId, input.workspaceId, domain),
        history: "complete" as const,
        membershipCursor: null,
      })));
      return { registryVersion: SYNC_REGISTRY_VERSION, domains };
    },

    async readDomainPage(input: { actorId: string; workspaceId: string; domainId: string; cursor?: string; limit: number }): Promise<DomainPage> {
      const domain = findSyncDomain(input.domainId);
      if (!domain) throw new DomainUnknownError(input.domainId);
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SYNC_MAX_LIMIT) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync limit is invalid.");
      const epoch = await epochFor(input.actorId, input.workspaceId);
      if (!epoch.authorized) throw new DomainNotAuthorizedError(input.domainId);
      const issuedAt = Date.parse(now());
      const scope: DomainCursorScope = {
        actorId: input.actorId, workspaceId: input.workspaceId, domainId: domain.domainId,
        authorizationEpoch: epoch.epoch, generation: domainGeneration(epoch.epoch),
        schemaVersion: SYNC_DOMAIN_SCHEMA_VERSION, registryVersion: SYNC_REGISTRY_VERSION,
      };
      const decoded = input.cursor ? cursors.decode(input.cursor, scope, issuedAt) : null;
      let afterRevision = decoded?.afterRevision ?? "0";
      let high = decoded?.highWatermark ?? "0";
      if (!decoded || decoded.afterRevision === decoded.highWatermark) high = await highWatermark(input.actorId, input.workspaceId, domain);
      const result = await client.query<SyncReadRow>(PAGE_SQL, [input.workspaceId, input.actorId, domain.collectionName, afterRevision, high, input.limit + 1]);
      if (result.rows.some((row) => row.workspace_id !== input.workspaceId || row.user_id !== input.actorId || row.collection_name !== domain.collectionName)) {
        throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
      }
      const pageRows = result.rows.slice(0, input.limit);
      const hasMore = result.rows.length > input.limit;
      const changes = pageRows.map((row) => domainChange(changeFromRow(row, input.actorId)));
      if (domain.collectionName === "personal_schedule_items") {
        const recurring = changes.filter((change) => change.payload && change.payload.kind === "personal" && change.payload.recurrence);
        const exceptions = await scheduleExceptions(client, { workspaceId: input.workspaceId, actorId: input.actorId, seriesIds: recurring.map((change) => change.id), issuedAt });
        for (const change of recurring) {
          const list = exceptions.get(change.id);
          if (list?.length) change.payload = { ...change.payload, occurrenceExceptions: list };
        }
      }
      afterRevision = hasMore ? String(pageRows.at(-1)?.sync_revision ?? afterRevision) : high;
      const page: DomainPage = {
        domainId: domain.domainId,
        schemaVersion: SYNC_DOMAIN_SCHEMA_VERSION,
        registryVersion: SYNC_REGISTRY_VERSION,
        authorizationEpoch: epoch.epoch,
        changes,
        nextCursor: cursors.encode({ ...scope, afterRevision, highWatermark: high }, issuedAt),
        highWatermark: high,
        hasMore,
        generation: scope.generation,
        serverTime: new Date(issuedAt).toISOString(),
      };
      if (Buffer.byteLength(JSON.stringify({ success: true, data: page }), "utf8") > SYNC_MAX_PAGE_BYTES) {
        throw new SyncReadError("SYNC_PAGE_TOO_LARGE", "The mapped sync page exceeds the configured limit.");
      }
      return page;
    },
  };
}

export type DomainReadService = ReturnType<typeof createDomainReadService>;
