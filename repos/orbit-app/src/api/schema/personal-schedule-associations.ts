import { z } from "zod";

const text = z.string().trim().min(1);
const avatarUrl = text.max(2_000).refine(value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}, "Invalid avatar URL");
const option = z.object({ id: text.max(300), title: text.max(500), avatarUrl: avatarUrl.optional() }).strict();

export const personalScheduleAssociationOptionsPageSchema = z.object({
  actorId: text,
  kind: z.enum(["note", "contact"]),
  options: z.array(option).max(20).refine(options => new Set(options.map(value => value.id)).size === options.length, "Duplicate association ID"),
  sourceVersion: text.max(300),
  nextCursor: text.max(2_048).optional(),
  partial: z.boolean(),
}).strict().refine(page => !page.partial || !!page.nextCursor, "Partial page requires continuation");
