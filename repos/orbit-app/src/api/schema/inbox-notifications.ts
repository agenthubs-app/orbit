import { z } from 'zod';
import { knownValues, readableItems, tolerantEnum } from './tolerant';
import type { InboxNotificationDTO, InboxNotificationListDTO, InboxNotificationActionInput, InboxNotificationReadBatchInput } from '../contract/inbox-notifications';
const id = z.string().trim().min(1).max(512);
const instant = z.string().datetime({ offset: true });
export const inboxNotificationActionSchema = z.object({
  action: z.enum(['read','dismiss','handle','snooze','accept']), expectedRevision:z.number().int().positive(), idempotencyKey:id, scheduledFor:instant.optional(),
}).strict() as z.ZodType<InboxNotificationActionInput>;
export const inboxNotificationReadBatchSchema: z.ZodType<InboxNotificationReadBatchInput> = z.object({
  items:z.array(z.object({id,expectedRevision:z.number().int().positive()}).strict()).min(1).max(50), idempotencyKey:id,
}).strict();
const SOURCE_KINDS = ['reminder_plan','task','schedule','appointment','batch','connection','note','message','contact','goal','read_cost_alert','event_contact_request','event_deadline','event_prep','event_pick','mail_summary'] as const;
const ACTIONS = ['read','dismiss','handle','snooze','accept'] as const;
const copyShape = (text: z.ZodString) => z.object({zh:z.object({title:text,reason:text}),en:z.object({title:text,reason:text}),ja:z.object({title:text,reason:text})});

/**
 * Server write validation (features/notifications/inbox-record-service.ts): strict —
 * a record the server stores must be exactly the contract shape.
 */
export const inboxNotificationWriteSchema = z.object({
  id,actorId:id,revision:z.number().int().positive(),kind:z.enum(['reminder','suggestion','update']),origin:z.enum(['user','automation','business']),semanticKey:id,
  title:z.string().min(1).max(1000),reason:z.string().min(1).max(4000),object:z.object({id,name:z.string().min(1)}).optional(),
  sources:z.array(z.object({sourceKind:z.enum(SOURCE_KINDS),sourceId:id,sourceRevision:id,occurredAt:instant,readAt:instant,authorId:id.optional(),objectId:id.optional(),excerpt:z.string().max(4000).optional()})).min(1).max(20),
  target:z.object({kind:z.enum(['task','schedule','appointment','event','conversation','batch','source']),id,href:z.string().regex(/^\/(?!\/)/).nullable(),status:z.enum(['available','changed','unavailable'])}),
  actions:z.array(z.enum(ACTIONS)),occurredAt:instant,updatedAt:instant,readAt:instant.nullable(),dueAt:instant.optional(),scheduledFor:instant.optional(),expiresAt:instant.optional(),disposition:z.enum(['open','dismissed','handled','accepted','expired','archived']),legacyId:id.optional(),createdTaskId:id.optional(),
  copy:copyShape(z.string()).optional(),
  sample:z.literal(true).optional(),
}).strict() as z.ZodType<InboxNotificationDTO>;

/**
 * Reading a notification (Web inbox and home, App inbox): tolerant (README rule 10).
 * Unknown keys are dropped; an unknown target kind reads as `source`, target status as
 * `unavailable` (no jump offered), disposition as `open`, origin as `automation`;
 * unknown actions are skipped. A notification kind or source kind this client does
 * not know means the item cannot be shown meaningfully: it fails here and the list
 * skips it, keeping the server's unread total (Sprint 0104 / 0122).
 */
export const inboxNotificationSchema = z.object({
  id,actorId:id,revision:z.number().int().positive(),kind:z.enum(['reminder','suggestion','update']),origin:tolerantEnum(['user','automation','business'],'automation'),semanticKey:id,
  title:z.string().min(1).max(1000),reason:z.string().min(1).max(4000),object:z.object({id,name:z.string().min(1)}).optional(),
  sources:z.array(z.object({sourceKind:z.enum(SOURCE_KINDS),sourceId:id,sourceRevision:id,occurredAt:instant,readAt:instant,authorId:id.optional(),objectId:id.optional(),excerpt:z.string().max(4000).optional()})).min(1).max(20),
  target:z.object({kind:tolerantEnum(['task','schedule','appointment','event','conversation','batch','source'],'source'),id,href:z.string().regex(/^\/(?!\/)/).nullable(),status:tolerantEnum(['available','changed','unavailable'],'unavailable')}),
  actions:knownValues(ACTIONS),occurredAt:instant,updatedAt:instant,readAt:instant.nullable(),dueAt:instant.optional(),scheduledFor:instant.optional(),expiresAt:instant.optional(),disposition:tolerantEnum(['open','dismissed','handled','accepted','expired','archived'],'open'),legacyId:id.optional(),createdTaskId:id.optional(),
  copy:copyShape(z.string()).optional(),
  sample:z.literal(true).optional(),
}) as unknown as z.ZodType<InboxNotificationDTO>;
/** A page: items this client cannot read are skipped; `unreadCount` stays the server total. */
export const inboxNotificationListSchema = z.object({enabled:z.boolean(),items:readableItems(inboxNotificationSchema),unreadCount:z.number().int().nonnegative(),nextCursor:z.string().nullable(),asOf:instant}) as z.ZodType<InboxNotificationListDTO>;
