import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createDiscoveryRepository} from '../../features/notifications/discovery/discovery-repository';
import {createDiscoverySourceAdapters} from '../../features/notifications/discovery/source-adapters';
import {createDiscoveryWorker} from '../../features/notifications/discovery/discovery-worker';
import {createInboxRuntime} from '../../features/notifications/inbox-record-service-factory';
import type {DiscoveryExtractor} from '../../features/notifications/discovery/evidence-extractor';
const url=process.env.ORBIT_EVENT_DATABASE_URL;
test('saved cloud facts drain in bounded batches; daily quota and ignored identities persist across workers',{skip:!url},async()=>{
 const client=createTransactionalPostgresClient({connectionString:url!,max:4}),workspaceId='qa:discovery-worker:'+randomUUID();let now='2026-09-16T00:00:00.000Z';const actor='a',store=createPostgresLiveRecordStore({client});const repo=createDiscoveryRepository({client,workspaceId,now:()=>now,budgetWorkspaceId:workspaceId});
 const save=async(collectionName:string,recordId:string,payload:Record<string,unknown>)=>store.upsertRecord({workspaceId,collectionName,recordId,userId:actor,sourceType:'manual',sourceId:recordId,evidenceIds:[],lifecycleState:'active',payload,createdAt:now,updatedAt:now});
 let calls=0;const extractor:DiscoveryExtractor={paid:false,upperBoundUsd:0,extract:async(packages)=>{calls++;assert.ok(packages.length<=20);return {metadata:{testOnly:true},results:packages.map(p=>{const s=p.evidence[0],goal=p.evidence.find(s=>s.source.sourceKind==='goal');return {jobId:p.jobId,reason:'',candidate:s.source.sourceKind==='note'?{sourceKeys:[s.key],action:'发送报价资料',actionQuote:'发送报价资料',factQuote:s.text,objectId:'c',responsibleActorId:actor,mode:'suggestion',timeQuote:null,inference:'报价资料与当前需求相关。',goalKey:goal?.key??null,goalQuote:'报价合作渠道'}:null};})};}};
 const sources=createDiscoverySourceAdapters({store,client,workspaceId,preferences:a=>repo.preferences(a),now:()=>now});const worker=createDiscoveryWorker({client,workspaceId,repository:repo,sources,extractor,now:()=>now});
 try {
  await repo.updatePreferences(actor,{enabled:true,expectedRevision:0});now='2026-09-16T00:01:00.000Z';
  await save('contacts','c',{id:'c',displayName:'佐藤',updatedAt:now});await save('profiles','g',{id:'g',accountId:actor,relationshipGoal:'寻找报价合作渠道',updatedAt:now});
  for(let i=0;i<205;i++)await save('notes','n'+String(i).padStart(3,'0'),{schemaVersion:2,operations:[],note:{id:'n'+String(i).padStart(3,'0'),ownerUserId:actor,accountId:actor,title:'报价资料',body:'我答应向佐藤发送报价资料。',manualContactIds:['c'],mentions:[],contactIds:['c'],eventIds:[],version:1,createdAt:now,updatedAt:now}});
  const r=await worker.runActor(actor);assert.equal(r.scanned,200);assert.equal(r.requests,2);assert.equal(calls,2);assert.equal(r.published,3);
  const inbox=createInboxRuntime({client,workspaceId,now:()=>now});const list=await inbox.service.list(actor,{});assert.equal(list.items.length,3);assert.ok(list.items.every(n=>n.kind==='suggestion'&&n.reason.includes('AI 判断')&&n.sources.some(s=>s.sourceKind==='goal')));
  const n=list.items[0];await inbox.service.action(actor,n.id,{action:'dismiss',expectedRevision:n.revision,idempotencyKey:'dismiss'});
  const source=n.sources.find(s=>s.sourceKind==='note')!;now='2026-09-16T00:02:00.000Z';const old=await store.getRecord({workspaceId,collectionName:'notes',recordId:source.sourceId});const note=old!.payload.note as Record<string,unknown>;await save('notes',source.sourceId,{...old!.payload,note:{...note,version:2,updatedAt:now,body:'我答应向佐藤发送报价资料。补充说明。'}});
  for(let i=0;i<6;i++)await worker.runActor(actor);
  const history=await inbox.service.list(actor,{history:true});assert.equal(history.items.length,3);assert.equal(history.items.find(x=>x.id===n.id)?.disposition,'dismissed');
  const counts=(await repo.health(actor)).counts;assert.equal((counts.queued??0)+(counts.running??0),0);
  assert.equal((await client.query<{count:string}>(`select count(*)::text as count from orbit_records where workspace_id=$1 and collection_name='tasks'`,[workspaceId])).rows[0].count,'0');
  const prefs=await repo.preferences(actor);await repo.updatePreferences(actor,{enabled:false,expectedRevision:prefs.revision});const disabled=await repo.preferences(actor);await repo.updatePreferences(actor,{enabled:true,expectedRevision:disabled.revision});const before=calls;await worker.runActor(actor);assert.equal(calls,before);
 } finally {await client.query('delete from orbit_records where workspace_id=$1',[workspaceId]);await client.close();}
});

test('429 exhausts exactly three attempts with durable backoff; missing reconciliation defers without a paid call',{skip:!url},async()=>{
 const client=createTransactionalPostgresClient({connectionString:url!,max:4}),workspaceId='qa:discovery-retry:'+randomUUID(),actor='a';let now='2026-09-16T00:00:00.000Z',calls=0;const store=createPostgresLiveRecordStore({client}),repo=createDiscoveryRepository({client,workspaceId,now:()=>now,budgetWorkspaceId:workspaceId});
 const sources=createDiscoverySourceAdapters({store,client,workspaceId,preferences:a=>repo.preferences(a),now:()=>now});const {DiscoveryProviderError}=await import('../../features/notifications/discovery/evidence-extractor');
 const extractor:DiscoveryExtractor={paid:false,upperBoundUsd:0,extract:async()=>{calls++;throw new DiscoveryProviderError('provider_429',true);}};
 const save=async(collectionName:string,recordId:string,payload:Record<string,unknown>)=>store.upsertRecord({workspaceId,collectionName,recordId,userId:actor,sourceType:'manual',sourceId:recordId,evidenceIds:[],lifecycleState:'active',payload,createdAt:now,updatedAt:now});
 try {
  await repo.updatePreferences(actor,{enabled:true,expectedRevision:0});now='2026-09-16T00:01:00.000Z';await save('contacts','c',{id:'c',displayName:'佐藤',updatedAt:now});await save('notes','n',{schemaVersion:2,operations:[],note:{id:'n',ownerUserId:actor,accountId:actor,title:'发送报价资料',body:'我答应发送报价资料。',manualContactIds:['c'],mentions:[],contactIds:['c'],eventIds:[],version:1,createdAt:now,updatedAt:now}});
  const paid=createDiscoveryWorker({client,workspaceId,repository:repo,sources,extractor:{...extractor,paid:true,upperBoundUsd:0.1},now:()=>now});assert.equal((await paid.runActor(actor)).requests,0);assert.equal(calls,0);let job=(await repo.jobs(actor)).find(j=>j.source.kind==='note')!;assert.equal(job.attempts,0);assert.equal(job.reason,'budget_unreconciled');
  now='2026-09-16T00:06:00.000Z';const worker=createDiscoveryWorker({client,workspaceId,repository:repo,sources,extractor,now:()=>now});await worker.runActor(actor);assert.equal(calls,1);job=(await repo.jobs(actor)).find(j=>j.source.kind==='note')!;assert.equal(job.nextAttemptAt,'2026-09-16T00:11:00.000Z');
  await worker.runActor(actor);assert.equal(calls,1);now='2026-09-16T00:11:00.000Z';await worker.runActor(actor);assert.equal(calls,2);job=(await repo.jobs(actor)).find(j=>j.source.kind==='note')!;assert.equal(job.nextAttemptAt,'2026-09-16T00:41:00.000Z');
  now='2026-09-16T00:41:00.000Z';await worker.runActor(actor);await worker.runActor(actor);assert.equal(calls,3);job=(await repo.jobs(actor)).find(j=>j.source.kind==='note')!;assert.equal(job.state,'failed');assert.equal(job.attempts,3);
 } finally {await client.query('delete from orbit_records where workspace_id=$1',[workspaceId]);await client.close();}
});

test('revoking message analysis removes an already published excerpt on the very next persistent read',{skip:!url},async()=>{
 const client=createTransactionalPostgresClient({connectionString:url!,max:2}),workspaceId='qa:discovery-revoke:'+randomUUID(),actor='a',now='2026-09-16T00:00:00.000Z';const store=createPostgresLiveRecordStore({client}),repo=createDiscoveryRepository({client,workspaceId,now:()=>now});
 const save=async(collectionName:string,recordId:string,payload:Record<string,unknown>,userId=actor)=>store.upsertRecord({workspaceId,collectionName,recordId,userId,sourceType:'manual',sourceId:recordId,evidenceIds:[],lifecycleState:'active',payload,createdAt:now,updatedAt:now});
 try {
  await repo.updatePreferences(actor,{enabled:true,messageAnalysisEnabled:true,expectedRevision:0});
  await save('contacts','c',{id:'c',displayName:'佐藤',updatedAt:now});await save('relationship_communication_bindings','b',{bindingId:'b',conversationId:'v',contactId:'c',status:'confirmed',inviterAccountId:actor,remoteAccountId:'other',qualificationVersion:'q'});await save('relationship_communication_conversations','v',{bindingId:'b',conversationId:'v',contactId:'c',status:'active',participantAccountIds:[actor,'other'],participantDisplayNames:{a:'自己',other:'佐藤'},qualificationVersion:'q'});await save('relationship_communication_messages','m',{messageId:'m',conversationId:'v',senderAccountId:actor,body:'我会发送私密报价资料。',sentAt:now,qualificationVersion:'q'});
  const inbox=createInboxRuntime({client,workspaceId,now:()=>now});const n=await inbox.service.upsert({actorId:actor,semanticKey:'test-message',kind:'reminder',origin:'automation',title:'发送私密报价资料',reason:'AI 判断与原文',object:{id:'c',name:'佐藤'},sources:[{sourceKind:'message',sourceId:'m',sourceRevision:now,occurredAt:now,readAt:now,objectId:'discovery',excerpt:'我会发送私密报价资料。'}],target:{kind:'source',id:'m',href:'/inbox/threads/v',status:'available'},actions:['read','accept'],occurredAt:now,scheduledFor:now,expiresAt:'2026-09-17T00:00:00.000Z'});
  assert.ok(JSON.stringify(await inbox.service.get(actor,n.id)).includes('私密报价'));
  const p=await repo.preferences(actor);await repo.updatePreferences(actor,{messageAnalysisEnabled:false,expectedRevision:p.revision});const unavailable=await inbox.service.get(actor,n.id);assert.equal(unavailable.target.status,'unavailable');assert.equal(unavailable.target.href,null);assert.equal(unavailable.actions.length,0);assert.equal(JSON.stringify(unavailable).includes('私密报价'),false);assert.equal((await inbox.service.list(actor,{})).unreadCount,0);
 }finally{await client.query('delete from orbit_records where workspace_id=$1',[workspaceId]);await client.close();}
});
