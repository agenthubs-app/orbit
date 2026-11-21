/**
 * agent-design AG18-1 — the backfill of the new multi-value fields (设计稿 §8 第 5 步「单值回填数组仅在新字段缺失时进行」).
 *
 * Only where the new field is missing, the old single value becomes a list of zero or one item; a list that is there
 * is never touched (an old client's partial update and the readers already treat a missing list as the single value, so
 * the backfill changes no answer). Dry run by default; `apply` writes, in one transaction, only the rows planned; a second
 * run plans 0 rows. Every collection reports its counts and every row it could not handle.
 *
 * | collection | field filled | from |
 * |---|---|---|
 * | tasks | task.relatedContactIds | task.relatedContactId (0 or 1) |
 * | tasks | task.relatedEventRefs | task.relatedEventId as a platform event (0 or 1) |
 * | notes | note.eventRefs | note.eventIds as platform events |
 *
 * Not filled, by decision: schedule items (they never had a single event field: a missing eventRefs is none), contacts'
 * `version` (an old contact without one reads as 0, and the relationship initialization still relies on it being absent,
 * CONVENTIONS §8), attendance (参会自述不从报名推断: nothing is made from registrations). Row timestamps and versions are
 * left as they are: the record means the same before and after (the sync revision moves, so devices get the lists).
 */
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { acquireSyncCommitOrderLock } from "../../sync/commit-order-lock";

export type BackfillMode = "dry-run" | "preview" | "apply";

export interface BackfillChange {
  collection: "tasks" | "notes";
  recordId: string;
  set: Record<string, unknown>;
}

export interface BackfillCounts {
  scanned: number;
  /** Rows that already had every new field (left as they are). */
  alreadyFilled: number;
  /** Rows planned (dry run, preview) or written (apply). */
  planned: number;
  written: number;
  unprocessable: number;
}

export interface BackfillResult {
  mode: BackfillMode;
  workspaceId: string;
  counts: Record<"tasks" | "notes", BackfillCounts>;
  notApplicable: { collection: string; reason: string }[];
  changes: BackfillChange[];
  unprocessable: { collection: string; recordId: string; reason: string }[];
}

const NOT_APPLICABLE = [
  { collection: "personal_schedule_items", reason: "no single event field ever existed; a missing eventRefs means none" },
  { collection: "contacts", reason: "version is not backfilled: a contact without one reads as 0, and relationship initialization relies on it being absent" },
  { collection: "event_attendance_notes", reason: "attendance is never inferred from registrations" },
];

interface Row {
  record_id: string;
  payload: Record<string, unknown> | null;
}

const emptyCounts = (): BackfillCounts => ({ alreadyFilled: 0, planned: 0, scanned: 0, unprocessable: 0, written: 0 });

/** The planned change of one to-do, or why it cannot be handled. Null: nothing to do. */
export function planTask(payload: Record<string, unknown> | null): { set: Record<string, unknown> } | { reason: string } | null {
  const task = payload?.task as Record<string, unknown> | undefined;
  if (!task || typeof task !== "object") return { reason: "payload has no task" };
  const set: Record<string, unknown> = {};
  if (task.relatedContactIds === undefined) {
    const single = task.relatedContactId;
    if (single !== undefined && single !== null && (typeof single !== "string" || !single.trim())) return { reason: "relatedContactId is not an id" };
    set.relatedContactIds = typeof single === "string" && single.trim() ? [single] : [];
  } else if (!Array.isArray(task.relatedContactIds)) return { reason: "relatedContactIds is not a list" };
  if (task.relatedEventRefs === undefined) {
    const single = task.relatedEventId;
    if (single !== undefined && single !== null && (typeof single !== "string" || !single.trim())) return { reason: "relatedEventId is not an id" };
    set.relatedEventRefs = typeof single === "string" && single.trim() ? [{ id: single, kind: "platform" }] : [];
  } else if (!Array.isArray(task.relatedEventRefs)) return { reason: "relatedEventRefs is not a list" };
  return Object.keys(set).length ? { set } : null;
}

/** The planned change of one memo, or why it cannot be handled. Null: nothing to do. */
export function planNote(payload: Record<string, unknown> | null): { set: Record<string, unknown> } | { reason: string } | null {
  const note = payload?.note as Record<string, unknown> | undefined;
  if (!note || typeof note !== "object") return { reason: "payload has no note" };
  if (note.eventRefs !== undefined) return Array.isArray(note.eventRefs) ? null : { reason: "eventRefs is not a list" };
  const ids = note.eventIds ?? [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.trim())) return { reason: "eventIds is not a list of ids" };
  return { set: { eventRefs: (ids as string[]).map((id) => ({ id, kind: "platform" })) } };
}

const PLANNERS = { notes: { field: "note", plan: planNote }, tasks: { field: "task", plan: planTask } } as const;

async function plan(executor: TransactionalSqlExecutor, workspaceId: string, result: BackfillResult): Promise<void> {
  for (const collection of ["tasks", "notes"] as const) {
    const { rows } = await executor.query<Row>(
      `select record_id, payload from orbit_records where workspace_id = $1 and collection_name = $2 and lifecycle_state <> 'deleted' order by record_id`,
      [workspaceId, collection],
    );
    const counts = result.counts[collection];
    for (const row of rows) {
      counts.scanned += 1;
      const planned = PLANNERS[collection].plan(row.payload);
      if (!planned) {
        counts.alreadyFilled += 1;
        continue;
      }
      if ("reason" in planned) {
        counts.unprocessable += 1;
        result.unprocessable.push({ collection, reason: planned.reason, recordId: row.record_id });
        continue;
      }
      counts.planned += 1;
      result.changes.push({ collection, recordId: row.record_id, set: planned.set });
    }
  }
}

/**
 * Dry run and preview read only. Apply re-plans inside one serializable transaction and writes each planned row with
 * a guard that the new field is still missing (`payload #> '{task,relatedContactIds}' is null`), so a row a client
 * filled in the meantime is left alone.
 */
export async function runAgentV1Backfill(input: { client: TransactionalPostgresClient; workspaceId: string; mode: BackfillMode }): Promise<BackfillResult> {
  const result: BackfillResult = { changes: [], counts: { notes: emptyCounts(), tasks: emptyCounts() }, mode: input.mode, notApplicable: NOT_APPLICABLE, unprocessable: [], workspaceId: input.workspaceId };
  if (input.mode !== "apply") {
    await plan(input.client, input.workspaceId, result);
    return result;
  }
  await input.client.transaction(async (tx) => {
    // tasks and notes sync to devices: every write takes the sync commit-order lock first (features/sync/commit-order-lock.ts),
    // so each row's new sync revision commits in order and devices receive the filled lists.
    await acquireSyncCommitOrderLock(tx);
    await plan(tx, input.workspaceId, result);
    for (const change of result.changes) {
      const field = PLANNERS[change.collection].field;
      let patched = 0;
      for (const [key, value] of Object.entries(change.set)) {
        const updated = await tx.query<{ record_id: string }>(
          `update orbit_records set payload = jsonb_set(payload, $4::text[], $5::jsonb, true)
            where workspace_id = $1 and collection_name = $2 and record_id = $3 and payload #> $4::text[] is null
            returning record_id`,
          [input.workspaceId, change.collection, change.recordId, [field, key], JSON.stringify(value)],
        );
        patched += updated.rows.length;
      }
      if (patched) result.counts[change.collection].written += 1;
    }
  });
  return result;
}

export function backfillSummary(result: BackfillResult): string {
  const lines = [`agent-v1 field backfill ${result.mode} (${result.workspaceId})`];
  for (const [collection, counts] of Object.entries(result.counts)) {
    lines.push(`  ${collection}: scanned ${counts.scanned}, already filled ${counts.alreadyFilled}, ${result.mode === "apply" ? `planned ${counts.planned}, written ${counts.written}` : `to fill ${counts.planned}`}, unprocessable ${counts.unprocessable}`);
  }
  for (const item of result.notApplicable) lines.push(`  ${item.collection}: not filled — ${item.reason}`);
  lines.push(`  unprocessable rows (${result.unprocessable.length}, left unchanged):`);
  for (const item of result.unprocessable) lines.push(`    ${item.collection}/${item.recordId}: ${item.reason}`);
  return lines.join("\n");
}
