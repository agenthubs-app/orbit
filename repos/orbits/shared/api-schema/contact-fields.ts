import { z } from "zod";
import { knownValues } from "./tolerant";

const FIELDS = ["displayName", "organization", "role", "email", "phone"] as const;
const value = z.string().max(256).nullable();

/** R11a：请求严格（未知字段报错），响应宽进。 */
export const contactFieldsUpdateInputObject = z.object({
  values: z.object({ displayName: value.optional(), organization: value.optional(), role: value.optional(), email: value.optional(), phone: value.optional() }).strict(),
  /** AG12：可选的期望版本；带了就不自动重试，不符返回 409。 */
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
export const contactFieldsUpdateResultObject = z.object({
  contactId: z.string().min(1).max(512),
  changed: knownValues(FIELDS),
  updatedAt: z.string().datetime({ offset: true }),
  version: z.number().int().min(1).optional(),
});
export const contactFieldsUpdateInputSchema = contactFieldsUpdateInputObject;
export const contactFieldsUpdateResultSchema = contactFieldsUpdateResultObject;
