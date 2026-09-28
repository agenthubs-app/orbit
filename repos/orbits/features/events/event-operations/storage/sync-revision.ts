import { SYNC_WRITE_LOCK_KEY_SQL, SYNC_WRITE_LOCK_SETTING } from "../../../sync/commit-order-lock";
import { SYNC_DERIVED_OWNER_GUARD_STATEMENTS } from "../../../sync/owner-guard";

/**
 * Sprint 0113 (offline design step 5, method three): the event tables sprint
 * 0115 syncs to the device get a sync_revision, drawn from the same sequence
 * as orbit_records and the relationship message tables, under the same
 * commit-order guarantee (sprint 0108): every insert/update must hold the
 * transaction-scoped commit-order lock, and the trigger refuses an unlocked
 * write with SYNC_WRITE_LOCK_REQUIRED (55P03). The lock key is the
 * orbit_records one, so revisions across all sync tables become visible in the
 * order they were taken and a device bookmark works across them.
 *
 * event_ops_publications stays without a revision: its rows are immutable and
 * a new publication always moves event_ops_publication_heads.
 *
 * Idempotent: the column, backfill, NOT NULL, indexes and trigger are only
 * created when missing; a rerun on a migrated database changes nothing. The
 * backfill runs before the trigger exists, in the same transaction, holding
 * the commit-order lock. Needs the event operations schema, so
 * runOrbitRecordsMigration runs it after the event operations migrations.
 */
export const EVENT_SYNC_REVISION_TABLES = [
  "event_ops_events",
  "event_ops_configuration_heads",
  "event_ops_membership_heads",
  "event_ops_admission_application_heads",
  "event_ops_publication_heads",
] as const;

const tableArray = `array[${EVENT_SYNC_REVISION_TABLES.map((table) => `'${table}'`).join(", ")}]`;

function assignFunction(strict: boolean): string {
  const lockCheck = strict
    ? `  if current_setting('${SYNC_WRITE_LOCK_SETTING}', true)
    is distinct from (${SYNC_WRITE_LOCK_KEY_SQL})::text then
    raise exception 'SYNC_WRITE_LOCK_REQUIRED'
      using errcode = '55P03';
  end if;
`
    : "";
  return `create or replace function event_ops_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
${lockCheck}  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$`;
}

const BACKFILL_AND_TRIGGERS = `do $event_sync_revision$
declare
  target text;
begin
  perform pg_advisory_xact_lock((${SYNC_WRITE_LOCK_KEY_SQL}));
  perform set_config('${SYNC_WRITE_LOCK_SETTING}', (${SYNC_WRITE_LOCK_KEY_SQL})::text, true);
  foreach target in array ${tableArray} loop
    execute format('alter table %I add column if not exists sync_revision bigint', target);
    execute format('update %I set sync_revision = nextval(%L::regclass) where sync_revision is null', target, 'orbit_records_sync_revision_seq');
    execute format('alter table %I alter column sync_revision set not null', target);
    execute format('create unique index if not exists %I on %I (sync_revision)', target || '_sync_revision_uidx', target);
    execute format('create or replace trigger %I before insert or update on %I for each row execute function event_ops_assign_sync_revision()', target || '_sync_revision_trigger', target);
  end loop;
end
$event_sync_revision$`;

/** One statement each: the event operations client accepts a single statement per query. */
export const EVENT_SYNC_REVISION_STATEMENTS: readonly string[] = [
  "create sequence if not exists orbit_records_sync_revision_seq",
  assignFunction(true),
  BACKFILL_AND_TRIGGERS,
  // "My rows after bookmark N": the owner-scoped heads a device reads.
  "create index if not exists event_ops_membership_heads_sync_actor_idx on event_ops_membership_heads (workspace_id, actor_id, sync_revision)",
  "create index if not exists event_ops_admission_heads_sync_actor_idx on event_ops_admission_application_heads (workspace_id, actor_id, sync_revision)",
  // Sprint 0115: the owner heads of the event sync domains may not move to another actor, event or workspace.
  ...SYNC_DERIVED_OWNER_GUARD_STATEMENTS,
];

export const EVENT_SYNC_REVISION_SQL = EVENT_SYNC_REVISION_STATEMENTS.map((statement) => `${statement};`).join("\n\n");

/**
 * Rollback step 1 ("relax"): the trigger keeps assigning revisions but stops
 * checking the lock, as for orbit_records. Running the migration again
 * returns to strict.
 */
export const EVENT_SYNC_REVISION_RELAX_SQL = assignFunction(false);

export interface EventSyncRevisionMigrationClient {
  query(text: string): Promise<unknown>;
}

export async function runEventSyncRevisionMigration(client: EventSyncRevisionMigrationClient): Promise<void> {
  for (const statement of EVENT_SYNC_REVISION_STATEMENTS) await client.query(statement);
}
