import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createTransactionalPostgresClient,type TransactionalSqlExecutor} from '../../shared/storage/transactional-postgres';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createConfiguredReminderPlanService} from '../../features/notifications/reminder-plan-service-factory';
import {claimCanonicalReminderWakes,processCanonicalReminderWakeMessage,readCanonicalReminderProjectionSource,canonicalReminderDeliveryId} from '../../features/notifications/canonical-reminder-wake';
import {INBOX_PROJECTION_WORK_SCHEMA_SQL,createInboxProjectionWorkRepository} from '../../features/notifications/storage/inbox-projection-work';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL,at='2026-09-25T00:00:00.000Z';
test('one projection reads only its scoped authority fields regardless of unrelated history or payload size', {skip:!url,timeout:30000},async t=>{
  assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname));assert.equal(address.search,'');
  const schema='projection_cost_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:3,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000`});
  const client=createTransactionalPostgresClient({connectionString:url,pool}),workspaceId='w',actorId='owner',now=()=>at;
  const work=createInboxProjectionWorkRepository({client,workspaceId,now});
  const runtime={client,workspaceId,now,inboxProjection:work,publisher:{publish:async()=>{}}};
  let queries=0,bytes=0;
  const measured:TransactionalSqlExecutor={query:async(sql,values)=>{
    const result=await client.query(sql,values);queries++;bytes+=Buffer.byteLength(JSON.stringify(result.rows));return result as never;
  }};
  try{
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await createPostgresLiveRecordStore({client}).upsertRecord({workspaceId,collectionName:'tasks',recordId:'task',userId:actorId,sourceType:'manual',sourceId:'task',evidenceIds:[],lifecycleState:'active',createdAt:at,updatedAt:at,
      payload:{version:1,task:{id:'task',accountId:actorId,ownerUserId:actorId,title:'Task',status:'open',category:'work',priority:'normal',source:'manual',createdAt:at,updatedAt:at},activities:[]}});
    const service=createConfiguredReminderPlanService({runtime,now,publisher:runtime.publisher});
    const plan=await service.create({actorId,targetType:'task',targetId:'task',fireAt:at,timeZone:'UTC',channels:['in_app'],title:'Reminder',body:'Body',deepLink:'/app/tasks/task',createdBy:'user',idempotencyKey:'create'});
    const wake=(await claimCanonicalReminderWakes({runtime,workerId:'test',now:at})).messages[0]!;
    assert.equal((await processCanonicalReminderWakeMessage(wake,runtime)).outcome,'delivered');
    let source=(await work.claim())[0]!;assert.equal(source.sourceId,plan.id);
    let baseline=await readCanonicalReminderProjectionSource(measured,workspaceId,source);
    assert.ok(baseline);assert.equal(queries,2);
    // Millisecond timestamps are not unique revisions: a second delivery at
    // another fireAt in the same clock tick must supersede the old work.
    const oldSource=source;
    await service.reschedule({actorId,reminderId:plan.id,fireAt:'2026-09-24T23:59:00.000Z',timeZone:'UTC',expectedUpdatedAt:baseline.updatedAt,idempotencyKey:'reschedule'});
    const nextWake=(await claimCanonicalReminderWakes({runtime,workerId:'test-again',now:at})).messages[0]!;
    assert.equal((await processCanonicalReminderWakeMessage(nextWake,runtime)).outcome,'delivered');
    source=(await work.claim())[0]!;assert.ok(source,'a same-timestamp change must enqueue a new generation');
    assert.notEqual(source.sourceRevision,oldSource.sourceRevision);assert.equal(source.generation,'2');
    assert.equal(await work.complete(oldSource,async()=>{throw Error('stale worker');}),false);
    assert.equal(await readCanonicalReminderProjectionSource(measured,workspaceId,oldSource),null);
    queries=0;bytes=0;
    baseline=await readCanonicalReminderProjectionSource(measured,workspaceId,source);assert.ok(baseline);
    assert.equal(baseline.updatedAt,at);assert.equal(baseline.fireAt,'2026-09-24T23:59:00.000Z');
    const baselineBytes=bytes;
    // These fields are not used by the authoritative parsers or the notification.
    await pool.query(`update orbit_records set payload=payload||jsonb_build_object('unusedPrivateBody',repeat('p',1000000)) where collection_name in ('reminderPlans','notificationDeliveries')`);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,unusedHistory}',to_jsonb(repeat('h',1000000))) where collection_name in ('reminderPlans','notificationDeliveries')`);
    const full=await pool.query(`select payload from orbit_records where workspace_id=$1 and user_id=$2 and ((collection_name='reminderPlans' and record_id=$3) or (collection_name='notificationDeliveries' and record_id=$4))`,[workspaceId,actorId,plan.id,canonicalReminderDeliveryId(baseline)]);
    const fullBytes=Buffer.byteLength(JSON.stringify(full.rows));assert.ok(fullBytes>4000000);
    // Same-owner old sources must not get returned along with this one source.
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
      select 'w','reminderPlans','history:'||n,'owner','manual','history:'||n,'{}','active',jsonb_build_object('entity',jsonb_build_object('id','history:'||n,'status','delivered')),$1,$1 from generate_series(1,10000)n`,[at]);
    queries=0;bytes=0;
    assert.deepEqual(await readCanonicalReminderProjectionSource(measured,workspaceId,source),baseline);
    assert.equal(queries,2);assert.equal(bytes,baselineBytes);assert.ok(bytes<5000);
    t.diagnostic(JSON.stringify({fullSourcePayloadBytes:fullBytes,narrowSourceBytes:bytes,queries,unrelatedPlans:10000}));
    assert.equal(await readCanonicalReminderProjectionSource(measured,'other',source),null);
    assert.equal(await readCanonicalReminderProjectionSource(measured,workspaceId,{...source,actorId:'linked'}),null);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,accountId}','"linked"') where collection_name='reminderPlans' and record_id=$1`,[plan.id]);
    await assert.rejects(readCanonicalReminderProjectionSource(measured,workspaceId,source),/SOURCE_INVALID/);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,accountId}','"owner"') where collection_name='reminderPlans' and record_id=$1`,[plan.id]);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,channel}','"ios_push"') where collection_name='notificationDeliveries'`);
    await assert.rejects(readCanonicalReminderProjectionSource(measured,workspaceId,source),/SOURCE_INVALID/);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,channel}','"in_app"') where collection_name='notificationDeliveries'`);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,ownerUserId}','"linked"') where collection_name='notificationDeliveries'`);
    await assert.rejects(readCanonicalReminderProjectionSource(measured,workspaceId,source),/SOURCE_INVALID/);
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{entity,body}',to_jsonb(repeat('b',1000000))) where collection_name='reminderPlans' and record_id=$1`,[plan.id]);
    queries=0;bytes=0;
    await assert.rejects(readCanonicalReminderProjectionSource(measured,workspaceId,source),/SOURCE_INVALID/);
    assert.equal(queries,1);assert.ok(bytes<5000,'oversized relevant content is rejected in SQL, not transferred first');
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await client.close();}
});
