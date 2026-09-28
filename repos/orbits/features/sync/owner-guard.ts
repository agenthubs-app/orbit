import { derivedOwnerTables, ownerGuardedCollections, personalSubspaceCollections, reassigningOwnerChangeHandlers, SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS } from "./domain-registry";

/**
 * Owner/identity guard (sprint 0113).
 *
 * A device keeps every row of a sync domain it was sent until the server says
 * the row changed. If a write moves an owned row to another owner (or out of
 * its collection), the old owner's device never learns that the row left: the
 * row simply stops matching its reads. The registry lists the columns that
 * decide visibility; this module refuses any change to them that is not one of
 * the registered "reassign" handlers (SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS; none
 * today). A "first-owner" handler (the 0114 backfill) never needs this guard:
 * giving an owner-less row its first owner does not fire it.
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

interface OwnerChangeExecutor {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

/**
 * Sprint 0117: run the rest of the current transaction as a registered
 * "reassign" handler (the database guard then lets it move rows of the
 * handler's collections). The caller must also rotate the previous owners'
 * authorization epochs in the same transaction (rotateAuthorizationEpochs).
 */
export async function actAsOwnerChangeHandler(executor: OwnerChangeExecutor, handler: string): Promise<void> {
  if (!reassigningOwnerChangeHandlers().includes(handler)) throw new SyncOwnerChangeUnregisteredError("(any)", handler);
  await executor.query(`select set_config('${SYNC_OWNER_CHANGE_SETTING}', $1, true)`, [handler]);
}

/**
 * Sprint 0117: a "reassign" handler's duty to the previous owners. A device is
 * never told that a row left it, so the handler moves each previous owner's
 * authorization epoch (features/sync/authorization-epoch.ts: the latest
 * updated_at of the actor's account, auth user and permission rows): their
 * cursors are refused (409) and their devices rebuild every domain from what
 * they own now. Touches only the account row's updated_at.
 */
export const ROTATE_AUTHORIZATION_EPOCH_SQL = `
  update orbit_records as account
  set updated_at = greatest(now(), latest.max_updated_at + interval '1 millisecond')
  from (
    select actor.id, max(auth.updated_at) as max_updated_at
    from unnest($2::text[]) as actor(id)
    join orbit_records auth on auth.workspace_id = $1
      and ((auth.collection_name in ('auth_users', 'accounts', 'permissions') and auth.user_id = actor.id)
        or (auth.collection_name = 'accounts' and auth.record_id = actor.id))
    group by actor.id
  ) latest
  where account.workspace_id = $1
    and account.collection_name = 'accounts'
    and account.record_id = latest.id
`;

export async function rotateAuthorizationEpochs(executor: OwnerChangeExecutor, workspaceId: string, actorIds: readonly string[]): Promise<void> {
  const ids = [...new Set(actorIds.filter((id) => id.trim().length > 0))];
  if (ids.length > 0) await executor.query(ROTATE_AUTHORIZATION_EPOCH_SQL, [workspaceId, ids]);
}

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
  if (handler && reassigningOwnerChangeHandlers(collectionName).includes(handler)) return;
  throw new SyncOwnerChangeUnregisteredError(collectionName, handler);
}

function literalList(values: readonly string[]): string {
  return values.length ? values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ") : "";
}

/**
 * SQL that is true unless the transaction runs as a registered "reassign"
 * handler on a collection in its scope (none registered: always true, so a
 * first-owner handler name opens nothing).
 */
const reassigners = SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS.filter((handler) => handler.scope === "reassign");
const unregisteredHandler = reassigners.length
  ? `not (${reassigners.map((handler) => `(coalesce(current_setting('${SYNC_OWNER_CHANGE_SETTING}', true), '') = '${handler.name.replaceAll("'", "''")}' and old.collection_name in (${literalList(handler.collections)}))`).join(" or ")})`
  : "true";

/**
 * The trigger fires only when an update names user_id or collection_name and
 * one of them actually changes, so ordinary writes pay nothing. Idempotent.
 */
/**
 * Sprint 0118: a personal sub-workspace row (the AI sessions) is owned by its
 * workspace, not by user_id, so moving it to another workspace or collection is
 * the owner change the guard refuses.
 */
const subspaceCollections = personalSubspaceCollections();
const subspaceDeparture = subspaceCollections.length
  ? `(old.collection_name in (${literalList(subspaceCollections)}) or new.collection_name in (${literalList(subspaceCollections)}))
      and (old.workspace_id is distinct from new.workspace_id or old.collection_name is distinct from new.collection_name)`
  : "false";

export const SYNC_OWNER_GUARD_SQL = `
create or replace function orbit_records_sync_owner_guard()
returns trigger
language plpgsql
as $$
begin
  if ((nullif(old.user_id, '') is not null
    and (old.collection_name in (${literalList(ownerGuardedCollections())})
      or new.collection_name in (${literalList(ownerGuardedCollections())})))
    or (${subspaceDeparture}))
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
  before update of user_id, collection_name, workspace_id on orbit_records
  for each row
  when (old.user_id is distinct from new.user_id or old.collection_name is distinct from new.collection_name or old.workspace_id is distinct from new.workspace_id)
  execute function orbit_records_sync_owner_guard();
`;

/** Sprint 0118: an owner guard trigger installed before workspace_id became a watched column must be replaced. */
export const SYNC_OWNER_GUARD_WATCHES_WORKSPACE_SQL =
  "select pg_get_triggerdef(oid) ~ 'workspace_id' as watches from pg_trigger where tgrelid = 'orbit_records'::regclass and tgname = 'orbit_records_sync_owner_guard_trigger' and not tgisinternal";

/**
 * Sprint 0115: the same guard on the dedicated tables that decide who owns a
 * derived domain's row (derivedOwnerTables: the membership and admission
 * application heads of the event domains). Moving a head to another actor,
 * event or workspace would leave the old owner's device holding the row, so
 * any such update is refused unless the transaction runs as a registered
 * "reassign" handler listing that table (none). Cancelling, re-registering,
 * deciding an application — every product write — keeps these columns and is
 * never refused. One statement each (the event operations client accepts one
 * per query); idempotent.
 */
function derivedGuardCondition(): string {
  const reassigning = reassigners.filter((handler) => handler.collections.some((name) => derivedOwnerTables().some((owner) => owner.table === name)));
  return reassigning.length
    ? `not (${reassigning.map((handler) => `(coalesce(current_setting('${SYNC_OWNER_CHANGE_SETTING}', true), '') = '${handler.name.replaceAll("'", "''")}' and tg_table_name in (${literalList(handler.collections)}))`).join(" or ")})`
    : "true";
}

export const SYNC_DERIVED_OWNER_GUARD_STATEMENTS: readonly string[] = [
  `create or replace function sync_derived_owner_guard()
returns trigger
language plpgsql
as $$
begin
  if ${derivedGuardCondition()} then
    raise exception 'SYNC_OWNER_CHANGE_UNREGISTERED'
      using errcode = '55000',
        detail = format('%s: %s/%s/%s -> %s/%s/%s', tg_table_name, old.workspace_id, old.event_id, old.actor_id, new.workspace_id, new.event_id, new.actor_id);
  end if;
  return new;
end;
$$`,
  ...derivedOwnerTables().map((owner) => {
    const columns = [owner.ownerColumn, ...owner.identityColumns];
    return `create or replace trigger ${owner.table}_sync_owner_guard_trigger
  before update of ${columns.join(", ")} on ${owner.table}
  for each row
  when (${columns.map((column) => `old.${column} is distinct from new.${column}`).join(" or ")})
  execute function sync_derived_owner_guard()`;
  }),
];
