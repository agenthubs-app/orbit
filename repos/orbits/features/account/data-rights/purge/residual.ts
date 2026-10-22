import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { acquireSyncCommitOrderLock } from "../../../../features/sync/commit-order-lock";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

/** Records the final identity step deletes itself (it also checks them). */
const IDENTITY_COLLECTIONS = ["accounts", "profiles", "account_deletion_requests", "account_deletion_locks",
  "account_reauth_receipts", "account_rights_outbox", "account_purge_steps", "auth_users"];
/** Audit trails other accounts rely on: kept without the account's identity (owner cleared, payload reduced to its kind). */
const PSEUDONYMIZED_AUDITS = ["relationship_lifecycle_audits", "relationship_lifecycle_migration_audits"];
/** Dedicated tables keyed by the account (LF18 audit: written outside orbit_records and never swept). */
const ACTOR_TABLES: readonly { table: string; column: string }[] = [
  { table: "organizer_profiles", column: "owner_actor_id" },
  { table: "orbit_inbox_projection_work", column: "actor_id" },
  { table: "orbit_schedule_reminder_windows", column: "actor_id" },
  { table: "relationship_lifecycle_migration_receipts", column: "actor_id" },
];

async function count(sql: TransactionalSqlExecutor, statement: string, values: readonly unknown[]): Promise<number> {
  const result = await sql.query<{ count: string }>(`with touched as (${statement} returning 1) select count(*)::text as count from touched`, values);
  return Number(result.rows[0]?.count ?? 0);
}

async function exists(sql: TransactionalSqlExecutor, table: string): Promise<boolean> {
  return Boolean((await sql.query<{ found: string | null }>("select to_regclass($1)::text as found", [table])).rows[0]?.found);
}

/**
 * LF18: the last step before the identity. The domain steps cover what they know; this step removes every other
 * record the account owns, so a purge no longer stops at PURGE_RESIDUAL_RECORDS on the ~40 collections written with
 * the account as owner (profile mutations, language and home preferences, guide state, completion questions,
 * delivery reservations, push tokens, business-card import jobs, …) and does not leave the dedicated tables behind.
 */
export async function purgeAccountResidual(db: TransactionalPostgresClient, workspaceId: string, actorId: string, userId: string): Promise<{
  deleted: number; retainedPseudonymizedAuditRows: number;
}> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId || !userId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  return db.transaction(async (sql) => {
    await acquireSyncCommitOrderLock(sql);
    const owners = [...new Set([actorId, userId])];
    const retainedPseudonymizedAuditRows = await count(sql, `update orbit_records set user_id=null,
      payload=jsonb_build_object('pseudonymized', true, 'kind', payload->>'kind', 'at', payload->>'at'), updated_at=now()
      where workspace_id=$1 and collection_name=any($2::text[]) and user_id=any($3::text[])`, [workspaceId, PSEUDONYMIZED_AUDITS, owners]);
    let deleted = await count(sql, `delete from orbit_records where workspace_id=$1 and user_id=any($2::text[])
      and collection_name<>all($3::text[])`, [workspaceId, owners, IDENTITY_COLLECTIONS]);
    // Introduction requests carry the people only in the payload (no owner column).
    deleted += await count(sql, `delete from orbit_records where workspace_id=$1 and collection_name='matchmakingIntroductionRequests'
      and (payload->>'requesterActorId'=$2 or payload->>'targetActorId'=$2 or payload->>'organizerActorId'=$2)`, [workspaceId, actorId]);
    for (const { table, column } of ACTOR_TABLES) {
      if (await exists(sql, table)) deleted += await count(sql, `delete from ${table} where workspace_id=$1 and ${column}=$2`, [workspaceId, actorId]);
    }
    return { deleted, retainedPseudonymizedAuditRows };
  });
}
