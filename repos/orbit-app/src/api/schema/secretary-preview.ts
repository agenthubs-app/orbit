import { z } from 'zod';
import { inboxNotificationSchema } from './inbox-notifications';
import { readableItems } from './tolerant';
import type { SecretaryPreviewDTO } from '../contract/secretary-preview';

const id = z.string().trim().min(1).max(512);
const item = z.object({
  key: id,
  eventId: id,
  kind: z.enum(['event_deadline', 'event_prep', 'event_pick', 'daily_recommendation']),
  notification: inboxNotificationSchema,
});

/** Unknown fields are discarded; unknown card or notification kinds skip only that card. */
export const secretaryPreviewSchema = z.object({
  actorId: id,
  items: readableItems(item),
  hasMore: z.boolean(),
  asOf: z.string().datetime({ offset: true }),
}) as z.ZodType<SecretaryPreviewDTO>;

/** A mixed-account response is unusable as a whole, even when its visible cards parse. */
export function parseSecretaryPreviewForActor(value: unknown, actorId: string): SecretaryPreviewDTO {
  const parsed = secretaryPreviewSchema.parse(value);
  if (parsed.actorId !== actorId || parsed.items.some(item => item.notification.actorId !== actorId)) {
    throw new Error('Secretary preview owner mismatch');
  }
  return parsed;
}
