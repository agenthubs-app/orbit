import {pathToFileURL} from 'node:url';
import {createConfiguredDiscoveryWorker} from '../features/notifications/discovery/service-factory';
import {loadLocalEnv} from './load-local-env';

export async function runNotificationDiscoveryWorker(args:readonly string[],env:NodeJS.ProcessEnv=process.env) {
 const watch=args.includes('--watch'),intervalMs=Number(args[args.indexOf('--interval-ms')+1]??60000);
 const interval=args.includes('--interval-ms')?intervalMs:60000;
 if(!Number.isSafeInteger(interval)||interval<5000)throw new Error('Interval must be at least 5000ms');
 const actors=[...new Set((env.ORBIT_TYPED_INBOX_ACTORS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(!actors.length)throw new Error('An explicit QA actor allowlist is required');
 const runtime=createConfiguredDiscoveryWorker(env);if(!runtime)throw new Error('Discovery storage unavailable');
 let stopping=false;let wake:(()=>void)|undefined;const stop=()=>{stopping=true;wake?.();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try {do{for(const actorId of actors){if(stopping)break;try{const result=await runtime.worker.runActor(actorId);console.log(JSON.stringify({at:new Date().toISOString(),actorId,...result}));}catch{console.error(JSON.stringify({at:new Date().toISOString(),actorId,status:'round_failed'}));}}if(!watch||stopping)break;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,interval);wake=()=>{clearTimeout(timer);resolve();};});}while(!stopping);}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await runtime.client.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){loadLocalEnv();runNotificationDiscoveryWorker(process.argv.slice(2)).catch(e=>{console.error(e instanceof Error?e.message:'Discovery worker failed');process.exitCode=1;});}
