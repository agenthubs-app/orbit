import type { InboxNotificationDTO, InboxNotificationSource } from '../../shared/contract/inbox-notifications';
import type { InboxReadWindow } from './storage/inbox-record-repository';

/** Separate page payloads from global, permission-checked unread candidates. */
export async function readBoundedInbox(input:{
  window:InboxReadWindow;actorId:string;asOf:string;now:string;limit:number;
  history:boolean;kind?:InboxNotificationDTO['kind'];before?:{at:string;id:string};
  present:(row:InboxNotificationDTO)=>Promise<InboxNotificationDTO>;
  presentBatch?:(rows:readonly InboxNotificationDTO[])=>Promise<readonly InboxNotificationDTO[]>;
  access:(actor:string,source:InboxNotificationSource)=>Promise<'available'|'changed'|'unavailable'>;
  accessBatch?:(actor:string,sources:readonly InboxNotificationSource[])=>Promise<readonly ('available'|'changed'|'unavailable')[]>;
}) {
  const items:InboxNotificationDTO[]=[];
  let before=input.before,hasMore=false,unreadCount=0;
  while(true) {
    const size=Math.min(50,input.limit+1-items.length);
    const rows=await input.window.page({actorId:input.actorId,asOf:input.asOf,limit:size,history:input.history,
      ...(input.kind?{kind:input.kind}:{}),...(before?{before}:{})});
    const presented:InboxNotificationDTO[]=[];
    if(input.presentBatch)presented.push(...await input.presentBatch(rows));
    else for(const row of rows)presented.push(await input.present(row));
    if(presented.length!==rows.length)throw new Error('Incomplete notification presentation');
    for(const n of presented) {
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
    const sources=rows.flatMap(row=>row.sources);
    const states:('available'|'changed'|'unavailable')[]=[];
    if(input.accessBatch)states.push(...await input.accessBatch(input.actorId,sources));
    else for(const row of rows)states.push(...await Promise.all(row.sources.map(source=>input.access(input.actorId,source))));
    if(states.length!==sources.length)throw new Error('Incomplete source authorization');
    let offset=0;
    for(const row of rows) {
      const checked=states.slice(offset,offset+row.sources.length);offset+=row.sources.length;
      if(checked.length && checked.every(state=>state==='available'))unreadCount++;
    }
    if(rows.length<50)break;
    const last=rows.at(-1)!;before={at:last.occurredAt,id:last.id};
  }
  return {items,hasMore,unreadCount};
}
