import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {Pool} from 'pg';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createInboxRuntime} from '../../features/notifications/inbox-record-service-factory';
import {createNoteService} from '../../features/notes/service';import {createNoteRepository} from '../../features/notes/repository';
import {createTaskService} from '../../features/tasks/service';import {createTaskRepository} from '../../features/tasks/repository';
import {createReminderPlanRepository} from '../../features/notifications/reminder-plan-repository';import {createReminderPlanService} from '../../features/notifications/reminder-plan-service';
import {reminderPlanNotification} from '../../features/notifications/inbox-business-projections';
const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('PostgreSQL reopen, concurrent accept, source invalidation, read and snooze share authoritative transactions',{skip:!url},async()=>{
 assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname),'local test database required');assert.equal(address.search,'');
 const workspaceId='workspace:qa:inbox:'+randomUUID(),at='2026-09-16T02:00:00.000Z';
 const schema='inbox_transactions_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url,max:1});
 const clients=[0,1].map(()=>createTransactionalPostgresClient({connectionString:url,pool:new Pool({connectionString:url,max:2,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000`})}));
 const runtimes=clients.map(client=>createInboxRuntime({client,workspaceId,now:()=>at}));
 const store=createPostgresLiveRecordStore({client:clients[0]!});
 try {
  await admin.query(`create schema ${schema}`);await clients[0]!.query(ORBIT_RECORDS_SCHEMA_SQL);
  const notes=createNoteService({repository:createNoteRepository({store,workspaceId})});const note=await notes.create({actorId:'a',body:'答应发送报价资料',idempotencyKey:'n',now:at});
  const n=await runtimes[0]!.service.upsert({actorId:'a',semanticKey:'promise:quote',kind:'suggestion',origin:'automation',title:'发送报价资料',reason:'会议中答应发送资料',occurredAt:at,sources:[{sourceKind:'note',sourceId:note.id,sourceRevision:String(note.version),occurredAt:at,readAt:at,excerpt:note.body}],target:{kind:'source',id:note.id,href:'/notes/'+encodeURIComponent(note.id),status:'available'},actions:['read','accept','dismiss']});
  assert.equal((await runtimes[1]!.service.get('a',n.id)).id,n.id);
  await assert.rejects(runtimes[1]!.service.get('b',n.id),/not found/i);
  const request={action:'accept' as const,expectedRevision:1,idempotencyKey:'accept'};
  const accepted=await Promise.all(runtimes.map(r=>r.service.action('a',n.id,request)));
  assert.equal(accepted[0]!.createdTaskId,accepted[1]!.createdTaskId);
  const tasks=createTaskService({repository:createTaskRepository({store,workspaceId,transactionClient:clients[0]})});assert.equal((await tasks.list({actorId:'a'})).length,1);
  const plan=await createReminderPlanService({now:()=>at,repository:createReminderPlanRepository({store,workspaceId})}).create({actorId:'a',targetType:'task',targetId:accepted[0]!.createdTaskId!,fireAt:at,timeZone:'Asia/Tokyo',channels:['in_app'],title:'报价资料',body:'用户设置提醒',deepLink:'/tasks/'+encodeURIComponent(accepted[0]!.createdTaskId!),createdBy:'user',idempotencyKey:'r'});
  const r=await runtimes[0]!.service.upsert(reminderPlanNotification(plan,at)!);
  await runtimes[1]!.service.action('a',r.id,{action:'read',expectedRevision:1,idempotencyKey:'read'});
  await runtimes[0]!.service.action('a',r.id,{action:'snooze',expectedRevision:2,idempotencyKey:'snooze',scheduledFor:'2026-09-17T00:00:00.000Z'});
  const reopened=await runtimes[1]!.service.get('a',r.id);assert.equal(reopened.disposition,'open');assert.equal(reopened.scheduledFor,'2026-09-17T00:00:00.000Z');assert.equal(reopened.target.status,'available');
  assert.equal((await tasks.list({actorId:'a'}))[0]?.status,'open');
  await notes.update({actorId:'a',noteId:note.id,body:'新的内容',expectedVersion:1,idempotencyKey:'edit',now:at});
  const stale=await runtimes[0]!.service.get('a',n.id);assert.equal(stale.target.status,'changed');assert.equal(stale.sources[0]?.excerpt,undefined);
 } finally {await Promise.all(clients.map(c=>c.close()));try{await admin.query(`drop schema if exists ${schema} cascade`);}finally{await admin.end();}}
});
