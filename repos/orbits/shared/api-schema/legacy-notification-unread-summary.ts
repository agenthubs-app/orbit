import {z} from 'zod';
export const legacyNotificationUnreadSummarySchema=z.object({
  actorId:z.string().min(1),unreadTotal:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),refreshedAt:z.iso.datetime(),
}).strict();
