import type { InboxNotificationDTO, InboxNotificationSource } from '../../shared/contract/inbox-notifications';
import type { InboxReadWindow } from './storage/inbox-record-repository';

/** Separate page payloads from global, permission-checked unread candidates. */
export async function readBoundedInbox(input:{
  window:InboxReadWindow;actorId:string;asOf:string;now:string;limit:number;
  history:boolean;kind?:InboxNotificationDTO['kind'];before?:{at:string;id:string};
  present:(row:InboxNotificationDTO)=>Promise<InboxNotificationDTO>;
  access:(actor:string,source:InboxNotificationSource)=>Promise<'available'|'changed'|'unavailable'>;
}) {
  const items:InboxNotificationDTO[]=[];
  let before=input.before,hasMore=false,unreadCount=0;
  while(true) {
    const size=Math.min(50,input.limit+1-items.length);
    const rows=await input.window.page({actorId:input.actorId,asOf:input.asOf,limit:size,history:input.history,
      ...(input.kind?{kind:input.kind}:{}),...(before?{before}:{})});
    for(const row of rows) {
      const n=await input.present(row);
      const active=n.disposition==='open' && (!n.scheduledFor||Date.parse(n.scheduledFor)<=Date.parse(input.asOf))
        && (n.kind==='reminder'||Date.parse(n.occurredAt)>=Date.parse(input.asOf)-30*86400000);
      if(!input.history && (n.target.status==='unavailable'||!active))continue;
      if(items.length<input.limit)items.push(n);else {hasMore=true;break;}
    }
    if(hasMore||rows.length<size)break;
    const last=rows.at(-1)!;before={at:last.occurredAt,id:last.id};
  }
  before=undefined;
  // Not a raw COUNT: current authorization and revision determine unreadness.
  // Only active unread source metadata is transferred, not read history/copy/receipts.
  while(true) {
    const rows=await input.window.unreadPage({actorId:input.actorId,asOf:input.asOf,now:input.now,limit:50,...(before?{before}:{})});
    for(const row of rows) {
      const states=await Promise.all(row.sources.map(source=>input.access(input.actorId,source)));
      if(states.length && states.every(state=>state==='available'))unreadCount++;
    }
    if(rows.length<50)break;
    const last=rows.at(-1)!;before={at:last.occurredAt,id:last.id};
  }
  return {items,hasMore,unreadCount};
}
