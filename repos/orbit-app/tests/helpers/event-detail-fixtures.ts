// Complete HTTP payloads based on the existing goal-readiness, recommendation
// and post-event-review contracts. No Web source is imported by these tests.
const source = { type: "event_import", label: "活动记录", eventId: "event:1", providerRecordId: "event:1", generatedBy: "live-store-query" };
const at = "2026-09-12T00:00:00Z";
const event = { id: "event:1", title: "周末产品交流会", venue: "东京 · 涩谷", startsAt: "2026-09-12T05:00:00Z", endsAt: "2026-09-12T08:00:00Z", source, calendarProviderRequested: false, liveCalendarRequested: false, liveDatabaseWriteExecuted: false, externalNetworkRequested: false };
const safe = { aiProviderRequested: false, calendarProviderRequested: false, emailProviderRequested: false, notificationDelivered: false, externalNetworkRequested: false };
const goalSource = { ...source, generatedBy: "mock-event-goal-readiness-service" };
const goal = { goalId: "goal:1", eventId: "event:1", intent: "认识两位产品负责人", selectedSuggestionId: "suggestion:1", priority: "primary", source: goalSource, evidenceIds: ["evidence:goal"], createdAt: at, updatedAt: at, generatedBy: "mock-goal-rule", aiProviderRequested: false, liveDatabaseWriteExecuted: true, externalNetworkRequested: false };
const suggestion = { goalId: "suggestion:1", focus: "operator_intros", label: "产品交流", intent: "交流一次用户访谈经验", rationale: "本次活动有产品同行参加。", suggestedPreparation: ["准备一个具体问题"], source: goalSource, evidenceIds: ["evidence:goal"], generatedBy: "mock-goal-rule", aiProviderRequested: false, externalNetworkRequested: false };
export const readinessPayload = {
  state: "success", event: { ...event, source: goalSource }, goal, suggestedGoals: [suggestion],
  readinessChecklist: [{ itemId: "check:1", label: "确认交流目标", status: "ready", owner: "operator", rationale: "已明确想认识的人。", evidenceIds: ["evidence:goal"], source: goalSource, ...safe, liveDatabaseWriteExecuted: false }],
  preparationState: { readinessScore: 75, relationshipBriefStatus: "ready", calendarConflictCheck: { hasConflict: false, checkedWindow: "活动当天", checkedBy: "mock-calendar-rule", rationale: "按现有记录检查。", liveCalendarRequested: false, calendarProviderRequested: false, externalNetworkRequested: false }, preEventBriefReady: true, nextPreparationStep: "整理要交流的问题。", source: goalSource, ...safe },
  summary: "活动准备记录已读取。", nextAction: "确认活动目标。",
  provenance: { source: "event-store", sourceLabel: "活动记录", evidenceIds: ["evidence:goal"], collectedAt: at, privacy: "demo-event-goal-readiness-only", generationMethod: "live-store-query", ...safe, liveCalendarRequested: false, liveDatabaseWriteExecuted: false }
};
export const goalPayload = { ...readinessPayload, goal: { ...goal, intent: "交流一次用户访谈经验", selectedSuggestionId: "suggestion:1" }, acceptedGoalText: "交流一次用户访谈经验", provenance: { ...readinessPayload.provenance, generationMethod: "live-store-goal-setting", liveDatabaseWriteExecuted: true } };
const attendee = { attendeeId: "attendee:li", displayName: "李伟", role: "产品负责人", organization: "星野工作室", relationshipContext: "正在开展用户访谈。", eventIntent: "交流产品经验", source, evidenceIds: ["evidence:li"], externalProfileRequested: false, databaseQueryExecuted: true, ...safe };
const line = { lineId: "line:1", eventId: "event:1", attendeeId: "attendee:li", style: "warm_context", text: "你们最近的用户访谈有哪些发现？", rationale: "从本次活动共同话题切入。", source, evidenceIds: ["evidence:li"], generatedBy: "live-opening-line-rule", ...safe };
const recommendation = {
  recommendationId: "recommendation:li", eventId: "event:1", attendee, rank: 1, score: 88, scoreBand: "high", reasons: ["正在推进相近的产品研究。"],
  matchSignals: [{ signalId: "signal:1", label: "产品研究", detail: "交流主题相同", weight: 30, evidenceIds: ["evidence:li"], source, generatedBy: "live-match-signal-rule", vectorSearchExecuted: false, embeddingGenerated: false, rankingProviderRequested: false, aiProviderRequested: false, externalNetworkRequested: false, databaseQueryExecuted: true }],
  openingLine: line, recommendedAction: "现场聊一个具体问题。", source, evidenceIds: ["evidence:li"], generatedBy: "live-store-ranking", vectorSearchExecuted: false, embeddingGenerated: false, rankingProviderRequested: false, databaseQueryExecuted: true, ...safe
};
export const peoplePayload = {
  state: "success", event, recommendations: [recommendation], summary: "推荐一位交流对象。", nextAction: "先看共同话题。",
  provenance: { source: "event-store", sourceLabel: "活动记录", evidenceIds: ["evidence:li"], collectedAt: at, privacy: "live-event-recommendation-only", generationMethod: "live-store-ranking", vectorSearchExecuted: false, embeddingsGenerated: false, rankingProviderRequested: false, databaseQueryExecuted: true, databaseWriteExecuted: false, productionAuditLogWriteExecuted: false, deviceRequested: false, ...safe }
};
export const openingLinePayload = { state: "success", event, recommendation, openingLine: { ...line, lineId: "line:2", style: "context_question", text: "这轮访谈里，哪个发现改变了你们的产品计划？" }, alternatives: [], summary: "新开场白已生成。", nextAction: "确认用词后再使用。", provenance: { ...peoplePayload.provenance, generationMethod: "live-store-opening-line" } };
const reviewSource = { ...source, generatedBy: "mock-post-event-review-service" };
const followUp = { suggestionId: "followup:li", channel: "email", urgency: "this_week", messageDraft: "今天聊到的访谈方法很有帮助，下周可以继续交流吗？", rationale: "延续活动话题。", source: reviewSource, evidenceIds: ["evidence:li"], generatedBy: "mock-post-event-rules", externalMessageSendRequested: false, ...safe };
const contact = {
  contactDraftId: "draft:li", displayName: "李伟", organization: "星野工作室", role: "产品负责人", metAt: "周末产品交流会", relationshipContext: "交流了产品访谈经验。", status: "needs_review", source: reviewSource, evidenceIds: ["evidence:li"],
  summary: { summaryId: "summary:li", headline: "可以继续交流用户研究", context: "活动现场交流", whyNow: "双方都有正在推进的产品问题。", source: reviewSource, evidenceIds: ["evidence:li"], generatedBy: "mock-post-event-rules", aiProviderRequested: false, externalNetworkRequested: false },
  tags: [{ tagId: "tag:product", label: "产品交流", reason: "共同话题", source: reviewSource, evidenceIds: ["evidence:li"], generatedBy: "mock-post-event-rules", aiProviderRequested: false, liveDatabaseWriteExecuted: false }],
  followUpSuggestion: followUp, liveDatabaseWriteExecuted: false, batchPersistenceExecuted: false
};
export const reviewPayload = {
  state: "success", event: { id: "event:1", title: event.title, venue: event.venue, endedAt: event.endsAt, source: reviewSource, calendarProviderRequested: false, liveDatabaseReadExecuted: true }, reviewId: "review:1", contacts: [contact], summary: "有一位候选需要复核。", nextAction: "先复核候选记录。",
  provenance: { source: "event-store", sourceLabel: "活动记录", evidenceIds: ["evidence:li"], collectedAt: at, privacy: "demo-post-event-review-only", generationMethod: "live-store-query", ...safe, liveDatabaseReadExecuted: true, liveDatabaseWriteExecuted: false, batchPersistenceExecuted: false }
};
export const reviewConfirmationPayload = {
  state: "confirmed", event: reviewPayload.event, eventId: "event:1", reviewId: "review:1",
  confirmedContacts: [{ contactId: "contact:li", contactDraftId: "draft:li", displayName: "李伟", tags: ["产品交流"], followUpSuggestion: followUp, source: reviewSource, evidenceIds: ["evidence:li"], batchPersistenceExecuted: true, liveDatabaseWriteExecuted: true, notificationDelivered: false, externalMessageSendRequested: false }],
  summary: "已确认所选候选。", nextAction: "继续复核联系人。", provenance: { ...reviewPayload.provenance, generationMethod: "live-store-confirmation", liveDatabaseWriteExecuted: true, batchPersistenceExecuted: true }
};
export const personalPayloads = {
  "/api/events/event%3A1/readiness": readinessPayload,
  "/api/recommendations/event/event%3A1": peoplePayload,
  "/api/events/event%3A1/post-event": reviewPayload
};
