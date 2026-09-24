import type {OrbitApiClient} from './client';
import {legacyNotificationUnreadSummarySchema} from './schema/legacy-notification-unread-summary';
import {relationshipAlertsToView} from '../view-models/relationship-inbox';

export const LEGACY_UNREAD_SUMMARY_PATH='/api/notifications/unread-summary';
export interface LegacyUnreadCapability {legacyOnly?:boolean}
export async function readLegacyNotificationUnreadCount(input:{client:OrbitApiClient;actorId:string;signal:AbortSignal;capability:LegacyUnreadCapability}):Promise<number|undefined> {
  if(!input.capability.legacyOnly) {
    const result=await input.client.get<unknown>(LEGACY_UNREAD_SUMMARY_PATH,{signal:input.signal});
    if(input.signal.aborted)return undefined;
    if(result.status!==404&&result.status!==405) {
      if(!result.success||result.status<200||result.status>=300)return undefined;
      const parsed=legacyNotificationUnreadSummarySchema.safeParse(result.data);
      return parsed.success&&parsed.data.actorId===input.actorId?parsed.data.unreadTotal:undefined;
    }
    input.capability.legacyOnly=true;
  }
  const result=await input.client.get<unknown>('/api/notifications',{signal:input.signal});
  if(input.signal.aborted||!result.success||result.status<200||result.status>=300)return undefined;
  return relationshipAlertsToView(result.data).alerts.filter(item=>!item.read).length;
}
