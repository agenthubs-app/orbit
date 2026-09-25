import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createPostgresLiveRecordStore,type LiveRecordSqlClient} from '../../shared/storage/postgres-live-record-store';
import {createStorageFollowupTaskProvider} from '../../features/followups/storage/followup-live-record-provider';
import {createPostgresRelationshipScopeReader} from '../../shared/storage/relationship-read-scope';
import {relationshipTaskSummaries} from '../../features/connections/lifecycle/task-list';
import {createRelationshipTaskPageReader} from '../../features/connections/lifecycle/task-page';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL,at='2026-09-25T00:00:00.000Z',secret='local-only-key-'.repeat(4);
test('relationship task page matches the legacy list, enforces ownership before pagination and bounds growth', {skip:!url,timeout:120000},async()=>{
  assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname));assert.equal(address.search,'');
  const schema='relationship_task_page_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:1,options:`-c search_path=${schema} -c statement_timeout=60000`});
  const store=createPostgresLiveRecordStore({client:pool}),common={source:{type:'manual',id:'s'},evidenceIds:['e'],createdAt:at,updatedAt:at};
  const insert=async(collectionName:string,id:string,payload:Record<string,unknown>,userId:string|null='a')=>store.upsertRecord({workspaceId:'w',collectionName,recordId:id,userId,sourceType:'manual',sourceId:'s',evidenceIds:['e'],lifecycleState:'active',createdAt:at,updatedAt:at,payload:{...common,id,...payload}});
  let bytes=0,queries=0;
  const client:LiveRecordSqlClient={async query(text,values){const result=await pool.query(text,values as unknown[]);bytes+=Buffer.byteLength(JSON.stringify(result.rows));queries++;return result;}};
  try {
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await insert('contacts','c',{displayName:'Contact',stage:'active',privateNotes:'PRIVATE_NOTE'},'a');
    await insert('connections','cn',{accountId:'a',contactId:'c',stage:'active',summary:'PRIVATE_RELATIONSHIP'});
    const ids=['É','e','é','E','东京','東京','😀',...Array.from({length:95},(_,i)=>`task:${String(i).padStart(4,'0')}`)];
    for(const [i,id] of ids.entries())await insert('tasks',id,{title:`Task ${id}`,status:i%3?'open':'completed',connectionId:'cn',dueAt:i%5?at:null});
    await insert('tasks','no-connection',{title:'Hidden',status:'open',contactId:'c'});
    await insert('tasks','mismatch',{title:'Hidden',status:'open',connectionId:'cn',contactId:'wrong'});
    for(const [id,owner,accountId] of [['alias','b','a'],['unowned',null,'a'],['conflict','a','b']] as const)await insert('tasks',id,{title:'PRIVATE_FOREIGN',status:'open',connectionId:'cn',accountId},owner);
    const provider=createStorageFollowupTaskProvider({store,workspaceId:'w',scopeRecordReader:createPostgresRelationshipScopeReader({client:pool,workspaceId:'w',purpose:'followups'})});
    const expected=relationshipTaskSummaries(await provider.readFollowupGraph('a'),'a');
    const reader=createRelationshipTaskPageReader({client,workspaceId:'w',secret,now:()=>at});
    for(const mode of ['open','completed'] as const) {
      const actual=[];let cursor:string|undefined;
      do {
        const page=await reader.read('a',{mode,limit:20,cursor});
        assert.ok(page.items.length<=20);actual.push(...page.items);cursor=page.nextCursor??undefined;
        assert.equal(page.total,expected.filter(item=>mode==='open'?['open','scheduled'].includes(item.status):['completed','dismissed'].includes(item.status)).length);
      }while(cursor&&actual.length<200);
      assert.deepEqual(actual.map(item=>({taskId:item.taskId,connectionId:item.connectionId,contactId:item.contactId,contactName:item.contactNamePreview,title:item.titlePreview,status:item.status,dueAt:item.dueAt})),expected.filter(item=>mode==='open'?['open','scheduled'].includes(item.status):['completed','dismissed'].includes(item.status)));
    }
    const first=await reader.read('a',{mode:'open',limit:20}),cursor=first.nextCursor!;assert.ok(cursor);
    await assert.rejects(reader.read('b',{mode:'open',cursor}),/CURSOR/);
    await assert.rejects(reader.read('a',{mode:'completed',cursor}),/CURSOR/);
    await assert.rejects(reader.read('a',{mode:'open',cursor:cursor+'x'}),/CURSOR/);
    await assert.rejects(reader.read('a',{mode:'open',limit:51}),/INPUT/);
    assert.equal((await reader.read('b',{mode:'open'})).total,0);
    bytes=0;queries=0;await reader.read('a',{mode:'open'});const smallBytes=bytes;
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,created_at,updated_at,payload)
      select workspace_id,collection_name,'grown:'||n,user_id,source_type,source_id,evidence_ids,lifecycle_state,created_at,updated_at,
        payload||jsonb_build_object('id','grown:'||n,'title',repeat('large',1000),'dueAt','2099-01-01T00:00:00.000Z')
      from orbit_records cross join generate_series(1,10000)n where record_id='task:0001'`);
    bytes=0;queries=0;const large=await reader.read('a',{mode:'open'});
    assert.equal(queries,1);assert.ok(bytes<16000);assert.ok(!JSON.stringify(large).includes('PRIVATE'));
    console.info(JSON.stringify({metric:'relationship_task_page',smallBytes,largeBytes:bytes,total:large.total,queries}));
    await pool.query(`update orbit_records set user_id='b' where collection_name='contacts'`);
    assert.equal((await reader.read('a',{mode:'open',cursor})).total,0,'owned relationship cannot grant access to a foreign contact');
    await pool.query(`update orbit_records set user_id='a' where collection_name='contacts'`);
    await pool.query(`update orbit_records set user_id='b' where collection_name='connections'`);
    assert.equal((await reader.read('a',{mode:'open',cursor})).total,0);
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await pool.end();}
});
