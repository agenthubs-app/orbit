import {createConfiguredTransactionalPostgresRuntime} from '../../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../../shared/storage/postgres-live-record-store';
import {createDiscoveryRepository} from './discovery-repository';
import {createDiscoverySourceAdapters} from './source-adapters';
import {createEvidenceExtractor} from './evidence-extractor';
import {createDiscoveryWorker} from './discovery-worker';

export function createConfiguredDiscoveryWorker(env:NodeJS.ProcessEnv=process.env) {
 const runtime=createConfiguredTransactionalPostgresRuntime({env,max:4});if(!runtime)return null;
 const repository=createDiscoveryRepository(runtime),store=createPostgresLiveRecordStore({client:runtime.client});
 const sources=createDiscoverySourceAdapters({...runtime,store,preferences:actor=>repository.preferences(actor)});
 // No implicit developer key or provider fallback. Missing audited budget blocks before any model request.
 const upperBoundUsd=Number(env.ORBIT_DISCOVERY_REQUEST_COST_BOUND_USD??'1');
 if(!Number.isFinite(upperBoundUsd)||upperBoundUsd<=0||upperBoundUsd>5)throw new Error('Invalid discovery request cost bound');
 const extractor=createEvidenceExtractor({upperBoundUsd,config:{apiKey:env.ORBIT_DISCOVERY_API_KEY??'',provider:env.ORBIT_DISCOVERY_PROVIDER??'deepseek',model:env.ORBIT_DISCOVERY_MODEL??null,endpoint:env.ORBIT_DISCOVERY_ENDPOINT,deepseekThinking:false}});
 return {...runtime,repository,worker:createDiscoveryWorker({...runtime,repository,sources,extractor})};
}
