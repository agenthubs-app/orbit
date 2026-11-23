import { z } from "zod";

import type {
  AgentActionPreviewContract,
  AgentAnswerBlockContract,
  AgentAnswerRecordContract,
  AgentCardDecisionInputContract,
  AgentClarificationContract,
  AgentConnectionConsentContract,
  AgentConnectionConsentInputContract,
  AgentConnectionListContract,
  AgentProposalViewContract,
  AgentReferenceCandidateContract,
  AgentReferenceCheckResultContract,
  AgentReferenceSearchResultContract,
  AgentResultDocument,
  AgentScheduledTaskContract,
  AgentScheduledTaskFormContract,
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
// AG14: the memory contracts (kept as an import of their own).
import type { AgentMemoryCreateInputContract, AgentMemoryEntryContract, AgentMemoryListContract, AgentMemorySettingsContract, AgentMemorySettingsInputContract, AgentMemoryUpdateInputContract } from "../contract/agent-v1";

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
  // AG20a（决定 8）：设备时区；是否可用由服务端判断，无效时退回部署时区，不因此拒收。
  timeZone: z.string().trim().min(1).max(64).optional(),
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
  // AG15: why and how an expired card says it expired (D15-5, D15-6).
  expiredNote: z.string().optional(),
  expiredReason: z.literal("superseded").optional(),
  expiresAt: z.string().optional(),
  locale: z.enum(["zh", "ja", "en"]).optional(),
  supersededBy: z.object({ actionId: z.string(), firedAt: z.string() }).optional(),
  operations: z.array(z.object({
    after: z.record(z.string(), z.unknown()),
    before: z.record(z.string(), z.unknown()).optional(),
    capability: z.string(),
    dependsOn: z.array(z.string()).optional(),
    // AG07: how the card shows the item (written by the server in the card's language).
    display: z.object({
      change: z.enum(["update", "create", "delete", "restore"]),
      // AG15: a new scheduled task's three grouped lines (rows stay as they are).
      lines: z.array(z.object({ fields: z.array(z.string()), key: z.enum(["when", "pick", "after"]), label: z.string(), text: z.string(), zone: z.object({ id: z.string(), text: z.string() }).optional() })).optional(),
      note: z.string().optional(),
      record: z.string(),
      rows: z.array(z.object({ after: z.string(), before: z.string().optional(), field: z.string(), label: z.string(), sideBySide: z.boolean().optional() })),
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

/* ── AG19：回答排版与记录卡片 ─────────────────────────────────────────────── */

export const agentAnswerRecordSchema: z.ZodType<AgentAnswerRecordContract> = z.object({
  contactId: z.string().optional(),
  day: z.string().optional(),
  eventId: z.string().optional(),
  eventKind: z.enum(["platform", "private"]).optional(),
  gone: z.boolean().optional(),
  id: z.string().min(1),
  kind: z.enum(["event", "contact", "todo", "memo", "schedule", "attendance"]),
  sub: z.string().optional(),
  subTone: z.enum(["late"]).optional(),
  title: z.string(),
  top: z.string().optional(),
  why: z.string().optional(),
}) as unknown as z.ZodType<AgentAnswerRecordContract>;

/** AG19: one block of the answer. */
export const agentAnswerBlockSchema: z.ZodType<AgentAnswerBlockContract> = z.discriminatedUnion("type", [
  z.object({ text: z.string(), type: z.literal("conclusion") }),
  z.object({ text: z.string(), type: z.literal("paragraph") }),
  z.object({ items: z.array(z.object({ head: z.string().optional(), text: z.string() })), type: z.literal("points") }),
  z.object({ caption: z.string().optional(), items: z.array(agentAnswerRecordSchema), lessLabel: z.string().optional(), moreLabel: z.string().optional(), shown: z.number().int().nonnegative(), size: z.enum(["full", "mini"]).optional(), type: z.literal("records") }),
  // AG14: the note may end in an entry to the memory settings («去设置 ›»).
  z.object({ go: z.object({ label: z.string(), memoryId: z.string().optional(), to: z.literal("memory_settings") }).optional(), items: z.array(z.object({ action: z.string().optional(), quote: z.string().optional(), text: z.string() })), title: z.string(), type: z.literal("note") }),
]) as unknown as z.ZodType<AgentAnswerBlockContract>;

/** AG14: one memory chip at the start of an answer. */
export const agentAnswerMemoryUseSchema = z.object({ kind: z.enum(["used", "skipped", "rule"]), memoryId: z.string(), text: z.string() });

export const agentResultDocumentSchema: z.ZodType<AgentResultDocument> = z.object({
  actionPreview: agentActionPreviewSchema.optional(),
  answer: z.object({
    // AG07: the basis line and the record links (code's).
    basis: z.object({
      links: z.array(z.object({ contactId: z.string().optional(), id: z.string(), label: z.string(), type: z.enum(["memo", "todo", "schedule", "contact", "event"]) })),
      text: z.string(),
    }).optional(),
    // AG19: the answer laid out in blocks (code's); a block this client does not know is skipped, never an error.
    blocks: z.array(z.unknown()).transform((items) => items.flatMap((item) => { const parsed = agentAnswerBlockSchema.safeParse(item); return parsed.success ? [parsed.data] : []; })).optional(),
    cardLine: z.string().optional(),
    // AG14: the memory chips at the start of the answer (code's); one this client does not know is skipped.
    memoryUse: z.array(z.unknown()).transform((items) => items.flatMap((item) => { const parsed = agentAnswerMemoryUseSchema.safeParse(item); return parsed.success ? [parsed.data] : []; })).optional(),
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

/* ── AG14：个人记忆（/api/agent/memory、/[id]、/settings） ── */

const memoryCategorySchema = z.enum(["identity", "goal", "preference", "constraint"]);
const memoryTaskSchema = z.enum(["all", "event.recommend", "contact.recommend", "memo.summarize", "todo.plan", "schedule.plan"]);
const memoryDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const memoryStructuredSchema = z.object({
  dayPart: z.enum(["morning", "afternoon", "evening"]).optional(),
  preferredDays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).optional(),
  replyLanguage: z.enum(["zh", "ja", "en"]).optional(),
  strength: z.enum(["prefer", "only", "avoid"]).optional(),
  topics: z.array(z.string()).optional(),
});

export const agentMemoryEntrySchema: z.ZodType<AgentMemoryEntryContract> = z.object({
  appliesTo: z.array(memoryTaskSchema),
  category: memoryCategorySchema,
  content: z.string(),
  createdAt: z.string(),
  deletedAt: z.string().nullable().optional(),
  memoryId: identifier.max(180),
  revision: z.number().int().min(1),
  source: z.enum(["manual", "conversation"]),
  sourceMessageRef: z.string().nullable(),
  status: z.enum(["active", "deleted"]),
  structured: memoryStructuredSchema.nullable(),
  updatedAt: z.string(),
  validFrom: memoryDaySchema.nullable(),
  validUntil: memoryDaySchema.nullable(),
}) as unknown as z.ZodType<AgentMemoryEntryContract>;

export const agentMemorySettingsSchema = z.object({
  allowConversationLearning: z.boolean(),
  enabled: z.boolean(),
  updatedAt: z.string(),
}) satisfies z.ZodType<AgentMemorySettingsContract>;

export const agentMemoryListSchema: z.ZodType<AgentMemoryListContract> = z.object({
  memories: z.array(agentMemoryEntrySchema),
  memoryVersion: z.number().int().min(0),
  ruleLimit: z.number().int().min(1).optional(),
  settings: agentMemorySettingsSchema,
}) as unknown as z.ZodType<AgentMemoryListContract>;

export const agentMemoryCreateInputSchema = z.object({
  appliesTo: z.array(memoryTaskSchema).max(6).optional(),
  category: memoryCategorySchema,
  content: z.string().trim().min(1).max(600),
  structured: memoryStructuredSchema.nullable().optional(),
  validFrom: memoryDaySchema.nullable().optional(),
  validUntil: memoryDaySchema.nullable().optional(),
}) satisfies z.ZodType<AgentMemoryCreateInputContract>;

export const agentMemoryUpdateInputSchema = z.object({
  appliesTo: z.array(memoryTaskSchema).max(6).optional(),
  category: memoryCategorySchema.optional(),
  content: z.string().trim().min(1).max(600).optional(),
  expectedRevision: z.number().int().min(1).optional(),
  structured: memoryStructuredSchema.nullable().optional(),
  validFrom: memoryDaySchema.nullable().optional(),
  validUntil: memoryDaySchema.nullable().optional(),
}) satisfies z.ZodType<AgentMemoryUpdateInputContract>;

export const agentMemorySettingsInputSchema = z.object({
  allowConversationLearning: z.boolean().optional(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<AgentMemorySettingsInputContract>;

/* ── AG17：外部连接 ─────────────────────────────────────────────────────── */

/** POST /api/agent/connections/authorize 的请求体：用户在同意页上的选择。 */
export const agentConnectionConsentInputSchema: z.ZodType<AgentConnectionConsentInputContract> = z.object({
  decision: z.enum(["allow", "deny"]),
  request: z.string().min(1).max(8000),
  scopes: z.array(z.string().min(1).max(60)).max(40),
  accountKey: z.string().max(80).optional(),
}).strict();

// AG17 页面读取用（视觉稿批准后加）：同意页、设置里的连接列表、确认链接页。读取时放宽：多出来的字段不拒。
const agentConnectionScopeOptionSchema = z.object({ domain: z.enum(["contacts", "events", "attendance", "todos", "memos", "schedule"]), propose: z.string().nullable(), read: z.string() });

export const agentConnectionListSchema: z.ZodType<AgentConnectionListContract> = z.object({
  connectAddress: z.string().nullable().optional(),
  connections: z.array(z.object({ clientHost: z.string(), clientName: z.string(), createdAt: z.string(), id: z.string(), lastUsedAt: z.string().nullable(), scopes: z.array(z.string()), waitingProposals: z.number().int().nonnegative().optional() })),
  options: z.array(agentConnectionScopeOptionSchema),
}) as unknown as z.ZodType<AgentConnectionListContract>;

export const agentConnectionConsentSchema: z.ZodType<AgentConnectionConsentContract> = z.object({
  account: z.object({ email: z.string().nullable(), key: z.string(), name: z.string().nullable() }).optional(),
  clientHost: z.string(),
  clientName: z.string(),
  current: z.object({ connectedAt: z.string(), scopes: z.array(z.string()) }).nullable().optional(),
  options: z.array(agentConnectionScopeOptionSchema),
  preselectedScopes: z.array(z.string()),
  redirectHost: z.string(),
  redirectIsLoopback: z.boolean(),
  requestedScopes: z.array(z.string()),
}) as unknown as z.ZodType<AgentConnectionConsentContract>;

export const agentProposalViewSchema: z.ZodType<AgentProposalViewContract> = z.object({
  card: agentActionPreviewSchema,
  clientName: z.string(),
  createdAt: z.string(),
  notice: z.string().optional(),
  proposalId: z.string(),
}) as unknown as z.ZodType<AgentProposalViewContract>;

// ── agent-design AG15：定时任务与运行历史（本块由 AG15 追加）。读取时放宽：不认识的结果当作 failed，不认识的状态当作 paused。 ──

const scheduledRunOutcome = z.string().transform((value): AgentScheduledTaskRunContract["outcome"] => (["delivered", "no_match", "undelivered", "failed", "needs_attention"].includes(value) ? (value as AgentScheduledTaskRunContract["outcome"]) : "failed"));

export const agentScheduledTaskRunSchema: z.ZodType<AgentScheduledTaskRunContract> = z.object({
  attention: z.object({ message: z.string(), reason: z.literal("reference_unreadable"), referenceTitle: z.string().optional() }).optional(),
  cardId: z.string().optional(),
  computeAttempts: z.number().int().positive(),
  computedAt: z.string(),
  delivery: z.object({ attempts: z.number().int().nonnegative(), cancelReason: z.enum(["rule_paused", "rule_changed", "rule_removed", "reference_unreadable"]).optional(), deliveredAt: z.string().optional(), state: z.enum(["none", "pending", "delivered", "cancelled"]) }),
  // AG15 interface: how the history shows the period (written by the server).
  display: z.object({ day: z.string(), opens: z.enum(["result", "card"]).nullable().catch(null), skippedNote: z.string().nullable(), text: z.string(), time: z.string().nullable() }).optional(),
  detail: z.object({ basis: z.string(), notes: z.array(z.string()), source: z.object({ caption: z.string(), card: agentAnswerRecordSchema }).optional().catch(undefined) }).optional(),
  items: z.array(z.object({ card: agentAnswerRecordSchema.optional().catch(undefined), id: z.string(), kind: z.enum(["event", "contact", "todo"]), line: z.string(), ref: z.string(), title: z.string() })),
  line: z.string(),
  outcome: scheduledRunOutcome,
  push: z.lazy(() => agentScheduledTaskRunPushSchema),
  runId: identifier,
  scheduledAt: z.string(),
  skipped: z.number().int().nonnegative(),
  skippedDays: z.array(z.string()),
  taskId: identifier,
  text: z.string(),
}) as unknown as z.ZodType<AgentScheduledTaskRunContract>;

/** AG15 interface: the task form (edit a task, or make one with the form). Notes by id only. */
export const agentScheduledTaskFormSchema: z.ZodType<AgentScheduledTaskFormContract> = z.object({
  basis: z.union([
    z.object({ kind: z.literal("note"), noteId: identifier, title: z.string().max(200) }),
    z.object({ field: z.enum(["startsAt", "lastInteraction", "dueAt", "plannedDate"]), kind: z.literal("field") }),
    z.object({ kind: z.literal("topic"), words: z.string().trim().min(1).max(200) }),
  ]),
  domain: z.enum(["event", "contact", "todo"]),
  maxItems: z.number().int().min(1).max(20),
  push: z.boolean(),
  schedule: z.union([
    z.object({ kind: z.literal("daily"), time: z.string().regex(/^\d{2}:\d{2}$/u), timeZone: z.string().min(1).max(64) }),
    z.object({ daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7), kind: z.literal("weekly"), time: z.string().regex(/^\d{2}:\d{2}$/u), timeZone: z.string().min(1).max(64) }),
  ]),
  scopeText: z.string().max(400).optional(),
  title: z.string().trim().max(120),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  window: z.enum(["weekend", "week", "month", "upcoming"]).optional(),
}) as unknown as z.ZodType<AgentScheduledTaskFormContract>;

export const agentScheduledTaskSchema: z.ZodType<AgentScheduledTaskContract> = z.object({
  createdAt: z.string(),
  id: identifier,
  lastRun: agentScheduledTaskRunSchema.nullable(),
  nextRunAt: z.string().nullable(),
  notify: z.object({ inApp: z.boolean(), push: z.boolean() }),
  rows: z.array(z.object({ field: z.string(), label: z.string(), note: z.string().optional(), value: z.string() })),
  // AG15 interface (approved draft 15-3, 15-4): words the two clients show as they are.
  domain: z.enum(["event", "contact", "todo"]).nullable().optional().catch(null),
  form: agentScheduledTaskFormSchema.optional().catch(undefined),
  last: z.object({ opens: z.enum(["result", "card"]).nullable().catch(null), runId: z.string(), text: z.string(), when: z.string() }).nullable().optional(),
  needsAttention: z.boolean().optional(),
  next: z.object({ day: z.string(), time: z.string() }).nullable().optional(),
  summary: z.object({ attention: z.string().nullable(), schedule: z.string(), status: z.string() }).optional(),
  status: z.string().transform((value): AgentScheduledTaskContract["status"] => (value === "active" || value === "completed" ? value : "paused")),
  timeZone: z.string().nullable(),
  title: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive(),
}) as unknown as z.ZodType<AgentScheduledTaskContract>;

export const agentScheduledTaskListSchema: z.ZodType<AgentScheduledTaskListContract> = z.object({ tasks: z.array(agentScheduledTaskSchema) }) as unknown as z.ZodType<AgentScheduledTaskListContract>;

export const agentScheduledTaskHistorySchema: z.ZodType<AgentScheduledTaskHistoryContract> = z.object({ runs: z.array(agentScheduledTaskRunSchema), task: agentScheduledTaskSchema }) as unknown as z.ZodType<AgentScheduledTaskHistoryContract>;

// ── AG16：定时任务的提醒 ──
// (Its own import, kept with the block so that sprints working in parallel do not meet in the list at the top.)
import type { AgentPushDeviceStateContract, AgentScheduledTaskReminderInputContract, AgentScheduledTaskRunPushContract, AgentWebPushConfigContract } from "../contract/agent-v1";

export const agentScheduledTaskPushReasonSchema = z.enum([
  "quiet_hours", "daily_cap", "notifications_off",
  "reminder_off", "rule_paused", "rule_removed", "result_not_sent",
  "no_device", "permission_revoked", "provider_rejected", "outcome_unknown", "not_configured",
]);

export const agentScheduledTaskRunPushSchema: z.ZodType<AgentScheduledTaskRunPushContract> = z.object({
  attempts: z.number().int().nonnegative(),
  deliveredAt: z.string().optional(),
  lastAttemptAt: z.string().optional(),
  line: z.string().nullable().optional(),
  reason: agentScheduledTaskPushReasonSchema.optional(),
  state: z.enum(["not_requested", "pending", "delivered", "failed", "skipped"]),
  targets: z.array(z.object({ deviceId: z.string(), platform: z.enum(["ios", "android", "web"]), state: z.enum(["delivered", "retry", "revoked", "rejected", "unknown"]) })).optional(),
}) as unknown as z.ZodType<AgentScheduledTaskRunPushContract>;

export const agentScheduledTaskReminderInputSchema: z.ZodType<AgentScheduledTaskReminderInputContract> = z.object({
  locale: z.enum(["zh", "en", "ja"]).optional(),
  push: z.boolean(),
}).strict();

export const agentPushDeviceStateSchema: z.ZodType<AgentPushDeviceStateContract> = z.object({
  active: z.boolean(),
  deviceId: z.string(),
  permission: z.enum(["granted", "provisional", "denied", "undetermined"]),
  platform: z.enum(["ios", "android", "web"]),
  revokedAt: z.string().optional(),
  revokedReason: z.enum(["user", "provider_rejected"]).optional(),
});

export const agentWebPushConfigSchema: z.ZodType<AgentWebPushConfigContract> = z.object({ publicKey: z.string().nullable() }) as unknown as z.ZodType<AgentWebPushConfigContract>;
