import {createHash} from 'node:crypto';
import type {TransactionalPostgresClient,TransactionalSqlExecutor} from '../../shared/storage/transactional-postgres';
import {createDeliveryPolicyRepository,DeliveryPolicyConflict,deliveryPolicyId} from './delivery-policy-repository';
type Row={collection_name:string;record_id:string;payload:Record<string,unknown>;lifecycle_state:string;updated_at:string;provider:string|null;evidence_ids:string[]};
type Item={collection:string;legacyId:string;newId:string|null;action:'archive'|'suppress'|'preserve'|'blocked';reason:string;readState:string|null;sourceRevision:string;before:Row;after:Pick<Row,'payload'|'lifecycle_state'>};
type Batch={actorId:string;batchId:string;hash:string;state:'applied'|'rolled_back';generation:number;at:string;changes:Item[];mappings:Omit<Item,'before'|'after'>[];conflicts:string[];preserved:number};
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const collections=['notifications','notificationDeliveries','reminderPlans','notification_interactions'];
export function createNotificationCutoverMigration(input:{client:TransactionalPostgresClient;workspaceId:string;now?:()=>string}){
 const repository=createDeliveryPolicyRepository(input),now=input.now??(()=>new Date().toISOString());
 async function planWith(db:TransactionalSqlExecutor,actorId:string,lock=false){
  const rows=(await db.query<Row>(`select collection_name,record_id,payload,lifecycle_state,updated_at::text,provider,evidence_ids from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=any($3::text[]) and lifecycle_state<>'deleted' order by collection_name,record_id limit 5001 ${lock?'for update':''}`,[input.workspaceId,actorId,collections])).rows;
  if(rows.length>5000)throw new DeliveryPolicyConflict('Actor inventory exceeds the 5000-row transaction limit; partitioned migration required');
  const reads=new Map(rows.filter(r=>r.collection_name==='notification_interactions').map(r=>[r.payload.notificationId,String(r.payload.state)]));
  const items:Item[]=rows.map(row=>{
   const p=row.payload,d=p.delivery as Record<string,unknown>|undefined,e=p.entity as Record<string,unknown>|undefined;
   let action:Item['action']='preserve',reason='business_or_delivery_history';let next=p,lifecycle=row.lifecycle_state,newId:string|null=null;
   if(row.collection_name==='reminderPlans'){reason='explicit_user_plan';newId='inbox:'+hash([actorId,'reminder-plan:'+row.record_id]).slice(0,32);}
   if(row.collection_name==='notificationDeliveries'&&((d&&!d.policySource&&['processing','receipt_unknown'].includes(String(d.status)))||e?.status==='claimed')){action='blocked';reason='legacy_dispatch_in_flight_or_unknown';}
   else if(row.collection_name==='notificationDeliveries'&&d&&!d.policySource&&['scheduled','retry_scheduled'].includes(String(d.status))){action='suppress';reason=d.phase==='pre_event'?'replace_automatic_stages_with_30_minutes':'legacy_producer_retired';next={...p,delivery:{...d,status:'suppressed',suppressionReason:'notification_cutover',leaseOwner:undefined,leasedAt:undefined}};}
   else if(row.collection_name==='notifications'&&row.lifecycle_state==='active'&&((row.provider==='generated-relationship-fixtures')||(!row.evidence_ids?.length&&p.source&&typeof p.source==='object'&&(p.source as {type?:string}).type!=='agent_action')||/^(Review follow-up for |复核与.+的下一步)/.test(String(p.title??'')))){action='archive';reason='generic_or_unsupported_generated_notification';lifecycle='archived';}
   return {collection:row.collection_name,legacyId:row.record_id,newId,action,reason,readState:reads.get(row.record_id)??null,sourceRevision:row.updated_at,before:row,after:{payload:next,lifecycle_state:lifecycle}};
  });
  return {actorId,workspaceId:input.workspaceId,hash:hash(items),items,changes:items.filter(i=>i.action==='archive'||i.action==='suppress'),blocked:items.filter(i=>i.action==='blocked').map(i=>i.collection+':'+i.legacyId)};
 }
 const migration={
  plan:(actorId:string)=>planWith(input.client,actorId),
  async apply(actorId:string,batchId:string,expectedHash:string){return repository.tx(actorId,async db=>{
   const id=deliveryPolicyId(actorId,batchId),previous=await repository.get<Batch>(db,'notificationMigrationBatches',id);if(previous){if(previous.hash!==expectedHash)throw new DeliveryPolicyConflict('Batch hash differs');return previous;}
   const old=await repository.get<{enabled:boolean;generation:number}>(db,'notificationCutover',actorId);if(old?.enabled)throw new DeliveryPolicyConflict('Actor already cut over');
   const plan=await planWith(db,actorId,true);if(plan.hash!==expectedHash)throw new DeliveryPolicyConflict('Inventory changed; run dry-run again');if(plan.blocked.length)throw new DeliveryPolicyConflict('Reconcile active legacy deliveries before cutover: '+plan.blocked.join(','));
   for(const item of plan.changes)await db.query(`update orbit_records set payload=$1::jsonb,lifecycle_state=$2,updated_at=$3::timestamptz where workspace_id=$4 and user_id=$5 and collection_name=$6 and record_id=$7`,[JSON.stringify(item.after.payload),item.after.lifecycle_state,now(),input.workspaceId,actorId,item.collection,item.legacyId]);
   const result:Batch={actorId,batchId,hash:expectedHash,state:'applied',generation:(old?.generation??0)+1,at:now(),changes:plan.changes,mappings:plan.items.map(({before:_before,after:_after,...item})=>item),conflicts:[],preserved:plan.items.length-plan.changes.length};
   await repository.save(db,'notificationCutover',actorId,actorId,{enabled:true,legacyBlocked:true,generation:result.generation,since:result.at,batchId});await repository.save(db,'notificationMigrationBatches',id,actorId,result);return result;
  });},
  async rollback(actorId:string,batchId:string){return repository.tx(actorId,async db=>{
   const id=deliveryPolicyId(actorId,batchId),batch=await repository.get<Batch>(db,'notificationMigrationBatches',id);if(!batch||batch.actorId!==actorId)throw new DeliveryPolicyConflict('Batch not found');if(batch.state==='rolled_back')return batch;
   const state=await repository.get<{batchId:string;generation:number}>(db,'notificationCutover',actorId);if(state?.batchId!==batchId||state.generation!==batch.generation)throw new DeliveryPolicyConflict('A later cutover owns this actor');
   const conflicts:string[]=[];
   for(const item of batch.changes){const found=(await db.query<{payload:Record<string,unknown>;lifecycle_state:string}>(`select payload,lifecycle_state from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=$3 and record_id=$4 for update`,[input.workspaceId,actorId,item.collection,item.legacyId])).rows[0];
    // Compare in PostgreSQL: jsonb key order and omitted undefined fields are immaterial.
    const unchanged=found&&(await db.query<{same:boolean}>('select $1::jsonb=$2::jsonb as same',[JSON.stringify(found),JSON.stringify(item.after)])).rows[0]?.same;
    if(!unchanged){conflicts.push(item.collection+':'+item.legacyId);continue;}
    // Retired automatic intentions never regain send eligibility on rollback.
    if(item.action==='suppress')continue;
    await db.query(`update orbit_records set payload=$1::jsonb,lifecycle_state=$2,updated_at=$3::timestamptz where workspace_id=$4 and user_id=$5 and collection_name=$6 and record_id=$7`,[JSON.stringify(item.before.payload),item.before.lifecycle_state,now(),input.workspaceId,actorId,item.collection,item.legacyId]);
   }
   await db.query(`update orbit_records set payload=jsonb_set(payload,'{delivery,status}','"suppressed"'::jsonb),updated_at=$3::timestamptz where workspace_id=$1 and user_id=$2 and collection_name='notificationDeliveries' and payload->'delivery'->'policySource' is not null and payload->'delivery'->>'status' in ('scheduled','retry_scheduled')`,[input.workspaceId,actorId,now()]);
   const result:Batch={...batch,state:'rolled_back',conflicts};await repository.save(db,'notificationCutover',actorId,actorId,{enabled:false,legacyBlocked:true,generation:batch.generation+1,since:now(),batchId});await repository.save(db,'notificationMigrationBatches',id,actorId,result);return result;
  });},
 };return migration;
}
