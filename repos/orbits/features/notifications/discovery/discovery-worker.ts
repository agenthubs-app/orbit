import { randomUUID } from 'node:crypto';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../../shared/storage/postgres-live-record-store';
import { createInboxRuntime } from '../inbox-record-service-factory';
import type { InboxStoredRecord } from '../storage/inbox-record-repository';
import type { DiscoveryEvidence, DiscoveryJob, DiscoveryPreferences } from './contract';
import { DISCOVERY_LIMITS } from './contract';
import type { DiscoveryRepository } from './discovery-repository';
import type { DiscoverySourceAdapters } from './source-adapters';
import { createDiscoverySourceAdapters } from './source-adapters';
import type { DiscoveryExtractor, DiscoveryPackage } from './evidence-extractor';
import { DiscoveryProviderError } from './evidence-extractor';
import { localDiscoveryDay, qualifyDiscoveryCandidate, discoveryPrefilter } from './qualification-policy';
import { discoveryDigest, semanticDiscoveryKey } from './semantic-dedup';

export function createDiscoveryWorker(input:{client:TransactionalPostgresClient;workspaceId:string;repository:DiscoveryRepository;sources:DiscoverySourceAdapters;extractor:DiscoveryExtractor;now?:()=>string}) {
 const now=input.now??(()=>new Date().toISOString());
 function transactionalClient(executor:TransactionalSqlExecutor):TransactionalPostgresClient{return {...executor,transaction:operation=>operation(executor),close:async()=>{}};}
 async function publish(executor:TransactionalSqlExecutor,job:DiscoveryJob,p:DiscoveryPreferences,candidate:NonNullable<Awaited<ReturnType<DiscoveryExtractor['extract']>>['results'][number]['candidate']>,original:DiscoveryEvidence[]) {
  const store=createPostgresLiveRecordStore({client:executor});
  const sources=createDiscoverySourceAdapters({store,client:executor,workspaceId:input.workspaceId,preferences:async()=>p,now});
  const fresh:DiscoveryEvidence[]=[];
  for(const s of original){const item=await sources.read(job.actorId,{kind:s.source.sourceKind,id:s.source.sourceId,revision:s.source.sourceRevision,at:s.source.occurredAt,key:s.key},false);if(!item)return {value:null,reason:'source_changed'};fresh.push(item);}
  const qualified=qualifyDiscoveryCandidate({actorId:job.actorId,candidate,evidence:fresh,now:now(),timeZone:p.timeZone});
  if(!qualified.eligible)return {value:null,reason:(qualified as {reason:string}).reason};
  const q=qualified;
  const primary=q.evidence.filter(s=>s.source.sourceKind!=='goal'&&s.source.sourceKind!=='contact');
  const semanticKey=semanticDiscoveryKey({actorId:job.actorId,objectId:q.object.id,action:q.action,...(q.kind==='reminder'?{dueAt:q.expiresAt}:q.dueAt?{dueAt:q.dueAt}:{}),evidence:primary.length?primary:q.evidence.filter(s=>s.source.sourceKind!=='goal')});
  const id='inbox:'+discoveryDigest([job.actorId,semanticKey]).slice(0,32);
  const previous=(await store.getRecord({workspaceId:input.workspaceId,collectionName:'inboxNotifications',recordId:id}))?.payload as unknown as InboxStoredRecord|undefined;
  if(!previous&&q.kind==='suggestion'){
   const recordId=job.actorId+':'+localDiscoveryDay(now(),p.timeZone),collectionName='notificationDiscoveryQuota';
   const quota=await store.getRecord({workspaceId:input.workspaceId,collectionName,recordId});const count=Number(quota?.payload.count??0);
   if(count>=DISCOVERY_LIMITS.suggestionsPerDay)return {value:null,reason:'daily_suggestion_limit'};
   await store.upsertRecord({workspaceId:input.workspaceId,collectionName,recordId,userId:job.actorId,sourceType:'system',sourceId:recordId,evidenceIds:[],lifecycleState:'active',payload:{count:count+1},createdAt:now(),updatedAt:now()});
  }
  const incoming=q.evidence.map(s=>({...s.source,objectId:'discovery',excerpt:s.key===candidate.sourceKeys[0]?q.facts:s.text.slice(0,500)}));
  const merged=new Map((previous?.notification.sources??[]).map(s=>[s.sourceKind+':'+s.sourceId,s]));for(const source of incoming)merged.set(source.sourceKind+':'+source.sourceId,source);
  if(merged.size>20)return {value:null,reason:'evidence_limit'};
  const title=q.object.name+' · '+q.action;
  const copy={zh:{title,reason:`原文：${q.facts}\nAI 判断：${q.inference}`},en:{title,reason:`Source: ${q.facts}\nAI inference: ${q.inference}`},ja:{title,reason:`原文：${q.facts}\nAI の判断：${q.inference}`}};
  const source=q.evidence.find(s=>s.key===candidate.sourceKeys[0])!;
  const runtime=createInboxRuntime({client:transactionalClient(executor),workspaceId:input.workspaceId,now});
  const notification=await runtime.service.upsert({actorId:job.actorId,semanticKey,kind:q.kind,origin:'automation',object:q.object,...copy[p.language],copy,sources:[...merged.values()],target:{kind:source.source.sourceKind==='task'?'task':'source',id:source.source.sourceId,href:source.href,status:'available'},actions:source.source.sourceKind==='task'?['read','dismiss','handle']:['read','dismiss','accept'],occurredAt:now(),...(q.dueAt?{dueAt:q.dueAt}:{}),...(q.scheduledFor?{scheduledFor:q.scheduledFor}:{}),expiresAt:q.expiresAt});
  return {value:notification.id,notificationId:notification.id};
 }
 return {async runActor(actorId:string) {
  const token=randomUUID(),metrics={scanned:0,requests:0,published:0,rejected:0,status:'idle' as string};
  if(!await input.repository.acquireActor(actorId,token))return {...metrics,status:'leased'};
  let error:string|null=null;
  try {
   const prefs=await input.repository.preferences(actorId);if(!prefs.enabled)return {...metrics,status:'disabled'};
   const saved=await input.repository.state(actorId);let cursor=saved.cursor??{at:prefs.enabledSince,key:''};const asOf=now();
   for(let page=0;page<DISCOVERY_LIMITS.pagesPerRound;page++){
    const result=await input.sources.scan(actorId,cursor,asOf);if(result.refs.length>50)throw new Error('Adapter exceeded source page');
    await input.repository.enqueuePage(actorId,token,prefs.generation,result.refs,result.hasMore?result.cursor:{at:prefs.enabledSince,key:''});metrics.scanned+=result.refs.length;cursor=result.cursor;if(!result.hasMore)break;
   }
   for(let request=0;request<DISCOVERY_LIMITS.requestsPerRound;request++){
    const jobs=await input.repository.claim(actorId,token,DISCOVERY_LIMITS.packagesPerRequest);if(!jobs.length)break;
    const packages:DiscoveryPackage[]=[];
    for(const job of jobs){const evidence=await input.sources.read(actorId,job.source);if(!evidence){await input.repository.complete(actorId,job.id,token,async()=>({value:null,reason:'source_unavailable'}));metrics.rejected++;continue;}const context=await input.sources.context(actorId,evidence);if(!discoveryPrefilter(evidence,context)){await input.repository.complete(actorId,job.id,token,async()=>({value:null,reason:'insufficient_relevance'}));metrics.rejected++;continue;}packages.push({jobId:job.id,evidence:[evidence,...context.filter(s=>s.key!==evidence.key)]});}
    if(!packages.length)continue;
    if(input.extractor.configured===false){error='discovery_provider_unconfigured';for(const pack of packages)await input.repository.deferUncalled(actorId,pack.jobId,token,error);break;}
    if(input.extractor.paid){const budget=await input.repository.reserveCost(token+':'+request,input.extractor.upperBoundUsd);if(!budget.allowed){error=(budget as {reason:string}).reason;for(const p of packages)await input.repository.deferUncalled(actorId,p.jobId,token,error);break;}}
    // Consent is checked again after the potentially slow source collection.
    const current=await input.repository.preferences(actorId);if(!current.enabled||current.generation!==prefs.generation){metrics.status='cancelled';break;}
    metrics.requests++;
    const requestId=token+':'+request;
    await input.repository.recordModelCall(actorId,requestId,{state:'started',jobIds:packages.map(p=>p.jobId),reservedUsd:input.extractor.paid?input.extractor.upperBoundUsd:0});
    try {
     const extracted=await input.extractor.extract(packages,{actorId,language:prefs.language,timeZone:prefs.timeZone});
     await input.repository.recordModelCall(actorId,requestId,{state:'succeeded',jobIds:packages.map(p=>p.jobId),reservedUsd:input.extractor.paid?input.extractor.upperBoundUsd:0,metadata:extracted.metadata});
     const byId=new Map(extracted.results.map(r=>[r.jobId,r]));
     for(const pack of packages){const result=byId.get(pack.jobId);if(!result)throw new DiscoveryProviderError('missing_job_result',true);
      if(!result.candidate){await input.repository.complete(actorId,pack.jobId,token,async()=>({value:null,reason:result.reason||'insufficient_evidence'}));metrics.rejected++;continue;}
      const candidate=result.candidate;
      const id=await input.repository.complete(actorId,pack.jobId,token,(executor,job,p)=>publish(executor,job,p,candidate,pack.evidence));if(id)metrics.published++;else metrics.rejected++;
     }
    } catch(e){const reason=e instanceof DiscoveryProviderError?e.reason:'worker_processing_failed';const retryable=e instanceof DiscoveryProviderError?e.retryable:true;await input.repository.recordModelCall(actorId,requestId,{state:'failed',jobIds:packages.map(p=>p.jobId),reservedUsd:input.extractor.paid?input.extractor.upperBoundUsd:0,reason});for(const pack of packages)await input.repository.fail(actorId,pack.jobId,token,reason,retryable);error=reason;}
   }
   return {...metrics,status:error??'ok'};
  } catch(e){error=e instanceof Error?e.name:'worker_failed';throw e;}
  finally {await input.repository.releaseActor(actorId,token,error);}
 }};
}
