import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createTransactionalPostgresClient,type TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createDeliveryPolicyRepository} from '../../features/notifications/delivery-policy-repository';
import {createTypedDeliveryRuntime} from '../../features/notifications/typed-delivery-factory';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL,at='2026-09-25T01:00:00.000Z';
test('typed delivery materialization reads 50 narrow message references without changing paging or dedupe', {skip:!url,timeout:30000},async t=>{
  assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname));assert.equal(address.search,'');
  const schema='message_materialize_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:3,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000`});
  const client=createTransactionalPostgresClient({connectionString:url,pool}),workspaceId='w',actorId='a',now=()=>at;
  const repository=createDeliveryPolicyRepository({client,workspaceId,now});
  const pages:{bytes:number;rows:unknown[]}[]=[];
  const measured:TransactionalPostgresClient={...client,query:async(sql,values)=>{
    const result=await client.query(sql,values);
    if(sql.includes("m.collection_name='relationship_communication_messages'"))pages.push({bytes:Buffer.byteLength(JSON.stringify(result.rows)),rows:[...result.rows]});
    return result as never;
  }};
  const devices={listActive:async()=>[{deviceId:'local-fixture',token:'not-a-provider-token',platform:'ios' as const,permission:'granted' as const,active:true,registeredAt:at,updatedAt:at}],revoke:async()=>null,register:async()=>{throw Error('unused');}};
  const runtime=createTypedDeliveryRuntime({client:measured,workspaceId,actorId,now,devices,push:null});
  try{
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await repository.tx(actorId,async tx=>{
      await repository.save(tx,'notificationCutover',actorId,actorId,{enabled:true,generation:1,since:'2026-09-25T00:00:00.000Z',batchId:'test'});
      await repository.save(tx,'relationship_communication_conversations','conversation',actorId,{conversationId:'conversation',participantAccountIds:['a','b']});
    });
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
      select 'w','relationship_communication_messages','m:'||lpad(n::text,3,'0'),'b','manual','fixture','{}','active',
        jsonb_build_object('messageId','m:'||lpad(n::text,3,'0'),'conversationId','conversation','senderAccountId','b','sentAt',$1::text,'body',repeat('x',100000),'unusedPrivateHistory',repeat('h',100000)),$1::timestamptz,$1::timestamptz from generate_series(1,65)n`,[at]);
    // Existing candidate filters continue to exclude own and unrelated messages.
    await repository.tx(actorId,async tx=>{
      await repository.save(tx,'relationship_communication_messages','own',actorId,{messageId:'own',conversationId:'conversation',senderAccountId:'a',sentAt:at,body:'own'});
      await repository.save(tx,'relationship_communication_messages','foreign','b',{messageId:'foreign',conversationId:'not-member',senderAccountId:'b',sentAt:at,body:'private'});
    });
    const full=(await pool.query(`select payload from orbit_records where workspace_id='w' and collection_name='relationship_communication_messages' and record_id like 'm:%' order by record_id limit 50`)).rows;
    const fullBytes=Buffer.byteLength(JSON.stringify(full));assert.ok(fullBytes>10000000);
    assert.deepEqual(await runtime.materialize(),{notifications:0,messages:50});
    assert.equal(pages.length,1);assert.equal(pages[0]!.rows.length,50);assert.ok(pages[0]!.bytes<10000,'candidate reads must not transfer message bodies');
    assert.deepEqual(pages[0]!.rows,full.map(({payload:m})=>({payload:{messageId:m.messageId,conversationId:m.conversationId,sentAt:m.sentAt}})));
    assert.deepEqual((await repository.get<{messages:unknown}>(client,'notificationDeliveryCursor',actorId))?.messages,{at,id:'m:050'});
    assert.deepEqual(await runtime.materialize(),{notifications:0,messages:15});assert.equal(pages[1]!.rows.length,15);
    assert.deepEqual((await repository.get<{messages:unknown}>(client,'notificationDeliveryCursor',actorId))?.messages,{at:'2026-09-25T00:00:00.000Z',id:''});
    // The old replay policy remains; this optimization does not claim a reliable incremental cursor.
    assert.deepEqual(await runtime.materialize(),{notifications:0,messages:50});
    const deliveries=await runtime.ledger.list({limit:100});assert.equal(deliveries.length,65);
    assert.ok(deliveries.every(d=>d.status==='scheduled'&&d.body==='Message'&&d.policySource?.kind==='message'));
    t.diagnostic(JSON.stringify({fullCandidateBytes:fullBytes,narrowCandidateBytes:pages[0]!.bytes,candidateRows:50,uniqueDeliveries:deliveries.length}));
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await client.close();}
});
