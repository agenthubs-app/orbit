import {inboxNotificationListSchema,inboxNotificationSchema} from '../../../../shared/api-schema/inbox-notifications';
import type {InboxNotificationKind} from '../../../../shared/contract/inbox-notifications';
export type NotificationCategory=InboxNotificationKind;
export function notificationInboxView(raw:unknown,actorId:string){const parsed=inboxNotificationListSchema.parse(raw);if(parsed.items.some(n=>n.actorId!==actorId))throw new Error('Inbox owner mismatch');return parsed;}
export function notificationDetailView(raw:unknown,actorId:string,id:string){const parsed=inboxNotificationSchema.parse(raw);if(parsed.actorId!==actorId||parsed.id!==id)throw new Error('Notification identity mismatch');return parsed;}
export type NotificationRow=ReturnType<typeof notificationDetailView>;
export type NotificationList=ReturnType<typeof notificationInboxView>;
