import { z } from "zod";
const id = z.string().min(1).max(512);
const at = z.string().datetime({ offset: true });
export const relationshipConversationIdentitySchema = z.object({
  conversationId: id, contactId: id,
  participantAccountIds: z.array(id).length(2).transform(values => [values[0]!, values[1]!] as [string, string]),
  participantDisplayNames: z.record(z.string(), z.string().max(512)),
  qualificationVersion: id, status: z.literal("active"), createdAt: at, updatedAt: at,
});
export const relationshipMessageSchema = z.object({
  messageId: id, conversationId: id, senderAccountId: id, senderDisplayName: z.string().min(1).max(1024),
  body: z.string().min(1).max(10000), sentAt: at, deliveryState: z.literal("delivered"),
});
export const relationshipConversationSummarySchema = relationshipConversationIdentitySchema.extend({
  unreadCount: z.number().int().nonnegative().safe(),
  lastMessage: z.object({ messageId: id, senderAccountId: id, sentAt: at, bodyPreview: z.string().max(640) }).nullable(),
});
export const relationshipConversationSummaryPageSchema = z.object({
  actorId: id, items: z.array(relationshipConversationSummarySchema).max(50),
  nextCursor: z.string().max(4096).nullable(), hasMore: z.boolean(), asOf: at,
});
export const relationshipMessagePageSchema = z.object({
  actorId: id, conversation: relationshipConversationIdentitySchema, items: z.array(relationshipMessageSchema).max(50),
  nextCursor: z.string().max(4096).nullable(), newestCursor: z.string().max(4096).nullable(),
  hasMore: z.boolean(), direction: z.enum(["older", "newer"]), asOf: at,
});
