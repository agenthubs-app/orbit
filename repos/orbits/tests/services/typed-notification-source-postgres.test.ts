import test from 'node:test';import assert from 'node:assert/strict';
import {createDeliveryPolicyRepository} from '../../features/notifications/delivery-policy-repository';import {createTypedDeliveryRuntime} from '../../features/notifications/typed-delivery-factory';
import {connect,createRelationshipHarness,relationshipPostgresSkip} from '../support/relationship-message-harness';
// Sprint 0109: the message, conversation, membership and read position come from the relationship message
// tables; runs on the explicit local test database (private schema), never on the configured application database.
test('real storage sends a contact message with AI disabled, then suppresses read/revoked sources and fences legacy claims',{skip:relationshipPostgresSkip,timeout:60_000},async t=>{
 const h=await createRelationshipHarness({prefix:'typed_source'});t.after(()=>h.close());
 const client=h.client,workspaceId=h.workspaceId,now=()=> '2026-09-16T01:00:00.000Z',repo=createDeliveryPolicyRepository({client,workspaceId,now});
 const a={accountId:'a',displayName:'Orbit QA',email:'a@example.test'},b={accountId:'b',displayName:'佐藤健一',email:'b@example.test'};
 const devices={listActive:async()=>[{deviceId:'d',token:'qa-not-a-provider-token',platform:'ios' as const,permission:'granted' as const,active:true,registeredAt:now(),updatedAt:now()}],revoke:async()=>null,register:async()=>{throw Error('not used');}};const calls:unknown[]=[];
 const runtime=createTypedDeliveryRuntime({client,workspaceId,actorId:'a',now,devices,push:{send:async request=>{calls.push(request);return {receiptId:'qa-ticket',verified:true};}}});
 await repo.tx('a',db=>repo.save(db,'notificationCutover','a','a',{enabled:true,legacyBlocked:true,generation:1,since:'2026-09-16T00:00:00.000Z',batchId:'qa'}));
 const {conversationId,qualificationVersion}=await connect(h,a,b,'contact');
 const sent=await h.service(b,{now}).sendMessage({conversationId,qualificationVersion,requestId:'m',body:'报价资料已收到'});const m=sent.message.messageId;
 await repo.acknowledgeOwner('a','d',1,true);
 const base={signalId:'message:'+m,signalRevision:now(),phase:'commitment' as const,title:'Orbit',body:'Message',scheduledFor:now(),policySource:{kind:'message' as const,id:m,eventKey:m,conversationId}};
 const {delivery}=await runtime.ledger.materialize(base);const source=await runtime.sources.resolve(delivery);assert.equal(source?.title,'佐藤健一');assert.equal(source?.subject.read,false);
 assert.equal(await runtime.sources.authorizeConversation(conversationId),true);
 assert.equal((await runtime.worker.run({workerId:'w'})).sent,1);assert.equal(calls.length,1);assert.deepEqual((calls[0] as {data:unknown}).data,{deliveryId:delivery.deliveryId});assert.equal((calls[0] as {body:string}).body,'你收到了一条新消息');
 await runtime.ledger.materialize({...base,signalId:'legacy',policySource:undefined} as never);assert.equal((await runtime.ledger.claimReady({workerId:'legacy',now:now(),limit:10})).length,0);
 await h.service(a).markConversationRead({conversationId,lastReadMessageId:m});assert.equal((await runtime.sources.resolve(delivery))?.subject.read,true);
 // A delivery whose revision does not match the stored send time, or that names another conversation, resolves to nothing.
 assert.equal(await runtime.sources.resolve({...delivery,signalRevision:'2026-09-16T00:59:59.000Z'}),null);
 assert.equal(await runtime.sources.resolve({...delivery,policySource:{...base.policySource,conversationId:'other'}}),null);
 await h.service(a).revokeContactBinding('contact');assert.equal(await runtime.sources.resolve(delivery),null);assert.equal(await runtime.sources.authorizeConversation(conversationId),false);
 const outsider=createTypedDeliveryRuntime({client,workspaceId,actorId:'x',now,devices,push:null});assert.equal(await outsider.sources.authorizeConversation(conversationId),false);
});
