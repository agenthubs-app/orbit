import {inboxNotificationListSchema,inboxNotificationSchema} from '../../../../shared/api-schema/inbox-notifications';
import type {InboxNotificationKind} from '../../../../shared/contract/inbox-notifications';
import { withoutMailSummary } from '../../../../shared/compute/secretary-source';
export type NotificationCategory=InboxNotificationKind;
export function notificationInboxView(raw:unknown,actorId:string){
 const items=raw&&typeof raw==='object'&&!Array.isArray(raw)?(raw as {items?:unknown}).items:null;
 if(Array.isArray(items)&&items.some(item=>item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.actorId==='string'&&item.actorId!==actorId))throw new Error('Inbox owner mismatch');
 const parsed=inboxNotificationListSchema.parse(raw);
 return {...parsed,items:withoutMailSummary(parsed.items)};
}
export function notificationDetailView(raw:unknown,actorId:string,id:string){const parsed=inboxNotificationSchema.parse(raw);if(parsed.actorId!==actorId||parsed.id!==id)throw new Error('Notification identity mismatch');if(withoutMailSummary([parsed]).length===0)throw new Error('Mail summary is unavailable');return parsed;}
export type NotificationRow=ReturnType<typeof notificationDetailView>;
export type NotificationList=ReturnType<typeof notificationInboxView>;
