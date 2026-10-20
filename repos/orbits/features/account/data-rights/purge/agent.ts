import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

const BASE_COLLECTIONS = [
  "agent_entity_drafts", "agentActions", "aiAnalyses", "interactionMemories",
  "matchRecommendations", "recommendationTests", "orbit_agent_chat_groups",
  "orbit_agent_chat_requests", "orbit_agent_chat_session_organizations",
  "orbit_agent_chat_session_revisions", "conversations", "messages",
];

export async function purgeAccountAgentData(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  const personalSpaces = [`${workspaceId}:agent-actor:${actorId}`, `${workspaceId}:actor:${encodeURIComponent(actorId)}`];
  return db.transaction(async sql => {
    const result = await sql.query<{ count: string }>(`with removed as (
      delete from orbit_records where
      (workspace_id=any($3::text[])) or
      (workspace_id=$1 and user_id=$2 and collection_name=any($4::text[]))
      returning 1
    ) select count(*)::text as count from removed`, [workspaceId, actorId, personalSpaces, BASE_COLLECTIONS]);
    return { deleted: Number(result.rows[0]?.count ?? 0) };
  }, { isolation: "read committed" });
}
