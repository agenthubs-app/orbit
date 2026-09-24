import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createInboxRecordService,InboxRecordError} from '../../features/notifications/inbox-record-service';
import {createPostgresInboxRecordRepository} from '../../features/notifications/storage/inbox-record-repository';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createReadCostLedger} from './read-cost-ledger';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('typed pages and global unread agree with original semantics without reading historical receipts', {skip:!url,timeout:60000},async()=>{
  assert.ok(url);assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
  const schema='inbox_cost_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:url,max:1});
  const pool=new Pool({connectionString:url,max:2,options:`-c search_path=${schema} -c statement_timeout=20000`});
  const ledger=createReadCostLedger(),client=createTransactionalPostgresClient({connectionString:url,pool,readMetrics:ledger.observer});
  const workspaceId='inbox-test',now='2026-09-25T00:00:00.000Z';
  const repository=createPostgresInboxRecordRepository({client,workspaceId});
  let checks=0;
  const access=async(_actor:string,source:{sourceId:string})=>{checks++;return source.sourceId==='gone'?'unavailable' as const:source.sourceId==='changed'?'changed' as const:'available' as const;};
  const options={now:()=>now,sourceAccess:access,effects:{accept:async()=>'',snooze:async()=>{}}};
  const service=createInboxRecordService({...options,repository});
  const original=createInboxRecordService({...options,repository:{transaction:repository.transaction,page:repository.page}});
  try {
    await admin.query(`create schema ${schema}`);await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const base={actorId:'a',semanticKey:'base',kind:'reminder' as const,origin:'user' as const,title:'Reminder',reason:'Reason',occurredAt:now,dueAt:now,
      sources:[{sourceKind:'task' as const,sourceId:'source',sourceRevision:'1',occurredAt:now,readAt:now,excerpt:'x'.repeat(2000)}],
      target:{kind:'task' as const,id:'source',href:'/tasks/source',status:'available' as const},actions:['read'] as const};
    for(let i=0;i<12;i++)await service.upsert({...base,semanticKey:`n:${i}`,kind:i%2?'update':'reminder',
      ...(i===1?{readAt:now}:{}),...(i===2?{scheduledFor:'2026-10-01T00:00:00Z'}:{}),
      ...(i===3?{expiresAt:'2026-09-01T00:00:00Z'}:{}),...(i===4?{disposition:'dismissed' as const}:{}),
      ...(i===5?{occurredAt:'2026-01-01T00:00:00.000Z'}:{}),
      ...(i===6||i===7?{sources:[{...base.sources[0]!,sourceId:i===6?'gone':'changed'}]}:{})});
    for(const query of [{limit:2},{limit:2,history:true},{limit:2,kind:'update' as const},{limit:50}]) {
      let cursor:string|undefined,pages=0;
      do {
        assert.ok(++pages<20,`Cursor must advance: ${JSON.stringify(query)} ${cursor}`);
        const request={...query,...(cursor?{cursor}:{})};
        const expected=await original.list('a',request),actual=await service.list('a',request);
        assert.deepEqual(actual,expected);cursor=actual.nextCursor??undefined;
      }while(cursor);
    }
    assert.equal((await service.list('other',{})).unreadCount,0);
    const before=await ledger.measure('typed.before',()=>service.list('a',{limit:2}));
    // Completed history + large idempotency receipts must not become poll egress.
    await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,occurred_at,created_at,updated_at,payload)
      select $1,'inboxNotifications','history:'||n,'a','system','test','active','2025-01-01T00:00:00Z'::timestamptz,now(),now(),
        jsonb_build_object('notification',$2::jsonb||jsonb_build_object('id','history:'||n,'semanticKey','history:'||n,'occurredAt','2025-01-01T00:00:00.000Z','updatedAt',$3::text,'disposition','handled','readAt',$3::text),
        'operations',jsonb_build_object('hugeReceipt',repeat('x',10000))) from generate_series(1,1000)n`,[workspaceId,JSON.stringify(base),now]);
    checks=0;const after=await ledger.measure('typed.after',()=>service.list('a',{limit:2}));
    assert.deepEqual(after.result,before.result);assert.deepEqual(after.cost,before.cost);
    assert.ok(checks<20,'source checks exclude handled/read history');
    const old=await ledger.measure('typed.original',()=>original.list('a',{limit:2}));
    assert.deepEqual(old.result,after.result);assert.ok(old.cost.bytes>after.cost.bytes*100);
    console.info(JSON.stringify({before:before.cost,after:after.cost,original:old.cost}));
    // Corrupt history still fails closed even when the requested page is full.
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{notification,title}','""') where record_id='history:1'`);
    await assert.rejects(service.list('a',{limit:2}),e=>e instanceof InboxRecordError&&e.code==='INTEGRITY_VIOLATION');
  }finally{await client.close();await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();}
});
