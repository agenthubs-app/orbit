import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryRepository } from '../../features/notifications/discovery/discovery-repository';
import { createTransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
const url=process.env.ORBIT_EVENT_DATABASE_URL;
// enqueuePage reads up to 52 rows in one serializable transaction; past max_pred_locks_per_relation
// Postgres promotes them to a relation-level SIREAD lock, so any concurrent orbit_records writer in the
// shared full-suite database (any workspace) aborted it with 40001. A private schema isolates the table.
test('Postgres queue cursor, leases, retry attempts, cancellation and global cost reservations survive recreation',{skip:!url},async()=>{
 const schema='discovery_bounds_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url!,max:1}),isolated=new URL(url!);
 isolated.searchParams.set('options',`-c search_path=${schema}`);
 await admin.query(`create schema ${schema}`);
 const client=createTransactionalPostgresClient({connectionString:isolated.toString(),max:4}),workspaceId='qa:discovery:'+randomUUID(),actor='a';let at='2026-09-16T00:00:00.000Z';
 const make=()=>createDiscoveryRepository({client,workspaceId,now:()=>at,budgetWorkspaceId:workspaceId});let repo=make();
 try {
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  const initial=await repo.preferences(actor);assert.equal(initial.enabled,false);assert.equal(initial.messageAnalysisEnabled,false);
  const p=await repo.updatePreferences(actor,{enabled:true,expectedRevision:initial.revision});
  const leases=await Promise.all([repo.acquireActor(actor,'one'),repo.acquireActor(actor,'two')]);assert.equal(leases.filter(Boolean).length,1);const token=leases[0]?'one':'two';
  const refs=Array.from({length:50},(_,i)=>({kind:'note' as const,id:'n'+i,revision:'1',at,key:'note:n'+i}));
  await repo.enqueuePage(actor,token,p.generation,refs,{at,key:'note:n49'});repo=make();assert.equal((await repo.state(actor)).cursor?.key,'note:n49');
  let jobs=await repo.claim(actor,token,20);assert.equal(jobs.length,20);assert.ok(jobs.every(j=>j.attempts===1));
  await repo.fail(actor,jobs[0].id,token,'provider_429',true);assert.equal((await repo.jobs(actor)).find(j=>j.id===jobs[0].id)?.nextAttemptAt,'2026-09-16T00:05:00.000Z');
  at='2026-09-16T00:05:00.000Z';assert.equal(await repo.acquireActor(actor,'recovered'),true);jobs=await repo.claim(actor,'recovered',20);assert.ok(jobs.some(j=>j.attempts===2));
  assert.deepEqual(await repo.reserveCost('blocked',0.1),{allowed:false,reason:'budget_unreconciled'});
  await repo.reconcileBudget({historicalUpperBoundUsd:4.85,reference:'test-only-audited-ledger'});
  const reservations=await Promise.all([repo.reserveCost('r1',0.1),repo.reserveCost('r2',0.1)]);assert.equal(reservations.filter(r=>r.allowed).length,1);
  repo=make();assert.equal((await repo.reserveCost('r3',0.1)).allowed,false);
  const beforeMessageToggle=await repo.preferences(actor);await repo.updatePreferences(actor,{messageAnalysisEnabled:true,expectedRevision:beforeMessageToggle.revision});assert.ok((await repo.jobs(actor)).some(j=>j.state==='queued'));
  const current=await repo.preferences(actor);await repo.updatePreferences(actor,{enabled:false,expectedRevision:current.revision});assert.ok((await repo.jobs(actor)).every(j=>!['queued','running'].includes(j.state)));
  const disabled=await repo.preferences(actor);await repo.updatePreferences(actor,{enabled:true,expectedRevision:disabled.revision});assert.ok((await repo.preferences(actor)).generation>p.generation);assert.equal((await repo.claim(actor,'recovered',20)).length,0);
 } finally {await client.close();await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();}
});
