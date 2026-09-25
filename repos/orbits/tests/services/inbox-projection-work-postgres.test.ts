import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {INBOX_PROJECTION_WORK_SCHEMA_SQL,createInboxProjectionWorkRepository} from '../../features/notifications/storage/inbox-projection-work';

const url=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('projection work is transactional, coalesced, leased and generation-fenced', {skip:!url,timeout:30000},async()=>{
  assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname));assert.equal(address.search,'');
  const schema='inbox_work_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:4,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=2000`});
  const client=createTransactionalPostgresClient({connectionString:url,pool});
  let now='2026-09-25T00:00:00.000Z';
  const queue=createInboxProjectionWorkRepository({client,workspaceId:'w',now:()=>now});
  const source={actorId:'a',sourceKind:'canonical_reminder' as const,sourceId:'plan',sourceRevision:'1'};
  const enqueue=(value=source)=>client.transaction(tx=>queue.enqueue(tx,value));
  const count=async()=>Number((await pool.query('select count(*) count from projection_effects')).rows[0].count);
  try{
    await pool.query(`create schema ${schema}`);await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await pool.query('create table projection_effects(value text)');
    await assert.rejects(client.transaction(async tx=>{await queue.enqueue(tx,source);throw Error('business rollback');}),/business rollback/);
    assert.deepEqual(await queue.claim(),[]);
    await enqueue();await enqueue();
    const [one,two]=await Promise.all([queue.claim(),queue.claim()]);const leases=[...one,...two];
    assert.equal(leases.length,1);assert.equal(leases[0]!.generation,'1');
    await enqueue({...source,sourceRevision:'2'});
    assert.equal(await queue.complete(leases[0]!,async()=>{throw Error('stale worker ran');}),false);
    const current=(await queue.claim())[0]!;assert.equal(current.generation,'2');
    await assert.rejects(queue.complete(current,async tx=>{await tx.query("insert into projection_effects values ('rolled back')");throw Error('projection failed');}),/projection failed/);
    assert.equal(await count(),0);
    assert.equal(await queue.fail(current,'TRANSIENT'),true);
    assert.deepEqual(await queue.claim(),[],'retry has an explicit due time');
    now='2026-09-25T00:01:00.000Z';
    const retry=(await queue.claim())[0]!;
    assert.equal(await queue.complete(retry,async tx=>{await tx.query("insert into projection_effects values ('once')");}),true);
    assert.equal(await queue.complete(retry,async()=>{throw Error('replay ran');}),false);assert.equal(await count(),1);
    await enqueue({...source,sourceRevision:'3'});const expired=(await queue.claim({leaseMs:1000}))[0]!;
    now='2026-09-25T00:01:02.000Z';const replacement=(await queue.claim())[0]!;
    assert.notEqual(replacement.leaseToken,expired.leaseToken);
    assert.equal(await queue.complete(expired,async()=>{throw Error('expired worker ran');}),false);
    assert.equal(await queue.fail(expired,'OLD'),false);
    assert.equal(await queue.complete(replacement,async tx=>{await tx.query("insert into projection_effects values ('replacement')");}),true);
    // A lease expiring during a database-only projection rolls its writes back.
    await enqueue({...source,sourceRevision:'4'});const midflight=(await queue.claim({leaseMs:1000}))[0]!;
    await assert.rejects(queue.complete(midflight,async tx=>{await tx.query("insert into projection_effects values ('expired')");now='2026-09-25T00:01:04.000Z';}),/PROJECTION_LEASE_LOST/);
    assert.equal(await count(),2);
    assert.equal(await queue.complete({...midflight,actorId:'other'},async()=>{throw Error('wrong actor');}),false);
    assert.deepEqual(await createInboxProjectionWorkRepository({client,workspaceId:'other',now:()=>now}).claim(),[]);
    await assert.rejects(queue.claim({limit:51}),/INPUT_INVALID/);
    await assert.rejects(queue.claim({limit:0}),/INPUT_INVALID/);
    await assert.rejects(enqueue({...source,actorId:''}),/INPUT_INVALID/);
    const reclaimed=(await queue.claim())[0]!;assert.equal(await queue.fail(reclaimed,'INVALID_SOURCE',{permanent:true}),true);
    await enqueue({...source,sourceRevision:'4'});assert.deepEqual(await queue.claim(),[],'same revision does not resurrect dead letters');
    await enqueue({...source,sourceRevision:'5'});const recovered=(await queue.claim())[0]!;assert.equal(recovered.attempts,1);
    assert.equal(await queue.complete(recovered,async()=>{}),true);
    // A crashed final attempt is dead-lettered on the next recovery pass.
    await enqueue({...source,sourceId:'crash'});
    for(let attempt=1;attempt<=8;attempt++){
      const lease=(await queue.claim({leaseMs:1000}))[0]!;assert.equal(lease.attempts,attempt);
      now=new Date(Date.parse(now)+2000).toISOString();
    }
    assert.deepEqual(await queue.claim(),[]);
    assert.equal((await pool.query("select state,error_code from orbit_inbox_projection_work where source_id='crash'")).rows[0].error_code,'ATTEMPTS_EXHAUSTED');
    // Historical work is not returned or claimed on an idle pass.
    await pool.query(`insert into orbit_inbox_projection_work(workspace_id,actor_id,source_kind,source_id,source_revision,generation,state,available_at,created_at,updated_at)
      select 'w','history','canonical_reminder','old:'||n,'1',1,'done',$1,$1,$1 from generate_series(1,100000)n`,[now]);
    assert.deepEqual(await queue.claim(),[]);
    await enqueue({...source,sourceId:'fresh'});assert.equal((await queue.claim()).length,1);
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await client.close();}
});

test('new authority changes racing an active projection remain pending after the old generation commits', {skip:!url,timeout:30000},async()=>{
  assert.ok(url);const address=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(address.hostname));assert.equal(address.search,'');
  const schema='inbox_work_race_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url,max:3,options:`-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=2000`});
  const client=createTransactionalPostgresClient({connectionString:url,pool}),queue=createInboxProjectionWorkRepository({client,workspaceId:'w'});
  const source={actorId:'a',sourceKind:'canonical_reminder' as const,sourceId:'plan',sourceRevision:'old'};
  try{
    await pool.query(`create schema ${schema}`);await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await pool.query('create table projection_source(revision text)');await pool.query("insert into projection_source values ('old')");
    await client.transaction(tx=>queue.enqueue(tx,source));const lease=(await queue.claim())[0]!;
    let entered!:()=>void,release!:()=>void;
    const locked=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const consumer=queue.complete(lease,async tx=>{assert.equal((await tx.query<{revision:string}>('select revision from projection_source')).rows[0]!.revision,'old');entered();await gate;});
    await locked;
    let updated!:()=>void;const sourceUpdated=new Promise<void>(resolve=>{updated=resolve;});
    const produce=()=>client.transaction(async tx=>{await tx.query("update projection_source set revision='new'");updated();await queue.enqueue(tx,{...source,sourceRevision:'new'});});
    const producer=produce().catch(async error=>{if(error.code!=='40001')throw error;await produce();});
    await sourceUpdated;release();await Promise.all([consumer,producer]);
    const next=(await queue.claim())[0]!;assert.equal(next.sourceRevision,'new');assert.equal(next.generation,'2');
    assert.equal(await queue.complete(lease,async()=>{throw Error('old result overwrote new work');}),false);
    assert.equal(await queue.complete(next,async tx=>{assert.equal((await tx.query<{revision:string}>('select revision from projection_source')).rows[0]!.revision,'new');}),true);
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await client.close();}
});
