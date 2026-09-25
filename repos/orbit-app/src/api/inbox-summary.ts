import type {OrbitApiClient} from './client';
import {inboxSummarySchema} from './schema/inbox-summary';
import {INBOX_NOTIFICATIONS_PATH,notificationInboxData} from './inbox-notifications';

export const INBOX_SUMMARY_PATH='/api/inbox/summary';
/** Capability belongs to one identity/server/focus scope, not a global flag. */
export interface InboxSummaryCapability {legacyOnly?:boolean}
export type UnifiedInboxCount={kind:'unsupported'}|{kind:'count';count:number|undefined};

export async function readUnifiedInboxCount(input:{client:OrbitApiClient;actorId:string;signal:AbortSignal;capability:InboxSummaryCapability}):Promise<UnifiedInboxCount> {
  const failed:UnifiedInboxCount={kind:'count',count:undefined};
  if(input.signal.aborted)return failed;
  if(input.capability.legacyOnly)return {kind:'unsupported'};
  try {
    const result=await input.client.get<unknown>(INBOX_SUMMARY_PATH,{signal:input.signal});
    if(input.signal.aborted)return failed;
    if(result.status===404||result.status===405){input.capability.legacyOnly=true;return {kind:'unsupported'};}
    if(!result.success||result.status<200||result.status>=300)return failed;
    const parsed=inboxSummarySchema.safeParse(result.data);
    if(!parsed.success||parsed.data.actorId!==input.actorId)return failed;
    const summary=parsed.data;
    if(summary.notificationRead==='ready')return {kind:'count',count:summary.messagesUnread+summary.notificationsUnread};
    // Until all typed producers are wired, retain only the required typed GET.
    // The server selected typed mode; a legacy count would be both wasteful and wrong.
    const typed=await input.client.get<unknown>(`${INBOX_NOTIFICATIONS_PATH}?limit=1`,{signal:input.signal});
    if(input.signal.aborted)return failed;
    if(typed.status===401||typed.status===403)return failed;
    const notifications=typed.success&&typed.status>=200&&typed.status<300?notificationInboxData(typed.data,input.actorId):null;
    // The summary selected typed mode. Missing, failed, or contradictory typed
    // data cannot prove a zero count and must not make the refresh look healthy.
    if(!notifications?.enabled)return failed;
    return {kind:'count',count:summary.messagesUnread+notifications.unreadCount};
  } catch {return failed;}
}
