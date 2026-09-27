import { SYNC_COMMIT_ORDER_LOCK_CTE } from "./commit-order-lock";
import {
  DASHBOARD_GRAPH_VERSION_INDEX_SQL,
  SYNC_ACTOR_INDEX_SQL,
  SYNC_REVISION_COLUMN_SQL,
  SYNC_REVISION_FUNCTIONS_SQL,
  SYNC_REVISION_RELAXED_FUNCTION_SQL,
  SYNC_REVISION_TRIGGER_SQL,
} from "./migrations";

/**
 * Online sync_revision migration (sprint 0108), for a live database.
 *
 * Precondition: the code that takes the commit-order lock for every write to
 * notes/tasks/personal_schedule_items is already deployed. Once the strict
 * trigger is installed, an unlocked write to those collections fails.
 *
 * Idempotent on the three states a database can be in: no sync_revision at
 * all, the relaxed 0069 trigger, or already strict. Steps:
 *   1. sequence, nullable column, functions (strict)  – brief catalog locks
 *   2. align the sequence past every stored revision
 *   3. install the trigger, so every new write gets a revision from now on
 *   4. backfill rows with a null revision in primary-key batches; each batch is
 *      one short transaction holding the commit-order lock
 *   5. verify: no null, no duplicate
 *   6. NOT NULL via a validated CHECK constraint (no long exclusive scan)
 *   7. unique index and sync indexes, CONCURRENTLY
 *
 * The client must be one dedicated session (pg.Client): step 4 uses explicit
 * transactions and step 7 cannot run inside one.
 */
export interface SyncRevisionMigrationSession {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: TRow[]; rowCount?: number | null }>;
}

export type SyncRevisionState = "absent" | "relaxed" | "strict" | "disabled" | "partial";

export interface SyncRevisionInspection {
  state: SyncRevisionState;
  rows: number;
  nullRevisions: number;
  columnNotNull: boolean;
  triggerInstalled: boolean;
  uniqueIndexValid: boolean;
}

export interface SyncRevisionMigrationReport {
  before: SyncRevisionInspection;
  after: SyncRevisionInspection;
  backfilledRows: number;
  batches: number;
  steps: { step: string; ms: number }[];
}

export interface SyncRevisionMigrationOptions {
  batchSize?: number;
  /** Per-statement lock wait; a busy table fails the step instead of queueing every writer behind it. */
  lockTimeoutMs?: number;
  log?: (line: string) => void;
}

const UNIQUE_INDEX = "orbit_records_sync_revision_uidx";
const NOT_NULL_CHECK = "orbit_records_sync_revision_not_null";

async function exists(session: SyncRevisionMigrationSession, sql: string, values: readonly unknown[] = []): Promise<boolean> {
  return (await session.query<{ present: boolean }>(`select exists(${sql}) as present`, values)).rows[0]?.present === true;
}

export async function inspectSyncRevision(session: SyncRevisionMigrationSession): Promise<SyncRevisionInspection> {
  const column = (await session.query<{ is_nullable: string }>(
    "select is_nullable from information_schema.columns where table_schema = current_schema() and table_name = 'orbit_records' and column_name = 'sync_revision'",
  )).rows[0];
  const rows = Number((await session.query<{ n: string }>("select count(*)::text as n from orbit_records")).rows[0]?.n ?? 0);
  if (!column) return { state: "absent", rows, nullRevisions: rows, columnNotNull: false, triggerInstalled: false, uniqueIndexValid: false };
  const nullRevisions = Number((await session.query<{ n: string }>("select count(*)::text as n from orbit_records where sync_revision is null")).rows[0]?.n ?? 0);
  const triggerInstalled = await exists(session, "select 1 from pg_trigger where tgrelid = 'orbit_records'::regclass and tgname = 'orbit_records_assign_sync_revision_trigger' and not tgisinternal");
  const uniqueIndexValid = await exists(session, "select 1 from pg_index i join pg_class c on c.oid = i.indexrelid where i.indrelid = 'orbit_records'::regclass and c.relname = $1 and i.indisvalid", [UNIQUE_INDEX]);
  // Match the raise, not the token: the 0069 relaxed body mentions SYNC_WRITE_LOCK_REQUIRED in a comment.
  const strictBody = await exists(session, "select 1 from pg_proc where oid = to_regprocedure('orbit_records_assign_sync_revision()') and prosrc ~* $1", ["raise\\s+exception\\s+'SYNC_WRITE_LOCK_REQUIRED'"]);
  const columnNotNull = column.is_nullable === "NO";
  let state: SyncRevisionState;
  if (!triggerInstalled) state = "disabled";
  else if (!columnNotNull || nullRevisions > 0 || !uniqueIndexValid) state = "partial";
  else state = strictBody ? "strict" : "relaxed";
  return { state, rows, nullRevisions, columnNotNull, triggerInstalled, uniqueIndexValid };
}

async function timed(steps: SyncRevisionMigrationReport["steps"], step: string, log: (line: string) => void, run: () => Promise<void>): Promise<void> {
  const started = Date.now();
  await run();
  const ms = Date.now() - started;
  steps.push({ step, ms });
  log(`${step}: ${ms} ms`);
}

async function inTransaction(session: SyncRevisionMigrationSession, run: () => Promise<void>): Promise<void> {
  await session.query("begin");
  try {
    await run();
    await session.query("commit");
  } catch (error) {
    await session.query("rollback").catch(() => undefined);
    throw error;
  }
}

/**
 * A live database has writers calling nextval() concurrently, so setval() is
 * unsafe here: it could move the sequence back below a value another session
 * just took, and the next write would reuse it. Only move forward, with
 * nextval(), and only when stored revisions are ahead of the sequence (a
 * restored or copied table); normally there is nothing to do.
 */
async function advanceSequencePastStoredRevisions(session: SyncRevisionMigrationSession): Promise<void> {
  for (;;) {
    const state = (await session.query<{ gap: string }>(
      "select greatest(coalesce((select max(sync_revision) from orbit_records), 0) - (select case when is_called then last_value else last_value - 1 end from orbit_records_sync_revision_seq), 0)::text as gap",
    )).rows[0];
    const gap = BigInt(state?.gap ?? "0");
    if (gap <= BigInt(0)) return;
    const step = gap > BigInt(100_000) ? 100_000 : Number(gap);
    await session.query("select count(nextval('orbit_records_sync_revision_seq'::regclass)) from generate_series(1, $1::int)", [step]);
  }
}

/** One batch: the next rows by primary key after `after` that still lack a revision. */
const BACKFILL_BATCH_SQL = `
with ${SYNC_COMMIT_ORDER_LOCK_CTE},
batch as (
  select workspace_id, collection_name, record_id
  from orbit_records
  where (workspace_id, collection_name, record_id) > ($1::text, $2::text, $3::text)
  order by workspace_id, collection_name, record_id
  limit $4
),
filled as (
  update orbit_records target
  set sync_revision = nextval('orbit_records_sync_revision_seq'::regclass)
  from batch, sync_write_lock
  where target.workspace_id = batch.workspace_id
    and target.collection_name = batch.collection_name
    and target.record_id = batch.record_id
    and target.sync_revision is null
  returning 1
)
select
  (select count(*) from filled)::int as filled,
  (select count(*) from batch)::int as scanned,
  (select workspace_id from batch order by workspace_id desc, collection_name desc, record_id desc limit 1) as last_workspace_id,
  (select collection_name from batch order by workspace_id desc, collection_name desc, record_id desc limit 1) as last_collection_name,
  (select record_id from batch order by workspace_id desc, collection_name desc, record_id desc limit 1) as last_record_id
`;

export async function migrateSyncRevisionOnline(session: SyncRevisionMigrationSession, options: SyncRevisionMigrationOptions = {}): Promise<SyncRevisionMigrationReport> {
  const batchSize = options.batchSize ?? 1000;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50_000) throw new Error("SYNC_REVISION_BATCH_SIZE_INVALID");
  const log = options.log ?? (() => undefined);
  const steps: SyncRevisionMigrationReport["steps"] = [];
  await session.query(`set lock_timeout = ${Math.max(100, Math.floor(options.lockTimeoutMs ?? 5000))}`);
  const before = await inspectSyncRevision(session);
  log(`before: ${JSON.stringify(before)}`);

  // A rerun on a migrated database takes no table lock: the column and the
  // trigger are only (re)created when missing; replacing functions locks nothing.
  if (before.state === "absent") await timed(steps, "column", log, () => inTransaction(session, async () => { await session.query(SYNC_REVISION_COLUMN_SQL); }));
  // The column can exist without the free-standing sequence (e.g. a table
  // copied on its own); creating a missing sequence takes no table lock.
  else await session.query("create sequence if not exists orbit_records_sync_revision_seq");
  await timed(steps, "functions", log, () => inTransaction(session, async () => { await session.query(SYNC_REVISION_FUNCTIONS_SQL); }));
  await timed(steps, "align-sequence", log, () => advanceSequencePastStoredRevisions(session));
  if (!before.triggerInstalled) await timed(steps, "trigger", log, () => inTransaction(session, async () => { await session.query(SYNC_REVISION_TRIGGER_SQL); }));

  let backfilledRows = 0;
  let batches = 0;
  await timed(steps, "backfill", log, async () => {
    let after: [string, string, string] = ["", "", ""];
    for (;;) {
      let result: { filled: number; scanned: number; last_workspace_id: string | null; last_collection_name: string | null; last_record_id: string | null } | undefined;
      await inTransaction(session, async () => { result = (await session.query<NonNullable<typeof result>>(BACKFILL_BATCH_SQL, [...after, batchSize])).rows[0]; });
      if (!result || result.scanned === 0) break;
      batches += 1;
      backfilledRows += result.filled;
      after = [result.last_workspace_id!, result.last_collection_name!, result.last_record_id!];
      if (result.scanned < batchSize) break;
    }
    log(`backfilled ${backfilledRows} rows in ${batches} batches`);
  });

  await timed(steps, "verify", log, async () => {
    if (await exists(session, "select 1 from orbit_records where sync_revision is null")) throw new Error("SYNC_REVISION_NULL_BACKFILL_FAILED");
    if (await exists(session, "select 1 from orbit_records group by sync_revision having count(*) > 1")) throw new Error("SYNC_REVISION_DUPLICATE_BACKFILL_FAILED");
  });

  await timed(steps, "not-null", log, async () => {
    const notNull = (await session.query<{ is_nullable: string }>(
      "select is_nullable from information_schema.columns where table_schema = current_schema() and table_name = 'orbit_records' and column_name = 'sync_revision'",
    )).rows[0]?.is_nullable === "NO";
    if (notNull) return;
    // A validated CHECK lets SET NOT NULL skip its own full-table scan under
    // ACCESS EXCLUSIVE; VALIDATE only takes SHARE UPDATE EXCLUSIVE (writes go on).
    if (!await exists(session, "select 1 from pg_constraint where conrelid = 'orbit_records'::regclass and conname = $1", [NOT_NULL_CHECK])) {
      await session.query(`alter table orbit_records add constraint ${NOT_NULL_CHECK} check (sync_revision is not null) not valid`);
    }
    await session.query(`alter table orbit_records validate constraint ${NOT_NULL_CHECK}`);
    await session.query("alter table orbit_records alter column sync_revision set not null");
    await session.query(`alter table orbit_records drop constraint ${NOT_NULL_CHECK}`);
  });

  await timed(steps, "unique-index", log, async () => {
    const leftover = await exists(session, "select 1 from pg_index i join pg_class c on c.oid = i.indexrelid where i.indrelid = 'orbit_records'::regclass and c.relname = $1 and not i.indisvalid", [UNIQUE_INDEX]);
    // A failed CONCURRENTLY build leaves an invalid index that IF NOT EXISTS would keep forever.
    if (leftover) await session.query(`drop index concurrently if exists ${UNIQUE_INDEX}`);
    await session.query(`create unique index concurrently if not exists ${UNIQUE_INDEX} on orbit_records (sync_revision)`);
  });
  await timed(steps, "sync-indexes", log, async () => {
    for (const statement of [SYNC_ACTOR_INDEX_SQL, DASHBOARD_GRAPH_VERSION_INDEX_SQL]) {
      await session.query(statement.replace(/create index if not exists/i, "create index concurrently if not exists"));
    }
  });

  const after = await inspectSyncRevision(session);
  log(`after: ${JSON.stringify(after)}`);
  if (after.state !== "strict") throw new Error(`SYNC_REVISION_MIGRATION_INCOMPLETE:${after.state}`);
  return { before, after, backfilledRows, batches, steps };
}

/**
 * Rollback.
 * - "relax": the trigger keeps assigning revisions but stops checking the lock.
 *   Nothing can fail on the lock any more; sync keeps working without the
 *   commit-order guarantee. First choice.
 * - "disable": drop the trigger and the NOT NULL. New rows get no revision and
 *   devices stop seeing changes. Only if the trigger itself is the problem.
 * Running the migration again returns either state to strict.
 */
export async function rollbackSyncRevision(session: SyncRevisionMigrationSession, mode: "relax" | "disable"): Promise<SyncRevisionInspection> {
  await inTransaction(session, async () => {
    if (mode === "relax") {
      await session.query(SYNC_REVISION_RELAXED_FUNCTION_SQL);
    } else {
      await session.query("drop trigger if exists orbit_records_assign_sync_revision_trigger on orbit_records");
      if (await exists(session, "select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'orbit_records' and column_name = 'sync_revision'")) {
        await session.query("alter table orbit_records alter column sync_revision drop not null");
      }
    }
  });
  return inspectSyncRevision(session);
}
