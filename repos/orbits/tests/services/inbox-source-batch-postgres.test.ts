import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createInboxRuntime} from '../../features/notifications/inbox-record-service-factory';
import {createReadCostLedger} from '../performance/read-cost-ledger';
import type {InboxNotificationSource} from '../../shared/contract/inbox-notifications';
import {createInboxRecordService} from '../../features/notifications/inbox-record-service';
import {createPostgresInboxRecordRepository} from '../../features/notifications/storage/inbox-record-repository';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('batched source authorization matches individual checks without transferring business bodies', {skip:!url,timeout:60000}, async()=>{
  assert.ok(url);assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
  const schema='inbox_sources_'+randomUUID().replaceAll('-',''),workspaceId='source-test',at='2026-09-25T00:00:00.000Z';
  const admin=new Pool({connectionString:url,max:1});
  const pool=new Pool({connectionString:url,max:2,options:`-c search_path=${schema} -c statement_timeout=20000`});
  const ledger=createReadCostLedger(),client=createTransactionalPostgresClient({connectionString:url,pool,readMetrics:ledger.observer});
  const runtime=createInboxRuntime({client,workspaceId,now:()=>at});
  const sources:InboxNotificationSource[]=[];
  try {
    await admin.query(`create schema ${schema}`);await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const bodies:Record<string,unknown>[]=[
      {note:{status:'active',version:1}}, {task:{status:'completed',version:2}},
      {entity:{status:'cancelled',version:1}}, {batch:{status:'expired',version:1}},
      {status:'deleted',version:1}, {note:null,task:{status:'open',version:1}},
      {note:{version:null,updatedAt:at}}, {note:{version:0}}, {note:{version:false}},
      {note:{version:['1',null,'2']}}, {note:{version:{nested:true}}},
      {note:0,task:{status:'cancelled'}}, {note:false}, {note:[]}, {note:'text'},
      {note:{status:['deleted'],version:1}}, {note:{status:{nested:true},version:1}},
      {note:{updatedAt:null}}, {status:'open',accountId:'linked-account',version:1},
    ];
    for (const [i,body] of bodies.entries()) {
      const id=`source:${i}`;
      await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,created_at,updated_at,payload)
        values($1,'notes',$2,'actor','system','test','active',$3,$3,$4::jsonb)`,[workspaceId,id,at,JSON.stringify({...body,largeBody:'x'.repeat(100000)})]);
      sources.push({sourceKind:'note',sourceId:id,sourceRevision:i===6||i===17?at:'1',occurredAt:at,readAt:at});
    }
    sources.push({...sources[0]!,sourceId:'missing'}, {...sources[0]!,sourceRevision:'stale'},sources[0]!);
    const before=await ledger.measure('sources.individual',()=>Promise.all(sources.map(source=>runtime.sourceAccess('actor',source))));
    const batch=runtime.sourceAccessBatch;
    assert.equal(typeof batch,'function');
    const after=await ledger.measure('sources.batch',()=>batch('actor',sources));
    assert.deepEqual(after.result,before.result);
    assert.ok(after.cost.bytes<before.cost.bytes/100,JSON.stringify({before:before.cost,after:after.cost}));
    assert.deepEqual(await batch('other',sources),sources.map(()=>'unavailable'));
    assert.deepEqual(await batch('actor',[]),[]);
    const kinds={task:'tasks',schedule:'personal_schedule_items',contact:'contacts',goal:'profiles',batch:'businessCardBatches'} as const;
    for(const [sourceKind,collection] of Object.entries(kinds)) {
      await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,created_at,updated_at,payload)
        values($1,$2,'same-id','actor','system','test','active',$3,$3,'{"entity":{"version":1,"status":"open"}}')`,[workspaceId,collection,at]);
      const source={...sources[0]!,sourceKind:sourceKind as InboxNotificationSource['sourceKind'],sourceId:'same-id'};
      assert.deepEqual(await batch('actor',[source]),[await runtime.sourceAccess('actor',source)]);
    }
    // Unsupported legacy root encodings must keep the original parser, not be
    // interpreted as an ordinary JSON object by the projection.
    await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,created_at,updated_at,payload)
      values($1,'notes','encoded','actor','system','test','active',$2,$2,$3::jsonb)`,[workspaceId,at,JSON.stringify(JSON.stringify({note:{version:1}}))]);
    assert.deepEqual(await batch('actor',[{...sources[0]!,sourceId:'encoded'}]),['available']);
    const missing=Array.from({length:201},(_,i)=>({...sources[0]!,sourceId:`missing:${i}`}));
    const chunks=await ledger.measure('sources.chunks',()=>batch('actor',missing));
    assert.equal(chunks.cost.queries,3);assert.deepEqual(chunks.result,missing.map(()=>'unavailable'));
    for(const [i,source] of sources.entries())await runtime.service.upsert({actorId:'actor',semanticKey:`notification:${i}`,kind:'update',origin:'automation',title:'Update',reason:'Reason',occurredAt:at,sources:[source],target:{kind:'source',id:source.sourceId,href:'/notes/'+source.sourceId,status:'available'},actions:['read']});
    const original=createInboxRecordService({repository:createPostgresInboxRecordRepository({client,workspaceId}),sourceAccess:runtime.sourceAccess,now:()=>at,effects:{accept:async()=>'',snooze:async()=>{}}});
    const oldList=await ledger.measure('list.individual',()=>original.list('actor',{limit:5}));
    const newList=await ledger.measure('list.batch',()=>runtime.service.list('actor',{limit:5}));
    assert.deepEqual(newList.result,oldList.result);
    assert.ok(newList.cost.queries<oldList.cost.queries/2,JSON.stringify({oldList:oldList.cost,newList:newList.cost}));
    assert.ok(newList.cost.bytes<oldList.cost.bytes/10);
    await client.query(`update orbit_records set user_id='other' where record_id='source:0'`);
    assert.deepEqual(await batch('actor',[sources[0]!]),['unavailable']);
    await client.query(`update orbit_records set lifecycle_state='archived' where record_id='source:1'`);
    assert.deepEqual(await batch('actor',[sources[1]!]),['unavailable']);
    for(const query of [{limit:3},{limit:3,history:true},{limit:3,kind:'reminder' as const}]) {
      let cursor:string|undefined,count=0;
      do {
        assert.ok(++count<30);
        const request={...query,...(cursor?{cursor}:{})};
        const expected=await original.list('actor',request),actual=await runtime.service.list('actor',request);
        assert.deepEqual(actual,expected);cursor=actual.nextCursor??undefined;
      }while(cursor);
    }
    console.info(JSON.stringify({sourceCount:sources.length,individual:before.cost,batch:after.cost,oldList:oldList.cost,newList:newList.cost}));
  } finally {await client.close();await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();}
});
