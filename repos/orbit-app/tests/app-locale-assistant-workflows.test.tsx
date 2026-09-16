import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTranslator, type MessageKey } from "../src/i18n/messages";
import {
  buildAiRunDetailRequest,
  conversationAiRunReferencesFor,
  conversationPayloadToChatView,
  pendingConversationThreadView,
  proactiveTurnPayloadToChatView,
} from "../src/view-models/conversations";
import { scheduleEventPreviewToView } from "../src/view-models/schedule-event-preview";
import { scheduleToCalendarView } from "../src/view-models/schedule";
import {
  relationshipAlertsToView,
  createdRelationshipThreadToView,
  relationshipInboxErrorText,
  relationshipPrivacyControlsToView,
  relationshipSignalConfirmToView,
  relationshipSignalsToView,
} from "../src/view-models/relationship-inbox";
import { todayToView } from "../src/view-models/today-tasks";

const workflowScreens = [
  "src/screens/ai/AgentActionsScreen.tsx",
  "src/screens/ai/AiConversationScreen.tsx",
  "src/screens/ai/AiScreen.tsx",
  "src/screens/ai/AiSessionOrganization.tsx",
  "src/screens/ai/ContactMentionPicker.tsx",
  "src/screens/ai/OrbitNextActions.tsx",
  "src/screens/tasks/RelationshipTaskTools.tsx",
  "src/screens/tasks/TaskDetailScreen.tsx",
  "src/screens/tasks/TasksScreen.tsx",
  "src/screens/today/TodayScreen.tsx",
  "src/screens/schedule/PersonalScheduleList.tsx",
  "src/screens/schedule/PersonalScheduleScreen.tsx",
  "src/screens/schedule/ScheduleEventPreviewScreen.tsx",
  "src/screens/schedule/ScheduleScreen.tsx",
  "src/screens/inbox/RelationshipInboxScreen.tsx",
] as const;

const appScreenWorkflowScreens = [
  "src/screens/ai/AgentActionsScreen.tsx",
  "src/screens/tasks/TaskDetailScreen.tsx",
  "src/screens/tasks/TasksScreen.tsx",
  // The personal editor uses the approved Cancel action, covered by browser interaction tests.
  "src/screens/schedule/ScheduleEventPreviewScreen.tsx",
  "src/screens/schedule/ScheduleScreen.tsx",
] as const;

function translate(language: "en" | "ja" | "zh", key: string): string {
  return createTranslator(language)(key as MessageKey);
}

test("assistant, task, schedule, and inbox chrome exists in all three dictionaries", () => {
  const keys = [
    "ai.title",
    "ai.send",
    "tasks.title",
    "tasks.save",
    "schedule.title",
    "schedule.save",
    "inbox.title",
    "inbox.markRead",
  ];
  const expected = {
    zh: ["IORBIT", "发送", "待办", "保存", "日历", "保存日程", "收件箱", "标为已读"],
    ja: ["IORBIT", "送信", "タスク", "保存", "カレンダー", "予定を保存", "受信トレイ", "既読にする"],
    en: ["IORBIT", "Send", "Tasks", "Save", "Calendar", "Save schedule", "Inbox", "Mark as read"],
  } as const;

  for (const language of ["zh", "ja", "en"] as const) {
    assert.deepEqual(keys.map(key => translate(language, key)), expected[language]);
  }
});

test("0015 workflow screens consume locale context instead of fixed-language chrome", async () => {
  for (const path of workflowScreens) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /useOrbitLocale/u, path);
  }
});

test("0015 AppScreen workflows localize direct-entry back navigation", async () => {
  for (const path of appScreenWorkflowScreens) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /backAccessibilityLabel=\{locale\.t\("common\.backToNamed"/u, path);
    assert.match(source, /backLabel=\{locale\.t\(/u, path);
  }
});

test("conversation, task, schedule, and inbox business values stay literal", () => {
  const values = [
    "Discuss 東京 launch / 讨论东京发布",
    "@contact:stable-0015",
    "2026-11-01T01:30:00-04:00",
    "メール本文はそのまま / Keep this message unchanged.",
    "task:stable-0015",
  ];

  for (const language of ["zh", "ja", "en"] as const) {
    const t = createTranslator(language);
    assert.deepEqual(values.map(value => t.literal(value)), values);
  }
});

test("direct workflow view models localize generated labels without changing records", () => {
  const payload = {
    completedCount: 2,
    date: "2026-09-15",
    tasks: [{
      category: "relationship",
      id: "task:literal",
      priority: "high",
      status: "open",
      title: "東京 launch / 发布准备",
      updatedAt: "2026-09-15T00:00:00Z",
    }],
  };
  const english = todayToView(payload, new Date("2026-09-15T00:00:00Z"), "Asia/Tokyo", "en");
  const japanese = todayToView(payload, new Date("2026-09-15T00:00:00Z"), "Asia/Tokyo", "ja");

  assert.equal(english.summary, "1 task · 0 schedule items");
  assert.equal(english.completedLabel, "2 completed");
  assert.equal(english.tasks[0]?.categoryLabel, "Relationship");
  assert.equal(japanese.summary, "タスク 1 件 · 予定 0 件");
  assert.equal(japanese.tasks[0]?.categoryLabel, "つながり");
  assert.equal(english.tasks[0]?.title, payload.tasks[0]?.title);

  assert.equal(scheduleEventPreviewToView(null, "Asia/Tokyo", "en").title, "Unable to load schedule preview");
  assert.equal(scheduleEventPreviewToView(null, "Asia/Tokyo", "ja").title, "予定プレビューを読み込めません");
  assert.equal(scheduleToCalendarView({ events: {}, tasks: {}, language: "en", now: new Date("2026-09-15T00:00:00Z") }).emptyTitle, "No schedule");
  assert.equal(scheduleToCalendarView({ events: {}, tasks: {}, language: "ja", now: new Date("2026-09-15T00:00:00Z") }).emptyTitle, "予定はありません");
  assert.equal(pendingConversationThreadView("原文 / Original", "en").title, "Working");
  assert.equal(pendingConversationThreadView("原文 / Original", "ja").messages[0]?.content, "原文 / Original");
  assert.equal(
    conversationPayloadToChatView({ proposedToolIntents: [{}] }, "en")
      .proposedToolIntents[0]?.label,
    "Suggested action",
  );
  assert.equal(
    proactiveTurnPayloadToChatView({ suggestedActions: [{}] }, "ja")
      .proposedToolIntents[0]?.reason,
    "Orbit AIはこの操作を先に確認することを提案しています。",
  );
  assert.equal(
    conversationAiRunReferencesFor({ runId: "run:literal" }, "en")[0]?.actionLabel,
    "View evidence",
  );
  assert.equal(buildAiRunDetailRequest("", "ja").success, false);
});

test("relationship inbox view models localize generated chrome and preserve source content", () => {
  const signalPayload = {
    signals: [{
      confidence: "high",
      confirmation: { state: "pending" },
      displayName: "Aiko Watanabe / 渡辺愛子",
      evidence: [{ excerpt: "Header and subject fixture: Intro for Aiko." }],
      id: "signal:literal",
      occurredAt: "2026-09-15T01:30:00Z",
      organization: "Kumo Grid",
      permission: { state: "pending" },
      relationshipContext: "Intro email metadata suggests a warm introduction.",
      role: "Founder",
      signalKind: "email_intro",
      sourceKind: "gmail",
      suggestedNextAction: "Ask for context from the introducer.",
    }],
  };
  const englishSignals = relationshipSignalsToView(signalPayload, "en");
  const japaneseSignals = relationshipSignalsToView(signalPayload, "ja");

  assert.equal(englishSignals.title, "Relationship signals");
  assert.equal(englishSignals.signals[0]?.sourceLabel, "Email signal");
  assert.equal(englishSignals.signals[0]?.confidenceLabel, "High confidence");
  assert.equal(englishSignals.signals[0]?.title, "Aiko Watanabe / 渡辺愛子");
  assert.equal(japaneseSignals.signals[0]?.sourceLabel, "メールシグナル");
  assert.equal(japaneseSignals.signals[0]?.nextAction, "紹介者に背景を確認してから、連絡するか決めます。");

  const privacyPayload = {
    analysisDeletion: { status: "available" },
    analysisOptIn: { enabled: true },
    privateNotes: [{ bodyRedacted: true }],
    provenance: { sourceLabel: "Customer-authored audit trail" },
    sensitiveShareConfirmation: { confirmationRequired: true },
  };
  const englishPrivacy = relationshipPrivacyControlsToView(privacyPayload, "en");
  const japanesePrivacy = relationshipPrivacyControlsToView(privacyPayload, "ja");

  assert.equal(englishPrivacy.title, "Privacy controls");
  assert.equal(englishPrivacy.privateNotesLabel, "1 private note hidden");
  assert.equal(japanesePrivacy.analysisLabel, "関係分析を許可");
  assert.equal(englishPrivacy.sourceLabel, "Customer-authored audit trail");

  const alerts = relationshipAlertsToView({
    reminders: [{
      contactName: "山崎 美穂",
      dueAt: "2026-09-15T09:00:00+09:00",
      organization: "Aoba Technologies",
      priority: "high",
      reminderId: "reminder:literal",
      title: "Review follow-up for contact_021",
    }],
  }, undefined, "en");

  assert.equal(alerts.summary, "1 alert");
  assert.equal(alerts.alerts[0]?.title, "Contact 山崎 美穂");
  assert.equal(alerts.alerts[0]?.priorityLabel, "High priority");
  assert.equal(alerts.alerts[0]?.detail, "Aoba Technologies");

  const confirmation = relationshipSignalConfirmToView({
    confirmedAt: "2026-09-15T01:30:00Z",
    confirmedSignal: { displayName: "Aiko Watanabe", organization: "Kumo Grid" },
    externalActionExecuted: false,
    relationshipWriteExecuted: false,
  }, "ja");
  assert.equal(confirmation.title, "シグナルを確認しました");
  assert.equal(confirmation.contactLine, "Aiko Watanabe · Kumo Grid");
  assert.equal(
    relationshipInboxErrorText("Please sign in again.", "Fallback", "en"),
    "Please sign in again.",
  );

  const created = createdRelationshipThreadToView({
    inboxItem: {
      conversationId: "conversation:literal",
      participantName: "Maya Chen",
      preview: "Keep this preview unchanged.",
      subject: "東京 launch / Launch follow-up",
    },
    sideEffects: {
      calendarEntryCreated: false,
      externalMessageSent: false,
      networkRequestMade: false,
      notificationDelivered: false,
      savedRecordCreated: false,
    },
    thread: {
      conversationId: "conversation:literal",
      messages: [{
        body: "メール本文 / Keep this body unchanged.",
        messageId: "message:literal",
        occurredAt: "2026-09-15T01:30:00Z",
        senderName: "Maya Chen",
        senderRole: "contact",
      }],
      subject: "東京 launch / Launch follow-up",
      summary: "Maya asked to review the launch plan.",
    },
  }, "en");
  assert.equal(created.detail.currentUserName, "Me");
  assert.equal(created.detail.messages[0]?.body, "メール本文 / Keep this body unchanged.");
  assert.equal(created.detail.safetyText, "This is a draft only. Nothing is sent or added to the calendar without confirmation.");
});
