import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

type Context = { db: TransactionalPostgresClient; workspaceId: string; actorId: string; eraseObject: (key: string) => Promise<void> };

async function countDelete(sql: TransactionalSqlExecutor, statement: string, values: readonly unknown[]): Promise<number> {
  const result = await sql.query<{ removed: string }>(`with removed as (${statement} returning 1) select count(*)::text as removed from removed`, values);
  return Number(result.rows[0]?.removed ?? 0);
}

/** Deletes an actor's private contact data. The injected object eraser must be
 * idempotent and reject keys outside its private card-image roots. */
export async function purgeAccountContacts({ db, workspaceId, actorId, eraseObject }: Context): Promise<{ deleted: number; objects: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  const keys = await db.query<{ key: string }>(`select distinct key from (
    select i.derivative_object_key as key from bc_ingest_items i join bc_ingest_batches b
      on b.workspace_id=i.workspace_id and b.id=i.batch_id where b.workspace_id=$1 and b.actor_id=$2
    union all select r.object_key from bc_ingest_raw_uploads r where r.workspace_id=$1 and r.actor_id=$2
    union all select c.object_key from bc_ingest_cleanup_tasks c join bc_ingest_batches b
      on b.workspace_id=c.workspace_id and b.id=c.batch_id where b.workspace_id=$1 and b.actor_id=$2
    union all select o.payload->'item'->>'imagePath' from orbit_records o
      where o.workspace_id=$1 and o.user_id=$2 and o.collection_name='businessCardBatchItems'
  ) objects where key is not null and key<>'' order by key`, [workspaceId, actorId]);
  for (const { key } of keys.rows) {
    const shared = await db.query(`select 1 from (
      select i.derivative_object_key as key,b.actor_id from bc_ingest_items i join bc_ingest_batches b on b.workspace_id=i.workspace_id and b.id=i.batch_id where b.workspace_id=$1
      union all select object_key,actor_id from bc_ingest_raw_uploads where workspace_id=$1
      union all select o.payload->'item'->>'imagePath',o.user_id from orbit_records o where o.workspace_id=$1 and o.collection_name='businessCardBatchItems'
    ) refs where refs.key=$2 and refs.actor_id is distinct from $3 limit 1`, [workspaceId, key, actorId]);
    if (shared.rows.length) throw new Error("SHARED_CARD_IMAGE_KEY");
    await eraseObject(key);
  }
  const deleted = await db.transaction(async sql => {
    const params = [workspaceId, actorId];
    let total = 0;
    total += await countDelete(sql, `delete from bc_ingest_notifications where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from bc_ingest_cleanup_tasks c using bc_ingest_batches b
      where c.workspace_id=b.workspace_id and c.batch_id=b.id and b.workspace_id=$1 and b.actor_id=$2`, params);
    total += await countDelete(sql, `delete from bc_ingest_image_writes where workspace_id=$1 and object_key=any($2::text[])`, [workspaceId, keys.rows.map(row => row.key)]);
    total += await countDelete(sql, `delete from bc_ingest_items i using bc_ingest_batches b
      where i.workspace_id=b.workspace_id and i.batch_id=b.id and b.workspace_id=$1 and b.actor_id=$2`, params);
    total += await countDelete(sql, `delete from bc_ingest_batches where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from bc_ingest_raw_uploads where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from contact_import_rows r using contact_import_batches b
      where r.workspace_id=b.workspace_id and r.batch_id=b.id and b.workspace_id=$1 and b.actor_id=$2`, params);
    total += await countDelete(sql, `delete from contact_import_followups where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from contact_import_batches where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from contact_insights where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from invite_connections where workspace_id=$1 and (inviter_actor_id=$2 or redeemer_actor_id=$2)`, params);
    total += await countDelete(sql, `delete from invite_codes where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from network_analysis_jobs where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from network_analysis_snapshots where workspace_id=$1 and actor_id=$2`, params);
    total += await countDelete(sql, `delete from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=any($3::text[])`,
      [workspaceId, actorId, ["contacts", "contactDrafts", "connections", "contact_actor_links", "businessCardBatches", "businessCardBatchItems", "networkPeople", "personRelationshipEdges", "evidence"]]);
    return total;
  }, { isolation: "read committed" });
  return { deleted, objects: keys.rows.length };
}
