import { z } from "zod";

import type {
  AiSessionReferenceContract,
  ReliableAiSendInputContract,
  ReliableAiSendReceiptContract,
} from "../contract/ai-sessions";

const identifier = z.string().trim().min(1).max(160);
const referenceSchema: z.ZodType<AiSessionReferenceContract> = z.object({
  id: identifier,
  type: z.enum(["contact", "event", "note"]),
});

export const reliableAiSendInputSchema: z.ZodType<ReliableAiSendInputContract> =
  z.object({
    clientMessageId: identifier,
    expectedMessageRevision: z.number().int().nonnegative(),
    locale: z.enum(["zh", "en", "ja"]),
    message: z.string().trim().min(1).max(12000),
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
