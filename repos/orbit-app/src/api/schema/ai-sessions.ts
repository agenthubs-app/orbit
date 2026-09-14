import { z } from "zod";

import type {
  AiSessionOriginContract,
  AiSessionOriginInputContract,
  AiSessionReferenceContract,
  LegacyAiSessionOriginContract,
  StoredAiSessionOriginContract,
  ReliableAiSendInputContract,
  ReliableAiSendReceiptContract,
} from "../contract/ai-sessions";

const identifier = z.string().trim().min(1).max(160);
const referenceSchema: z.ZodType<AiSessionReferenceContract> = z.object({
  id: identifier,
  type: z.enum(["contact", "event", "note"]),
});
const entryPointIdSchema = z.enum([
  "ai.home",
  "ai.new_chat",
  "chat.ai_assistant",
  "contact.followup_draft",
  "contact.message_draft",
  "followup.task_candidate",
  "home.contact_priority",
  "home.event_preparation",
  "home.introductions",
  "inbox.polish_draft",
  "notes.task_suggestions",
]);

const aiSessionOriginInputObject = z.object({
    entryClient: z.enum(["app", "web"]),
    entryPointId: entryPointIdSchema,
    initialGroupId: identifier.nullable(),
    kind: z.enum(["manual", "structured"]),
    template: z
      .object({ id: identifier, version: z.number().int().positive() })
      .nullable(),
  });
export const aiSessionOriginInputSchema =
  aiSessionOriginInputObject as unknown as z.ZodType<AiSessionOriginInputContract>;

const recordedOriginSchema: z.ZodType<AiSessionOriginContract> =
  aiSessionOriginInputObject.extend({
    firstSentText: z.string().trim().min(1).max(12000),
    firstUserMessageId: identifier,
    recordedAt: z.string().datetime(),
    references: z.array(referenceSchema).max(20),
    schemaVersion: z.literal(1),
  }) as unknown as z.ZodType<AiSessionOriginContract>;

const legacyOriginSchema: z.ZodType<LegacyAiSessionOriginContract> = z.object({
  entryClient: z.literal("unknown"),
  entryPointId: z.literal("legacy.unknown"),
  firstSentText: z.null(),
  firstUserMessageId: z.null(),
  initialGroupId: z.null(),
  kind: z.literal("legacy_unknown"),
  recordedAt: z.null(),
  references: z.array(z.never()).max(0),
  schemaVersion: z.literal(1),
  template: z.null(),
}) as unknown as z.ZodType<LegacyAiSessionOriginContract>;

export const aiSessionOriginSchema = z.union([
  recordedOriginSchema,
  legacyOriginSchema,
]) as unknown as z.ZodType<StoredAiSessionOriginContract>;

export const reliableAiSendInputSchema: z.ZodType<ReliableAiSendInputContract> =
  z.object({
    clientMessageId: identifier,
    expectedMessageRevision: z.number().int().nonnegative(),
    locale: z.enum(["zh", "en", "ja"]),
    message: z.string().trim().min(1).max(12000),
    origin: aiSessionOriginInputSchema.optional(),
    protocolVersion: z.literal(2),
    references: z.array(referenceSchema).max(20),
    requestId: identifier,
    sessionId: identifier,
  });

export const reliableAiSendReceiptSchema: z.ZodType<ReliableAiSendReceiptContract> =
  z.object({
    messageRevision: z.number().int().nonnegative().optional(),
    protocolVersion: z.literal(2),
    replayed: z.boolean(),
    requestId: identifier,
    sessionId: identifier,
    state: z.enum([
      "completed",
      "failed_before_execution",
      "outcome_unknown",
      "pending",
    ]),
  });
