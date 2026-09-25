import type { TodayTaskSummaryModeContract } from "../../src/api/contract/today";

// Complete existing HTTP shapes; no imports from the server implementation.
export const aiConversationPayload = {
  state: "success", activeConversationId: "conversation:1", assistantMessage: "讨论了活动主题、嘉宾邀请和场地安排。",
  conversations: [{ conversationId: "conversation:1", title: "交流会准备", lastMessagePreview: "讨论了活动主题、嘉宾邀请和场地安排。", updatedAt: "2026-09-12T01:00:00Z", evidenceIds: [] }],
  messages: [
    { messageId: "message:1", conversationId: "conversation:1", role: "user", content: "帮我整理交流会准备事项", createdAt: "2026-09-12T00:00:00Z", evidenceIds: [] },
    { messageId: "message:2", conversationId: "conversation:1", role: "assistant", content: "讨论了活动主题、嘉宾邀请和场地安排。", createdAt: "2026-09-12T01:00:00Z", evidenceIds: [] }
  ], artifacts: [], proposedToolIntents: [], nextAction: "可以继续补充需要讨论的事项。",
  provenance: { source: "conversation-store", sourceLabel: "会话记录", evidenceIds: [], collectedAt: "2026-09-12T01:00:00Z", generationMethod: "model-provider-live-agent-reply", privacy: "demo-orbit-agent-conversation-only",
    safety: { externalSideEffectsExecuted: false, domainToolCallsExecuted: false, aiProviderRequested: true, externalNetworkRequested: true, liveDatabaseReadExecuted: false, liveDatabaseWriteExecuted: false, emailProviderRequested: false, calendarProviderRequested: false, notificationDelivered: false } }
};
export const emptyAiConversationPayload = { ...aiConversationPayload, state: "empty", activeConversationId: null, assistantMessage: "", conversations: [], messages: [] };
export const aiSession = {
  id: "session:1", title: "产品试点讨论", customTitle: "产品试点讨论", pinned: false, createdAt: "2026-09-11T00:00:00Z", updatedAt: "2026-09-11T01:00:00Z", panel: null,
  organization: { customTitle: "产品试点讨论", groupId: "group:work", pinned: false, revision: 2 },
  messages: [{ role: "user", text: "讨论产品试点" }, { role: "assistant", text: "梳理了试点范围、时间节点和资源需求。" }]
};
const aiSessionSummary = (session: typeof aiSession) => ({
  id: session.id,
  title: session.title,
  firstUserText: session.messages.find(message => message.role === "user")?.text ?? "",
  lastMessagePreview: session.messages.at(-1)?.text ?? "",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  messageRevision: 1,
  organization: session.organization,
});
export const aiSessionListPayload = { items: [aiSessionSummary(aiSession), aiSessionSummary({ ...aiSession, id: "session:2", title: "本周安排", customTitle: "本周安排", organization: { ...aiSession.organization, customTitle: "本周安排" }, updatedAt: "2026-09-09T01:00:00Z", messages: [{ role: "user", text: "本周安排" }, { role: "assistant", text: "汇总本周重点工作与待办事项。" }] })], nextCursor: null, hasMore: false, storage: { configured: true, persisted: true, source: "session-store" } };
export const emptyAiSessionListPayload = { ...aiSessionListPayload, items: [] };
export const aiTodayPayload = {
  taskMode: "summary", date: "2026-09-12", timeZone: "Asia/Tokyo",
  items: [{ kind: "task", task: { id: "task:1", titlePreview: "整理访谈记录", category: "work", priority: "normal", plannedDate: "2026-09-12", dueAt: null } }],
  summary: { openTaskCount: 1, suggestionCount: 0 },
  questionSignals: { urgentTask: false, relationshipTask: false, preparation: false },
} satisfies TodayTaskSummaryModeContract;
export const aiReadPayloads = {
  "/api/ai/conversations": aiConversationPayload,
  "/api/ai/conversations/sessions": aiSessionListPayload,
  "/api/ai/conversations/groups": { groups: [{ id: "group:work", name: "工作", revision: 1, createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" }] },
  "/api/today": aiTodayPayload,
  "/api/chat/relationship-inbox": { items: [] },
  "/api/notifications": { notifications: [] }
};
