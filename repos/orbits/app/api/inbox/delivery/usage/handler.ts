import {NextResponse} from 'next/server';
import {resolveAuthenticatedApiActor,authenticatedApiActorRequiredResponse,type ResolveAuthenticatedApiActor} from '../../../_shared/authenticated-actor';
import {createConfiguredDeliveryPolicyRuntime} from '../../../../../features/notifications/typed-delivery-factory';
import {readDeliveryQuotaToday} from '../../../../../features/notifications/delivery-quota-read';
import {isTypedInboxEnabled} from '../../../../../features/notifications/inbox-record-service-factory';
import {success,failure} from '../../../../../shared/api/envelope';
import {AppError} from '../../../../../shared/errors/app-error';
// GET only: today's automatic pushes against the daily cap, for the Web inbox rail (b5 #6).
export function createDeliveryUsageHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;runtime?:typeof createConfiguredDeliveryPolicyRuntime;enabled?:typeof isTypedInboxEnabled;read?:typeof readDeliveryQuotaToday}={}) {
 return async():Promise<Response>=>{
  const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();if(!actor)return authenticatedApiActorRequiredResponse('live');const headers={'Cache-Control':'no-store'};
  if(!(options.enabled??isTypedInboxEnabled)(actor.id))return NextResponse.json(failure(new AppError('NOT_FOUND','Feature unavailable')),{status:404,headers});
  try {const runtime=(options.runtime??createConfiguredDeliveryPolicyRuntime)(actor.id);if(!runtime)throw Error('Storage unavailable');
   const preferences=await runtime.repository.preferences(actor.id);
   return NextResponse.json(success({actorId:actor.id,...await (options.read??readDeliveryQuotaToday)(runtime,actor.id,preferences)}),{headers});
  }catch{return NextResponse.json(failure(new AppError('SERVICE_UNAVAILABLE','Delivery usage unavailable')),{status:503,headers});}
 };
}
