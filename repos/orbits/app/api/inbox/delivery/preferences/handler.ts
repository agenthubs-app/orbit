import {NextResponse} from 'next/server';
import {resolveAuthenticatedApiActor,authenticatedApiActorRequiredResponse,type ResolveAuthenticatedApiActor} from '../../../_shared/authenticated-actor';
import {createConfiguredDeliveryPolicyRuntime} from '../../../../../features/notifications/typed-delivery-factory';
import {DeliveryPolicyConflict,DeliveryPolicyInvalid} from '../../../../../features/notifications/delivery-policy-repository';
import {inboxDeliveryPreferencesInputSchema} from '../../../../../shared/api-schema/notification-delivery-policy';
import {isTypedInboxEnabled} from '../../../../../features/notifications/inbox-record-service-factory';
import {success,failure} from '../../../../../shared/api/envelope';
import {AppError} from '../../../../../shared/errors/app-error';
export function createDeliveryPolicyHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;runtime?:typeof createConfiguredDeliveryPolicyRuntime;enabled?:typeof isTypedInboxEnabled}={}) {
 return async(request:Request):Promise<Response>=>{
  const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();if(!actor)return authenticatedApiActorRequiredResponse('live');const headers={'Cache-Control':'no-store'};
  if(!(options.enabled??isTypedInboxEnabled)(actor.id))return NextResponse.json(failure(new AppError('NOT_FOUND','Feature unavailable')),{status:404,headers});
  try {const runtime=(options.runtime??createConfiguredDeliveryPolicyRuntime)(actor.id);if(!runtime)throw Error('Storage unavailable');
   if(request.method==='PUT'||request.method==='POST'){const parsed=inboxDeliveryPreferencesInputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json(failure(new AppError('VALIDATION_ERROR','Invalid preferences')),{status:400,headers});const value=await runtime.repository.updatePreferences(actor.id,parsed.data,runtime.sources.authorizeConversation);return NextResponse.json(success(value),{headers});}
   return NextResponse.json(success(await runtime.repository.preferences(actor.id)),{headers});
  }catch(error){const conflict=error instanceof DeliveryPolicyConflict,invalid=error instanceof DeliveryPolicyInvalid;return NextResponse.json(failure(new AppError(conflict?'CONFLICT':invalid?'VALIDATION_ERROR':'SERVICE_UNAVAILABLE',conflict?'Preferences changed or conversation unavailable':invalid?'Invalid preferences':'Notification settings unavailable')),{status:conflict?409:invalid?400:503,headers});}
 };
}
