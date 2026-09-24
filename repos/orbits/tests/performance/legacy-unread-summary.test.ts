import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {readLegacyNotificationUnreadSummary} from '../../features/notifications/legacy-unread-summary';
import {createStorageReminderScheduleNotificationProvider} from '../../features/notifications/storage/reminder-notification-live-record-provider';
import {createNotificationInteractionService} from '../../features/notifications/interaction-service';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createReadCostLedger} from './read-cost-ledger';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('legacy badge preserves decoded candidates and read/ignored semantics with one row egress',{skip:!url,timeout:60000},async()=>{
  assert.ok(url);assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
  const schema='legacy_count_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:url,max:1}),pool=new Pool({connectionString:url,max:2,options:`-c search_path=${schema} -c statement_timeout=20000`});
  const ledger=createReadCostLedger(),client=createTransactionalPostgresClient({connectionString:url,pool,readMetrics:ledger.observer});
  const store=createPostgresLiveRecordStore({client}),workspaceId='test',actorId='a',now='2026-09-25T00:00:00Z';
  const interactions=createNotificationInteractionService({store,workspaceId,now:()=>now});
  const count=()=>readLegacyNotificationUnreadSummary({client,workspaceId,actorId,now:()=>now});
  try {
    await admin.query(`create schema ${schema}`);await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const base={channel:'in_app',title:'Title',body:'Body',status:'pending',source:{type:'system',id:'s'},evidenceIds:['e'],createdAt:now};
    const patches=[{}, {}, {}, {title:''},{body:42},{title:'\t\ufeff'}, {evidenceIds:[false,'e']},{source:{id:'s',type:'bad'}},{evidenceIds:[]}];
    for(const [n,patch] of patches.entries()) await store.upsertRecord({workspaceId,collectionName:'notifications',recordId:'n:'+n,userId:actorId,sourceType:'system',sourceId:'s',evidenceIds:[],lifecycleState:'active',createdAt:now,updatedAt:now,payload:{...base,id:'n:'+n,...patch}});
    await interactions.set({actorId,notificationId:'n:0',state:'read'});
    await interactions.set({actorId,notificationId:'n:1',state:'ignored'});
    const graph=await createStorageReminderScheduleNotificationProvider({store,workspaceId}).readReminderNotificationGraph(actorId);
    const states=await interactions.list(actorId,graph.notifications.map(n=>n.id));
    assert.equal((await count()).unreadTotal,graph.notifications.filter(n=>!states[n.id]).length);
    assert.equal((await count()).unreadTotal,2);
    for(const status of ['delivered','failed','scheduled','cancelled'])await store.upsertRecord({workspaceId,collectionName:'reminderPlans',recordId:status,userId:actorId,sourceType:'system',sourceId:'s',evidenceIds:[],lifecycleState:'active',createdAt:now,updatedAt:now,payload:{entity:{id:status,status}}});
    assert.equal((await count()).unreadTotal,4);
    await interactions.set({actorId,notificationId:'delivered',state:'ignored'});
    assert.equal((await count()).unreadTotal,3);
    assert.equal((await readLegacyNotificationUnreadSummary({client,workspaceId,actorId:'other'})).unreadTotal,0);
    const before=await ledger.measure('legacy.badge.before',count);
    await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select $1,'notifications','foreign:'||n,'foreign','system','s',$2::jsonb||jsonb_build_object('id','foreign:'||n,'body',repeat('x',10000)),now(),now() from generate_series(1,1000)n`,[workspaceId,JSON.stringify(base)]);
    const after=await ledger.measure('legacy.badge.after',count);
    assert.deepEqual(before,after);assert.equal(after.cost.queries,1);assert.equal(after.cost.rows,1);assert.ok(after.cost.bytes<100);
    // Duplicate legacy/canonical IDs: the old App deliberately drops ambiguous
    // read actions, but server-side ignored interactions still remove both.
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{entity,id}','"n:0"') where collection_name='reminderPlans' and record_id='failed'`);
    assert.equal((await count()).unreadTotal,4);
    await interactions.set({actorId,notificationId:'n:0',state:'ignored'});assert.equal((await count()).unreadTotal,2);
  }finally{await client.close();await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();}
});
