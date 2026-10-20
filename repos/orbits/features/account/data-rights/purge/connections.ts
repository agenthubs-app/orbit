import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

type Context = {
  db: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  userId: string;
  /** Must revoke the upstream grant and reject on failure. Test runs inject a fake. */
  revokeToken?: (sourceId: string, encryptedPayload: unknown) => Promise<void>;
};

export async function purgeAccountConnections({ db, workspaceId, actorId, userId, revokeToken }: Context): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId || !userId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  const tokens = await db.query<{ source_id: string; payload: unknown }>(`select source_id,payload from orbit_records
    where workspace_id=$1 and collection_name='integrationTokens' and user_id=$2 order by record_id`, [workspaceId, actorId]);
  if (tokens.rows.length && !revokeToken) throw new Error("TOKEN_REVOCATION_REQUIRED");
  for (const token of tokens.rows) await revokeToken!(token.source_id, token.payload);
  return db.transaction(async sql => {
    const result = await sql.query<{ count: string }>(`with removed as (delete from orbit_records
      where workspace_id=$1 and ((user_id=$2 and collection_name=any($4::text[])) or
      (collection_name='mobile_auth_exchanges' and payload->'user'->>'id'=$3)) returning 1)
      select count(*)::text as count from removed`, [workspaceId, actorId, userId,
      ["integrationTokens", "integrationOAuthStates", "integrationHealth", "pushDevices"]]);
    return { deleted: Number(result.rows[0]?.count ?? 0) };
  }, { isolation: "read committed" });
}
