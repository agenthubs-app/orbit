export interface FollowupMetricView {
  label: string;
  value: string;
}

export interface FollowupTaskView {
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

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const date = new Date(timestamp);
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

function dueLabel(record: UnknownRecord): string {
  const dueAt = stringField(record, "dueAt");
  if (dueAt) {
    return formatDateTime(dueAt);
  }

  const dueInDays = numberField(record, "dueInDays", -1);
  if (dueInDays === 0) {
    return "今天";
  }

  if (dueInDays === 1) {
    return "明天";
  }

  return dueInDays > 1 ? `${dueInDays} 天后` : "待定";
}

function priorityLabel(value: string): string {
  const labels: Record<string, string> = {
    high: "高优先级",
    low: "低优先级",
    normal: "普通优先级",
    nurture: "长期经营",
    this_week: "本周",
    today: "今天"
  };

  return labels[value.trim().toLowerCase()] ?? "待确认";
}

function triggerLabel(value: string): string {
  const labels: Record<string, string> = {
    dormant_relationship: "冷关系唤醒",
    event_encounter: "活动后",
    new_connection: "新认识",
    promised_action: "承诺事项"
  };

  return labels[value.trim()] ?? "关系触发";
}

function contactName(record: UnknownRecord): string {
  return stringField(record, "contactName", "联系人");
}

function followupTitle(record: UnknownRecord): string {
  return `跟进 ${contactName(record)}`;
}

function recommendedAction(record: UnknownRecord): string {
  const action = stringField(record, "recommendedAction");

  if (!action || /\bcontact[_:-]?\d+|review follow-up\b/i.test(action)) {
    return `跟进 ${contactName(record)} 的关系进展。`;
  }

  return userFacingText(action, `跟进 ${contactName(record)} 的关系进展。`);
}

function rationale(record: UnknownRecord): string {
  return userFacingText(
    stringField(record, "rationale"),
    "这条跟进来自已记录的关系上下文，先复核再行动。"
  );
}

function sourceLabel(record: UnknownRecord): string {
  return userFacingText(
    stringField(nestedRecord(record, "source"), "label"),
    "来源已记录"
  );
}

function evidenceLabel(record: UnknownRecord): string {
  const count = listField(record, "evidenceIds").length;
  return count > 0 ? `${count} 条来源` : "来源待补";
}

function taskView(record: UnknownRecord): FollowupTaskView {
  return {
    contactName: contactName(record),
    dueLabel: dueLabel(record),
    evidenceLabel: evidenceLabel(record),
    id: stringField(record, "taskId", stringField(record, "id", "task")),
    organization: stringField(record, "organization"),
    priorityLabel: priorityLabel(stringField(record, "priority")),
    rationale: rationale(record),
    recommendedAction: recommendedAction(record),
    sourceLabel: sourceLabel(record),
    title: followupTitle(record),
    triggerLabel: triggerLabel(stringField(record, "triggerKind"))
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
      stringField(record, "organization")
    ]
      .filter(Boolean)
      .join(" · "),
    reviewLabel: messageDraftReviewLabel(stringField(record, "status")),
    safetyText: "这里只保存草稿，不会自动发送。",
    sourceLabel: userFacingText(
      stringField(nestedRecord(record, "source"), "label"),
      "来源已记录"
    ),
    subject: stringField(record, "subject", "跟进消息草稿"),
    windowLabel: messageDraftWindowLabel(
      stringField(record, "recommendedSendWindow")
    )
  };
}

function chatFollowupDraftTitle(record: UnknownRecord): string {
  const kind = stringField(record, "kind").trim().toLowerCase();

  if (kind === "follow_up_draft") {
    return "跟进草稿";
  }

  return userFacingText(stringField(record, "label"), "跟进草稿");
}

function chatFollowupDraftView(record: UnknownRecord): ChatFollowupDraftView {
  return {
    body: stringField(
      record,
      "suggestedText",
      stringField(record, "originalText", "先写一版简短跟进，再决定是否保存。")
    ),
    id: stringField(record, "assistId", stringField(record, "id", "assist")),
    reason: userFacingText(
      stringField(record, "rationale"),
      "先按自己的语气改一遍，再决定是否保存为正式草稿。"
    ),
    recipientLine: [
      stringField(record, "participantName", "联系人"),
      stringField(record, "organization")
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

function reminderTitle(record: UnknownRecord): string {
  const title = stringField(record, "title");
  const name = contactName(record);

  if (!title || /^review follow-up for /iu.test(title)) {
    return `提醒跟进 ${name}`;
  }

  return userFacingText(title, `提醒跟进 ${name}`);
}

function reminderQueueLabel(
  record: UnknownRecord,
  queueEntries: UnknownRecord[]
): string {
  const reminderId = stringField(record, "reminderId");
  const count = queueEntries.filter((entry) =>
    listField(entry, "reminderIds").includes(reminderId)
  ).length;

  return count > 0 ? `${count} 条通知待复核` : "提醒待复核";
}

function reminderView(
  record: UnknownRecord,
  queueEntries: UnknownRecord[]
): FollowupReminderView {
  return {
    dueLabel: dueLabel(record),
    id: stringField(record, "reminderId", "reminder"),
    organization: stringField(record, "organization"),
    priorityLabel: priorityLabel(stringField(record, "priority")),
    queueLabel: reminderQueueLabel(record, queueEntries),
    title: reminderTitle(record),
    windowLabel: userFacingText(
      stringField(record, "recommendedWindow"),
      "复核后再决定是否提醒。"
    )
  };
}

function topTask(tasks: FollowupTaskView[]): FollowupTaskView | null {
  return (
    tasks.find((task) => task.priorityLabel === "今天") ??
    tasks.find((task) => task.priorityLabel === "本周") ??
    tasks[0] ??
    null
  );
}

function nextAction(tasksPayload: unknown, tasks: FollowupTaskView[]): string {
  const sourceNextAction = userFacingText(
    stringField(recordFrom(tasksPayload), "nextAction"),
    ""
  );

  if (sourceNextAction) {
    return sourceNextAction;
  }

  return tasks.length
    ? "先处理今天到期、关系价值最高的那一条。"
    : "先从联系人或活动里记录一个明确的下一步。";
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

export function followupsToView(input: FollowupsViewInput): FollowupsView {
  const tasks = listFromPayload(input.tasksPayload, "tasks").map(taskView);
  const notificationRecord = recordFrom(input.notificationsPayload);
  const queueEntries = listField(notificationRecord, "notificationQueue").filter(
    isRecord
  );
  const reminders = listFromPayload(input.notificationsPayload, "reminders").map(
    (reminder) => reminderView(reminder, queueEntries)
  );
  const dueTodayCount = tasks.filter(
    (task) => task.priorityLabel === "今天" || task.dueLabel.startsWith("今天")
  ).length;

  return {
    metrics: [
      { label: "待跟进", value: String(tasks.length) },
      { label: "今天", value: String(dueTodayCount) },
      { label: "提醒", value: String(reminders.length) }
    ],
    nextAction: nextAction(input.tasksPayload, tasks),
    priorityTask: topTask(tasks),
    reminders,
    safetyText: "这里只做复核，不会发送消息、创建提醒或写入日程。",
    summary: tasks.length || reminders.length
      ? `${tasks.length} 个跟进 · ${reminders.length} 条提醒`
      : "暂无跟进",
    tasks,
    title: "跟进队列"
  };
}

export function generatedFollowupTasksToView(
  payload: unknown
): GeneratedFollowupTasksView {
  const tasks = listFromPayload(payload, "tasks").map(taskView);

  return {
    nextAction: generatedNextAction(payload, tasks),
    safetyText: "这些只是候选，不会自动发送消息或写入日程。",
    summary: tasks.length
      ? `生成了 ${tasks.length} 个候选跟进`
      : "暂无可生成的跟进",
    tasks,
    title: "新生成的跟进"
  };
}

export function generatedFollowupRemindersToView(
  payload: unknown
): GeneratedFollowupRemindersView {
  const record = recordFrom(payload);
  const queueEntries = listField(record, "notificationQueue").filter(isRecord);
  const reminders = listFromPayload(payload, "reminders").map((reminder) =>
    reminderView(reminder, queueEntries)
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
    title: "AI 跟进草稿"
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
