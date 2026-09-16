import {NextResponse} from 'next/server';
import {resolveAuthenticatedApiActor,authenticatedApiActorRequiredResponse,type ResolveAuthenticatedApiActor} from '../../../_shared/authenticated-actor';
import {createConfiguredTransactionalPostgresRuntime} from '../../../../../shared/storage/transactional-postgres';
import {createDiscoveryRepository,DiscoveryConflict} from '../../../../../features/notifications/discovery/discovery-repository';
import {notificationDiscoveryPreferencesInputSchema} from '../../../../../shared/api-schema/notification-discovery';
import {isTypedInboxEnabled} from '../../../../../features/notifications/inbox-record-service-factory';
import {success,failure} from '../../../../../shared/api/envelope';
import {AppError} from '../../../../../shared/errors/app-error';
export function createDiscoveryPreferencesHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;runtime?:typeof createConfiguredTransactionalPostgresRuntime;enabled?:typeof isTypedInboxEnabled}={}) {
 return async(request:Request):Promise<Response>=>{
  const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();if(!actor)return authenticatedApiActorRequiredResponse('live');
  const headers={'Cache-Control':'no-store'};
  if(!(options.enabled??isTypedInboxEnabled)(actor.id))return NextResponse.json(failure(new AppError('NOT_FOUND','Feature unavailable')),{status:404,headers});
  try {
   const runtime=(options.runtime??createConfiguredTransactionalPostgresRuntime)();if(!runtime)throw new Error('Storage unavailable');
   const repository=createDiscoveryRepository(runtime);
   if(request.method==='PUT'||request.method==='POST'){const parsed=notificationDiscoveryPreferencesInputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json(failure(new AppError('VALIDATION_ERROR','Invalid preferences')),{status:400,headers});await repository.updatePreferences(actor.id,parsed.data);}
   return NextResponse.json(success({...await repository.health(actor.id),sources:{email:'unavailable',calendar:'unavailable'}}),{headers});
  } catch(e){const conflict=e instanceof DiscoveryConflict;return NextResponse.json(failure(new AppError(conflict?'CONFLICT':'SERVICE_UNAVAILABLE',conflict?'Preferences changed; refresh':'Discovery settings unavailable')),{status:conflict?409:503,headers});}
 };
}
