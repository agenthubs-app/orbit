import type { TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeTarget } from "./local-gate";

// Child rows precede parents because some plan FKs intentionally do not cascade.
const PLAN_TABLES = [
  "plan_match_candidates", "plan_match_job_contacts", "plan_match_jobs",
  "plan_commands", "plan_flow_commands", "plan_drafts", "plan_revisions",
  "plan_log", "plan_items", "plan_intakes", "plans", "ai_usage_ledger",
] as const;

export async function purgeAccountPlans(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string): Promise<{ deleted: number; tables: Record<string, number> }> {
  assertLocalAccountPurgeTarget();
  const tables: Record<string, number> = {};
  let deleted = 0;
  const calls = await sql.query<{ removed: string }>(`with removed as (delete from ai_usage_calls c using ai_usage_ledger l
    where c.workspace_id=l.workspace_id and c.operation_id=l.id and l.workspace_id=$1 and l.actor_id=$2 returning 1)
    select count(*)::text as removed from removed`, [workspaceId, actorId]);
  tables.ai_usage_calls = Number(calls.rows[0]?.removed ?? 0);
  deleted += tables.ai_usage_calls;
  for (const table of PLAN_TABLES) {
    const result = await sql.query<{ removed: string }>(`with removed as (delete from ${table} where workspace_id=$1 and actor_id=$2 returning 1)
      select count(*)::text as removed from removed`, [workspaceId, actorId]);
    const count = Number(result.rows[0]?.removed ?? 0);
    tables[table] = count;
    deleted += count;
  }
  return { deleted, tables };
}
