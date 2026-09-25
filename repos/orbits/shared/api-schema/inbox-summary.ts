import {z} from 'zod';
const base={actorId:z.string().min(1),messagesUnread:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),asOf:z.string().datetime({offset:true})};
export const inboxSummarySchema=z.object({...base,notificationMode:z.enum(['legacy','typed']),notificationRead:z.literal('ready'),notificationsUnread:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)});
