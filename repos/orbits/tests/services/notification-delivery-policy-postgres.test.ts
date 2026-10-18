import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createDeliveryPolicyRepository,deliveryPolicyId} from '../../features/notifications/delivery-policy-repository';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
const url=process.env.ORBIT_EVENT_DATABASE_URL;
test('durable cross-device quota, sound, consent revisions and unknown provider results survive reconstruction',{skip:!url},async()=>{
 const client=createTransactionalPostgresClient({connectionString:url!,max:4}),workspaceId='qa:delivery-policy:'+randomUUID();let at='2026-09-16T01:00:00.000Z';const make=()=>createDeliveryPolicyRepository({client,workspaceId,now:()=>at});let repo=make();const actor='a';
 try {
  await repo.tx(actor,db=>repo.save(db,'notificationCutover',actor,actor,{enabled:true,generation:1,since:at,batchId:'qa'}));
  assert.deepEqual(((p)=>[p.quietStart,p.quietEnd,p.dailyCap,p.secretaryMail,p.secretaryDeadline,p.secretaryPick])(await repo.preferences(actor)),['22:00','07:30',3,false,true,true]);
  await assert.rejects(repo.acknowledgeOwner(actor,'d1',1,false));
  for(const device of ['d1','d2'])await repo.acknowledgeOwner(actor,device,1,true);
  const reserve=(deliveryId:string,eventKey:string,deviceId='d1',suggestion=false,conversationId?:string)=>repo.reserve(actor,{deliveryId,eventKey,deviceId,automatic:!conversationId,suggestion,conversationId,expectedPreferenceRevision:0});
  const first=await Promise.all([reserve('n1:d1','n1','d1',true),reserve('n1:d2','n1','d2',true)]);assert.ok(first.every(x=>x.allowed));
  assert.equal((await reserve('n2:d1','n2','d1',true)).allowed,true);assert.equal((await reserve('n3:d1','n3')).allowed,true);assert.equal((await reserve('n4:d1','n4', 'd1', false, 'conversation')).allowed,false);
  repo=make();assert.equal((await reserve('n1:d1','n1')).allowed,false);
  at='2026-09-17T01:00:00.000Z';
  const sound=await Promise.all([reserve('m1:d1','m1','d1',false,'c'),reserve('m1:d2','m1','d2',false,'c')]);assert.equal(sound.filter(x=>x.allowed&&x.sound).length,1);assert.ok(sound.every(x=>x.allowed));
  at='2026-09-17T01:01:00.000Z';assert.equal((await reserve('m2:d1','m2','d1',false,'c') as {sound:boolean}).sound,true);
  await repo.settle(actor,'m1:d1','unknown');await assert.rejects(repo.settle(actor,'m1:d1','rejected'),/unknown/i);
  await assert.rejects(repo.settle(actor,'m2:d1','sent'),/receipt/i);
  const prefs=await repo.updatePreferences(actor,{expectedRevision:0,messageEnabled:false},async()=>false);assert.equal(prefs.messageEnabled,false);assert.equal((await reserve('m3:d1','m3','d1',false,'c')).allowed,false);
  await assert.rejects(repo.updatePreferences(actor,{expectedRevision:1,muteConversation:{conversationId:'foreign',muted:true}},async()=>false));assert.equal((await repo.preferences('b')).messageEnabled,true);
  const edited=await repo.updatePreferences(actor,{expectedRevision:1,quietStart:'23:00',quietEnd:'07:00',dailyCap:1},async()=>true);
  assert.deepEqual([edited.quietStart,edited.quietEnd,edited.dailyCap],['23:00','07:00',1]);
  await assert.rejects(repo.updatePreferences(actor,{expectedRevision:1,dailyCap:2},async()=>true),/Refresh preferences/);
  assert.equal((await repo.preferences(actor)).dailyCap,1);
  assert.equal((await repo.get<{entity:{quietHours:{start:string;end:string}}}>(client,'notificationPreferences',actor))?.entity.quietHours.start,'23:00');
  at='2026-09-18T01:00:00.000Z';
  assert.equal((await reserve('u1:d1','u1','d1',false,'c')).allowed,false); // stale revision must fail
  const capped=(deliveryId:string,eventKey:string,automatic:boolean)=>repo.reserve(actor,{deliveryId,eventKey,deviceId:'d1',automatic,suggestion:false,conversationId:automatic?undefined:'c',expectedPreferenceRevision:2});
  assert.equal((await capped('u1:d1','u1',false)).allowed,true);
  assert.equal((await capped('a1:d1','a1',true)).allowed,false);
  at='2026-09-19T01:00:00.000Z';
  const digest=(deliveryId:string,deviceId:string)=>repo.reserve(actor,{deliveryId,eventKey:'digest:2026-09-19',digestKey:'digest:2026-09-19',deviceId,automatic:true,suggestion:false,expectedPreferenceRevision:2});
  const competing=await Promise.all([digest('dig-one:d1','d1'),digest('dig-two:d1','d1')]);
  assert.equal(competing.filter(result=>result.allowed).length,1,'two workers cannot send two digests to one device');
  assert.equal((await digest('dig-one:d2','d2')).allowed,true);
  assert.ok(['dig-one:d1','dig-two:d1'].includes((await repo.get<{deliveryId:string}>(client,'notificationDigestGuards',deliveryPolicyId(actor,'digest:2026-09-19','d1')))?.deliveryId??''));
  await repo.tx(actor,db=>repo.save(db,'notificationDeliveries','wake',actor,{kind:'notification_delivery',delivery:{policySource:{kind:'notification',id:'n',eventKey:'n'},status:'retry_scheduled',availableAt:'2026-09-19T02:00:00.000Z',scheduledFor:'2026-09-18T14:00:00.000Z'}}));
  await repo.updatePreferences(actor,{expectedRevision:2,secretaryPick:false},async()=>true);
  assert.equal((await repo.get<{delivery:{availableAt:string}}>(client,'notificationDeliveries','wake'))?.delivery.availableAt,at);
 } finally {await client.query('delete from orbit_records where workspace_id=$1',[workspaceId]);await client.close();}
});
