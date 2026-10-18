import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createStorageNotificationDeliveryService} from '../../features/notifications/delivery-service';
import {createDeliveryPolicyRepository} from '../../features/notifications/delivery-policy-repository';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';

const url=process.env.ORBIT_EVENT_DATABASE_URL;
test('PostgreSQL cutover stops old push claims while typed claims remain available',{skip:!url},async()=>{
 const client=createTransactionalPostgresClient({connectionString:url!,max:3}),workspaceId='qa:cutover-lanes:'+randomUUID(),actorId='actor',now='2026-09-16T01:00:00.000Z';
 const service=createStorageNotificationDeliveryService({actorId,workspaceId,sqlClient:client,store:createPostgresLiveRecordStore({client}) as never,now:()=>now});
 const repository=createDeliveryPolicyRepository({client,workspaceId,now:()=>now});
 try{
  await service.materialize({signalId:'old',signalRevision:'1',phase:'commitment',title:'Orbit',body:'Legacy',scheduledFor:now});
  await service.materialize({signalId:'typed',signalRevision:'1',phase:'commitment',title:'Orbit',body:'Typed',scheduledFor:now,policySource:{kind:'notification',id:'n',eventKey:'n'}});
  await repository.tx(actorId,db=>repository.save(db,'notificationCutover',actorId,actorId,{enabled:true,legacyBlocked:true,generation:1,since:now,batchId:'test'}));
  assert.equal((await service.claimReady({now,limit:10,workerId:'legacy',lane:'legacy'})).length,0);
  const typed=await service.claimReady({now,limit:10,workerId:'typed',lane:'typed'});
  assert.equal(typed.length,1);assert.equal(typed[0]?.policySource?.eventKey,'n');
 }finally{await client.query('delete from orbit_records where workspace_id=$1',[workspaceId]);await client.close();}
});
