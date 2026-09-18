export interface SyncLockSqlExecutor {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

// Global journal revisions and permission changes can span actors, domains and workspaces.
// Reserve the two-int namespace; it is separate from existing one-bigint advisory keys.
const SYNC_COMMIT_BARRIER_KEY = [1330790996, 2] as const;

// The caller must own the transaction and acquire this before domain locks/CAS/revisions.
// An autocommit query cannot hold a transaction advisory lock across later statements.
export async function acquireSharedSyncWriteGate(executor: SyncLockSqlExecutor): Promise<void> {
  await executor.query("select pg_advisory_xact_lock_shared($1,$2)", SYNC_COMMIT_BARRIER_KEY);
}

// Page readers acquire this in a separate statement before their READ COMMITTED snapshot.
export async function acquireExclusiveSyncReadBarrier(executor: SyncLockSqlExecutor): Promise<void> {
  await executor.query("select pg_advisory_xact_lock($1,$2)", SYNC_COMMIT_BARRIER_KEY);
}
