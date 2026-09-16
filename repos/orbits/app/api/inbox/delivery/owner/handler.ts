import {NextResponse} from 'next/server';
import {resolveAuthenticatedApiActor,authenticatedApiActorRequiredResponse,type ResolveAuthenticatedApiActor} from '../../../_shared/authenticated-actor';
import {createConfiguredDeliveryPolicyRuntime} from '../../../../../features/notifications/typed-delivery-factory';
import {DeliveryPolicyConflict} from '../../../../../features/notifications/delivery-policy-repository';
import {inboxDeliveryOwnerInputSchema} from '../../../../../shared/api-schema/notification-delivery-policy';
import {success,failure} from '../../../../../shared/api/envelope';
import {AppError} from '../../../../../shared/errors/app-error';
export function createDeliveryOwnerHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;runtime?:typeof createConfiguredDeliveryPolicyRuntime}={}) {
 return async(request:Request):Promise<Response>=>{
  const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();if(!actor)return authenticatedApiActorRequiredResponse('live');const headers={'Cache-Control':'no-store'};
  try{const runtime=(options.runtime??createConfiguredDeliveryPolicyRuntime)(actor.id);if(!runtime)throw Error('Storage unavailable');
   if(request.method==='POST'){const parsed=inboxDeliveryOwnerInputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json(failure(new AppError('VALIDATION_ERROR','Invalid ownership acknowledgement')),{status:400,headers});
    if(!(await runtime.devices.listActive()).some(d=>d.deviceId===parsed.data.deviceId))throw new DeliveryPolicyConflict('Device unavailable');
    return NextResponse.json(success(await runtime.repository.acknowledgeOwner(actor.id,parsed.data.deviceId,parsed.data.generation,parsed.data.localCancelled)),{headers});}
   const deviceId=new URL(request.url).searchParams.get('deviceId');if(!deviceId?.trim()||deviceId.length>256)return NextResponse.json(failure(new AppError('VALIDATION_ERROR','Device required')),{status:400,headers});
   return NextResponse.json(success(await runtime.repository.owner(actor.id,deviceId)),{headers});
  }catch(error){const conflict=error instanceof DeliveryPolicyConflict;return NextResponse.json(failure(new AppError(conflict?'CONFLICT':'SERVICE_UNAVAILABLE',conflict?'Delivery ownership changed':'Delivery ownership unavailable')),{status:conflict?409:503,headers});}
 };
}
