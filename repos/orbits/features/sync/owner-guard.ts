import { ownerGuardedCollections, SYNC_OWNER_CHANGE_HANDLERS } from "./domain-registry";

/**
 * Owner/identity guard (sprint 0113).
 *
 * A device keeps every row of a sync domain it was sent until the server says
 * the row changed. If a write moves an owned row to another owner (or out of
 * its collection), the old owner's device never learns that the row left: the
 * row simply stops matching its reads. The registry lists the columns that
 * decide visibility; this module refuses any change to them that is not one of
 * the registered handlers (SYNC_OWNER_CHANGE_HANDLERS, empty today).
 *
 * Two layers:
 *   - the database trigger below, on orbit_records, stops product code, scripts
 *     and ad-hoc SQL alike at write time;
 *   - tests/storage/sync-owner-audit.test.ts scans product code and scripts for
 *     statements that set a visibility column, so a new writer fails the default
 *     test suite before it can reach a database.
 *
 * Giving an unowned row its first owner (the 0114 backfill) is not a departure
 * and is allowed.
 */
export const SYNC_OWNER_CHANGE_SETTING = "orbit.sync_owner_change_handler";

export class SyncOwnerChangeUnregisteredError extends Error {
  readonly code = "SYNC_OWNER_CHANGE_UNREGISTERED";
  constructor(readonly collectionName: string, readonly handler: string | undefined) {
    super(`Changing the owner of a ${collectionName} row needs a registered owner-change handler${handler ? ` (${handler} is not registered)` : ""}.`);
    this.name = "SyncOwnerChangeUnregisteredError";
  }
}

export function isOwnerGuardedCollection(collectionName: string): boolean {
  return ownerGuardedCollections().includes(collectionName);
}

/** Throws unless the change is outside every sync domain or runs as a registered handler. */
export function assertRegisteredOwnerChange(collectionName: string, handler: string | undefined): void {
  if (!isOwnerGuardedCollection(collectionName)) return;
  if (handler && SYNC_OWNER_CHANGE_HANDLERS.includes(handler)) return;
  throw new SyncOwnerChangeUnregisteredError(collectionName, handler);
}

function literalList(values: readonly string[]): string {
  return values.length ? values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ") : "";
}

/** SQL that is true unless the transaction runs as a registered handler (none registered: always true). */
const unregisteredHandler = SYNC_OWNER_CHANGE_HANDLERS.length
  ? `coalesce(current_setting('${SYNC_OWNER_CHANGE_SETTING}', true), '') not in (${literalList(SYNC_OWNER_CHANGE_HANDLERS)})`
  : "true";

/**
 * The trigger fires only when an update names user_id or collection_name and
 * one of them actually changes, so ordinary writes pay nothing. Idempotent.
 */
export const SYNC_OWNER_GUARD_SQL = `
create or replace function orbit_records_sync_owner_guard()
returns trigger
language plpgsql
as $$
begin
  if nullif(old.user_id, '') is not null
    and (old.collection_name in (${literalList(ownerGuardedCollections())})
      or new.collection_name in (${literalList(ownerGuardedCollections())}))
    and ${unregisteredHandler}
  then
    raise exception 'SYNC_OWNER_CHANGE_UNREGISTERED'
      using errcode = '55000',
        detail = format('%s/%s: owner %s -> %s, collection %s -> %s', old.workspace_id, old.record_id, old.user_id, new.user_id, old.collection_name, new.collection_name);
  end if;
  return new;
end;
$$;

create or replace trigger orbit_records_sync_owner_guard_trigger
  before update of user_id, collection_name on orbit_records
  for each row
  when (old.user_id is distinct from new.user_id or old.collection_name is distinct from new.collection_name)
  execute function orbit_records_sync_owner_guard();
`;
