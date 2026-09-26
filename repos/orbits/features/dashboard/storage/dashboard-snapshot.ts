import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import {
  networkGapCoreFromGraph,
  type NetworkGapCore,
} from "../live-distribution-service";
import {
  opportunityCoreFromGraph,
  type OpportunityCore,
} from "../live-opportunity-service";
import type { LiveDashboardGraph } from "./dashboard-live-record-provider";

/**
 * Sprint 0102 (dashboard D2): gaps and opportunities are recomputed only when
 * the actor's relationship graph changed.
 *
 * Graph version: count, sum and max of sync_revision over the actor's rows in
 * the six graph collections, deleted rows included. Every insert, update and
 * soft delete assigns a new, larger revision to one row, so the sum moves even
 * when a write commits out of revision order (max alone would miss an update
 * that commits after a later revision became visible); the count catches hard
 * deletes and rows moved to another owner.
 */
export const DASHBOARD_GRAPH_VERSION_COLLECTIONS = [
  "connections",
  "contact_detail_states",
  "contacts",
  "events",
  "evidence",
  "tasks",
] as const;

export const DASHBOARD_SNAPSHOT_COLLECTION = "dashboard_snapshots";

/** Bump when gap or opportunity rules change so stored snapshots are recomputed. */
export const DASHBOARD_SNAPSHOT_SCHEMA_VERSION = 1;

export interface DashboardAnalysisSnapshot {
  graphVersion: string;
  gaps: NetworkGapCore;
  opportunities: OpportunityCore;
}

interface StoredDashboardSnapshotPayload extends DashboardAnalysisSnapshot {
  schemaVersion: number;
  computedAt: string;
}

// One statement returns the graph version and the stored snapshot, so an
// unchanged graph costs a single small query. The collection list is spelled
// as literals (not a bind parameter) so the planner can match the partial
// index orbit_records_graph_version_idx (index-only scan).
const GRAPH_STATE_SQL = `
  /* dashboard:graph-version */
  select version.row_count, version.revision_sum, version.revision_max, snapshot.payload
  from (
    select count(*)::text as row_count,
      coalesce(sum(sync_revision), 0)::text as revision_sum,
      coalesce(max(sync_revision), 0)::text as revision_max
    from orbit_records
    where workspace_id = $1
      and user_id = $2
      and collection_name in (${DASHBOARD_GRAPH_VERSION_COLLECTIONS.map((name) => `'${name}'`).join(", ")})
  ) version
  left join lateral (
    select payload
    from orbit_records
    where workspace_id = $1
      and collection_name = '${DASHBOARD_SNAPSHOT_COLLECTION}'
      and record_id = $3
      and user_id = $2
      and lifecycle_state <> 'deleted'
  ) snapshot on true
`;

const WRITE_SNAPSHOT_SQL = `
  /* dashboard:snapshot:write */
  insert into orbit_records (
    workspace_id, collection_name, record_id, user_id, source_type, source_id,
    source_label, evidence_ids, lifecycle_state, payload, created_at, updated_at
  )
  values ($1, '${DASHBOARD_SNAPSHOT_COLLECTION}', $2, $3, 'system', $2,
    'Dashboard analysis snapshot', '{}', 'active', $4::jsonb, $5, $5)
  on conflict (workspace_id, collection_name, record_id)
  do update set payload = excluded.payload, updated_at = excluded.updated_at,
    lifecycle_state = 'active', deleted_at = null
  where orbit_records.user_id = excluded.user_id
`;

function snapshotRecordId(accountId: string): string {
  return `dashboard-snapshot:${accountId}`;
}

let versionUnavailableLogged = false;

export interface DashboardGraphState {
  graphVersion: string;
  /** The stored snapshot row's payload, whatever version it was computed at. */
  storedSnapshot: unknown;
}

/**
 * The actor's graph version and stored snapshot, or null when this database
 * has no sync_revision column (undefined_column): callers then compute from
 * the graph as before.
 */
export async function readDashboardGraphState(
  client: LiveRecordSqlClient,
  workspaceId: string,
  accountId: string,
): Promise<DashboardGraphState | null> {
  try {
    const result = await client.query<{ row_count: string; revision_sum: string; revision_max: string; payload: unknown }>(
      GRAPH_STATE_SQL,
      [workspaceId, accountId, snapshotRecordId(accountId)],
    );
    const row = result.rows[0];
    return {
      graphVersion: `${row?.row_count ?? "0"}:${row?.revision_sum ?? "0"}:${row?.revision_max ?? "0"}`,
      storedSnapshot: row?.payload ?? null,
    };
  } catch (error) {
    if ((error as { code?: unknown })?.code !== "42703") throw error;
    if (!versionUnavailableLogged) {
      versionUnavailableLogged = true;
      console.warn(JSON.stringify({ event: "dashboard_graph_version_unavailable", reason: "sync_revision column missing" }));
    }
    return null;
  }
}

function parsePayload(value: unknown): StoredDashboardSnapshotPayload | null {
  const payload = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<StoredDashboardSnapshotPayload>;
  return candidate.schemaVersion === DASHBOARD_SNAPSHOT_SCHEMA_VERSION &&
    typeof candidate.graphVersion === "string" &&
    candidate.gaps && candidate.opportunities
    ? (candidate as StoredDashboardSnapshotPayload)
    : null;
}

export interface DashboardSnapshotReaderOptions {
  client: LiveRecordSqlClient;
  workspaceId: string;
  now?: () => string;
}

/**
 * Returns the stored snapshot when it was computed at the current version;
 * otherwise reads the graph once, recomputes and stores it. The version must
 * be read before the graph: a write that lands in between makes the stored
 * version older than the data, which only causes one extra recompute later.
 * Concurrent recomputes write equal results for equal versions; the last
 * writer wins and any mismatch is recomputed on the next read.
 */
export async function readOrComputeDashboardSnapshot(
  { client, workspaceId, now = () => new Date().toISOString() }: DashboardSnapshotReaderOptions,
  accountId: string,
  { graphVersion, storedSnapshot }: DashboardGraphState,
  readGraph: () => Promise<LiveDashboardGraph>,
): Promise<DashboardAnalysisSnapshot> {
  const recordId = snapshotRecordId(accountId);
  const existing = parsePayload(storedSnapshot);
  if (existing && existing.graphVersion === graphVersion) {
    return { graphVersion, gaps: existing.gaps, opportunities: existing.opportunities };
  }

  const graph = await readGraph();
  const snapshot: DashboardAnalysisSnapshot = {
    graphVersion,
    gaps: networkGapCoreFromGraph(graph),
    opportunities: opportunityCoreFromGraph(graph),
  };
  const computedAt = now();
  const payload: StoredDashboardSnapshotPayload = {
    schemaVersion: DASHBOARD_SNAPSHOT_SCHEMA_VERSION,
    computedAt,
    ...snapshot,
  };
  try {
    await client.query(WRITE_SNAPSHOT_SQL, [workspaceId, recordId, accountId, JSON.stringify(payload), computedAt]);
  } catch (error) {
    // The computed result is still correct; only the cache write failed.
    console.warn(JSON.stringify({
      event: "dashboard_snapshot_write_failed",
      code: (error as { code?: unknown })?.code ?? null,
    }));
  }
  // Same JSON round trip as a stored snapshot so hit and miss return equal values.
  return JSON.parse(JSON.stringify(snapshot)) as DashboardAnalysisSnapshot;
}
