import { z } from "zod";

import type {
  AgentResultDocument,
  AgentSendInputContract,
  AgentSendReceiptContract,
  AgentSessionEventContract,
} from "../contract/agent-v1";
import { aiSessionOriginInputSchema } from "./ai-sessions";

const identifier = z.string().trim().min(1).max(160);

export const agentRequestStatusSchema = z.enum(["queued", "running", "waiting_user", "completed", "failed", "cancelled"]);

const partStatusSchema = z.enum([
  "answered",
  "awaiting_clarification",
  "awaiting_confirmation",
  "awaiting_acceptance",
  "suggested_external",
  "waiting_dependency",
  "declined",
  "unfinished",
  "failed",
]);

/** 协议版本 3 的发送。引用类型在 AG11 扩到六类之前与协议 2 相同。 */
export const agentSendInputSchema: z.ZodType<AgentSendInputContract> = z.object({
  clientMessageId: identifier,
  locale: z.enum(["zh", "en", "ja"]),
  message: z.string().trim().min(1).max(12000),
  origin: aiSessionOriginInputSchema.optional(),
  pageContext: z.object({
    count: z.number().int().nonnegative().max(100_000),
    filters: z.record(z.string().max(40), z.union([z.string().max(80), z.array(z.string().max(80)).max(10)])),
    route: z.string().min(1).max(160),
  }).optional(),
  protocolVersion: z.literal(3),
  references: z.array(z.object({ id: identifier, type: z.enum(["contact", "event", "note"]) })).max(20),
  sessionId: identifier,
});

export const agentResultDocumentSchema: z.ZodType<AgentResultDocument> = z.object({
  answer: z.object({ sourceRefs: z.array(z.string()), text: z.string() }).nullable(),
  ending: z.object({
    at: z.string(),
    kind: z.enum(["stopped_by_user", "failed"]),
    reason: z.string().optional(),
  }).optional(),
  partResults: z.array(z.object({ operationId: z.string().optional(), partId: z.string(), status: partStatusSchema })),
  requestId: identifier,
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  sessionId: identifier,
  status: agentRequestStatusSchema,
  updatedAt: z.string(),
}) as unknown as z.ZodType<AgentResultDocument>;

export const agentSendReceiptSchema: z.ZodType<AgentSendReceiptContract> = z.object({
  acceptedAt: z.string(),
  clientMessageId: identifier,
  protocolVersion: z.literal(3),
  receivedSeq: z.number().int().positive(),
  replayed: z.boolean(),
  requestId: identifier,
  sessionId: identifier,
  status: agentRequestStatusSchema,
});

export const agentSessionEventSchema: z.ZodType<AgentSessionEventContract> = z.object({
  at: z.string(),
  document: agentResultDocumentSchema.optional(),
  kind: z.enum(["accepted", "status", "document"]),
  requestId: identifier,
  seq: z.number().int().positive(),
  sessionId: identifier,
  status: agentRequestStatusSchema,
});

/** 实时通道续传的序号：查询参数 after 或 Last-Event-ID。 */
export const agentEventsAfterSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
