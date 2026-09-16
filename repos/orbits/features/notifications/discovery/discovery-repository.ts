import {createStorageAccountLanguagePreferenceProvider} from '../../account-language/storage/account-language-live-record-provider';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../../shared/storage/postgres-live-record-store';
import type { DiscoveryCursor, DiscoveryJob, DiscoveryPreferences, DiscoverySourceRef } from './contract';
import { DISCOVERY_POLICY_VERSION } from './contract';
import { discoveryDigest } from './semantic-dedup';

const C={state:'notificationDiscoveryState',jobs:'notificationDiscoveryJobs',preferences:'notificationDiscoveryPreferences',budget:'notificationDiscoveryBudget'};
export interface DiscoveryState {
 cursor:DiscoveryCursor|null;leaseToken:string|null;leaseUntil:string|null;lastRoundAt:string|null;lastError:string|null;
}
export class DiscoveryConflict extends Error {}
export function createDiscoveryRepository(input:{client:TransactionalPostgresClient;workspaceId:string;now?:()=>string;budgetWorkspaceId?:string}) {
 const now=input.now??(()=>new Date().toISOString());
 const budgetWorkspaceId=input.budgetWorkspaceId??'orbit-project-ai-budget';
 const initialPrefs=(actorId:string):DiscoveryPreferences=>({actorId,enabled:false,messageAnalysisEnabled:false,timeZone:'Asia/Tokyo',language:'zh',revision:0,generation:0,enabledSince:now(),messageEnabledSince:now(),updatedAt:now()});
 const initialState=():DiscoveryState=>({cursor:null,leaseToken:null,leaseUntil:null,lastRoundAt:null,lastError:null});
 async function tx<T>(actorId:string,operation:(executor:TransactionalSqlExecutor)=>Promise<T>,workspaceId=input.workspaceId):Promise<T> {
  for(let i=0;;i++)try{return await input.client.transaction(async executor=>{await executor.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['notification-discovery',workspaceId,actorId])]);return operation(executor);});}catch(e){if(i>=2||!['40001','40P01'].includes(String((e as {code?:string}).code)))throw e;}
 }
 async function get<T>(executor:TransactionalSqlExecutor,collectionName:string,recordId:string,workspaceId=input.workspaceId):Promise<T|null>{return (await createPostgresLiveRecordStore({client:executor}).getRecord({workspaceId,collectionName,recordId}))?.payload as unknown as T??null;}
 async function save(executor:TransactionalSqlExecutor,collectionName:string,recordId:string,actorId:string,payload:unknown,workspaceId=input.workspaceId){await createPostgresLiveRecordStore({client:executor}).upsertRecord({workspaceId,collectionName,recordId,userId:actorId,sourceType:'system',sourceId:recordId,evidenceIds:[],lifecycleState:'active',payload:payload as Record<string,unknown>,createdAt:now(),updatedAt:now()});}
 async function prefs(executor:TransactionalSqlExecutor,actorId:string):Promise<DiscoveryPreferences> {
  const p=await get<DiscoveryPreferences>(executor,C.preferences,actorId)??initialPrefs(actorId);
  const profile=await executor.query<{time_zone:string|null}>(`select payload->>'timezone' as time_zone from orbit_records where workspace_id=$1 and collection_name='profiles' and user_id=$2 and payload->>'accountId'=$2 and lifecycle_state='active' order by updated_at desc,record_id limit 1`,[input.workspaceId,actorId]);
  const timeZone=profile.rows[0]?.time_zone;if(timeZone)try{new Intl.DateTimeFormat('en',{timeZone}).format();p.timeZone=timeZone;}catch{/* Keep the last validated account setting. */}
  const language=await createStorageAccountLanguagePreferenceProvider({store:createPostgresLiveRecordStore({client:executor}),workspaceId:input.workspaceId}).read(actorId);
  if(language.mode==='manual'&&language.language)p.language=language.language;
  return p;
 }
 const state=(executor:TransactionalSqlExecutor,actorId:string)=>get<DiscoveryState>(executor,C.state,actorId).then(p=>p??initialState());
 const leaseValid=(s:DiscoveryState,token:string)=>s.leaseToken===token&&!!s.leaseUntil&&Date.parse(s.leaseUntil)>Date.parse(now());
 async function jobs(executor:TransactionalSqlExecutor,actorId:string,limit=200){const result=await executor.query<{payload:DiscoveryJob}>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 order by created_at,record_id limit $4`,[input.workspaceId,C.jobs,actorId,limit]);return result.rows.map(r=>r.payload);}
 const repository={
  preferences:(actorId:string)=>prefs(input.client,actorId),
  state:(actorId:string)=>state(input.client,actorId),
  jobs:(actorId:string)=>jobs(input.client,actorId),
  async updatePreferences(actorId:string,patch:Partial<Pick<DiscoveryPreferences,'enabled'|'messageAnalysisEnabled'|'timeZone'|'language'>>&{expectedRevision:number}) {
   return tx(actorId,async executor=>{const old=await prefs(executor,actorId);if(old.revision!==patch.expectedRevision)throw new DiscoveryConflict('Preferences changed');
    if(patch.timeZone)new Intl.DateTimeFormat('en',{timeZone:patch.timeZone}).format();
    const changed=(patch.enabled!==undefined&&patch.enabled!==old.enabled)||(patch.messageAnalysisEnabled!==undefined&&patch.messageAnalysisEnabled!==old.messageAnalysisEnabled);
    const updated:DiscoveryPreferences={...old,...patch,actorId,revision:old.revision+1,generation:old.generation+(changed?1:0),enabledSince:patch.enabled&&!old.enabled?now():old.enabledSince,messageEnabledSince:patch.messageAnalysisEnabled&&!old.messageAnalysisEnabled?now():old.messageEnabledSince,updatedAt:now()};
    delete (updated as unknown as Record<string,unknown>).expectedRevision;
    await save(executor,C.preferences,actorId,actorId,updated);
    if(changed){
     const globalChanged=updated.enabled!==old.enabled;
     if(globalChanged){await executor.query(`update orbit_records set payload=payload||jsonb_build_object('state','cancelled','reason','preferences_changed','leaseToken',null,'leaseUntil',null),updated_at=$4::timestamptz where workspace_id=$1 and collection_name=$2 and user_id=$3 and payload->>'state' in ('queued','running')`,[input.workspaceId,C.jobs,actorId,now()]);}
     else {
      await executor.query(`update orbit_records set payload=payload||jsonb_build_object('generation',$4::int,'state',case when payload->'source'->>'kind'='message' then 'cancelled' else 'queued' end,'reason','analysis_permission_changed','leaseToken',null,'leaseUntil',null),updated_at=$5::timestamptz where workspace_id=$1 and collection_name=$2 and user_id=$3 and payload->>'state' in ('queued','running')`,[input.workspaceId,C.jobs,actorId,updated.generation,now()]);
     }
     const s=await state(executor,actorId);await save(executor,C.state,actorId,actorId,{...s,cursor:globalChanged&&updated.enabled?{at:now(),key:''}:s.cursor,leaseToken:null,leaseUntil:null});
    }
    return updated;
   });
  },
  async acquireActor(actorId:string,token:string){return tx(actorId,async executor=>{const s=await state(executor,actorId);if(s.leaseUntil&&Date.parse(s.leaseUntil)>Date.parse(now()))return false;await save(executor,C.state,actorId,actorId,{...s,leaseToken:token,leaseUntil:new Date(Date.parse(now())+180000).toISOString()});return true;});},
  async releaseActor(actorId:string,token:string,error:string|null=null){return tx(actorId,async executor=>{const s=await state(executor,actorId);if(s.leaseToken===token)await save(executor,C.state,actorId,actorId,{...s,leaseToken:null,leaseUntil:null,lastRoundAt:now(),lastError:error});});},
  async enqueuePage(actorId:string,token:string,generation:number,refs:DiscoverySourceRef[],cursor:DiscoveryCursor){
   if(refs.length>50)throw new Error('Source page exceeds 50');
   return tx(actorId,async executor=>{const s=await state(executor,actorId),p=await prefs(executor,actorId);if(!leaseValid(s,token)||!p.enabled||p.generation!==generation)throw new DiscoveryConflict('Discovery lease or authorization changed');
    for(const source of refs){const id='discovery-job:'+discoveryDigest([actorId,source.key,source.revision,DISCOVERY_POLICY_VERSION]);if(await get(executor,C.jobs,id))continue;
     const allowed=source.at>=p.enabledSince&&(source.kind!=='message'||(p.messageAnalysisEnabled&&source.at>=p.messageEnabledSince));
     const job:DiscoveryJob={id,actorId,source,generation,state:allowed?'queued':'cancelled',attempts:0,nextAttemptAt:now(),leaseUntil:null,leaseToken:null,reason:allowed?null:'analysis_disabled',notificationId:null};await save(executor,C.jobs,id,actorId,job);
    }
    await save(executor,C.state,actorId,actorId,{...s,cursor});
   });
  },
  async claim(actorId:string,token:string,limit:number):Promise<DiscoveryJob[]> {
   if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new Error('Model batch exceeds 20');
   return tx(actorId,async executor=>{const s=await state(executor,actorId),p=await prefs(executor,actorId);if(!p.enabled||!leaseValid(s,token))return [];
    const rows=await executor.query<{payload:DiscoveryJob}>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 and (payload->>'generation')::int=$4 and (payload->>'nextAttemptAt')::timestamptz<=$5::timestamptz and (payload->>'state'='queued' or (payload->>'state'='running' and (payload->>'leaseUntil')::timestamptz<=$5::timestamptz)) order by created_at,record_id limit $6`,[input.workspaceId,C.jobs,actorId,p.generation,now(),limit]);
    const result:DiscoveryJob[]=[];for(const {payload:j} of rows.rows){if(j.attempts>=3){await save(executor,C.jobs,j.id,actorId,{...j,state:'failed',reason:'attempts_exhausted',leaseToken:null,leaseUntil:null});continue;}const job:DiscoveryJob={...j,state:'running',attempts:j.attempts+1,leaseToken:token,leaseUntil:s.leaseUntil};await save(executor,C.jobs,j.id,actorId,job);result.push(job);}return result;
   });
  },
  async fail(actorId:string,id:string,token:string,reason:string,retryable:boolean){return tx(actorId,async executor=>{const job=await get<DiscoveryJob>(executor,C.jobs,id);if(!job||job.actorId!==actorId||job.leaseToken!==token||job.state!=='running')return;const retry=retryable&&job.attempts<3;await save(executor,C.jobs,id,actorId,{...job,state:retry?'queued':'failed',reason,nextAttemptAt:new Date(Date.parse(now())+(job.attempts===1?300000:1800000)).toISOString(),leaseUntil:null,leaseToken:null});});},
  async deferUncalled(actorId:string,id:string,token:string,reason:string){return tx(actorId,async executor=>{const job=await get<DiscoveryJob>(executor,C.jobs,id);if(!job||job.actorId!==actorId||job.leaseToken!==token||job.state!=='running')return;await save(executor,C.jobs,id,actorId,{...job,state:'queued',attempts:Math.max(0,job.attempts-1),reason,nextAttemptAt:new Date(Date.parse(now())+300000).toISOString(),leaseUntil:null,leaseToken:null});});},
  async complete<T>(actorId:string,id:string,token:string,operation:(executor:TransactionalSqlExecutor,job:DiscoveryJob,preferences:DiscoveryPreferences)=>Promise<{value:T;notificationId?:string;reason?:string}>):Promise<T|null>{return tx(actorId,async executor=>{const j=await get<DiscoveryJob>(executor,C.jobs,id),p=await prefs(executor,actorId),s=await state(executor,actorId);if(!j||j.actorId!==actorId||j.state!=='running'||j.leaseToken!==token||j.generation!==p.generation||!p.enabled||!leaseValid(s,token))return null;const result=await operation(executor,j,p);await save(executor,C.jobs,id,actorId,{...j,state:result.reason?'rejected':'done',reason:result.reason??null,notificationId:result.notificationId??null,leaseToken:null,leaseUntil:null});return result.value;});},
  async recordModelCall(actorId:string,requestId:string,details:{state:'started'|'succeeded'|'failed';reservedUsd:number;jobIds?:string[];metadata?:unknown;reason?:string}) {return tx(actorId,executor=>save(executor,'notificationDiscoveryCalls',requestId,actorId,{...details,actorId,requestId,actualCostUsd:null,settlement:'reserved_upper_bound',at:now()}));},
  async health(actorId:string){const p=await repository.preferences(actorId),s=await repository.state(actorId);const result=await input.client.query<{state:string;count:string}>(`select payload->>'state' as state,count(*)::text as count from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 group by payload->>'state'`,[input.workspaceId,C.jobs,actorId]);return {preferences:p,lastRoundAt:s.lastRoundAt,lastError:s.lastError,counts:Object.fromEntries(result.rows.map(r=>[r.state,Number(r.count)]))};},
  async reconcileBudget(reconciliation:{historicalUpperBoundUsd:number;reference:string}) {
   if(!Number.isFinite(reconciliation.historicalUpperBoundUsd)||reconciliation.historicalUpperBoundUsd<0||reconciliation.historicalUpperBoundUsd>5||!reconciliation.reference.trim())throw new Error('Invalid audited budget reconciliation');
   return tx('global',async executor=>{const previous=await get<{historicalUpperBoundUsd:number;reservations:Record<string,number>}>(executor,C.budget,'global',budgetWorkspaceId);if(previous&&previous.historicalUpperBoundUsd!==reconciliation.historicalUpperBoundUsd)throw new DiscoveryConflict('Budget reconciliation already recorded');await save(executor,C.budget,'global','global',{...reconciliation,reservations:previous?.reservations??{},hardCapUsd:5},budgetWorkspaceId);},budgetWorkspaceId);
  },
  async reserveCost(requestId:string,upperBoundUsd:number):Promise<{allowed:true;reservedUsd:number}|{allowed:false;reason:string}> {
   if(!Number.isFinite(upperBoundUsd)||upperBoundUsd<=0)throw new Error('A positive hard cost bound is required');
   return tx('global',async executor=>{const b=await get<{historicalUpperBoundUsd:number;reservations:Record<string,number>}>(executor,C.budget,'global',budgetWorkspaceId);if(!b)return {allowed:false,reason:'budget_unreconciled'};
    if(b.reservations[requestId]!==undefined)return {allowed:true,reservedUsd:b.reservations[requestId]};
    if(b.historicalUpperBoundUsd+Object.values(b.reservations).reduce((a,c)=>a+c,0)+upperBoundUsd>5+1e-9)return {allowed:false,reason:'budget_exhausted'};
    await save(executor,C.budget,'global','global',{...b,reservations:{...b.reservations,[requestId]:upperBoundUsd},hardCapUsd:5},budgetWorkspaceId);return {allowed:true,reservedUsd:upperBoundUsd};
   },budgetWorkspaceId);
  },
 };
 return repository;
}
export type DiscoveryRepository=ReturnType<typeof createDiscoveryRepository>;
