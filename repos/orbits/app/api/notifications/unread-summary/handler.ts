import {NextResponse} from 'next/server';
import {resolveSharedReadBudgetGate} from '../../../../features/sync/read-budget-gate';
import {readLegacyNotificationUnreadSummary} from '../../../../features/notifications/legacy-unread-summary';
import type {LegacyNotificationUnreadSummaryDTO} from '../../../../shared/contract/legacy-notification-unread-summary';
import {failure,success} from '../../../../shared/api/envelope';
import {AppError} from '../../../../shared/errors/app-error';
import {createConfiguredPostgresLiveRecordStore} from '../../../../shared/storage/configured-live-record-store';
import {authenticatedApiActorRequiredResponse,resolveAuthenticatedApiActor,type ResolveAuthenticatedApiActor} from '../../_shared/authenticated-actor';

export function createLegacyUnreadSummaryGetHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;read?:(actorId:string)=>Promise<LegacyNotificationUnreadSummaryDTO>}={}) {
  return async function GET():Promise<Response> {
    const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();
    if(!actor)return authenticatedApiActorRequiredResponse('live');
    const actorId=actor.accountId??actor.id;
    try {
      resolveSharedReadBudgetGate()?.assertAllowed({collectionName:'notifications'});
      const runtime=options.read?null:createConfiguredPostgresLiveRecordStore();
      const data=options.read?await options.read(actorId):runtime?await readLegacyNotificationUnreadSummary({...runtime,actorId}):null;
      if(!data)throw new Error('Storage unavailable');
      return NextResponse.json(success(data),{headers:{'Cache-Control':'private, no-store'}});
    }catch{return NextResponse.json(failure(new AppError('SERVICE_UNAVAILABLE','Notification count is temporarily unavailable')),{status:503,headers:{'Cache-Control':'private, no-store'}});}
  };
}
