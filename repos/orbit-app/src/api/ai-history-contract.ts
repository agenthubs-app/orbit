import { z } from "zod";
import type { OrbitAiConversationSummaryContract, OrbitAiMessageContract } from "./contract/orbit-ai";
import { aiSessionOrganizationSchema, aiSessionOriginSchema, reliableAiSendReceiptSchema } from "./schema/ai-sessions";
import type { ReliableAiSendReceiptContract } from "./contract/ai-sessions";
import { aiSessionArtifactRecoverySchema } from "./schema/ai-artifacts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Local HTTP consumer validation. This does not expand the shared-copy channel.
const identifier = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const conversationSummary: z.ZodType<OrbitAiConversationSummaryContract> = z.object({
  conversationId: identifier, title: z.string(), lastMessagePreview: z.string(), updatedAt: timestamp, evidenceIds: z.array(z.string())
});
const message: z.ZodType<OrbitAiMessageContract> = z.object({
  messageId: identifier, conversationId: identifier, role: z.enum(["user", "assistant", "system"]), content: z.string(), createdAt: timestamp, evidenceIds: z.array(z.string())
});
export const aiConversationListSchema = z.object({
  state: z.enum(["success", "empty", "pending"]), activeConversationId: identifier.nullable(), assistantMessage: z.string(),
  conversations: z.array(conversationSummary), messages: z.array(message), artifacts: z.array(z.unknown()),
  proposedToolIntents: z.array(z.object({ intentId: identifier, toolFamily: z.enum(["relationship_chat", "events", "contacts", "followups", "notes", "tasks", "schedule"]), label: z.string(), reason: z.string(), requiresUserConfirmation: z.boolean() })),
  nextAction: z.string()
}).passthrough().refine(data => new Set(data.conversations.map(item => item.conversationId)).size === data.conversations.length
  && new Set(data.messages.map(item => item.messageId)).size === data.messages.length
  && (data.state === "empty"
    ? data.activeConversationId === null && data.conversations.length === 0 && data.messages.length === 0
    : data.activeConversationId !== null && data.conversations.some(item => item.conversationId === data.activeConversationId) && data.messages.length > 0));

export const aiSessionSchema = z.object({
  id: identifier, title: z.string().trim().min(1), customTitle: z.string().optional(), createdAt: timestamp, updatedAt: timestamp,
  messageRevision: z.number().int().nonnegative().optional(),
  origin: aiSessionOriginSchema.optional(),
  organization: aiSessionOrganizationSchema.optional(),
  pinned: z.boolean().optional(), panel: z.record(z.string(), z.unknown()).nullable().optional(),
  messages: z.array(z.object({ id: identifier.optional(), createdAt: timestamp.optional(), role: z.enum(["user", "assistant"]), text: z.string().trim().min(1) }).passthrough()).min(1)
}).passthrough();
const storage = z.object({ configured: z.boolean(), persisted: z.boolean(), source: z.string().optional() });
export const aiSessionListSchema = z.object({
  sessions: z.array(aiSessionSchema),
  items: z.array(aiSessionSchema).optional(),
  nextCursor: z.string().nullable().optional(),
  storage,
}).refine(data =>
  new Set(data.sessions.map(item => item.id)).size === data.sessions.length
  && (data.storage.configured || (data.sessions.length === 0 && !data.storage.persisted)));
export const aiSessionDeleteReceiptSchema = z.object({ deleted: z.literal(true), storage: storage.extend({ configured: z.literal(true), persisted: z.literal(true) }) });
export const aiSessionGroupSchema = z.object({ id: identifier, name: z.string().trim().min(1), revision: z.number().int().positive(), createdAt: timestamp, updatedAt: timestamp });
export const aiSessionGroupListSchema = z.object({ groups: z.array(aiSessionGroupSchema) });
export const aiSessionOrganizationReceiptSchema = z.object({ session: aiSessionSchema, storage: storage.extend({ configured: z.literal(true), persisted: z.literal(true) }) });
export const aiSessionGroupReceiptSchema = z.object({ group: aiSessionGroupSchema });
export const aiSessionGroupDeleteReceiptSchema = z.object({ deleted: z.literal(true), id: identifier, ungroupedCount: z.number().int().nonnegative() });

export type AiSession = z.infer<typeof aiSessionSchema>;
export type AiConversationPayload = z.infer<typeof aiConversationListSchema>;
export const aiSessionReadSchema = z.object({ session: aiSessionSchema.nullable(), storage, artifactRecovery: z.unknown().optional() }).transform(value => ({ ...value, artifactRecovery: value.artifactRecovery === undefined ? undefined : aiSessionArtifactRecoverySchema.safeParse(value.artifactRecovery).success ? value.artifactRecovery : { turns: [], truncated: false, unavailable: true } }));
const persistedSessionReceipt = z.object({ session: aiSessionSchema, storage: storage.extend({ configured: z.literal(true), persisted: z.literal(true) }) });

export function aiSessionReceiptMatches(data: unknown, expected: AiSession): boolean {
  const parsed = persistedSessionReceipt.safeParse(data);
  if (!parsed.success) return false;
  const actual = parsed.data.session;
  // The sessions API trims text and retains its documented bounded history.
  const messages = expected.messages.map(item => ({ ...item, text: item.text.trim().slice(0, 12000) })).filter(item => item.text).slice(-100);
  return actual.id === expected.id.trim().slice(0, 160) && actual.title === expected.title.trim().slice(0, 120)
    && (actual.customTitle ?? "") === (expected.customTitle ?? "").trim().slice(0, 120)
    && (actual.pinned ?? false) === (expected.pinned ?? false)
    && actual.messages.length === messages.length
    && actual.messages.every((item, index) => item.role === messages[index]?.role && item.text === messages[index]?.text);
}

export function aiReplyPayload(data: unknown, question: string): AiConversationPayload | null {
  const parsed = aiConversationListSchema.safeParse(data);
  if (!parsed.success || parsed.data.state !== "success") return null;
  const payload = parsed.data;
  const userIndex = payload.messages.findLastIndex(item => item.role === "user");
  if (userIndex < 0 || payload.messages[userIndex]?.content.trim() !== question
    || !payload.messages.slice(userIndex + 1).some(item => item.role === "assistant" && item.content.trim())) return null;
  return payload;
}

export function aiReliableSendReceipt(data: unknown): ReliableAiSendReceiptContract | null {
  if (!isRecord(data)) return null;
  const parsed = reliableAiSendReceiptSchema.safeParse(data.reliableSend);
  return parsed.success ? parsed.data : null;
}

export function aiReliableSendRecovery(data: unknown): {
  receipt: ReliableAiSendReceiptContract;
  result: unknown;
} | null {
  if (!isRecord(data)) return null;
  const receipt = aiReliableSendReceipt(data);
  return receipt ? { receipt, result: data.reliableSend && isRecord(data.reliableSend) ? data.reliableSend.result : undefined } : null;
}

export function aiTaskReceipt(data: unknown, suggestionId: string, action: "accept" | "dismiss"): { taskId: string | null } | null {
  const parsed = z.object({
    suggestion: z.object({ id: identifier, status: z.enum(["pending", "accepted", "dismissed"]), acceptedTaskId: identifier.optional() }),
    task: z.object({ id: identifier, suggestionId: identifier, status: z.enum(["open", "completed", "cancelled"]) }).optional()
  }).safeParse(data);
  if (!parsed.success || parsed.data.suggestion.id !== suggestionId) return null;
  if (action === "dismiss") return parsed.data.suggestion.status === "dismissed" ? { taskId: null } : null;
  return parsed.data.suggestion.status === "accepted" && parsed.data.task?.suggestionId === suggestionId
    && parsed.data.task.id === parsed.data.suggestion.acceptedTaskId ? { taskId: parsed.data.task.id } : null;
}

export type AiHistoryRow = { groupId: string | null; id: string; organizationRevision: number; title: string; preview: string; when: string; updatedAt: string; pinned: boolean; source: "session" | "conversation" };
export function aiHistoryRows(conversations: z.infer<typeof aiConversationListSchema> | null, sessions: z.infer<typeof aiSessionListSchema> | null, now = new Date()): AiHistoryRow[] {
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = dayFormat.format(now), yesterday = dayFormat.format(new Date(now.getTime() - 86400000));
  const rows: Omit<AiHistoryRow, "when">[] = [
    ...(conversations?.conversations ?? []).filter(item => !(item.conversationId === "live-orbit-agent-conversation"
      && conversations?.messages.length === 1 && conversations.messages[0]?.messageId === "orbit-agent-live-ready"
      && conversations.messages[0]?.content === "Orbit Agent is ready for a natural-language request.")).map(item => ({
      groupId: null, id: item.conversationId, organizationRevision: 0, title: item.title.trim() || "未命名会话", preview: item.lastMessagePreview, updatedAt: item.updatedAt, pinned: false, source: "conversation" as const
    })),
    ...(sessions?.sessions ?? []).filter(item => item.messages.some(message => message.role === "user")).map(item => ({
      groupId: item.organization?.groupId ?? null, id: item.id, organizationRevision: item.organization?.revision ?? 0,
      title: item.organization?.customTitle?.trim() || item.customTitle?.trim() || item.title.trim() || item.messages.find(message => message.role === "user")!.text,
      preview: item.messages.at(-1)?.text ?? "", updatedAt: item.updatedAt, pinned: item.organization?.pinned ?? item.pinned ?? false, source: "session" as const
    }))
  ];
  return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(item => {
    const date = new Date(item.updatedAt), day = dayFormat.format(date);
    const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).formatToParts(date);
    const when = day === today ? "今天" : day === yesterday ? "昨天" : `${parts.find(part => part.type === "month")?.value}月${parts.find(part => part.type === "day")?.value}日`;
    return { ...item, when };
  });
}
