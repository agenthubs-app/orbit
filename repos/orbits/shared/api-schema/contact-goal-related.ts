import { z } from "zod";
import { readableItems } from "./tolerant";

/** R11a：GET /api/contacts/goal-related-ids 的响应（宽进：多余字段丢弃，读不了的 link 跳过）。 */
export const contactGoalRelatedLinkObject = z.object({
  contactId: z.string().min(1).max(512),
  label: z.string().max(120),
  talked: z.boolean(),
});
export const contactGoalRelatedIdsObject = z.object({
  ids: z.array(z.string().min(1).max(512)).max(500),
  truncated: z.boolean(),
  asOf: z.string().datetime({ offset: true }),
  links: readableItems(contactGoalRelatedLinkObject).optional(),
  followUpContactIds: z.array(z.string().min(1).max(512)).max(2000).optional(),
  sample: z.literal(true).optional(),
});
export const contactGoalRelatedIdsSchema = contactGoalRelatedIdsObject;
