import type {InboxNotificationDTO,InboxNotificationListDTO} from './contract/inbox-notifications';
import {inboxNotificationListSchema,inboxNotificationSchema} from './schema/inbox-notifications';
export const INBOX_NOTIFICATIONS_PATH='/api/inbox/notifications';
export function notificationInboxData(raw:unknown,actorId:string):InboxNotificationListDTO|null {
 const result=inboxNotificationListSchema.safeParse(raw);return result.success&&result.data.items.every(n=>n.actorId===actorId)?result.data:null;
}
export function notificationDetailData(raw:unknown,actorId:string,id:string):InboxNotificationDTO|null {
 const result=inboxNotificationSchema.safeParse(raw);return result.success&&result.data.actorId===actorId&&result.data.id===id?result.data:null;
}
export const notificationDetailPath=(id:string)=>INBOX_NOTIFICATIONS_PATH+'/'+encodeURIComponent(id);
