import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

export async function purgeAccountExports(input: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  storage: { delete(actorId: string, key: string): Promise<void> };
}): Promise<{ deleted: number; objects: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(input.db);
  const { db, workspaceId, actorId, storage } = input;
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  const files = await db.query<{ file_key: string | null }>(`select distinct payload->>'fileKey' as file_key from orbit_records
    where workspace_id=$1 and collection_name='account_exports' and user_id=$2 and payload->>'fileKey' is not null
    order by file_key`, [workspaceId, actorId]);
  for (const row of files.rows) if (row.file_key) await storage.delete(actorId, row.file_key);
  const result = await db.transaction(async sql => sql.query<{ count: string }>(`with removed as (delete from orbit_records
    where workspace_id=$1 and user_id=$2 and
    (collection_name in ('account_exports','account_export_locks') or
     (collection_name='account_rights_outbox' and payload->>'kind'='export-ready')) returning 1)
    select count(*)::text as count from removed`, [workspaceId, actorId]), { isolation: "read committed" });
  return { deleted: Number(result.rows[0]?.count ?? 0), objects: files.rows.length };
}
