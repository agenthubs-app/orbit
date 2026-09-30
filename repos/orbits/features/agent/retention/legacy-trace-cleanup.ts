import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import {
  AGENT_RUN_TARGET_TYPE,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS,
} from "../storage/agent-runtime-live-record-provider";
import { AGENT_REQUEST_COLLECTION, AGENT_RUN_CHILD_COLLECTION_NAMES } from "./run-retention";

// Sprint 0111 (AI A5, design decision 3): one-off removal of the duplicate AI
// trace written before 0103/0110 — every analytics event, every plain-answer
// run (a run with no action) and that run's step rows — plus clearing the
// request records' link to those runs. Runs with actions and all their
// children are untouched. Count first (dry run), export every row that will
// change to a local JSON Lines file, then delete exactly the exported rows in
// bounded transactions. Re-running deletes only what is left.

export const LEGACY_ANALYTICS_BATCH = 1000;
export const LEGACY_RUN_BATCH = 200;

const RUNS = AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs;
const STEPS = AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps;
const ANALYTICS = AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.analytics;
const ACTION_CHILDREN = [
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
];

export interface LegacyTraceCounts {
  /** agentAnalyticsEvents rows in the workspace and its agent subspaces (all to delete). */
  analyticsEvents: number;
  /** Runs without any action (to delete). */
  plainRuns: number;
  /** Step rows of those runs (to delete). */
  plainRunSteps: number;
  /** Request records linked to those runs (link to clear; the record stays). */
  plainRunRequestLinks: number;
  /** Runs with actions (kept, with every child). */
  actionRuns: number;
  /** Child rows still missing the 0103 run target: deletion refuses to start while this is not 0. */
  unlinkedChildRows: number;
  /** Step rows whose run no longer exists (reported, not deleted). */
  orphanSteps: number;
}

// Scope: the workspace itself and its `<workspace>:agent-actor:<actor>` subspaces.
const SCOPE = `(workspace_id = $1 or (left(workspace_id, char_length($1) + 13) = $1 || ':agent-actor:' and char_length(workspace_id) > char_length($1) + 13))`;
const scoped = (alias: string) => SCOPE.replaceAll("workspace_id", `${alias}.workspace_id`);

/** A run is plain when it names no action and no action, outbox or receipt row belongs to it, linked or not. */
const PLAIN_RUN = `
  r.collection_name = '${RUNS}'
  and (jsonb_typeof(r.payload->'entity'->'actionIds') is distinct from 'array' or jsonb_array_length(r.payload->'entity'->'actionIds') = 0)
  and not exists (select 1 from orbit_records c where c.workspace_id = r.workspace_id
    and c.collection_name = any(array['${ACTION_CHILDREN.join("','")}'])
    and ((c.target_type = '${AGENT_RUN_TARGET_TYPE}' and c.target_id = r.record_id) or c.payload->'entity'->>'runId' = r.record_id))`;

const n = (value: unknown) => Number(value ?? 0);

export async function countLegacyTrace(client: TransactionalSqlExecutor, workspaceId: string): Promise<LegacyTraceCounts> {
  const result = await client.query<Record<string, string>>(
    `select
       (select count(*) from orbit_records a where ${scoped("a")} and a.collection_name = '${ANALYTICS}') as analytics,
       (select count(*) from orbit_records r where ${scoped("r")} and ${PLAIN_RUN}) as plain_runs,
       (select count(*) from orbit_records s join orbit_records r on r.workspace_id = s.workspace_id and r.record_id = s.target_id
          where ${scoped("s")} and s.collection_name = '${STEPS}' and s.target_type = '${AGENT_RUN_TARGET_TYPE}' and ${PLAIN_RUN}) as plain_steps,
       (select count(*) from orbit_records q join orbit_records r
           on r.workspace_id = q.workspace_id || ':agent-actor:' || q.user_id and r.record_id = q.target_id
          where q.workspace_id = $1 and q.collection_name = '${AGENT_REQUEST_COLLECTION}' and q.target_type = '${AGENT_RUN_TARGET_TYPE}'
            and ${PLAIN_RUN}) as request_links,
       (select count(*) from orbit_records r where ${scoped("r")} and r.collection_name = '${RUNS}') as all_runs,
       (select count(*) from orbit_records c where ${scoped("c")} and c.target_id is null
          and c.collection_name = any(array['${AGENT_RUN_CHILD_COLLECTION_NAMES.join("','")}'])
          and coalesce(c.payload->'entity'->>'runId', '') <> '') as unlinked,
       (select count(*) from orbit_records s where ${scoped("s")} and s.collection_name = '${STEPS}' and s.target_id is not null
          and not exists (select 1 from orbit_records r where r.workspace_id = s.workspace_id and r.collection_name = '${RUNS}' and r.record_id = s.target_id)) as orphan_steps`,
    [workspaceId],
  );
  const row = result.rows[0] ?? {};
  const plainRuns = n(row.plain_runs);
  return {
    analyticsEvents: n(row.analytics),
    plainRuns,
    plainRunSteps: n(row.plain_steps),
    plainRunRequestLinks: n(row.request_links),
    actionRuns: n(row.all_runs) - plainRuns,
    unlinkedChildRows: n(row.unlinked),
    orphanSteps: n(row.orphan_steps),
  };
}

export class LegacyTraceCleanupRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyTraceCleanupRefused";
  }
}

interface RowKey { workspace_id: string; record_id: string }
interface RunKey extends RowKey { stepIds: string[]; requestIds: string[] }

export interface LegacyTraceCleanupResult {
  mode: "dry-run" | "execute";
  before: LegacyTraceCounts;
  backup?: { path: string; rows: number; bytes: number };
  deleted?: { analyticsEvents: number; plainRuns: number; plainRunSteps: number; requestLinksCleared: number; skippedRuns: number };
  after?: LegacyTraceCounts;
}

/** Appends JSON lines to a new file (never overwrites) and flushes them to disk on close. */
function backupWriter(path: string) {
  const fd = openSync(path, "wx", 0o600);
  let rows = 0;
  let bytes = 0;
  return {
    write(kind: string, row: unknown) {
      const line = `${JSON.stringify({ kind, row })}\n`;
      bytes += writeSync(fd, line);
      if (kind !== "header") rows += 1;
    },
    close() {
      fsyncSync(fd);
      closeSync(fd);
      return { rows, bytes };
    },
  };
}

/**
 * Dry run: counts only, never writes. Execute: refuses while unlinked child
 * rows exist; exports every row it will delete or relink (full rows) to
 * `backupPath`, then deletes exactly those rows — analytics in batches,
 * plain runs with their steps and request links in one transaction per batch,
 * re-checking under a row lock that each run is still plain.
 */
export async function runLegacyTraceCleanup(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  execute: boolean;
  backupPath?: string;
  analyticsBatch?: number;
  runBatch?: number;
  /** Test hook: called after each committed deletion batch (e.g. to simulate an interruption). */
  afterBatch?: (kind: "analytics" | "runs", batch: number) => void | Promise<void>;
}): Promise<LegacyTraceCleanupResult> {
  const before = await countLegacyTrace(input.client, input.workspaceId);
  if (!input.execute) return { mode: "dry-run", before };
  if (before.unlinkedChildRows > 0) {
    throw new LegacyTraceCleanupRefused(
      `${before.unlinkedChildRows} agent child row(s) still lack the run target; run npm run db:migrate:agent-run-targets first.`,
    );
  }
  if (!input.backupPath) throw new LegacyTraceCleanupRefused("A backup path is required to delete.");
  const analyticsBatch = input.analyticsBatch ?? LEGACY_ANALYTICS_BATCH;
  const runBatch = input.runBatch ?? LEGACY_RUN_BATCH;

  // 1. Export. Keys are kept so the delete phase touches only exported rows.
  const writer = backupWriter(input.backupPath);
  const analyticsKeys: RowKey[] = [];
  const runKeys: RunKey[] = [];
  let written: { rows: number; bytes: number } | undefined;
  try {
    writer.write("header", { sprint: "0111", workspaceId: input.workspaceId, exportedAt: new Date().toISOString(), before });
    let after: RowKey = { workspace_id: "", record_id: "" };
    for (;;) {
      const page = await input.client.query<{ workspace_id: string; record_id: string; row: unknown }>(
        `select a.workspace_id, a.record_id, to_jsonb(a) as row from orbit_records a
          where ${scoped("a")} and a.collection_name = '${ANALYTICS}'
            and (a.workspace_id collate "C", a.record_id collate "C") > ($2 collate "C", $3 collate "C")
          order by a.workspace_id collate "C", a.record_id collate "C" limit $4`,
        [input.workspaceId, after.workspace_id, after.record_id, analyticsBatch],
      );
      for (const row of page.rows) {
        writer.write("delete", row.row);
        analyticsKeys.push({ workspace_id: row.workspace_id, record_id: row.record_id });
      }
      if (page.rows.length < analyticsBatch) break;
      after = page.rows.at(-1)!;
    }
    after = { workspace_id: "", record_id: "" };
    for (;;) {
      const runs = await input.client.query<{ workspace_id: string; record_id: string; row: unknown }>(
        `select r.workspace_id, r.record_id, to_jsonb(r) as row from orbit_records r
          where ${scoped("r")} and ${PLAIN_RUN}
            and (r.workspace_id collate "C", r.record_id collate "C") > ($2 collate "C", $3 collate "C")
          order by r.workspace_id collate "C", r.record_id collate "C" limit $4`,
        [input.workspaceId, after.workspace_id, after.record_id, runBatch],
      );
      if (runs.rows.length === 0) break;
      const pageKeys = new Map<string, RunKey>();
      for (const run of runs.rows) {
        writer.write("delete", run.row);
        const key = { workspace_id: run.workspace_id, record_id: run.record_id, stepIds: [], requestIds: [] };
        pageKeys.set(`${run.workspace_id}\u0000${run.record_id}`, key);
        runKeys.push(key);
      }
      const workspaces = runs.rows.map((run) => run.workspace_id);
      const ids = runs.rows.map((run) => run.record_id);
      const steps = await input.client.query<{ workspace_id: string; record_id: string; target_id: string; row: unknown }>(
        `select s.workspace_id, s.record_id, s.target_id, to_jsonb(s) as row
           from orbit_records s join unnest($1::text[], $2::text[]) as k(ws, run) on s.workspace_id = k.ws and s.target_id = k.run
          where s.collection_name = '${STEPS}' and s.target_type = '${AGENT_RUN_TARGET_TYPE}'
          order by s.workspace_id collate "C", s.record_id collate "C"`,
        [workspaces, ids],
      );
      for (const step of steps.rows) {
        writer.write("delete", step.row);
        pageKeys.get(`${step.workspace_id}\u0000${step.target_id}`)?.stepIds.push(step.record_id);
      }
      const requests = await input.client.query<{ record_id: string; subspace: string; target_id: string; row: unknown }>(
        `select q.record_id, q.workspace_id || ':agent-actor:' || q.user_id as subspace, q.target_id, to_jsonb(q) as row
           from orbit_records q join unnest($2::text[], $3::text[]) as k(ws, run)
             on q.workspace_id || ':agent-actor:' || q.user_id = k.ws and q.target_id = k.run
          where q.workspace_id = $1 and q.collection_name = '${AGENT_REQUEST_COLLECTION}' and q.target_type = '${AGENT_RUN_TARGET_TYPE}'
          order by q.record_id collate "C"`,
        [input.workspaceId, workspaces, ids],
      );
      for (const request of requests.rows) {
        writer.write("unlink", request.row);
        pageKeys.get(`${request.subspace}\u0000${request.target_id}`)?.requestIds.push(request.record_id);
      }
      if (runs.rows.length < runBatch) break;
      after = runs.rows.at(-1)!;
    }
  } finally {
    // Flushed before any delete: a failed export deletes nothing.
    written = writer.close();
  }
  const backup = { path: input.backupPath, ...written! };

  // 2. Delete exactly the exported rows.
  const deleted = { analyticsEvents: 0, plainRuns: 0, plainRunSteps: 0, requestLinksCleared: 0, skippedRuns: 0 };
  for (let start = 0, batch = 0; start < analyticsKeys.length; start += analyticsBatch, batch += 1) {
    const slice = analyticsKeys.slice(start, start + analyticsBatch);
    const result = await input.client.query<{ n: string }>(
      `with gone as (delete from orbit_records o using unnest($1::text[], $2::text[]) as k(ws, id)
         where o.workspace_id = k.ws and o.collection_name = '${ANALYTICS}' and o.record_id = k.id returning 1)
       select count(*)::text as n from gone`,
      [slice.map((key) => key.workspace_id), slice.map((key) => key.record_id)],
    );
    deleted.analyticsEvents += n(result.rows[0]?.n);
    await input.afterBatch?.("analytics", batch);
  }
  for (let start = 0, batch = 0; start < runKeys.length; start += runBatch, batch += 1) {
    const slice = runKeys.slice(start, start + runBatch);
    const counts = await input.client.transaction((tx) => deletePlainRunBatch(tx, input.workspaceId, slice));
    deleted.plainRuns += counts.runs;
    deleted.plainRunSteps += counts.steps;
    deleted.requestLinksCleared += counts.links;
    deleted.skippedRuns += counts.skipped;
    await input.afterBatch?.("runs", batch);
  }
  const afterCounts = await countLegacyTrace(input.client, input.workspaceId);
  return { mode: "execute", before, backup, deleted, after: afterCounts };
}

async function deletePlainRunBatch(tx: TransactionalSqlExecutor, workspaceId: string, runs: readonly RunKey[]) {
  // Lock the runs, then keep only those still plain under the lock.
  const stillPlain = await tx.query<{ workspace_id: string; record_id: string }>(
    `select r.workspace_id, r.record_id from orbit_records r join unnest($1::text[], $2::text[]) as k(ws, id)
        on r.workspace_id = k.ws and r.record_id = k.id
      where ${PLAIN_RUN}
      order by r.workspace_id collate "C", r.record_id collate "C"
      for update of r`,
    [runs.map((run) => run.workspace_id), runs.map((run) => run.record_id)],
  );
  const plain = new Set(stillPlain.rows.map((row) => `${row.workspace_id}\u0000${row.record_id}`));
  let steps = 0;
  let links = 0;
  let removed = 0;
  const kept = runs.filter((run) => plain.has(`${run.workspace_id}\u0000${run.record_id}`));
  const bySubspace = new Map<string, RunKey[]>();
  for (const run of kept) bySubspace.set(run.workspace_id, [...(bySubspace.get(run.workspace_id) ?? []), run]);
  for (const [subspace, group] of bySubspace) {
    const stepIds = group.flatMap((run) => run.stepIds);
    if (stepIds.length > 0) {
      const result = await tx.query<{ n: string }>(
        `with gone as (delete from orbit_records where workspace_id = $1 and collection_name = '${STEPS}' and record_id = any($2::text[]) returning 1)
         select count(*)::text as n from gone`,
        [subspace, stepIds],
      );
      steps += n(result.rows[0]?.n);
    }
    const runResult = await tx.query<{ n: string }>(
      `with gone as (delete from orbit_records where workspace_id = $1 and collection_name = '${RUNS}' and record_id = any($2::text[]) returning 1)
       select count(*)::text as n from gone`,
      [subspace, group.map((run) => run.record_id)],
    );
    removed += n(runResult.rows[0]?.n);
    // Only the exported request records lose their link, and only while it still names one of these runs.
    const requestIds = group.flatMap((run) => run.requestIds);
    if (requestIds.length > 0) {
      const result = await tx.query<{ n: string }>(
        `with cleared as (update orbit_records set target_type = null, target_id = null
           where workspace_id = $1 and collection_name = '${AGENT_REQUEST_COLLECTION}' and record_id = any($2::text[])
             and target_type = '${AGENT_RUN_TARGET_TYPE}' and target_id = any($3::text[]) returning 1)
         select count(*)::text as n from cleared`,
        [workspaceId, requestIds, group.map((run) => run.record_id)],
      );
      links += n(result.rows[0]?.n);
    }
  }
  return { runs: removed, steps, links, skipped: runs.length - kept.length };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Deleting on anything but a local database needs `--execute` plus
 * `--confirm-remote=<host>/<database>` naming exactly the database the
 * connection resolves to. A cloud target counts as remote whatever its host.
 * Counting (dry run) needs no confirmation. Errors never echo credentials.
 */
export function assertLegacyTraceCleanupTarget(input: {
  connectionString: string;
  target: "local" | "cloud";
  execute: boolean;
  confirmRemote?: string | null;
}): { host: string; database: string; remote: boolean } {
  let url: URL;
  try {
    url = new URL(input.connectionString);
  } catch {
    throw new LegacyTraceCleanupRefused("Database connection configuration is invalid.");
  }
  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const remote = input.target !== "local" || !LOCAL_HOSTS.has(host);
  if (input.execute && remote && input.confirmRemote !== `${host}/${database}`) {
    throw new LegacyTraceCleanupRefused(
      `Refusing to delete on a remote database; pass --confirm-remote=${host}/${database} after the dry run and backup plan are approved.`,
    );
  }
  return { host, database, remote };
}
