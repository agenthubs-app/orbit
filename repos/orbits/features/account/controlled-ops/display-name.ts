import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { createLiveProfileService } from "../../profile/live-service";
import { createConfiguredStorageProfileProvider } from "../../profile/storage/profile-live-record-provider";

/**
 * Controlled display-name change for one account (2026-11-28: the operator renames a person who asked for it).
 * The profile name goes through the product's own profile save (same validation and write as the person editing it);
 * the sign-in record's account name follows only when it was the same old name. Published event results are frozen
 * by design and keep the name they were published with.
 */

export interface NameCandidate {
  userId: string;
  actorId: string | null;
  accountName: string | null;
  profileName: string | null;
}

async function actorFor(sql: TransactionalSqlExecutor, workspaceId: string, userId: string): Promise<string | null> {
  const rows = await sql.query<{ actor: string | null; direct: boolean }>(`select coalesce(payload->>'accountId',$2) as actor,
    (payload->>'id')=$2 as direct from orbit_records where workspace_id=$1 and collection_name='profiles'
    and lifecycle_state<>'deleted' and ((payload->>'id')=$2 or (payload->>'accountId')=$2)`, [workspaceId, userId]);
  const preferred = rows.rows.some((row) => row.direct) ? rows.rows.filter((row) => row.direct) : rows.rows;
  const actors = [...new Set(preferred.map((row) => row.actor).filter((actor): actor is string => Boolean(actor)))];
  return actors.length === 1 ? actors[0]! : null;
}

async function profileName(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string): Promise<string | null> {
  const rows = await sql.query<{ name: string | null }>(`select payload->>'displayName' as name from orbit_records
    where workspace_id=$1 and collection_name='profiles' and user_id=$2 and lifecycle_state<>'deleted'
    order by updated_at desc limit 1`, [workspaceId, actorId]);
  return rows.rows[0]?.name ?? null;
}

/** Read-only: active accounts whose account name or profile name contains `name`. No emails are returned. */
export function previewControlledNameChange(input: { db: TransactionalPostgresClient; workspaceId: string; name: string }) {
  return input.db.transaction(async (sql) => {
    const name = input.name.trim();
    if (name.length < 2) throw new Error("NAME_TOO_SHORT");
    const found = await sql.query<{ id: string; account_name: string | null }>(`with matched as (
        select payload->>'id' as id from orbit_records where workspace_id=$1 and collection_name='auth_users' and lifecycle_state='active'
          and position($2 in coalesce(payload->>'displayName',''))>0
        union select coalesce(payload->>'accountId',payload->>'id') from orbit_records where workspace_id=$1 and collection_name='profiles'
          and lifecycle_state<>'deleted' and (position($2 in coalesce(payload->>'displayName',''))>0 or position($2 in coalesce(payload->>'name',''))>0))
      select u.payload->>'id' as id, u.payload->>'displayName' as account_name from orbit_records u
      where u.workspace_id=$1 and u.collection_name='auth_users' and u.lifecycle_state='active'
        and u.payload->>'id' in (select id from matched where id is not null) order by u.created_at`, [input.workspaceId, name]);
    const candidates: NameCandidate[] = [];
    for (const row of found.rows) {
      const actorId = await actorFor(sql, input.workspaceId, row.id);
      candidates.push({ userId: row.id, actorId, accountName: row.account_name, profileName: actorId ? await profileName(sql, input.workspaceId, actorId) : null });
    }
    return { name, candidates };
  });
}

export type NameChangeResult =
  | { kind: "dry-run"; userId: string; actorId: string; from: string; to: string; accountNameMatches: boolean }
  | { kind: "changed"; userId: string; actorId: string; from: string; to: string; profileName: string | null; accountNameChanged: boolean };

export async function runControlledNameChange(input: {
  db: TransactionalPostgresClient; workspaceId: string; userId: string; from: string; to: string; apply: boolean;
}): Promise<NameChangeResult> {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!to || to.length > 80) throw new Error("NEW_NAME_INVALID");
  const checked = await input.db.transaction(async (sql) => {
    const auth = await sql.query<{ account_name: string | null }>(`select payload->>'displayName' as account_name from orbit_records
      where workspace_id=$1 and collection_name='auth_users' and lifecycle_state='active' and payload->>'id'=$2`, [input.workspaceId, input.userId]);
    if (auth.rows.length !== 1) throw new Error("TARGET_NOT_FOUND");
    const actorId = await actorFor(sql, input.workspaceId, input.userId);
    if (!actorId) throw new Error("TARGET_PROFILE_NOT_FOUND");
    const current = (await profileName(sql, input.workspaceId, actorId))?.trim() ?? "";
    if (current !== from) throw new Error("CURRENT_NAME_MISMATCH");
    return { actorId, accountNameMatches: (auth.rows[0]!.account_name ?? "").trim() === from };
  });
  if (!input.apply) return { kind: "dry-run", userId: input.userId, actorId: checked.actorId, from, to, accountNameMatches: checked.accountNameMatches };

  const service = createLiveProfileService({ provider: createConfiguredStorageProfileProvider() });
  const saved = await service.updateProfile({ displayName: to }, { actorId: checked.actorId });
  if (saved.success === false) throw new Error(`PROFILE_SAVE_FAILED:${saved.error.code}`);
  let accountNameChanged = false;
  if (checked.accountNameMatches) {
    const updated = await input.db.transaction((sql) => sql.query(`update orbit_records
        set payload=jsonb_set(payload,'{displayName}',to_jsonb($3::text)), updated_at=now()
      where workspace_id=$1 and collection_name='auth_users' and lifecycle_state='active' and payload->>'id'=$2
        and trim(coalesce(payload->>'displayName',''))=$4 returning record_id`, [input.workspaceId, input.userId, to, from]));
    accountNameChanged = updated.rows.length === 1;
  }
  const after = await input.db.transaction((sql) => profileName(sql, input.workspaceId, checked.actorId));
  return { kind: "changed", userId: input.userId, actorId: checked.actorId, from, to, profileName: after, accountNameChanged };
}
