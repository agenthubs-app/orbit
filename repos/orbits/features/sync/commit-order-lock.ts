/**
 * Sync commit-order lock (sprint 0108).
 *
 * Every insert/update of a sync collection row assigns the row a new
 * sync_revision from one sequence. A device's bookmark is "everything up to
 * revision N", so revisions must become visible in the order they were
 * assigned: a transaction that takes revision 11 and commits after another
 * transaction's revision 12 would be skipped by a device that already
 * advanced its bookmark to 12. Writers therefore hold one transaction-scoped
 * advisory lock from the moment they take a revision until they commit.
 *
 * The strict trigger (SYNC_REVISION_MIGRATION_SQL) rejects an unlocked write
 * with SYNC_WRITE_LOCK_REQUIRED. The SQL here deliberately does not call the
 * migration's functions: it computes the same key inline, so code that takes
 * the lock can be deployed before the migration has run (on such a database
 * the lock is simply an unused advisory lock).
 */

export const SYNC_COLLECTION_NAMES = ["notes", "tasks", "personal_schedule_items"] as const;
export type SyncCollectionName = (typeof SYNC_COLLECTION_NAMES)[number];

export function isSyncCollection(collectionName: string): collectionName is SyncCollectionName {
  return (SYNC_COLLECTION_NAMES as readonly string[]).includes(collectionName);
}

/** Same expression as orbit_records_sync_write_lock_key(); a Postgres test pins the equality. */
export const SYNC_WRITE_LOCK_KEY_SQL =
  "hashtextextended('orbit:sync:commit-order:v1:' || 'orbit_records'::regclass::oid::text, 0)";

/** Transaction-local setting the strict trigger checks. */
export const SYNC_WRITE_LOCK_SETTING = "orbit.sync_write_lock_key";

/**
 * A CTE named sync_write_lock that takes the lock and marks the transaction as
 * holding it. A single statement that selects from (or joins) it holds the lock
 * before any row reaches the trigger, which also works in autocommit mode: the
 * statement's implicit transaction holds the lock until it commits.
 */
export const SYNC_COMMIT_ORDER_LOCK_CTE = `sync_write_lock as materialized (
  select set_config('${SYNC_WRITE_LOCK_SETTING}', held.key::text, true) as acquired_key
  from (
    select lock_key.key, pg_advisory_xact_lock(lock_key.key) as acquired
    from (select ${SYNC_WRITE_LOCK_KEY_SQL} as key) lock_key
  ) held
)`;

export const SYNC_COMMIT_ORDER_LOCK_SQL = `with ${SYNC_COMMIT_ORDER_LOCK_CTE} select acquired_key from sync_write_lock`;

export interface SyncCommitOrderLockExecutor {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

/**
 * For raw SQL inside an explicit transaction: take the lock before the first
 * write to a sync collection. Calling it in autocommit mode is useless (the
 * lock and the setting end with that one statement), so only transaction
 * executors should call it. Taking it twice in one transaction is harmless.
 */
export async function acquireSyncCommitOrderLock(executor: SyncCommitOrderLockExecutor): Promise<void> {
  await executor.query(SYNC_COMMIT_ORDER_LOCK_SQL);
}

/**
 * For bulk writers that insert caller-supplied records without taking the
 * lock: refuse a sync collection loudly instead of letting the strict trigger
 * (or, on a relaxed database, a silently skipped revision) find it later.
 */
export function assertNoSyncCollectionRecords(records: readonly { collectionName: string }[], writer: string): void {
  const offending = records.find((record) => isSyncCollection(record.collectionName));
  if (offending) throw new Error(`${writer} does not take the sync commit-order lock and cannot write ${offending.collectionName}.`);
}
