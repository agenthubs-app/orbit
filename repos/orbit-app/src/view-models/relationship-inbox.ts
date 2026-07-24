import { ORBIT_API_ENDPOINTS } from "../api/endpoints";

export interface RelationshipConversationView {
  contactId: string;
  id: string;
  lastAt: string;
  name: string;
  nextAction: string;
  organization: string;
  preview: string;
  sourceLabels: string[];
  subject: string;
  unreadLabel: string;
}

export interface RelationshipMessageView {
  body: string;
  fromMe: boolean;
  id: string;
  sender: string;
  time: string;
}

export interface RelationshipThreadDetailView {
  conversationId: string;
  currentUserName: string;
  draftReply: string;
  messages: RelationshipMessageView[];
  participantName: string;
  safetyText: string;
  sourceLabels: string[];
  subject: string;
  summary: string;
}

export interface RelationshipInboxView {
  conversations: RelationshipConversationView[];
  selected: RelationshipThreadDetailView | null;
  summary: string;
  title: string;
}

export interface RelationshipAlertView {
  detail: string;
  dueLabel: string;
  id: string;
  kind: "proactive" | "reminder";
  priorityLabel: string;
  title: string;
}

export interface RelationshipAlertsView {
  alerts: RelationshipAlertView[];
  safetyText: string;
  summary: string;
}

export interface RelationshipCreatedThreadView {
  conversation: RelationshipConversationView;
  detail: RelationshipThreadDetailView;
}

interface RelationshipThreadDraftInput {
  body: string;
  contactId?: string;
  organization: string;
  participantName: string;
  subject: string;
}

export type RelationshipThreadDraftRequestResult =
  | {
      error: string;
      success: false;
    }
  | {
      request: {
        body: {
          body: string;
          contactId?: string;
          organization: string;
          participantName: string;
          sourceLabel: string;
          subject: string;
        };
        endpoint: string;
      };
      success: true;
    };

type UnknownRecord = Record<string, unknown>;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const KNOWN_THREAD_COPY: Record<
  string,
  {
    draftReply?: string;
    messages?: Record<string, string>;
    preview?: string;
    subject?: string;
    summary?: string;
  }
> = {
  conversation_demo_aoba: {
    draftReply:
      "Aoba，我把早餐会的复盘压成两点：场地方最关心创始人匹配度，以及后续谁来负责推进。我可以在你和他们沟通前先发过去；如果需要快速对齐，我周四 10:00 可以留 25 分钟。",
    messages: {
      message_demo_aoba_1:
        "代代木那场气候创业者早餐会很有用。你能在我和场地方沟通前，把两点复盘发给我吗？",
      message_demo_aoba_2:
        "可以。我会写短一点，并对齐场地方后续最关心的问题。"
    },
    preview: "我会把内容压短，并对齐场地方的问题。",
    subject: "代代木早餐会跟进",
    summary: "Aoba 想在和场地方沟通前，先拿到早餐会的两点复盘。"
  },
  conversation_demo_lina: {
    preview: "如果机器人投资人介绍还合适，请提醒我最相关的角度。",
    subject: "投资人介绍背景",
    summary: "Lina 需要先确认投资人介绍最相关的切入角度。"
  }
};

const SOURCE_LABELS: Record<string, string> = {
  "Aoba follow-up task": "Aoba 跟进任务",
  "Calendar hold from Orbit schedule context": "日程预留",
  "Event attendance record": "活动记录",
  "Mock asynchronous relationship correspondence": "关系收件箱预览",
  "Mock staged conversation created from a reviewed draft": "待复核草稿",
  "Robotics investor intro note": "机器人投资人介绍记录",
  "Staged from a reviewed message draft": "待复核草稿",
  "Yoyogi climate founder breakfast": "代代木气候创业者早餐会"
};

const NEXT_ACTIONS: Record<string, string> = {
  "Prepare a local reply preview": "先准备一版回复，确认后再发送。",
  "Review the staged draft before any send": "先检查草稿，确认后再发送。",
  "Stage the intro-angle reply": "先准备介绍角度回复，确认后再发送。"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberField(
  record: UnknownRecord,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
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
  return /\b(mock|fixture|provider|generated|source:|evidence:|live-store|postgres|external send|network request|local reply preview|staged from|reviewed message draft)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback = ""): string {
  const preferred = preferredChineseSegment(value);

  if (!preferred) {
    return fallback;
  }

  if (containsImplementationLabel(preferred) && fallback) {
    return fallback;
  }

  if (!segmentLooksChinese(preferred) && fallback) {
    return fallback;
  }

  return preferred;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${date
    .getHours()
    .toString()
    .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function formatDateWithWeekday(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${
    WEEKDAYS[date.getDay()]
  } ${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function formatDateWithClock(value: string, clock: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return clock ? `${value} ${clock}` : value;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${
    WEEKDAYS[date.getDay()]
  } ${clock}`;
}

function localizeSourceLabels(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => SOURCE_LABELS[value] ?? userFacingText(value))
        .filter(Boolean)
    )
  ];
}

function localizeSubject(conversationId: string, value: string): string {
  return (
    KNOWN_THREAD_COPY[conversationId]?.subject ??
    userFacingText(value, "关系跟进")
  );
}

function localizePreview(conversationId: string, value: string): string {
  return (
    KNOWN_THREAD_COPY[conversationId]?.preview ??
    userFacingText(value, "先复核上下文，再决定下一步。")
  );
}

function localizeSummary(conversationId: string, value: string): string {
  return (
    KNOWN_THREAD_COPY[conversationId]?.summary ??
    userFacingText(value, "先复核这段关系背景，再准备跟进。")
  );
}

function localizeDraftReply(conversationId: string, value: string): string {
  return (
    KNOWN_THREAD_COPY[conversationId]?.draftReply ??
    userFacingText(value, "先写一版草稿，确认后再发送。")
  );
}

function localizeMessageBody(
  conversationId: string,
  messageId: string,
  value: string
): string {
  return (
    KNOWN_THREAD_COPY[conversationId]?.messages?.[messageId] ??
    userFacingText(value, "这条消息需要先复核。")
  );
}

function nextActionLabel(value: string): string {
  return (
    NEXT_ACTIONS[value] ??
    userFacingText(value, "先准备一版回复，确认后再发送。")
  );
}

function currentUserName(value: string): string {
  if (/^(alex tan|orbit operator|profile_orbit_generated_operator)$/iu.test(value.trim())) {
    return "我";
  }

  return value.trim() || "我";
}

function allSideEffectsFalse(record: UnknownRecord): boolean {
  return (
    record.externalMessageSent === false &&
    record.notificationDelivered === false &&
    record.calendarEntryCreated === false &&
    record.savedRecordCreated === false &&
    record.networkRequestMade === false
  );
}

function safetyText(sideEffects: UnknownRecord): string {
  if (allSideEffectsFalse(sideEffects)) {
    return "这里先写草稿。未经确认，不会发送消息或创建日程。";
  }

  return "请先复核这段草稿，再决定下一步。";
}

function conversationView(item: UnknownRecord): RelationshipConversationView {
  const id = stringField(item, "conversationId", "conversation");
  const unreadCount = Math.max(0, numberField(item, "unreadCount"));

  return {
    contactId: stringField(item, "contactId", "contact"),
    id,
    lastAt: formatDateTime(stringField(item, "lastCorrespondenceAt")),
    name: stringField(item, "participantName", "联系人"),
    nextAction: nextActionLabel(stringField(item, "nextActionLabel")),
    organization: stringField(item, "organization"),
    preview: localizePreview(id, stringField(item, "preview")),
    sourceLabels: localizeSourceLabels(listField(item, "sourceContextLabels")),
    subject: localizeSubject(id, stringField(item, "subject")),
    unreadLabel: unreadCount > 0 ? `${unreadCount} 条新消息` : ""
  };
}

function selectedThreadFromPayload(data: UnknownRecord): UnknownRecord | null {
  const selected = data.selectedThread;
  return isRecord(selected) ? selected : null;
}

function selectedConversationItem(
  conversations: RelationshipConversationView[],
  selectedId: string
): RelationshipConversationView | null {
  return (
    conversations.find((conversation) => conversation.id === selectedId) ?? null
  );
}

function threadDetailView(
  thread: UnknownRecord,
  currentUser: string,
  sideEffects: UnknownRecord,
  fallbackParticipantName = ""
): RelationshipThreadDetailView {
  const conversationId = stringField(thread, "conversationId", "conversation");
  const messages = listField(thread, "messages").filter(isRecord);

  return {
    conversationId,
    currentUserName: currentUserName(currentUser),
    draftReply: "",
    messages: messages.map((message) => {
      const fromMe = stringField(message, "senderRole") === "orbit_user";
      const messageId = stringField(message, "messageId", "message");

      return {
        body: localizeMessageBody(
          conversationId,
          messageId,
          stringField(message, "body")
        ),
        fromMe,
        id: messageId,
        sender: fromMe
          ? "我"
          : stringField(message, "senderName", fallbackParticipantName || "联系人"),
        time: formatDateTime(stringField(message, "occurredAt"))
      };
    }),
    participantName: fallbackParticipantName || "联系人",
    safetyText: safetyText(sideEffects),
    sourceLabels: localizeSourceLabels(listField(thread, "sourceContextLabels")),
    subject: localizeSubject(conversationId, stringField(thread, "subject")),
    summary: localizeSummary(conversationId, stringField(thread, "summary"))
  };
}

export function relationshipInboxToView(data: unknown): RelationshipInboxView {
  if (!isRecord(data)) {
    return {
      conversations: [],
      selected: null,
      summary: "暂无对话",
      title: "关系收件箱"
    };
  }

  const inbox = nestedRecord(data, "inbox");
  const currentUser = nestedRecord(data, "currentUser");
  const sideEffects = nestedRecord(data, "sideEffects");
  const conversations = listField(inbox, "conversations")
    .filter(isRecord)
    .map(conversationView);
  const unreadTotal = conversations.filter((item) => item.unreadLabel).length;
  const selectedThread = selectedThreadFromPayload(data);
  const selectedId = selectedThread
    ? stringField(selectedThread, "conversationId")
    : "";
  const selectedItem = selectedId
    ? selectedConversationItem(conversations, selectedId)
    : null;
  const draftReply = nestedRecord(data, "draftReply");
  const selected = selectedThread
    ? {
        ...threadDetailView(
          selectedThread,
          stringField(currentUser, "displayName", "我"),
          sideEffects,
          selectedItem?.name
        ),
        draftReply: localizeDraftReply(
          selectedId,
          stringField(draftReply, "body")
        )
      }
    : null;

  return {
    conversations,
    selected,
    summary: conversations.length
      ? `${conversations.length} 段对话 · ${unreadTotal} 条新消息`
      : "暂无对话",
    title: "关系收件箱"
  };
}

function createdSummary(value: string, participantName: string): string {
  if (/new relationship thread staged from a reviewed draft/i.test(value)) {
    return `已生成一段待复核的关系对话，收件人是${participantName}。`;
  }

  return userFacingText(value, `已生成一段待复核的关系对话，收件人是${participantName}。`);
}

export function createdRelationshipThreadToView(
  data: unknown
): RelationshipCreatedThreadView {
  const record = isRecord(data) ? data : {};
  const inboxItem = nestedRecord(record, "inboxItem");
  const thread = nestedRecord(record, "thread");
  const sideEffects = nestedRecord(record, "sideEffects");
  const conversation = conversationView(inboxItem);
  const detail = threadDetailView(
    thread,
    "我",
    sideEffects,
    conversation.name
  );

  return {
    conversation,
    detail: {
      ...detail,
      draftReply: "",
      sourceLabels: localizeSourceLabels(listField(thread, "sourceContextLabels")),
      summary: createdSummary(stringField(thread, "summary"), conversation.name)
    }
  };
}

function trimmed(value: string): string {
  return value.trim();
}

export function buildRelationshipThreadDraftRequest(
  input: RelationshipThreadDraftInput
): RelationshipThreadDraftRequestResult {
  const participantName = trimmed(input.participantName);
  const subject = trimmed(input.subject);
  const body = trimmed(input.body);
  const organization = trimmed(input.organization);
  const contactId = input.contactId?.trim();

  if (!participantName) {
    return {
      error: "先写收件人。",
      success: false
    };
  }

  if (!subject) {
    return {
      error: "先写主题。",
      success: false
    };
  }

  if (!body) {
    return {
      error: "先写正文。",
      success: false
    };
  }

  return {
    request: {
      body: {
        body,
        ...(contactId ? { contactId } : {}),
        organization,
        participantName,
        sourceLabel: "移动端关系草稿",
        subject
      },
      endpoint: ORBIT_API_ENDPOINTS.relationshipInbox
    },
    success: true
  };
}

export function defaultRelationshipDraft(input: {
  organization?: string;
  participantName?: string;
}): { body: string; subject: string } {
  const participantName = input.participantName?.trim() || "您好";
  const organization = input.organization?.trim() || "这件事";

  return {
    body: `${participantName}，您好：\n\n我想继续跟进${organization}相关的沟通。为了避免信息遗漏，我先把背景和下一步写成草稿，确认后再发送。\n\n如果您方便，我们可以约 15 分钟把重点对齐一下。`,
    subject: `关于${organization}的跟进`
  };
}

export function formatRelationshipDateForDisplay(value: string): string {
  return formatDateWithWeekday(value);
}

function priorityLabel(value: string): string {
  const labels: Record<string, string> = {
    high: "高优先级",
    low: "低优先级",
    normal: "普通优先级"
  };

  return labels[value.trim().toLowerCase()] ?? "普通优先级";
}

function reminderTitle(reminder: UnknownRecord): string {
  const contactName = stringField(reminder, "contactName", "这位联系人");
  const title = stringField(reminder, "title");

  if (/^review follow-up for /iu.test(title)) {
    return `跟进${contactName}`;
  }

  return userFacingText(title, `跟进${contactName}`);
}

function reminderAlert(reminder: UnknownRecord): RelationshipAlertView {
  return {
    detail: stringField(reminder, "organization"),
    dueLabel: formatDateWithWeekday(stringField(reminder, "dueAt")),
    id: stringField(reminder, "reminderId", "reminder"),
    kind: "reminder",
    priorityLabel: priorityLabel(stringField(reminder, "priority")),
    title: reminderTitle(reminder)
  };
}

function proactiveClock(message: string, occursAt: string): string {
  const messageMatch = /(?:明天|今天)\s+(\d{1,2}:\d{2})/u.exec(message);
  if (messageMatch?.[1]) {
    return messageMatch[1];
  }

  const date = new Date(occursAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function proactiveTitle(signal: UnknownRecord, message: string): string {
  const title = stringField(signal, "title");
  const participantMatch = /^Breakfast with (.+) tomorrow$/iu.exec(title);
  const clock = proactiveClock(message, stringField(signal, "occursAt"));

  if (participantMatch?.[1]?.trim() && clock) {
    return `明天 ${clock} 见 ${participantMatch[1].trim()}`;
  }

  return userFacingText(title, "有一条关系提醒需要准备");
}

function proactiveAlert(data: UnknownRecord): RelationshipAlertView | null {
  const message = nestedRecord(data, "message");
  const signal = nestedRecord(data, "signal");
  const messageText = stringField(message, "content");
  const occursAt = stringField(signal, "occursAt");

  if (!messageText && !occursAt) {
    return null;
  }

  return {
    detail: messageText || userFacingText(stringField(signal, "body")),
    dueLabel: occursAt
      ? formatDateWithClock(occursAt, proactiveClock(messageText, occursAt))
      : "",
    id: stringField(message, "messageId", stringField(signal, "signalId", "proactive")),
    kind: "proactive",
    priorityLabel: "需要准备",
    title: proactiveTitle(signal, messageText)
  };
}

export function relationshipAlertsToView(
  notificationsData: unknown,
  proactiveData?: unknown
): RelationshipAlertsView {
  const notificationRecord = isRecord(notificationsData) ? notificationsData : {};
  const reminders = listField(notificationRecord, "reminders")
    .filter(isRecord)
    .map(reminderAlert);
  const proactive = isRecord(proactiveData) ? proactiveAlert(proactiveData) : null;
  const alerts = proactive ? [...reminders, proactive] : reminders;

  return {
    alerts,
    safetyText: "这些只是提醒，不会发送推送、邮件或短信。",
    summary: alerts.length ? `${alerts.length} 条提醒` : "暂无提醒"
  };
}
