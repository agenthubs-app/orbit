import type { FollowupTaskContract } from "../api/contract/followups";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";
export interface FollowupMetricView {
  label: string;
  value: string;
}

export interface FollowupTaskView {
  contactId: string;
  contactName: string;
  dueLabel: string;
  evidenceLabel: string;
  id: string;
  organization: string;
  priorityLabel: string;
  rationale: string;
  recommendedAction: string;
  sourceLabel: string;
  title: string;
  triggerLabel: string;
}

export interface FollowupReminderView {
  dueLabel: string;
  id: string;
  organization: string;
  priorityLabel: string;
  queueLabel: string;
  title: string;
  windowLabel: string;
}

export interface FollowupsView {
  metrics: FollowupMetricView[];
  nextAction: string;
  priorityTask: FollowupTaskView | null;
  reminders: FollowupReminderView[];
  safetyText: string;
  summary: string;
  tasks: FollowupTaskView[];
  title: string;
}

export interface GeneratedFollowupTasksView {
  nextAction: string;
  safetyText: string;
  summary: string;
  tasks: FollowupTaskView[];
  title: string;
}

export interface GeneratedFollowupRemindersView {
  nextAction: string;
  reminders: FollowupReminderView[];
  safetyText: string;
  summary: string;
  title: string;
}

export interface ReminderGenerationRequest {
  dueWithinDays: 14;
  includeGroupedLowPriority: true;
  limit: 5;
}

export interface MessageDraftRequest {
  channel: "email";
  contextNote: string;
  draftKind: "follow_up";
  organization: string;
  recipientName: string;
}

export interface ChatFollowupDraftRequest {
  contextNote: string;
  organization: string;
  participantName: string;
  sourceText: string;
}

export interface MessageDraftReviewRequest {
  reviewerLabel: "Orbit iOS";
  status: "ready_for_confirmation";
}

export interface ChatFollowupDraftView {
  body: string;
  id: string;
  reason: string;
  recipientLine: string;
  safetyText: string;
  sourceLabel: string;
  title: string;
}

export interface ChatFollowupDraftsView {
  drafts: ChatFollowupDraftView[];
  nextAction: string;
  summary: string;
  title: string;
}

export interface MessageDraftView {
  body: string;
  channelLabel: string;
  id: string;
  recipientLine: string;
  reviewLabel: string;
  safetyText: string;
  sourceLabel: string;
  subject: string;
  windowLabel: string;
}

export interface MessageDraftsView {
  drafts: MessageDraftView[];
  nextAction: string;
  summary: string;
  title: string;
}

export interface FollowupsViewInput {
  notificationsPayload: unknown;
  tasksPayload: unknown;
}

type UnknownRecord = Record<string, unknown>;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

// 字段名受跨端契约约束：服务端改名，这里立刻编译报错。
// 只用于跟进任务记录；消息草稿等其他形状继续走 stringField。
function taskField(
  record: Record<string, unknown>,
  fieldName: keyof FollowupTaskContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function numberField(
  record: UnknownRecord,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function recordFrom(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(value);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? value.trim();
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|generated|source-backed|live storage|live-store|live task store|database|external action|notification queue|push notification|current-user relationship record|direct qr scan|qr scan|imported)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback = ""): string {
  const text = preferredChineseSegment(value);

  if (!text) {
    return fallback;
  }

  if (containsImplementationLabel(text)) {
    return fallback;
  }

  if (fallback && !segmentLooksChinese(text)) {
    return fallback;
  }

  return text;
}

function listFromPayload(value: unknown, fieldName: string): UnknownRecord[] {
  const record = recordFrom(value);
  const field = Array.isArray(value) ? value : record[fieldName];

  return Array.isArray(field) ? field.filter(isRecord) : [];
}

function formatDateTime(value: string, language: OrbitLanguage = "zh"): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const date = new Date(timestamp);
  if (language !== "zh") {
    return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", timeZone: "Asia/Tokyo", weekday: "short" }).format(date);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayByEnglish: Record<string, string> = {
    Fri: "周五",
    Mon: "周一",
    Sat: "周六",
    Sun: "周日",
    Thu: "周四",
    Tue: "周二",
    Wed: "周三"
  };
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return `${partValue("month")}月${partValue("day")}日 ${
    weekdayByEnglish[partValue("weekday")] ?? ""
  } ${time}`.trim();
}

function dueLabel(record: UnknownRecord, language: OrbitLanguage, t: OrbitTranslator): string {
  const dueAt = taskField(record, "dueAt");
  if (dueAt) {
    return formatDateTime(dueAt, language);
  }

  const dueInDays = numberField(record, "dueInDays", -1);
  if (dueInDays === 0) {
    return t("scheduleVm.today");
  }

  if (dueInDays === 1) {
    return t("scheduleVm.tomorrow");
  }

  return dueInDays > 1 ? t("scheduleVm.daysLater", { count: dueInDays }) : t("scheduleVm.tbd");
}

function priorityLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    high: t("followupVm.priorityHigh"),
    low: t("followupVm.priorityLow"),
    normal: t("followupVm.priorityNormal"),
    nurture: t("followupVm.priorityNurture"),
    this_week: t("scheduleVm.thisWeek"),
    today: t("scheduleVm.today")
  };

  return labels[value.trim().toLowerCase()] ?? t("scheduleVm.tbd");
}

function triggerLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    dormant_relationship: t("followupVm.triggerDormant"),
    event_encounter: t("followupVm.triggerEvent"),
    new_connection: t("followupVm.triggerNew"),
    promised_action: t("followupVm.triggerPromised")
  };

  return labels[value.trim()] ?? t("followupVm.triggerFallback");
}

function contactName(record: UnknownRecord, t: OrbitTranslator): string {
  return taskField(record, "contactName", t("scheduleVm.contact"));
}

function followupTitle(record: UnknownRecord, t: OrbitTranslator): string {
  return t("scheduleVm.contactNamed", { name: t.literal(contactName(record, t)) });
}

function recommendedAction(record: UnknownRecord, language: OrbitLanguage, t: OrbitTranslator): string {
  const action = taskField(record, "recommendedAction");
  const fallback = t("scheduleVm.contactNext", { name: t.literal(contactName(record, t)) });

  if (!action || /\bcontact[_:-]?\d+|review follow-up\b/i.test(action)) {
    return fallback;
  }

  return language === "zh" ? userFacingText(action, fallback) : containsImplementationLabel(action) ? fallback : action.trim();
}

function rationale(record: UnknownRecord, language: OrbitLanguage, t: OrbitTranslator): string {
  const value = taskField(record, "rationale");
  return language === "zh" ? userFacingText(
    value,
    t("followupVm.rationale")
  ) : containsImplementationLabel(value) || !value ? t("followupVm.rationale") : value;
}

function sourceLabel(record: UnknownRecord, language: OrbitLanguage, t: OrbitTranslator): string {
  const value = stringField(nestedRecord(record, "source"), "label");
  if (language !== "zh") return containsImplementationLabel(value) || !value ? t("followupVm.sourceRecorded") : value;
  return userFacingText(
    value,
    t("followupVm.sourceRecorded")
  );
}

function evidenceLabel(record: UnknownRecord, t: OrbitTranslator): string {
  const count = listField(record, "evidenceIds").length;
  return count > 0 ? t("followupVm.evidenceCount", { count }) : t("followupVm.evidencePending");
}

function taskView(record: UnknownRecord, language: OrbitLanguage, t: OrbitTranslator): FollowupTaskView {
  return {
    contactId: taskField(record, "contactId", stringField(record, "relatedContactId")),
    contactName: contactName(record, t),
    dueLabel: dueLabel(record, language, t),
    evidenceLabel: evidenceLabel(record, t),
    id: taskField(record, "taskId", stringField(record, "id", "task")),
    organization: taskField(record, "organization"),
    priorityLabel: priorityLabel(taskField(record, "priority"), t),
    rationale: rationale(record, language, t),
    recommendedAction: recommendedAction(record, language, t),
    sourceLabel: sourceLabel(record, language, t),
    title: followupTitle(record, t),
    triggerLabel: triggerLabel(taskField(record, "triggerKind"), t)
  };
}

function messageDraftChannelLabel(value: string): string {
  const labels: Record<string, string> = {
    calendar_note: "日程备注",
    email: "邮件",
    internal_note: "内部备注",
    linkedin: "LinkedIn"
  };

  return labels[value.trim().toLowerCase()] ?? "消息";
}

function messageDraftReviewLabel(value: string): string {
  const labels: Record<string, string> = {
    draft: "草稿",
    held_for_review: "待复核",
    ready_for_confirmation: "可确认",
    revised: "已修改"
  };

  return labels[value.trim().toLowerCase()] ?? "待复核";
}

function messageDraftWindowLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "next business day": "下一个工作日",
    "same day": "当天",
    "this week": "本周",
    "within 24 hours": "24 小时内"
  };
  const label = labels[normalized] ?? userFacingText(value, "");

  return label ? `建议 ${label}` : "发送时间待定";
}

function messageDraftView(record: UnknownRecord): MessageDraftView {
  return {
    body: stringField(record, "body"),
    channelLabel: messageDraftChannelLabel(stringField(record, "channel")),
    id: stringField(record, "draftId", stringField(record, "id", "draft")),
    recipientLine: [
      stringField(record, "recipientName", "联系人"),
      taskField(record, "organization")
    ]
      .filter(Boolean)
      .join(" · "),
    reviewLabel: messageDraftReviewLabel(stringField(record, "status")),
    safetyText: "这里只保存草稿，不会自动发送。",
    sourceLabel: userFacingText(
      stringField(nestedRecord(record, "source"), "label"),
      "来源已记录"
    ),
    subject: stringField(record, "subject", "联系消息草稿"),
    windowLabel: messageDraftWindowLabel(
      stringField(record, "recommendedSendWindow")
    )
  };
}

function chatFollowupDraftTitle(record: UnknownRecord): string {
  const kind = stringField(record, "kind").trim().toLowerCase();

  if (kind === "follow_up_draft") {
    return "联系草稿";
  }

  return userFacingText(stringField(record, "label"), "联系草稿");
}

function chatFollowupDraftView(record: UnknownRecord): ChatFollowupDraftView {
  return {
    body: stringField(
      record,
      "suggestedText",
      stringField(record, "originalText", "先写一版简短消息，再决定是否保存。")
    ),
    id: stringField(record, "assistId", stringField(record, "id", "assist")),
    reason: userFacingText(
      taskField(record, "rationale"),
      "先按自己的语气改一遍，再决定是否保存为正式草稿。"
    ),
    recipientLine: [
      stringField(record, "participantName", "联系人"),
      taskField(record, "organization")
    ]
      .filter(Boolean)
      .join(" · "),
    safetyText: "这里只生成文案，不会保存草稿或发送消息。",
    sourceLabel: userFacingText(
      stringField(nestedRecord(record, "source"), "label"),
      "来源已记录"
    ),
    title: chatFollowupDraftTitle(record)
  };
}

function reminderTitle(record: UnknownRecord, language: OrbitLanguage, t: OrbitTranslator): string {
  const title = stringField(record, "title");
  const name = contactName(record, t);
  const fallback = t("followupVm.reminderNamed", { name: t.literal(name) });

  if (!title || /^review follow-up for /iu.test(title)) {
    return fallback;
  }

  return language === "zh" ? userFacingText(title, fallback) : containsImplementationLabel(title) ? fallback : title;
}

function reminderQueueLabel(
  record: UnknownRecord,
  queueEntries: UnknownRecord[],
  t: OrbitTranslator
): string {
  const reminderId = stringField(record, "reminderId");
  const count = queueEntries.filter((entry) =>
    listField(entry, "reminderIds").includes(reminderId)
  ).length;

  return count > 0 ? t("followupVm.queueCount", { count }) : t("followupVm.queuePending");
}

function reminderView(
  record: UnknownRecord,
  queueEntries: UnknownRecord[],
  language: OrbitLanguage,
  t: OrbitTranslator
): FollowupReminderView {
  return {
    dueLabel: dueLabel(record, language, t),
    id: stringField(record, "reminderId", "reminder"),
    organization: taskField(record, "organization"),
    priorityLabel: priorityLabel(taskField(record, "priority"), t),
    queueLabel: reminderQueueLabel(record, queueEntries, t),
    title: reminderTitle(record, language, t),
    windowLabel: userFacingText(
      stringField(record, "recommendedWindow"),
      t("followupVm.reminderWindow")
    )
  };
}

function topTask(tasks: FollowupTaskView[], t: OrbitTranslator): FollowupTaskView | null {
  return (
    tasks.find((task) => task.priorityLabel === t("scheduleVm.today")) ??
    tasks.find((task) => task.priorityLabel === t("scheduleVm.thisWeek")) ??
    tasks[0] ??
    null
  );
}

function nextAction(tasksPayload: unknown, tasks: FollowupTaskView[], language: OrbitLanguage, t: OrbitTranslator): string {
  const value = stringField(recordFrom(tasksPayload), "nextAction");
  const sourceNextAction = userFacingText(
    value,
    ""
  );

  if (sourceNextAction || (language !== "zh" && value && !containsImplementationLabel(value))) {
    return language === "zh" ? sourceNextAction : value;
  }

  return tasks.length
    ? t("followupVm.nextWithTasks")
    : t("followupVm.nextEmpty");
}

function generatedNextAction(payload: unknown, tasks: FollowupTaskView[]): string {
  const sourceNextAction = userFacingText(
    stringField(recordFrom(payload), "nextAction"),
    ""
  );

  if (sourceNextAction) {
    return sourceNextAction;
  }

  return tasks.length
    ? "先复核来源，再决定是否写入任务。"
    : "暂时没有新的候选。";
}

function generatedReminderNextAction(
  payload: unknown,
  reminders: FollowupReminderView[]
): string {
  const fallback = reminders.length
    ? "先复核时间和来源，再决定是否开启提醒。"
    : "暂时没有新的提醒候选。";

  return userFacingText(stringField(recordFrom(payload), "nextAction"), fallback);
}

export function followupInlineContextLabel(
  task: Pick<FollowupTaskView, "priorityLabel" | "sourceLabel" | "triggerLabel">
): string {
  return (
    [task.sourceLabel, task.triggerLabel].filter(Boolean).join(" · ") ||
    task.priorityLabel
  );
}

export function followupsToView(input: FollowupsViewInput, language: OrbitLanguage = "zh"): FollowupsView {
  const t = createTranslator(language);
  const tasks = listFromPayload(input.tasksPayload, "tasks").map(record => taskView(record, language, t));
  const notificationRecord = recordFrom(input.notificationsPayload);
  const queueEntries = listField(notificationRecord, "notificationQueue").filter(
    isRecord
  );
  const reminders = listFromPayload(input.notificationsPayload, "reminders").map(
    (reminder) => reminderView(reminder, queueEntries, language, t)
  );
  const dueTodayCount = tasks.filter(
    (task) => task.priorityLabel === t("scheduleVm.today") || task.dueLabel.startsWith(t("scheduleVm.today"))
  ).length;

  return {
    metrics: [
      { label: t("followupVm.statTasks"), value: String(tasks.length) },
      { label: t("followupVm.statToday"), value: String(dueTodayCount) },
      { label: t("followupVm.statReminders"), value: String(reminders.length) }
    ],
    nextAction: nextAction(input.tasksPayload, tasks, language, t),
    priorityTask: topTask(tasks, t),
    reminders,
    safetyText: t("followupVm.safety"),
    summary: tasks.length || reminders.length
      ? t("followupVm.summary", { tasks: tasks.length, reminders: reminders.length })
      : t("followupVm.empty"),
    tasks,
    title: t("followupVm.title")
  };
}

export function generatedFollowupTasksToView(
  payload: unknown
): GeneratedFollowupTasksView {
  const language: OrbitLanguage = "zh";
  const t = createTranslator(language);
  const tasks = listFromPayload(payload, "tasks").map(record => taskView(record, language, t));

  return {
    nextAction: generatedNextAction(payload, tasks),
    safetyText: "这些只是候选，不会自动发送消息或写入日程。",
    summary: tasks.length
      ? `生成了 ${tasks.length} 项待办建议`
      : "暂无待办建议",
    tasks,
    title: "待办建议"
  };
}

export function generatedFollowupRemindersToView(
  payload: unknown
): GeneratedFollowupRemindersView {
  const language: OrbitLanguage = "zh";
  const t = createTranslator(language);
  const record = recordFrom(payload);
  const queueEntries = listField(record, "notificationQueue").filter(isRecord);
  const reminders = listFromPayload(payload, "reminders").map((reminder) =>
    reminderView(reminder, queueEntries, language, t)
  );

  return {
    nextAction: generatedReminderNextAction(payload, reminders),
    reminders,
    safetyText: "这些只是提醒候选，不会发送推送、邮件或短信。",
    summary: reminders.length
      ? `生成了 ${reminders.length} 条提醒候选`
      : "暂无可生成的提醒",
    title: "新生成的提醒"
  };
}

export function buildReminderGenerationRequest(): ReminderGenerationRequest {
  return {
    dueWithinDays: 14,
    includeGroupedLowPriority: true,
    limit: 5
  };
}

export function buildMessageDraftRequestFromTask(
  task: Pick<
    FollowupTaskView,
    "contactName" | "organization" | "recommendedAction"
  >
): MessageDraftRequest {
  return {
    channel: "email",
    contextNote: task.recommendedAction.trim(),
    draftKind: "follow_up",
    organization: task.organization.trim(),
    recipientName: task.contactName.trim()
  };
}

export function buildChatFollowupDraftRequestFromTask(
  task: Pick<
    FollowupTaskView,
    "contactName" | "organization" | "rationale" | "recommendedAction"
  >
): ChatFollowupDraftRequest {
  return {
    contextNote: task.recommendedAction.trim(),
    organization: task.organization.trim(),
    participantName: task.contactName.trim(),
    sourceText: task.rationale.trim()
  };
}

export function buildMessageDraftReviewRequest(
  _draft: Pick<MessageDraftView, "id">
): MessageDraftReviewRequest {
  return {
    reviewerLabel: "Orbit iOS",
    status: "ready_for_confirmation"
  };
}

export function chatFollowupDraftsToView(
  payload: unknown
): ChatFollowupDraftsView {
  const drafts = listFromPayload(payload, "assists").map(chatFollowupDraftView);
  const nextActionText = userFacingText(
    stringField(recordFrom(payload), "nextAction"),
    drafts.length
      ? "先检查文案，再决定是否保存或发送。"
      : "暂时没有新的 AI 草稿。"
  );

  return {
    drafts,
    nextAction: nextActionText,
    summary: drafts.length ? `${drafts.length} 条 AI 草稿待复核` : "暂无 AI 草稿",
    title: "AI 联系草稿"
  };
}

export function messageDraftsToView(payload: unknown): MessageDraftsView {
  const drafts = listFromPayload(payload, "drafts").map(messageDraftView);
  const nextActionText = userFacingText(
    stringField(recordFrom(payload), "nextAction"),
    "先检查草稿，再决定是否发送。"
  );

  return {
    drafts,
    nextAction: nextActionText,
    summary: drafts.length ? `${drafts.length} 封草稿待复核` : "暂无草稿",
    title: "消息草稿"
  };
}
