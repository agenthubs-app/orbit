import { z } from 'zod';
import type { InboxNotificationDTO, InboxNotificationListDTO, InboxNotificationActionInput, InboxNotificationReadBatchInput } from '../contract/inbox-notifications';
const id = z.string().trim().min(1).max(512);
const instant = z.string().datetime({ offset: true });
export const inboxNotificationActionSchema = z.object({
  action: z.enum(['read','dismiss','handle','snooze','accept']), expectedRevision:z.number().int().positive(), idempotencyKey:id, scheduledFor:instant.optional(),
}).strict() as z.ZodType<InboxNotificationActionInput>;
export const inboxNotificationReadBatchSchema: z.ZodType<InboxNotificationReadBatchInput> = z.object({
  items:z.array(z.object({id,expectedRevision:z.number().int().positive()}).strict()).min(1).max(50), idempotencyKey:id,
}).strict();
export const inboxNotificationSchema = z.object({
  id,actorId:id,revision:z.number().int().positive(),kind:z.enum(['reminder','suggestion','update']),origin:z.enum(['user','automation','business']),semanticKey:id,
  title:z.string().min(1).max(1000),reason:z.string().min(1).max(4000),object:z.object({id,name:z.string().min(1)}).optional(),
  sources:z.array(z.object({sourceKind:z.enum(['reminder_plan','task','schedule','appointment','batch','connection','note','message','contact','goal']),sourceId:id,sourceRevision:id,occurredAt:instant,readAt:instant,authorId:id.optional(),objectId:id.optional(),excerpt:z.string().max(4000).optional()})).min(1).max(20),
  target:z.object({kind:z.enum(['task','schedule','appointment','event','conversation','batch','source']),id,href:z.string().regex(/^\/(?!\/)/).nullable(),status:z.enum(['available','changed','unavailable'])}),
  actions:z.array(z.enum(['read','dismiss','handle','snooze','accept'])),occurredAt:instant,updatedAt:instant,readAt:instant.nullable(),dueAt:instant.optional(),scheduledFor:instant.optional(),expiresAt:instant.optional(),disposition:z.enum(['open','dismissed','handled','accepted','expired','archived']),legacyId:id.optional(),createdTaskId:id.optional(),
  copy:z.object({zh:z.object({title:z.string(),reason:z.string()}),en:z.object({title:z.string(),reason:z.string()}),ja:z.object({title:z.string(),reason:z.string()})}).optional(),
}).strict() as z.ZodType<InboxNotificationDTO>;
export const inboxNotificationListSchema = z.object({enabled:z.boolean(),items:z.array(inboxNotificationSchema),unreadCount:z.number().int().nonnegative(),nextCursor:z.string().nullable(),asOf:instant}) as z.ZodType<InboxNotificationListDTO>;
