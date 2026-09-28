import type { DomainChange } from "../../shared/contract/universal-read";
import { dashboardRecordTimeIso, type DashboardGraphSyncRow } from "../../shared/compute/dashboard-graph";
import { DASHBOARD_GRAPH_PROJECTION_SQL } from "../dashboard/storage/dashboard-live-record-provider";
import type { DashboardGraphSyncSource } from "./domain-registry";
import { SyncReadError } from "./read-service";

/**
 * Sprint 0117 (dashboard D3): the reader behind the sync domain
 * "dashboard-graph" — every stored record of the actor's six dashboard graph
 * collections, so the App computes the dashboard and the contacts analysis
 * from its own copy with the server's code (shared/compute).
 *
 * Owner: orbit_records rows of those collections whose user_id is the
 * authenticated actor, exactly the rows the server's graph read selects
 * (features/dashboard/storage/dashboard-live-record-provider.ts). All six are
 * sync collections: owner guarded and written under the commit-order lock, so
 * a row's own sync_revision orders it after every earlier bookmark.
 *
 * Visible: not soft-deleted, and for a contact, a payload accountId that is
 * missing, null or the actor (the graph read's own filter). A row that stops
 * being visible keeps its owner and takes a new revision; it is sent as a
 * delete. A first pull (bookmark 0) sends no tombstones.
 *
 * Payload: the graph read's projection of the payload (DASHBOARD_GRAPH_
 * PROJECTION_SQL) plus the record's occurred_at/updated_at in UTC with
 * microseconds, which order the rows like the server's SQL. A source
 * (evidence) row sends no payload at all: no dashboard computation reads a
 * source's content, only its record time (the graph's generatedAt).
 */
const TIME = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function collectionList(source: DashboardGraphSyncSource): string {
  if (!source.collections.every((name) => /^[a-z_]+$/.test(name))) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "A dashboard graph collection is not a plain identifier.");
  return source.collections.map((name) => `'${name}'`).join(", ");
}

function highWatermarkSql(source: DashboardGraphSyncSource): string {
  return `
  /* sync:dashboard-graph:high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from orbit_records
  where workspace_id = $1 and user_id = $2 and collection_name in (${collectionList(source)})
`;
}

function pageSql(source: DashboardGraphSyncSource): string {
  return `
  /* sync:dashboard-graph:page */
  select collection_name, record_id, user_id, sync_revision::text as sync_revision,
    (lifecycle_state <> 'deleted'
      and (collection_name <> 'contacts'
        or payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($2::text))) as visible,
    ${TIME("occurred_at")} as occurred_at,
    ${TIME("updated_at")} as updated_at,
    case when collection_name = 'evidence' then null else ${DASHBOARD_GRAPH_PROJECTION_SQL} end as data
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and collection_name in (${collectionList(source)})
    and sync_revision > $3::bigint
    and sync_revision <= $4::bigint
  -- The table column, not the text alias above: "100" sorts before "99".
  order by orbit_records.sync_revision asc
  limit $5
`;
}

interface DashboardGraphPageRow {
  collection_name: string;
  record_id: string;
  user_id: string;
  sync_revision: string;
  visible: boolean;
  occurred_at: string | null;
  updated_at: string;
  data: Record<string, unknown> | string | null;
}

interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

export async function readDashboardGraphHighWatermark(client: Queryable, source: DashboardGraphSyncSource, input: { workspaceId: string; actorId: string }): Promise<string> {
  const result = await client.query<{ high_watermark: string }>(highWatermarkSql(source), [input.workspaceId, input.actorId]);
  const value = result.rows[0]?.high_watermark;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
  return value;
}

export async function readDashboardGraphPage(
  client: Queryable,
  source: DashboardGraphSyncSource,
  input: { workspaceId: string; actorId: string; afterRevision: string; highWatermark: string; limit: number },
): Promise<{ changes: DomainChange[]; hasMore: boolean; lastRevision: string | null }> {
  const result = await client.query<DashboardGraphPageRow>(pageSql(source), [input.workspaceId, input.actorId, input.afterRevision, input.highWatermark, input.limit + 1]);
  if (result.rows.some((row) => row.user_id !== input.actorId || !source.collections.includes(row.collection_name))) {
    throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
  }
  const pageRows = result.rows.slice(0, input.limit);
  const firstPull = input.afterRevision === "0";
  const changes: DomainChange[] = [];
  for (const row of pageRows) {
    const id = `${row.collection_name}/${row.record_id}`;
    if (!row.visible) {
      if (!firstPull) changes.push({ id, revision: row.sync_revision, operation: "delete", payload: null });
      continue;
    }
    if (dashboardRecordTimeIso(row.updated_at) === null || (row.occurred_at !== null && dashboardRecordTimeIso(row.occurred_at) === null)) {
      throw new SyncReadError("SYNC_INVALID_RECORD", "A dashboard graph record time is invalid.");
    }
    const data = typeof row.data === "string" ? JSON.parse(row.data) as Record<string, unknown> : row.data;
    const payload: DashboardGraphSyncRow = {
      collection: row.collection_name as DashboardGraphSyncRow["collection"],
      recordId: row.record_id,
      occurredAt: row.occurred_at,
      updatedAt: row.updated_at,
      data,
    };
    changes.push({ id, revision: row.sync_revision, operation: "upsert", payload: payload as unknown as Record<string, unknown> });
  }
  return {
    changes,
    hasMore: result.rows.length > input.limit,
    lastRevision: pageRows.length ? pageRows.at(-1)!.sync_revision : null,
  };
}
