import { z } from "zod";

import type {
  AgentActionPreviewContract,
  AgentCardDecisionInputContract,
  AgentClarificationContract,
  AgentReferenceCandidateContract,
  AgentReferenceCheckResultContract,
  AgentReferenceSearchResultContract,
  AgentResultDocument,
  AgentScheduledTaskContract,
  AgentScheduledTaskHistoryContract,
  AgentScheduledTaskListContract,
  AgentScheduledTaskRunContract,
  AgentSelectionInputContract,
  AgentSelectionReceiptContract,
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

/**
 * AG11：一条引用的句中位置有什么问题（没有问题返回 null）。位置对去掉首尾空白之后的 message 算，左闭右开；
 * 标记必须以 @ 开头、至少有一个字，各标记不能重叠；start、end 要么都有，要么都没有（旧端不带位置）。
 */
export function referencePositionProblem(message: string, references: readonly { start?: number | undefined; end?: number | undefined }[]): { index: number; problem: string } | null {
  const spans: { index: number; start: number; end: number }[] = [];
  for (const [index, reference] of references.entries()) {
    const hasStart = reference.start !== undefined;
    const hasEnd = reference.end !== undefined;
    if (!hasStart && !hasEnd) continue;
    if (hasStart !== hasEnd) return { index, problem: "start and end come together" };
    const start = reference.start!;
    const end = reference.end!;
    if (!(start >= 0 && end <= message.length && start + 1 < end)) return { index, problem: "the marker is outside the message" };
    if (message[start] !== "@") return { index, problem: "the marker does not start with @" };
    spans.push({ end, index, start });
  }
  spans.sort((left, right) => left.start - right.start);
  for (let at = 1; at < spans.length; at += 1) {
    const current = spans[at]!;
    if (current.start < spans[at - 1]!.end) return { index: current.index, problem: "two markers overlap" };
  }
  return null;
}

const agentReferenceSchema = z.object({
  end: z.number().int().nonnegative().max(12000).optional(),
  eventKind: z.enum(["platform", "private"]).optional(),
  id: identifier,
  start: z.number().int().nonnegative().max(12000).optional(),
  type: z.enum(["contact", "event", "note", "memo", "todo", "schedule", "attendance"]),
});

/** 协议版本 3 的发送。AG05：引用类型扩到六类（旧的 note 仍收）；AG11：每条引用可带句中位置和活动的种类。 */
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
  references: z.array(agentReferenceSchema).max(20),
  sessionId: identifier,
}).superRefine((value, context) => {
  const found = referencePositionProblem(value.message, value.references);
  if (found) context.addIssue({ code: z.ZodIssueCode.custom, message: found.problem, path: ["references", found.index] });
  for (const [index, reference] of value.references.entries()) {
    if (reference.eventKind && reference.type !== "event") context.addIssue({ code: z.ZodIssueCode.custom, message: "eventKind is for event references", path: ["references", index, "eventKind"] });
  }
}) as unknown as z.ZodType<AgentSendInputContract>;

const cardStatusSchema = z.enum(["awaiting_confirmation", "deferred", "approved", "executing", "completed", "partially_failed", "failed", "rejected", "canceled", "undone", "expired"]);
const cardOperationStatusSchema = z.enum(["pending", "succeeded", "failed", "skipped", "undone", "needs_review", "user_confirmed", "abandoned"]);
const cardChangeSchema = z.object({ field: z.string(), now: z.unknown(), operationId: z.string(), shownBefore: z.unknown(), to: z.unknown().optional() });

/** AG02：一张卡的当前版（设计稿 §5.1 actionPreview）。 */
export const agentActionPreviewSchema: z.ZodType<AgentActionPreviewContract> = z.object({
  actionId: identifier,
  changes: z.array(cardChangeSchema).optional(),
  expiresAt: z.string().optional(),
  locale: z.enum(["zh", "ja", "en"]).optional(),
  operations: z.array(z.object({
    after: z.record(z.string(), z.unknown()),
    before: z.record(z.string(), z.unknown()).optional(),
    capability: z.string(),
    dependsOn: z.array(z.string()).optional(),
    // AG07: how the card shows the item (written by the server in the card's language).
    display: z.object({
      change: z.enum(["update", "create", "delete", "restore"]),
      note: z.string().optional(),
      record: z.string(),
      rows: z.array(z.object({ after: z.string(), before: z.string().optional(), field: z.string(), label: z.string() })),
    }).optional(),
    operationId: z.string(),
    // AG13: why an item that ran was not done (written by the server in the card's language).
    outcome: z.string().optional(),
    partId: z.string().optional(),
    shown: z.record(z.string(), z.unknown()).optional(),
    status: cardOperationStatusSchema,
    target: z.object({ collection: z.string(), id: z.string() }).optional(),
    text: z.string(),
  })),
  origin: z.union([
    z.object({ conversationId: z.string(), kind: z.literal("conversation"), requestId: z.string() }),
    z.object({ firedAt: z.string(), kind: z.literal("automation"), ruleId: z.string() }),
    z.object({ connectionId: z.string(), externalRequestKey: z.string(), kind: z.literal("connection") }),
  ]).optional(),
  payloadHash: z.string().min(1),
  revision: z.number().int().positive(),
  revisions: z.array(z.object({ payloadHash: z.string(), revision: z.number().int().positive() })),
  status: cardStatusSchema,
  summary: z.string(),
  title: z.string(),
  updatedAt: z.string(),
}) as unknown as z.ZodType<AgentActionPreviewContract>;

/** AG02：按钮决定的请求体。旧形状（没有 revision、payloadHash、clientDecisionId）对新卡一律被拒。 */
export const agentCardDecisionInputSchema: z.ZodType<AgentCardDecisionInputContract> = z.object({
  clientDecisionId: identifier,
  operationId: identifier.optional(),
  payloadHash: z.string().trim().min(1).max(200),
  revision: z.number().int().positive(),
  transition: z.enum(["confirm", "reject", "retry", "mark_done", "abandon"]),
}).refine((value) => (["retry", "mark_done", "abandon"].includes(value.transition)) === Boolean(value.operationId), {
  message: "operationId is required for retry, mark_done and abandon, and only for them.",
}) as unknown as z.ZodType<AgentCardDecisionInputContract>;

/** AG04：一组可点的方向。 */
export const agentClarificationSchema: z.ZodType<AgentClarificationContract> = z.object({
  answeredBy: z.string().optional(),
  asks: z.enum(["object", "reading"]).optional(),
  clarificationId: identifier,
  kind: z.enum(["question", "not_understood", "entry"]),
  options: z.array(z.object({
    capability: z.string(),
    label: z.string(),
    optionId: identifier,
    ref: z.object({ id: z.string(), name: z.string(), type: z.string() }).optional(),
  })),
  partId: z.string(),
  selectedOptionId: z.string().optional(),
  state: z.enum(["open", "answered", "shelved"]),
}) as unknown as z.ZodType<AgentClarificationContract>;

/** AG04：点选。只带编号，选项的内容一律由服务端按当时给出的候选核对。 */
export const agentSelectionInputSchema: z.ZodType<AgentSelectionInputContract> = z.object({
  clientSelectionId: identifier,
  protocolVersion: z.literal(3),
  selection: z.object({ clarificationId: identifier, optionId: identifier, requestId: identifier }),
  sessionId: identifier,
});

export const agentSelectionReceiptSchema: z.ZodType<AgentSelectionReceiptContract> = z.object({
  acceptedAt: z.string(),
  clarificationId: identifier,
  clientSelectionId: identifier,
  optionId: identifier,
  protocolVersion: z.literal(3),
  replayed: z.boolean(),
  requestId: identifier,
  sessionId: identifier,
  status: agentRequestStatusSchema,
});

export const agentResultDocumentSchema: z.ZodType<AgentResultDocument> = z.object({
  actionPreview: agentActionPreviewSchema.optional(),
  answer: z.object({
    // AG07: the basis line and the record links (code's).
    basis: z.object({
      links: z.array(z.object({ contactId: z.string().optional(), id: z.string(), label: z.string(), type: z.enum(["memo", "todo", "schedule", "contact", "event"]) })),
      text: z.string(),
    }).optional(),
    cardLine: z.string().optional(),
    sourceRefs: z.array(z.string()),
    text: z.string(),
    // AG09: the queries sent and the pages opened (code's).
    web: z.object({
      pages: z.array(z.object({ excerpt: z.string(), fetchedAt: z.string(), readStatus: z.enum(["ok", "empty", "timeout", "provider_error"]), sourceDate: z.string().optional(), sourceRef: z.string(), title: z.string(), url: z.string() })),
      queries: z.array(z.object({ provider: z.literal("deepseek"), sentAt: z.string(), text: z.string() })),
    }).optional(),
  }).nullable(),
  clarifications: z.array(agentClarificationSchema).optional(),
  ending: z.object({
    at: z.string(),
    kind: z.enum(["stopped_by_user", "failed"]),
    reason: z.string().optional(),
  }).optional(),
  partResults: z.array(z.object({
    coverage: z.array(z.object({ complete: z.boolean(), kind: z.string(), pagesRead: z.number().int().nonnegative(), seen: z.number().int().nonnegative(), total: z.number().int().nonnegative().optional() })).optional(),
    gaps: z.array(z.enum(["no_record", "partial", "unreadable", "conflict", "service_error", "budget"])).optional(),
    operationId: z.string().optional(),
    partId: z.string(),
    reason: z.string().optional(),
    route: z.enum(["answer", "read", "probe", "web_lookup", "propose_write", "offer_alternative", "suggest_external_agent", "explain_limit", "clarify"]).optional(),
    sourceQuote: z.string().optional(),
    status: partStatusSchema,
    verdict: z.enum(["accept", "convert", "decline"]).optional(),
    waitReason: z.enum(["object_ambiguous", "permission_missing", "dependency_pending", "service_unavailable", "awaiting_acceptance", "awaiting_external_result"]).optional(),
  })),
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
  stage: z.enum(["reading", "web", "composing"]).optional(),
  status: agentRequestStatusSchema,
});

/** AG13：一条活动引用。私人活动的归属由服务端逐项核对，这里只看形状。 */
export const eventRefSchema = z.object({ id: z.string().trim().min(1).max(300), kind: z.enum(["platform", "private"]) }).strict();
export const eventRefsSchema = z.array(eventRefSchema).max(50);

/** 一组活动引用去重（同一 kind 加 id 只留第一条，顺序不变）。 */
export function uniqueEventRefs<T extends { kind: string; id: string }>(refs: readonly T[]): T[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}\u0000${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 实时通道续传的序号：查询参数 after 或 Last-Event-ID。 */
export const agentEventsAfterSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/* ── AG11：@ 选择器 ─────────────────────────────────────────────────────── */

export const agentReferenceSearchKindSchema = z.enum(["contact", "memo", "todo", "schedule", "event", "attendance"]);

/** GET /api/agent/references/search 的查询参数。 */
export const agentReferenceSearchQuerySchema = z.object({
  kind: agentReferenceSearchKindSchema.optional(),
  q: z.string().max(80).default(""),
});

export const agentReferenceCandidateSchema: z.ZodType<AgentReferenceCandidateContract> = z.object({
  detail: z.object({
    company: z.string().optional(),
    date: z.string().optional(),
    dateKind: z.enum(["due", "at", "on", "written"]).optional(),
    people: z.array(z.string()).optional(),
    place: z.string().optional(),
    role: z.string().optional(),
  }),
  eventKind: z.enum(["platform", "private"]).optional(),
  id: identifier,
  name: z.string(),
  type: agentReferenceSearchKindSchema,
});

export const agentReferenceSearchResultSchema: z.ZodType<AgentReferenceSearchResultContract> = z.object({
  groups: z.array(z.object({ items: z.array(agentReferenceCandidateSchema), more: z.boolean(), type: agentReferenceSearchKindSchema, unavailable: z.boolean().optional() })),
  query: z.string(),
});

/** POST /api/agent/references/check 的请求体。 */
export const agentReferenceCheckInputSchema = z.object({
  references: z.array(z.object({ eventKind: z.enum(["platform", "private"]).optional(), id: identifier, type: agentReferenceSearchKindSchema })).min(1).max(20),
});

export const agentReferenceCheckResultSchema: z.ZodType<AgentReferenceCheckResultContract> = z.object({
  references: z.array(z.object({ accessible: z.boolean(), id: identifier, name: z.string().nullable(), type: agentReferenceSearchKindSchema })),
}) as unknown as z.ZodType<AgentReferenceCheckResultContract>;

// ── agent-design AG15：定时任务与运行历史（本块由 AG15 追加）。读取时放宽：不认识的结果当作 failed，不认识的状态当作 paused。 ──

const scheduledRunOutcome = z.string().transform((value): AgentScheduledTaskRunContract["outcome"] => (["delivered", "no_match", "undelivered", "failed", "needs_attention"].includes(value) ? (value as AgentScheduledTaskRunContract["outcome"]) : "failed"));

export const agentScheduledTaskRunSchema: z.ZodType<AgentScheduledTaskRunContract> = z.object({
  attention: z.object({ message: z.string(), reason: z.literal("reference_unreadable"), referenceTitle: z.string().optional() }).optional(),
  cardId: z.string().optional(),
  computeAttempts: z.number().int().positive(),
  computedAt: z.string(),
  delivery: z.object({ attempts: z.number().int().nonnegative(), cancelReason: z.enum(["rule_paused", "rule_changed", "rule_removed", "reference_unreadable"]).optional(), deliveredAt: z.string().optional(), state: z.enum(["none", "pending", "delivered", "cancelled"]) }),
  items: z.array(z.object({ id: z.string(), kind: z.enum(["event", "contact", "todo"]), line: z.string(), ref: z.string(), title: z.string() })),
  line: z.string(),
  outcome: scheduledRunOutcome,
  push: z.object({ attempts: z.number().int().nonnegative(), deliveredAt: z.string().optional(), state: z.enum(["not_requested", "pending", "delivered", "failed"]) }),
  runId: identifier,
  scheduledAt: z.string(),
  skipped: z.number().int().nonnegative(),
  skippedDays: z.array(z.string()),
  taskId: identifier,
  text: z.string(),
}) as unknown as z.ZodType<AgentScheduledTaskRunContract>;

export const agentScheduledTaskSchema: z.ZodType<AgentScheduledTaskContract> = z.object({
  createdAt: z.string(),
  id: identifier,
  lastRun: agentScheduledTaskRunSchema.nullable(),
  nextRunAt: z.string().nullable(),
  notify: z.object({ inApp: z.boolean(), push: z.boolean() }),
  rows: z.array(z.object({ field: z.string(), label: z.string(), value: z.string() })),
  status: z.string().transform((value): AgentScheduledTaskContract["status"] => (value === "active" || value === "completed" ? value : "paused")),
  timeZone: z.string().nullable(),
  title: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive(),
}) as unknown as z.ZodType<AgentScheduledTaskContract>;

export const agentScheduledTaskListSchema: z.ZodType<AgentScheduledTaskListContract> = z.object({ tasks: z.array(agentScheduledTaskSchema) }) as unknown as z.ZodType<AgentScheduledTaskListContract>;

export const agentScheduledTaskHistorySchema: z.ZodType<AgentScheduledTaskHistoryContract> = z.object({ runs: z.array(agentScheduledTaskRunSchema), task: agentScheduledTaskSchema }) as unknown as z.ZodType<AgentScheduledTaskHistoryContract>;
