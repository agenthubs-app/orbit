import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createTransactionalPostgresClient,type TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createConfiguredReminderPlanService} from '../../features/notifications/reminder-plan-service-factory';
import {claimCanonicalReminderWakes,processCanonicalReminderWakeMessage} from '../../features/notifications/canonical-reminder-wake';
import {dispatchActor,createConfiguredCanonicalReminderMaintenanceTask} from '../../features/notifications/configured-canonical-reminder-maintenance';
import {INBOX_PROJECTION_WORK_SCHEMA_SQL,createInboxProjectionWorkRepository} from '../../features/notifications/storage/inbox-projection-work';
import {runInboxProjectionPass} from '../../features/notifications/inbox-projection-worker';
import {createInboxRuntime} from '../../features/notifications/inbox-record-service-factory';
import {createNotificationInteractionService} from '../../features/notifications/interaction-service';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL,at='2026-09-25T00:00:00.000Z';
test('real wake and legacy dispatch enqueue atomically; projection retries independently without GET refresh', {skip:!url,timeout:30000},async()=>{
  assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname));assert.equal(address.search,'');
  const schema='canonical_inbox_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:4,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000`});
  const client=createTransactionalPostgresClient({connectionString:url,pool}),workspaceId='w';
  let clock=at;
  const now=()=>clock,store=createPostgresLiveRecordStore({client});
  const work=createInboxProjectionWorkRepository({client,workspaceId,now});
  const runtime={client,workspaceId,now,inboxProjection:work,publisher:{publish:async()=>{}}};
  const service=createConfiguredReminderPlanService({runtime,now,publisher:runtime.publisher});
  const pass=()=>runInboxProjectionPass({client,workspaceId,now,enabled:true});
  const rows=async(collection:string)=>store.listRecords({workspaceId,collectionName:collection,limit:'unbounded'});
  async function plan(actorId:string,body='Body'){
    const id='task:'+actorId;
    await store.upsertRecord({workspaceId,collectionName:'tasks',recordId:id,userId:actorId,sourceType:'manual',sourceId:id,evidenceIds:[],lifecycleState:'active',createdAt:at,updatedAt:at,payload:{version:1,task:{id,accountId:actorId,ownerUserId:actorId,title:'Task',status:'open',category:'work',priority:'normal',source:'manual',createdAt:at,updatedAt:at},activities:[]}});
    return service.create({actorId,targetType:'task',targetId:id,fireAt:at,timeZone:'UTC',channels:['in_app'],title:'Reminder '+actorId,body,deepLink:'/app/tasks/'+id,createdBy:'user',idempotencyKey:'create:'+actorId});
  }
  try{
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    const first=await plan('a');
    const claim=await claimCanonicalReminderWakes({runtime,workerId:'test',now:at});const message=claim.messages[0]!;
    // Producer failure rolls delivery, plan state and work back together.
    await assert.rejects(processCanonicalReminderWakeMessage(message,{...runtime,inboxProjection:{enqueue:async(tx,source)=>{await work.enqueue(tx,source);throw Error('queue failed');}}}),/queue failed/);
    assert.equal((await rows('notificationDeliveries')).length,0);assert.deepEqual(await work.claim(),[]);
    assert.equal((await processCanonicalReminderWakeMessage(message,runtime)).outcome,'delivered');
    assert.equal((await rows('notificationDeliveries')).length,1);assert.equal((await rows('inboxNotifications')).length,0);
    const disabled=await runInboxProjectionPass({...runtime,enabled:false});assert.equal(disabled.projectionClaimed,0);
    await createNotificationInteractionService({store,workspaceId,now}).set({actorId:'a',notificationId:first.id,state:'ignored'});
    const projected=await pass();assert.equal(projected.projectionCompleted,1);
    const inbox=createInboxRuntime({client,workspaceId,now});
    const firstList=await inbox.service.list('a',{history:true,limit:10});assert.equal(firstList.items.length,1);
    assert.equal(firstList.items[0]!.disposition,'dismissed');assert.equal(firstList.items[0]!.title,'Reminder a');
    assert.equal((await processCanonicalReminderWakeMessage(message,runtime)).outcome,'stale');assert.equal((await pass()).projectionClaimed,0);
    // Old dispatcher has the same durable enqueue, but no dependency on the UI writer.
    await plan('legacy');await dispatchActor(runtime,'legacy',at);assert.equal((await pass()).projectionCompleted,1);
    const legacy=await inbox.service.list('legacy',{limit:10});assert.equal(legacy.items.length,1);
    await inbox.service.action('legacy',legacy.items[0]!.id,{action:'dismiss',expectedRevision:legacy.items[0]!.revision,idempotencyKey:'dismiss'});
    // Format incompatible with typed inbox must not block an authoritative delivery.
    await plan('long','x'.repeat(5000));const longClaim=await claimCanonicalReminderWakes({runtime,workerId:'long',now:at});
    for(const m of longClaim.messages)await processCanonicalReminderWakeMessage(m,runtime);
    assert.equal((await rows('notificationDeliveries')).length,3);
    const failure=await pass();assert.equal(failure.projectionFailed,1);
    assert.equal((await pool.query("select state,error_code from orbit_inbox_projection_work where actor_id='long'")).rows[0].state,'failed');
    assert.equal((await inbox.service.list('long',{limit:10})).items.length,0);
    // A source revoked after enqueue is not resurrected by the projection worker.
    const revoked=await plan('revoked');const revokedClaim=await claimCanonicalReminderWakes({runtime,workerId:'revoke',now:at});
    for(const m of revokedClaim.messages)await processCanonicalReminderWakeMessage(m,runtime);
    await pool.query("update orbit_records set user_id='foreign' where workspace_id='w' and collection_name='reminderPlans' and record_id=$1",[revoked.id]);
    const skipped=await pass();assert.equal(skipped.projectionSkipped,1);assert.equal((await inbox.service.list('revoked',{limit:10})).items.length,0);
    // A failed typed write leaves its work retryable, not a falsely completed marker.
    await plan('retry');const retryClaim=await claimCanonicalReminderWakes({runtime,workerId:'retry',now:at});
    for(const m of retryClaim.messages)await processCanonicalReminderWakeMessage(m,runtime);
    let fail=true;
    const faulty:TransactionalPostgresClient={...client,transaction:operation=>client.transaction(tx=>operation({query:async(sql,values)=>{
      if(fail&&sql.trim().startsWith('insert into orbit_records')&&values?.includes('inboxNotifications')){fail=false;throw Error('write unavailable');}
      return tx.query(sql,values);
    }}))};
    assert.equal((await runInboxProjectionPass({client:faulty,workspaceId,now,enabled:true})).projectionFailed,1);
    assert.equal((await rows('inboxNotifications')).filter(row=>row.userId==='retry').length,0);
    clock='2026-09-25T00:01:00.000Z';assert.equal((await pass()).projectionCompleted,1);
    // Configured maintenance runs the consumer only behind the explicit gate.
    const task=createConfiguredCanonicalReminderMaintenanceTask({runtime,env:{ORBIT_CANONICAL_INBOX_PROJECTION:'1'}});
    const outcome=await task.run({now:()=>new Date(clock),deadline:Date.parse(clock)+10000} as never);
    assert.ok('projectionClaimed' in outcome);assert.equal(outcome.projectionClaimed,0);
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await client.close();}
});
