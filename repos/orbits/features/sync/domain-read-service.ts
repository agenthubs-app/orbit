import { createHash } from "node:crypto";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../../shared/contract/universal-read";
import { resolveAuthorizationEpoch, type AuthorizationEpoch, type AuthorizationEpochSqlClient } from "./authorization-epoch";
import { createDomainCursorCodec, type DomainCursorScope } from "./domain-cursor";
import { findSyncDomain, SYNC_DOMAIN_SCHEMA_VERSION, SYNC_DOMAINS, SYNC_REGISTRY_VERSION, type DedicatedTableSyncSource, type SyncDomainDefinition } from "./domain-registry";
import { readContactDomainHighWatermark, readContactDomainPage } from "./contact-domain-reader";
import { readEventDomainPage, readEventDomainSummary, type EventDomainSummary } from "./event-domain-reader";
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
  /** The manuals this service leases and reads; production uses the registry's device domains. */
  domains?: readonly SyncDomainDefinition[];
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

// Dedicated-table source (sprint 0113): the table's own sync_revision, drawn
// from the orbit_records sequence under the same commit-order lock, filtered to
// the owner column the manual declares. Identifiers come from the registry and
// are validated before any SQL is built.
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function dedicatedSql(source: DedicatedTableSyncSource, ownerColumn: string) {
  const identifiers = [source.table, source.recordIdColumn, ownerColumn, ...Object.values(source.columns)];
  if (!identifiers.every((identifier) => IDENTIFIER.test(identifier)) || !Object.keys(source.columns).every((field) => /^[A-Za-z][A-Za-z0-9]*$/.test(field))) {
    throw new SyncReadError("SYNC_SCOPE_MISMATCH", "A dedicated sync source is not a plain identifier.");
  }
  const columns = Object.entries(source.columns).map(([field, column]) => `${column} as "${field}"`).join(", ");
  return {
    highWatermark: `
  /* sync:domain:dedicated-high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from ${source.table}
  where workspace_id = $1 and ${ownerColumn} = $2
`,
    page: `
  /* sync:domain:dedicated-page */
  select ${source.recordIdColumn}::text as record_id, ${ownerColumn}::text as owner_id, ${columns},
    sync_revision::text as sync_revision
  from ${source.table}
  where workspace_id = $1
    and ${ownerColumn} = $2
    and sync_revision > $3::bigint
    and sync_revision <= $4::bigint
  order by sync_revision asc
  limit $5
`,
  };
}

function ownerColumnOf(domain: SyncDomainDefinition): string {
  if (domain.ownership.rule !== "column") throw new SyncReadError("SYNC_DOMAIN_SOURCE_UNSUPPORTED", `Domain ${domain.domainId} derives its owner; only the event_derived source implements a derived reader.`);
  return domain.ownership.column;
}

/** Only the manual's fields leave the server. */
function declaredFields(domain: SyncDomainDefinition, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(domain.fields);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
}

function wireValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : typeof value === "bigint" ? value.toString() : value;
}

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

/**
 * The generation a domain's cursors are bound to. `visibility` (sprint 0115)
 * folds in a visibility that changes with time rather than with a write — the
 * released set of published event results — so a device holding a cursor from
 * before the change is told to rebuild; without it the value is unchanged, so
 * existing record-domain cursors stay valid.
 */
export function domainGeneration(epoch: string, visibility?: string): string {
  const parts = visibility === undefined ? [epoch, SYNC_REGISTRY_VERSION, SYNC_DOMAIN_SCHEMA_VERSION] : [epoch, SYNC_REGISTRY_VERSION, SYNC_DOMAIN_SCHEMA_VERSION, visibility];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

function generationOf(domain: SyncDomainDefinition, epoch: string, summary: EventDomainSummary | null): string {
  if (domain.source.kind === "event_derived" && domain.source.view === "published-results") {
    if (!summary) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "The event sync summary is required.");
    return domainGeneration(epoch, `released:${summary.released}`);
  }
  return domainGeneration(epoch);
}

function domainChange(change: ReturnType<typeof changeFromRow>): DomainChange {
  return {
    id: change.id,
    revision: change.revision,
    operation: change.operation,
    payload: change.operation === "upsert" ? (change.payload as Record<string, unknown>) : null,
  };
}

export function createDomainReadService({ client, cursorSecret, now = () => new Date().toISOString(), domains = SYNC_DOMAINS }: DomainReadServiceOptions) {
  const cursors = createDomainCursorCodec({ secret: cursorSecret });
  // Production passes nothing and gets the device domains; a test adds the probe explicitly.
  const leased = [...domains];
  if (leased.length === 0) throw new Error("A domain read service needs at least one domain.");

  async function epochFor(actorId: string, workspaceId: string): Promise<AuthorizationEpoch> {
    if (!actorId.trim() || !workspaceId.trim()) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Authenticated sync scope is required.");
    return resolveAuthorizationEpoch({ client, actorId, workspaceId });
  }

  const hasEventDomains = leased.some((domain) => domain.source.kind === "event_derived");

  async function eventSummary(actorId: string, workspaceId: string): Promise<EventDomainSummary | null> {
    return hasEventDomains ? readEventDomainSummary(client, { workspaceId, actorId }) : null;
  }

  async function highWatermark(actorId: string, workspaceId: string, domain: SyncDomainDefinition, summary: EventDomainSummary | null = null): Promise<string> {
    const source = domain.source;
    if (source.kind === "event_derived") {
      if (!summary) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "The event sync summary is required.");
      return summary.watermarks[source.view];
    }
    if (source.kind === "contact_graph") return readContactDomainHighWatermark(client, { workspaceId, actorId });
    const result = source.kind === "orbit_records"
      ? await client.query<{ high_watermark: string }>(HIGH_WATERMARK_SQL, [workspaceId, actorId, source.collectionName])
      : await client.query<{ high_watermark: string }>(dedicatedSql(source, ownerColumnOf(domain)).highWatermark, [workspaceId, actorId]);
    const value = result.rows[0]?.high_watermark;
    if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
    return value;
  }

  type PageInput = { actorId: string; workspaceId: string; limit: number };
  type PageRead = { changes: DomainChange[]; hasMore: boolean; lastRevision: string | null };

  async function readRecordsPage(collectionName: string, input: PageInput, afterRevision: string, high: string): Promise<PageRead> {
    const result = await client.query<SyncReadRow>(PAGE_SQL, [input.workspaceId, input.actorId, collectionName, afterRevision, high, input.limit + 1]);
    if (result.rows.some((row) => row.workspace_id !== input.workspaceId || row.user_id !== input.actorId || row.collection_name !== collectionName)) {
      throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
    }
    const pageRows = result.rows.slice(0, input.limit);
    return {
      changes: pageRows.map((row) => domainChange(changeFromRow(row, input.actorId))),
      hasMore: result.rows.length > input.limit,
      lastRevision: pageRows.length ? String(pageRows.at(-1)!.sync_revision) : null,
    };
  }

  async function readDedicatedPage(domain: SyncDomainDefinition, source: DedicatedTableSyncSource, input: PageInput, afterRevision: string, high: string): Promise<PageRead> {
    const result = await client.query<Record<string, unknown> & { record_id: string; owner_id: string; sync_revision: string }>(
      dedicatedSql(source, ownerColumnOf(domain)).page, [input.workspaceId, input.actorId, afterRevision, high, input.limit + 1],
    );
    if (result.rows.some((row) => row.owner_id !== input.actorId)) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
    const pageRows = result.rows.slice(0, input.limit);
    return {
      changes: pageRows.map((row) => ({
        id: row.record_id,
        revision: row.sync_revision,
        operation: "upsert" as const,
        payload: Object.fromEntries(Object.keys(source.columns).map((field) => [field, wireValue(row[field])])),
      })),
      hasMore: result.rows.length > input.limit,
      lastRevision: pageRows.length ? pageRows.at(-1)!.sync_revision : null,
    };
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
          registeredDomainIds: leased.map((domain) => domain.domainId),
          authorizer: {
            // One statement, one snapshot: the epoch above is the durable authority for every grant.
            async readAtomicSnapshot(context) {
              return {
                actorId: context.actorId, subject: context.subject, workspaceId: context.workspaceId,
                consistency: "atomic", epochAuthority: "durable",
                coveredDomainIds: leased.map((domain) => domain.domainId),
                grants: epoch.authorized
                  ? leased.map((domain) => ({ workspaceId: context.workspaceId, domainId: domain.domainId, authorizationEpoch: epoch.epoch }))
                  : [],
              };
            },
          },
        },
      );
    },

    /**
     * What the event domains' manifest entries depend on besides the epoch (one
     * statement), or null when this service leases none. The manifest route
     * folds it into its conditional-read key and hands it back to manifest().
     */
    async eventSummary(input: { actorId: string; workspaceId: string }): Promise<EventDomainSummary | null> {
      if (!input.actorId.trim() || !input.workspaceId.trim()) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Authenticated sync scope is required.");
      return eventSummary(input.actorId, input.workspaceId);
    },

    async manifest(input: { actorId: string; workspaceId: string; eventSummary?: EventDomainSummary | null }): Promise<DomainManifest> {
      const epoch = await epochFor(input.actorId, input.workspaceId);
      if (!epoch.authorized) return { registryVersion: SYNC_REGISTRY_VERSION, domains: [] };
      const summary = input.eventSummary !== undefined && (input.eventSummary !== null || !hasEventDomains) ? input.eventSummary : await eventSummary(input.actorId, input.workspaceId);
      const entries = await Promise.all(leased.map(async (domain) => ({
        domainId: domain.domainId,
        schemaVersion: SYNC_DOMAIN_SCHEMA_VERSION,
        workspaceId: input.workspaceId,
        authorizationEpoch: epoch.epoch,
        generation: generationOf(domain, epoch.epoch, summary),
        watermark: await highWatermark(input.actorId, input.workspaceId, domain, summary),
        history: "complete" as const,
        membershipCursor: null,
      })));
      return { registryVersion: SYNC_REGISTRY_VERSION, domains: entries };
    },

    async readDomainPage(input: { actorId: string; workspaceId: string; domainId: string; cursor?: string; limit: number }): Promise<DomainPage> {
      const domain = findSyncDomain(input.domainId, leased);
      if (!domain) throw new DomainUnknownError(input.domainId);
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SYNC_MAX_LIMIT) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync limit is invalid.");
      const epoch = await epochFor(input.actorId, input.workspaceId);
      if (!epoch.authorized) throw new DomainNotAuthorizedError(input.domainId);
      const issuedAt = Date.parse(now());
      const summary = domain.source.kind === "event_derived" ? await eventSummary(input.actorId, input.workspaceId) : null;
      const scope: DomainCursorScope = {
        actorId: input.actorId, workspaceId: input.workspaceId, domainId: domain.domainId,
        authorizationEpoch: epoch.epoch, generation: generationOf(domain, epoch.epoch, summary),
        schemaVersion: SYNC_DOMAIN_SCHEMA_VERSION, registryVersion: SYNC_REGISTRY_VERSION,
      };
      const decoded = input.cursor ? cursors.decode(input.cursor, scope, issuedAt) : null;
      let afterRevision = decoded?.afterRevision ?? "0";
      let high = decoded?.highWatermark ?? "0";
      if (!decoded || decoded.afterRevision === decoded.highWatermark) high = await highWatermark(input.actorId, input.workspaceId, domain, summary);
      const read = domain.source.kind === "orbit_records"
        ? await readRecordsPage(domain.source.collectionName, input, afterRevision, high)
        : domain.source.kind === "event_derived"
          ? await readEventDomainPage(client, domain.source, { workspaceId: input.workspaceId, actorId: input.actorId, afterRevision, highWatermark: high, limit: input.limit })
          : domain.source.kind === "contact_graph"
            ? await readContactDomainPage(client, domain.source, { workspaceId: input.workspaceId, actorId: input.actorId, afterRevision, highWatermark: high, limit: input.limit, issuedAt: new Date(issuedAt).toISOString() })
            : await readDedicatedPage(domain, domain.source, input, afterRevision, high);
      const { hasMore, lastRevision } = read;
      const changes = read.changes;
      if (domain.attachments.some((attachment) => attachment.collectionName === "personal_schedule_occurrence_exceptions")) {
        const recurring = changes.filter((change) => change.payload && change.payload.kind === "personal" && change.payload.recurrence);
        const exceptions = await scheduleExceptions(client, { workspaceId: input.workspaceId, actorId: input.actorId, seriesIds: recurring.map((change) => change.id), issuedAt });
        for (const change of recurring) {
          const list = exceptions.get(change.id);
          if (list?.length) change.payload = { ...change.payload, occurrenceExceptions: list };
        }
      }
      for (const change of changes) if (change.payload) change.payload = declaredFields(domain, change.payload);
      afterRevision = hasMore ? (lastRevision ?? afterRevision) : high;
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
