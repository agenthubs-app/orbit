import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createTransactionalPostgresClient,type TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {ORBIT_RECORDS_SCHEMA_SQL,runOrbitRecordsMigration} from '../../shared/storage/migrations';
import {SYNC_COMMIT_ORDER_LOCK_SQL} from '../../features/sync/commit-order-lock';
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
    if(sql.includes("join relationship_messages m"))pages.push({bytes:Buffer.byteLength(JSON.stringify(result.rows)),rows:[...result.rows]});
    return result as never;
  }};
  const devices={listActive:async()=>[{deviceId:'local-fixture',token:'not-a-provider-token',platform:'ios' as const,permission:'granted' as const,active:true,registeredAt:at,updatedAt:at}],revoke:async()=>null,register:async()=>{throw Error('unused');}};
  const runtime=createTypedDeliveryRuntime({client:measured,workspaceId,actorId,now,devices,push:null});
  try{
    await pool.query(`create schema ${schema}`);await runOrbitRecordsMigration(client);
    await repository.tx(actorId,async tx=>{
      await repository.save(tx,'notificationCutover',actorId,actorId,{enabled:true,generation:1,since:'2026-09-25T00:00:00.000Z',batchId:'test'});
    });
    // Sprint 0109: a's conversation with b in the message tables, 65 large messages from b,
    // one own message, and a conversation a is not a member of.
    await client.transaction(async tx=>{
      await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
      await tx.query(`insert into relationship_conversations(workspace_id,conversation_id,inviter_account_id,invitee_account_id,inviter_contact_id,status,qualification_version,last_message_seq,last_message_at,created_at,updated_at)
        values ('w','conversation','a','b','c','active','q',66,$1,$1,$1),('w','not-member','b','z','c','active','q',1,$1,$1,$1)`,[at]);
      await tx.query(`insert into relationship_conversation_members(workspace_id,conversation_id,account_id,display_name,last_message_at,updated_at)
        values ('w','conversation','a','a',$1,$1),('w','conversation','b','b',$1,$1),('w','not-member','b','b',$1,$1),('w','not-member','z','z',$1,$1)`,[at]);
      await tx.query(`insert into relationship_messages(workspace_id,conversation_id,seq,message_id,sender_account_id,sender_display_name,body,sent_at,qualification_version,request_id)
        select 'w','conversation',n,'m:'||lpad(n::text,3,'0'),'b','b',repeat('x',10000),$1,'q','r'||n from generate_series(1,65)n`,[at]);
      await tx.query(`insert into relationship_messages(workspace_id,conversation_id,seq,message_id,sender_account_id,sender_display_name,body,sent_at,qualification_version,request_id)
        values ('w','conversation',66,'own','a','a','own',$1,'q','own'),('w','not-member',1,'foreign','b','b','private',$1,'q','foreign')`,[at]);
    });
    const full=(await pool.query(`select message_id as "messageId",conversation_id as "conversationId",sent_at,body from relationship_messages where workspace_id='w' and message_id like 'm:%' order by message_id limit 50`)).rows;
    const fullBytes=Buffer.byteLength(JSON.stringify(full));assert.ok(fullBytes>400000);
    assert.deepEqual(await runtime.materialize(),{notifications:0,messages:50});
    assert.equal(pages.length,1);assert.equal(pages[0]!.rows.length,50);assert.ok(pages[0]!.bytes<10000,'candidate reads must not transfer message bodies');
    assert.deepEqual(pages[0]!.rows,full.map(m=>({payload:{messageId:m.messageId,conversationId:m.conversationId,sentAt:at}})));
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

// Sprint 0109: a database without the relationship message tables (not migrated yet) must not stop
// notification candidates; message candidates are skipped and their cursor is kept for later.
test('typed delivery materialization keeps notifications flowing when the message tables are missing', {skip:!url,timeout:30000},async()=>{
  assert.ok(url);
  const schema='message_tables_missing_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:3,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000`});
  const client=createTransactionalPostgresClient({connectionString:url,pool}),workspaceId='w',actorId='a',now=()=>at;
  const repository=createDeliveryPolicyRepository({client,workspaceId,now});
  const devices={listActive:async()=>[],revoke:async()=>null,register:async()=>{throw Error('unused');}};
  const runtime=createTypedDeliveryRuntime({client,workspaceId,actorId,now,devices,push:null});
  const warnings:string[]=[];const warn=console.warn;console.warn=(line:string)=>{warnings.push(String(line));};
  try{
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    assert.equal((await pool.query("select to_regclass('relationship_messages') as t")).rows[0].t,null);
    const since='2026-09-25T00:00:00.000Z';
    await repository.tx(actorId,tx=>repository.save(tx,'notificationCutover',actorId,actorId,{enabled:true,generation:1,since,batchId:'test'}));
    await repository.tx(actorId,tx=>repository.save(tx,'notificationDeliveryCursor',actorId,actorId,{notifications:null,messages:{at:since,id:'kept'}}));
    assert.deepEqual(await runtime.materialize(),{notifications:0,messages:0});
    assert.deepEqual((await repository.get<{messages:unknown}>(client,'notificationDeliveryCursor',actorId))?.messages,{at:since,id:'kept'},'the message cursor waits for the tables');
    assert.ok(warnings.some(line=>line.includes('typed_delivery_message_tables_missing')),'the skip is logged');
  }finally{console.warn=warn;await pool.query(`drop schema if exists ${schema} cascade`);await client.close();}
});
