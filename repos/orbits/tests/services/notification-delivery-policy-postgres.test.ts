import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createDeliveryPolicyRepository} from '../../features/notifications/delivery-policy-repository';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
const url=process.env.ORBIT_EVENT_DATABASE_URL;
test('durable cross-device quota, sound, consent revisions and unknown provider results survive reconstruction',{skip:!url},async()=>{
 const client=createTransactionalPostgresClient({connectionString:url!,max:4}),workspaceId='qa:delivery-policy:'+randomUUID();let at='2026-09-16T01:00:00.000Z';const make=()=>createDeliveryPolicyRepository({client,workspaceId,now:()=>at});let repo=make();const actor='a';
 try {
  await repo.tx(actor,db=>repo.save(db,'notificationCutover',actor,actor,{enabled:true,generation:1,since:at,batchId:'qa'}));
  await assert.rejects(repo.acknowledgeOwner(actor,'d1',1,false));
  for(const device of ['d1','d2'])await repo.acknowledgeOwner(actor,device,1,true);
  const reserve=(deliveryId:string,eventKey:string,deviceId='d1',suggestion=false,conversationId?:string)=>repo.reserve(actor,{deliveryId,eventKey,deviceId,automatic:!conversationId,suggestion,conversationId,expectedPreferenceRevision:0});
  const first=await Promise.all([reserve('n1:d1','n1','d1',true),reserve('n1:d2','n1','d2',true)]);assert.ok(first.every(x=>x.allowed));
  assert.equal((await reserve('n2:d1','n2','d1',true)).allowed,false);assert.equal((await reserve('n2:d1','n2')).allowed,true);assert.equal((await reserve('n3:d1','n3')).allowed,false);
  repo=make();assert.equal((await reserve('n1:d1','n1')).allowed,false);
  const sound=await Promise.all([reserve('m1:d1','m1','d1',false,'c'),reserve('m1:d2','m1','d2',false,'c')]);assert.equal(sound.filter(x=>x.allowed&&x.sound).length,1);assert.ok(sound.every(x=>x.allowed));
  at='2026-09-16T01:01:00.000Z';assert.equal((await reserve('m2:d1','m2','d1',false,'c') as {sound:boolean}).sound,true);
  await repo.settle(actor,'m1:d1','unknown');await assert.rejects(repo.settle(actor,'m1:d1','rejected'),/unknown/i);
  await assert.rejects(repo.settle(actor,'m2:d1','sent'),/receipt/i);
  const prefs=await repo.updatePreferences(actor,{expectedRevision:0,messageEnabled:false},async()=>false);assert.equal(prefs.messageEnabled,false);assert.equal((await reserve('m3:d1','m3','d1',false,'c')).allowed,false);
  await assert.rejects(repo.updatePreferences(actor,{expectedRevision:1,muteConversation:{conversationId:'foreign',muted:true}},async()=>false));assert.equal((await repo.preferences('b')).messageEnabled,true);
 } finally {await client.query('delete from orbit_records where workspace_id=$1',[workspaceId]);await client.close();}
});
