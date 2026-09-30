import { acquireSyncCommitOrderLock, isSyncCollection } from "../../features/sync/commit-order-lock";
import { DASHBOARD_GRAPH_VERSION_INDEX_SQL, SYNC_REVISION_MIGRATION_SQL } from "../../features/sync/migrations";

/**
 * The strict sync_revision schema (sprint 0108): sequence, column, commit-order
 * lock functions and the trigger that refuses unlocked writes to
 * notes/tasks/personal_schedule_items. Apply after ORBIT_RECORDS_SCHEMA_SQL.
 * This is what the local development database and production run.
 */
export const STRICT_SYNC_REVISION_SQL = SYNC_REVISION_MIGRATION_SQL;

/**
 * The relaxed variant sprint 0069 installed on orbit_events before any writer
 * took the lock: a trigger that assigns a revision without checking the lock.
 * Kept only for the migration tests (upgrading a relaxed database) and for the
 * control test that shows why the lock is needed. Do not use it to make a new
 * test pass.
 */
export const SYNC_REVISION_ASSIGN_ONLY_SQL = `
create sequence if not exists orbit_records_sync_revision_seq;
alter table orbit_records add column if not exists sync_revision bigint;
update orbit_records set sync_revision = nextval('orbit_records_sync_revision_seq') where sync_revision is null;
alter table orbit_records alter column sync_revision set not null;
create unique index if not exists orbit_records_sync_revision_uidx on orbit_records (sync_revision);

create or replace function orbit_records_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$;

drop trigger if exists orbit_records_assign_sync_revision_trigger on orbit_records;
create trigger orbit_records_assign_sync_revision_trigger
  before insert or update on orbit_records
  for each row execute function orbit_records_assign_sync_revision();

create index if not exists orbit_records_sync_actor_idx
  on orbit_records (workspace_id, user_id, sync_revision)
  where user_id is not null
    and collection_name in ('notes', 'tasks', 'personal_schedule_items');
${DASHBOARD_GRAPH_VERSION_INDEX_SQL}
`;

interface TestTransactionClient {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
  transaction<T>(operation: (tx: { query(text: string, values?: readonly unknown[]): Promise<{ rows: readonly unknown[] }> }) => Promise<T>): Promise<T>;
}

/**
 * A test's own raw write (seeding, simulating another writer). Under the strict
 * trigger a raw write to a sync collection needs the lock like any product
 * writer; everything else runs as a plain statement.
 */
export async function testRawWrite(client: TestTransactionClient, collectionName: string, text: string, values?: readonly unknown[]): Promise<void> {
  if (!isSyncCollection(collectionName)) { await client.query(text, values); return; }
  await client.transaction(async (tx) => { await acquireSyncCommitOrderLock(tx); await tx.query(text, values); });
}

const RESEED_COLUMNS = "workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider, provider_record_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at";

/**
 * Sprint 0116: a test's own "this row belongs to someone else" setup for a row
 * of an owner-guarded sync collection (e.g. a contact another account owns).
 * The owner guard refuses moving an owned row, so the fixture removes it and
 * writes it again under the other owner (or none) in one locked transaction —
 * the row a fixture seeded that way from the start would hold.
 */
export async function testReseedOwner(client: TestTransactionClient, collectionName: string, where: string, owner: string | null, values: readonly unknown[] = []): Promise<void> {
  const columns = RESEED_COLUMNS.split(", ");
  await client.transaction(async (tx) => {
    await acquireSyncCommitOrderLock(tx);
    const selected = await tx.query(`select ${RESEED_COLUMNS} from orbit_records where collection_name = $${values.length + 1} and (${where})`, [...values, collectionName]) as { rows: Record<string, unknown>[] };
    for (const row of selected.rows) {
      await tx.query("delete from orbit_records where workspace_id = $1 and collection_name = $2 and record_id = $3", [row.workspace_id, row.collection_name, row.record_id]);
      await tx.query(`insert into orbit_records (${RESEED_COLUMNS}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")})`, columns.map((column) => column === "user_id" ? owner : row[column]));
    }
  });
}

type FixtureQueryable =
  | { transaction<T>(operation: (tx: { query(text: string, values?: readonly unknown[]): Promise<unknown> }) => Promise<T>): Promise<T> }
  | { connect(): Promise<{ query(text: string, values?: unknown[]): Promise<unknown>; release(): void }> };

/**
 * Sprint 0113: a test's own raw write to an event table that carries
 * sync_revision (event_ops_events, *_heads). Under the strict trigger it needs
 * the commit-order lock like any product writer, so it runs in its own short
 * transaction that takes the lock first.
 */
export async function lockedFixtureQuery(target: FixtureQueryable, text: string, values?: readonly unknown[]): Promise<void> {
  if ("transaction" in target) {
    await target.transaction(async (tx) => { await acquireSyncCommitOrderLock(tx); await tx.query(text, values); });
    return;
  }
  const client = await target.connect();
  try {
    await client.query("begin");
    await acquireSyncCommitOrderLock(client);
    await client.query(text, values === undefined ? undefined : [...values]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
