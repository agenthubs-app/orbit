// HTTP boundary payloads copied structurally from the documented profile,
// contact, task and schedule contracts. No server implementation imports.
const at = "2026-09-12T00:00:00Z";
export const profilePayload = {
  state: "success",
  profile: {
    id: "profile:1", displayName: "程川", headline: "产品经理 · 星野工作室", organization: "星野工作室", role: "产品经理",
    homeMarket: "东京 · 日本", relationshipGoal: "认识可以一起做产品的同行", targetRelationshipTypes: ["产品伙伴"],
    preferredFollowUpWindow: "本周", preferredLanguage: "zh", preferredIntroChannels: ["email"],
    industry: "互联网", bio: "记录工作中的交流，也寻找能一起做事的人。", offering: ["产品研究", "需求梳理"], seeking: ["设计合作", "技术交流"], topics: ["产品设计", "用户研究"], updatedAt: at
  },
  completeness: { score: 100, status: "ready", completedFields: ["displayName", "headline", "relationshipGoal", "homeMarket", "targetRelationshipTypes", "preferredIntroChannels"], missingFields: [], nextBestField: null },
  editor: { canSave: true, lastSavedAt: at, dirtyFields: [], validationMessages: [] },
  provenance: { source: "profile-store", sourceLabel: "个人资料", evidenceIds: [], collectedAt: at, privacy: "actor-scoped-profile" }, nextAction: "检查资料后再保存。"
};
export const emptyProfilePayload = {
  ...profilePayload, state: "empty", profile: null,
  completeness: { score: 0, status: "not-started", completedFields: [], missingFields: profilePayload.completeness.completedFields, nextBestField: "displayName" },
  editor: { canSave: false, lastSavedAt: null, dirtyFields: [], validationMessages: [] }, nextAction: "先填写名字。"
};
export const profileSuggestionsPayload = {
  state: "empty", suggestions: [], summary: "暂无资料建议。", nextAction: "有新的资料建议时会显示在这里。",
  provenance: { source: "profile-signals", sourceLabel: "资料建议", evidenceIds: [], collectedAt: at, privacy: "actor-scoped-profile-signals", generationMethod: "rule-based-signal-match" }
};
const safe = { externalNetworkRequested: false, aiProviderRequested: false, calendarProviderRequested: false, emailProviderRequested: false, notificationDelivered: false };
const source = { type: "manual", id: "source:profile-test", label: "手动记录", evidenceId: "evidence:profile-test" };
const contact = { id: "contact:1", displayName: "林悦", role: "设计师", organization: "星野", location: "东京", profileSnippet: "产品合作", relationshipContext: "一起交流过产品", lastInteractionAt: at,
  nextAction: "继续交流", source, evidence: [{ evidenceId: source.evidenceId, source, excerpt: "讨论过产品设计", capturedAt: at, createdBy: "actor-1" }], tags: ["产品"], value: { score: 70, valueTypes: ["collaboration"], rationale: "有合作机会", evidenceIds: [source.evidenceId] }, status: "active", databaseQueryExecuted: true, searchIndexReadExecuted: false, ...safe };
export const profileContactsPayload = {
  state: "success", query: "", appliedFilters: { query: "", sourceFilters: [], statusFilters: [], tagFilters: [], valueFilters: [] }, availableFilters: { tags: [], sources: [], values: [], statuses: [] },
  contacts: [contact, { ...contact, id: "contact:2", displayName: "李伟", status: "needs_follow_up" }], summary: "2 位人脉", nextAction: "查看人脉资料。",
  provenance: { source: "contacts-store", sourceLabel: "人脉记录", evidenceIds: [], collectedAt: at, privacy: "live-contacts-list-search-filter", generationMethod: "live-store-query", searchIndexReadExecuted: false, databaseQueryExecuted: true, deviceRequested: false, ...safe }
};
const task = { id: "task:1", accountId: "account-1", ownerUserId: "actor-1", title: "整理访谈记录", status: "open", category: "work", plannedDate: "2026-09-12", priority: "normal", source: "manual", createdAt: at, updatedAt: at };
export const profileTasksPayload = { tasks: [task, { ...task, id: "task:2", plannedDate: "2026-09-11" }, { ...task, id: "task:3", plannedDate: undefined, dueAt: "2026-09-11T15:01:00Z" },
  { ...task, id: "task:future", plannedDate: "2026-09-13" }, { ...task, id: "task:done", status: "completed", completedAt: at }] };
export const profileContactSummaryPayload = { total: 2, sources: { manual: 2 }, statuses: { active: 1, needs_follow_up: 1 }, values: {}, tags: [], hasMoreTags: false, asOf: at };
export const profileTaskDayPagePayload = { actorId: "actor-1", status: "open", scope: "all", query: "",
  dueWindow: { plannedThrough: "2026-09-12", dueBefore: "2026-09-12T15:00:00.000Z" },
  items: [{ id: "task:3", titlePreview: task.title, locationPreview: null, status: "open", category: task.category, priority: task.priority, plannedDate: null,
    dueAt: "2026-09-11T15:01:00Z", updatedAt: at, relatedContact: null }],
  total: 3, counts: { open: 3, completed: 0 }, hasMore: true, nextCursor: "signed", asOf: at };
const schedule = { id: "schedule:1", kind: "meeting", category: "meeting", state: "upcoming", title: "合作讨论", startsAt: "2026-09-12T05:00:00Z", endsAt: "2026-09-12T06:00:00Z", sourceId: "meeting:1", location: "线上" };
export const profileSchedulePayload = { scheduleItems: [schedule, { ...schedule, id: "schedule:2", kind: "event", sourceId: "event:2", startsAt: "2026-09-20T05:00:00Z", endsAt: "2026-09-20T06:00:00Z" },
  { ...schedule, id: "schedule:old", startsAt: "2026-09-11T05:00:00Z", endsAt: "2026-09-11T06:00:00Z" }, { ...schedule, id: "schedule:cancelled", state: "cancelled" }] };
export const profileReadPayloads = {
  "/api/profile": profilePayload,
  "/api/profile/update-suggestions": profileSuggestionsPayload,
  "/api/contacts": profileContactsPayload,
  "/api/tasks": profileTasksPayload,
  "/api/contacts/summary": profileContactSummaryPayload,
  "/api/tasks/page": profileTaskDayPagePayload,
  "/api/schedule-items": profileSchedulePayload
};

export const profileSuggestion = {
  id: "suggestion:1", sourceKind: "chat", sourceLabel: "最近的交流记录", targetProfileField: "headline", currentValue: "产品经理 · 星野工作室",
  suggestedValue: "Building live music tools with generated sound", rationale: "We discussed live performance and generated sound.", confidence: "high", status: "pending", createdAt: at,
  evidence: [{ evidenceId: "evidence:suggestion:1", sourceKind: "chat", sourceLabel: "音频工具交流", excerpt: "Looking for a provider of live music tools.", collectedAt: at }],
  provenance: profileSuggestionsPayload.provenance
};
export const readyProfileSuggestionsPayload = { ...profileSuggestionsPayload, state: "success", suggestions: [profileSuggestion], summary: "有 1 条待确认建议。", nextAction: "Review this music project before editing your profile." };
export const acceptedProfileSuggestionPayload = {
  state: "accepted", acceptedSuggestion: { ...profileSuggestion, status: "accepted" }, profilePatch: { headline: profileSuggestion.suggestedValue }, appliedFields: ["headline"],
  acceptedAt: at, provenance: profileSuggestionsPayload.provenance, nextAction: "Check the suggested headline before saving."
};
export const profileExtractionPayload = {
  state: "success", kind: "business-card",
  draft: { id: "extraction:1", kind: "business-card", displayName: "Alex Chen", headline: "Music product lead", organization: "Live Music Studio", role: "Product lead", email: "alex@example.test",
    homeMarket: "Tokyo", relationshipGoal: "Meet live music partners", targetRelationshipTypes: ["audio partners"], preferredFollowUpWindow: "next week", preferredIntroChannels: ["email"], confidence: "high", extractedAt: at,
    evidence: [{ field: "displayName", value: "Alex Chen", evidenceId: "evidence:extraction:1", excerpt: "Name: Alex Chen" }],
    suggestedProfileFields: { headline: "Music product lead", homeMarket: "Tokyo", relationshipGoal: "Meet live music partners", targetRelationshipTypes: ["audio partners"], preferredFollowUpWindow: "next week", preferredIntroChannels: ["email"] } },
  confidenceSummary: "Review the live music details from this document.",
  provenance: { source: "live-rule:profile-text-extraction", sourceLabel: "Deterministic profile text extractor", evidenceIds: ["evidence:extraction:1"], collectedAt: at, privacy: "live-profile-document-policy-only", extractionMethod: "rule-based-text-match" },
  nextAction: "Check the source text before saving these fields."
};
