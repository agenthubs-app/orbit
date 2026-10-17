import { z } from "zod";

/** R11a：删除 / 恢复的响应（宽进）。请求没有 body。 */
export const contactDeleteResultObject = z.object({
  contactId: z.string().min(1).max(512),
  deletedAt: z.string().datetime({ offset: true }),
  restorableUntil: z.string().datetime({ offset: true }),
});
export const contactRestoreResultObject = z.object({
  contactId: z.string().min(1).max(512),
  restoredAt: z.string().datetime({ offset: true }),
});
export const contactDeleteResultSchema = contactDeleteResultObject;
export const contactRestoreResultSchema = contactRestoreResultObject;
