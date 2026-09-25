import type {OrbitApiClient} from './client';
import {inboxSummarySchema} from './schema/inbox-summary';

export const INBOX_SUMMARY_PATH='/api/inbox/summary';
export type UnifiedInboxCount={kind:'count';count:number|undefined};

export async function readUnifiedInboxCount(input:{client:OrbitApiClient;actorId:string;signal:AbortSignal}):Promise<UnifiedInboxCount> {
  const failed:UnifiedInboxCount={kind:'count',count:undefined};
  if(input.signal.aborted)return failed;
  try {
    const result=await input.client.get<unknown>(INBOX_SUMMARY_PATH,{signal:input.signal});
    if(input.signal.aborted)return failed;
    if(!result.success||result.status<200||result.status>=300)return failed;
    const parsed=inboxSummarySchema.safeParse(result.data);
    if(!parsed.success||parsed.data.actorId!==input.actorId)return failed;
    return {kind:'count',count:parsed.data.messagesUnread+parsed.data.notificationsUnread};
  } catch {return failed;}
}
