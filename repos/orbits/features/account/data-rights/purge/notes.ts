import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeTarget } from "./local-gate";

const PERSONAL_COLLECTIONS = ["notes", "memo_extractions", "tasks", "task_mutations", "personal_schedule_items",
  "personal_schedule_mutations", "personal_schedule_occurrence_exceptions", "reminderPlans", "meetings"];

async function remove(sql: TransactionalSqlExecutor, statement: string, values: readonly unknown[]): Promise<number> {
  const result = await sql.query<{ count: string }>(`with removed as (${statement} returning 1) select count(*)::text as count from removed`, values);
  return Number(result.rows[0]?.count ?? 0);
}

export async function purgeAccountNotes(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  return db.transaction(async sql => {
    // The current appointment schema requires both account IDs. Keeping the
    // other participant's appointment needs an explicit product/schema rule.
    const shared = await sql.query(`select 1 from appointment_aggregates where workspace_id=$1
      and (owner_actor_id=$2 or invitee_actor_id=$2)
      and (owner_actor_id<>$2 or invitee_actor_id<>$2) limit 1`, [workspaceId, actorId]);
    if (shared.rows.length) throw new Error("SHARED_APPOINTMENT_REQUIRES_DECISION");
    const params = [workspaceId, actorId];
    let deleted = 0;
    deleted += await remove(sql, `delete from appointment_outbox o using appointment_aggregates a
      where o.workspace_id=a.workspace_id and o.appointment_id=a.appointment_id
      and a.workspace_id=$1 and a.owner_actor_id=$2 and a.invitee_actor_id=$2`, params);
    deleted += await remove(sql, `delete from appointment_command_receipts where workspace_id=$1 and actor_id=$2`, params);
    deleted += await remove(sql, `delete from appointment_aggregates where workspace_id=$1 and owner_actor_id=$2 and invitee_actor_id=$2`, params);
    deleted += await remove(sql, `delete from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=any($3::text[])`,
      [workspaceId, actorId, PERSONAL_COLLECTIONS]);
    return { deleted };
  }, { isolation: "read committed" });
}
