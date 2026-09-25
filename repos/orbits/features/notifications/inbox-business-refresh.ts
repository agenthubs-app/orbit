import type { TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import type { InboxRecordService } from './inbox-record-service';
import type { BusinessCardBatchContract } from '../../shared/contract/business-card-batch';
import { batchResultNotification } from './inbox-business-projections';

// Explicit historical backfill only. Live business-card writes project their
// own notification; request and delivery paths must never call this scan.
export async function backfillBusinessCardInboxRecords(input:{actorId:string;client:TransactionalPostgresClient;workspaceId:string;service:InboxRecordService;since:string}) {
  let before='';let projected=0;
  while(true) {
    const page=await input.client.query<{record_id:string;collection_name:string;payload:Record<string,unknown>}>(`select record_id,collection_name,payload from orbit_records where workspace_id=$1 and user_id=$2 and lifecycle_state='active'
      and collection_name='businessCardBatches' and record_id>$3 order by record_id limit 50`,[input.workspaceId,input.actorId,before]);
    for(const row of page.rows) {
      const b=row.payload.batch as BusinessCardBatchContract;
      if(!b||b.actorId!==input.actorId||b.updatedAt<input.since)continue;
      const n=batchResultNotification({actorId:input.actorId,batchId:b.id,revision:b.updatedAt,occurredAt:b.updatedAt,count:b.totalItems,status:b.status,pipeline:'v1'});
      if(n){await input.service.upsert(n);projected++;}
    }
    if(page.rows.length<50)break;before=page.rows.at(-1)!.record_id;
  }
  const tables=await input.client.query<{batches:string|null}>("select to_regclass('bc_ingest_batches')::text as batches");
  if(tables.rows[0]?.batches) {
    let after='';
    while(true) {
      const page=await input.client.query<{id:string;version:string;status:string;expected_items:number;updated_at:Date}>(`select id,version,status,expected_items,updated_at from bc_ingest_batches where workspace_id=$1 and actor_id=$2 and updated_at >= $3::timestamptz and id>$4 order by id limit 50`,[input.workspaceId,input.actorId,input.since,after]);
      for(const b of page.rows){const n=batchResultNotification({actorId:input.actorId,batchId:b.id,revision:String(b.version),occurredAt:b.updated_at.toISOString(),count:b.expected_items,status:b.status,pipeline:'v2'});if(n){await input.service.upsert(n);projected++;}}
      if(page.rows.length<50)break;after=page.rows.at(-1)!.id;
    }
  }
  return {projected,batchV2Storage:!!tables.rows[0]?.batches};
}
