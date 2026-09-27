import {z} from 'zod';
import type {InboxNotificationDTO,InboxNotificationListDTO} from './contract/inbox-notifications';
import {inboxNotificationSchema} from './schema/inbox-notifications';
export const INBOX_NOTIFICATIONS_PATH='/api/inbox/notifications';
// The page envelope is validated strictly; items are validated one by one so a
// notification type this build does not know yet (a newer server) or a single
// malformed item is skipped instead of failing the whole inbox (Sprint 0104).
const pageEnvelopeSchema=z.object({enabled:z.boolean(),items:z.array(z.unknown()),unreadCount:z.number().int().nonnegative(),nextCursor:z.string().nullable(),asOf:z.string().datetime({offset:true})});
function field(raw:unknown,key:string):unknown{return raw&&typeof raw==='object'&&!Array.isArray(raw)?(raw as Record<string,unknown>)[key]:undefined;}
export function notificationInboxData(raw:unknown,actorId:string):InboxNotificationListDTO|null {
 const page=pageEnvelopeSchema.safeParse(raw);if(!page.success)return null;
 const items:InboxNotificationDTO[]=[];let skipped=0,skippedUnread=0;
 for(const item of page.data.items){
  // Another account's row means the response itself is mis-scoped: fail closed.
  const owner=field(item,'actorId');if(typeof owner==='string'&&owner!==actorId)return null;
  const parsed=inboxNotificationSchema.safeParse(item);
  if(parsed.success&&parsed.data.actorId===actorId){items.push(parsed.data);continue;}
  skipped+=1;if(field(item,'readAt')===null)skippedUnread+=1;
 }
 if(skipped>0&&process.env.NODE_ENV!=='production')console.warn(`[inbox] skipped ${skipped} unrecognized notification item(s)`);
 return {...page.data,items,unreadCount:Math.max(0,page.data.unreadCount-skippedUnread)};
}
export function notificationDetailData(raw:unknown,actorId:string,id:string):InboxNotificationDTO|null {
 const result=inboxNotificationSchema.safeParse(raw);return result.success&&result.data.actorId===actorId&&result.data.id===id?result.data:null;
}
export const notificationDetailPath=(id:string)=>INBOX_NOTIFICATIONS_PATH+'/'+encodeURIComponent(id);
