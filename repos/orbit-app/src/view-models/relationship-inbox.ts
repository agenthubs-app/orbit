import {
  ORBIT_API_ENDPOINTS,
  chatPrivacyAnalysisTogglePath,
  relationshipSignalConfirmPath
} from "../api/endpoints";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";
import { inboxNotificationActions } from "./inbox-notification-actions";

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
  unreadCount: number;
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
  unreadTotal?: number;
  conversations: RelationshipConversationView[];
  selected: RelationshipThreadDetailView | null;
  summary: string;
  title: string;
}

export interface RelationshipAlertView {
  canPersistState?: boolean;
  detail: string;
  dueLabel: string;
  href?: string;
  id: string;
  kind: "proactive" | "reminder";
  priorityLabel: string;
  read?: boolean;
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

export interface RelationshipRewriteDraftView {
  body: string;
  label: string;
  rationale: string;
  safetyText: string;
  sourceLabel: string;
}

export interface RelationshipPrivacyControlsView {
  analysisDetail: string;
  analysisLabel: string;
  deletionLabel: string;
  nextEnabled: boolean;
  privateNotesLabel: string;
  safetyText: string;
  shareLabel: string;
  sourceLabel: string;
  summary: string;
  title: string;
  toggleLabel: string;
}

export interface RelationshipSignalView {
  canConfirm: boolean;
  confidenceLabel: string;
  context: string;
  evidenceExcerpt: string;
  id: string;
  metaLine: string;
  nextAction: string;
  occurredAt: string;
  permissionLabel: string;
  sourceLabel: string;
  statusLabel: string;
  title: string;
}

export interface RelationshipSignalsView {
  emptyText: string;
  nextAction: string;
  safetyText: string;
  signals: RelationshipSignalView[];
  summary: string;
  title: string;
}

export interface RelationshipSignalConfirmView {
  confirmedAt: string;
  contactLine: string;
  detail: string;
  safetyText: string;
  title: string;
}

interface RelationshipThreadDraftInput {
  body: string;
  contactId?: string;
  organization: string;
  participantName: string;
  subject: string;
}

interface RelationshipRewriteRequestInput {
  conversationId: string;
  organization: string;
  participantName: string;
  sourceText: string;
}

interface RelationshipPrivacyToggleInput {
  conversationId: string;
  enabled: boolean;
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

export type RelationshipRewriteRequestResult =
  | {
      error: string;
      success: false;
    }
  | {
      request: {
        body: {
          conversationId: string;
          organization: string;
          participantName: string;
          sourceText: string;
        };
        endpoint: string;
      };
      success: true;
    };

export type RelationshipPrivacyToggleRequestResult =
  | {
      error: string;
      success: false;
    }
  | {
      request: {
        body: {
          enabled: boolean;
        };
        endpoint: string;
      };
      success: true;
    };

export type RelationshipSignalConfirmRequestResult =
  | {
      error: string;
      success: false;
    }
  | {
      request: {
        body: {
          actorLabel: "Orbit iOS";
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
    subject: "代代木早餐会后续沟通",
    summary: "Aoba 想在和场地方沟通前，先拿到早餐会的两点复盘。"
  },
  conversation_demo_lina: {
    preview: "如果机器人投资人介绍还合适，请提醒我最相关的角度。",
    subject: "投资人介绍背景",
    summary: "Lina 需要先确认投资人介绍最相关的切入角度。"
  }
};

const SOURCE_LABELS: Record<string, string> = {
  "Aoba follow-up task": "Aoba 待办事项",
  "Calendar hold from Orbit schedule context": "日程预留",
  "Event attendance record": "活动记录",
  "Generated relationship conversation": "关系上下文",
  "Mock asynchronous relationship correspondence": "草稿预览",
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

export function relationshipInboxErrorText(
  value: unknown,
  fallback: string,
  language: OrbitLanguage = "zh"
): string {
  const rawText =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : "";

  if (language !== "zh" && rawText.trim() && !containsImplementationLabel(rawText)) {
    return rawText.trim();
  }

  return userFacingText(rawText, fallback) || fallback;
}

function formatDateTime(value: string, language: OrbitLanguage = "zh"): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (language === "zh") {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date
      .getHours()
      .toString()
      .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }

  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: language === "ja" ? "numeric" : "short",
  }).format(date);
}

function formatDateWithWeekday(value: string, language: OrbitLanguage = "zh"): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (language === "zh") {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${
      WEEKDAYS[date.getDay()]
    } ${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }

  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: language === "ja" ? "numeric" : "short",
    weekday: "short",
  }).format(date);
}

function formatDateWithClock(
  value: string,
  clock: string,
  language: OrbitLanguage = "zh"
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return clock ? `${value} ${clock}` : value;
  }

  if (language === "zh") {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${
      WEEKDAYS[date.getDay()]
    } ${clock}`;
  }

  const dateLabel = new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    day: "numeric",
    month: language === "ja" ? "numeric" : "short",
    weekday: "short",
  }).format(date);
  return `${dateLabel} ${clock}`;
}

function localizeSourceLabel(value: string, fallback = ""): string {
  return SOURCE_LABELS[value] ?? userFacingText(value, fallback);
}

function sourceLabelForLanguage(
  value: string,
  fallback: string,
  language: OrbitLanguage
): string {
  if (language === "zh") {
    return localizeSourceLabel(value, fallback);
  }

  const trimmedValue = value.trim();
  return trimmedValue && !containsImplementationLabel(trimmedValue)
    ? trimmedValue
    : fallback;
}

function generatedTextForLanguage(
  value: string,
  fallback: string,
  language: OrbitLanguage
): string {
  if (language !== "zh" && value.trim() && !containsImplementationLabel(value)) {
    return value.trim();
  }

  return userFacingText(value, fallback);
}

function localizeSourceLabels(
  values: unknown[],
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => sourceLabelForLanguage(
          value,
          t("inboxVm.sourceRecorded"),
          language
        ))
        .filter(Boolean)
    )
  ];
}

function localizeSubject(
  conversationId: string,
  value: string,
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): string {
  return (
    (language === "zh" ? KNOWN_THREAD_COPY[conversationId]?.subject : undefined) ??
    (/^与.+的关系跟进$/u.test(value.trim())
      ? t("inboxVm.followupSubject")
      : mailContent(value, t("inboxVm.followupSubject")))
  );
}

// Correspondence is content, not UI copy. Keep real multilingual text intact;
// only known synthetic instructions may become an explicit empty-content label.
function mailContent(value: string, fallback: string): string {
  const text = value.trim();
  if (!text || /^(?:Generated relationship conversation|Review relationship context(?: before external follow-up)?|Follow up about .+ with a concrete next step\.|Review source evidence before recording another live-storage message\.|先复核上下文，再决定下一步[。.]?|复核关系上下文后再决定是否外发[。.]?)$/iu.test(text)) {
    return fallback;
  }
  return text;
}

function localizePreview(
  conversationId: string,
  value: string,
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): string {
  return (
    (language === "zh" ? KNOWN_THREAD_COPY[conversationId]?.preview : undefined) ??
    mailContent(value, t("inbox.noMessageBody"))
  );
}

function localizeSummary(
  conversationId: string,
  value: string,
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): string {
  const fallback = t("inboxVm.prepareContext");

  return (
    (language === "zh" ? KNOWN_THREAD_COPY[conversationId]?.summary : undefined) ??
    (/\b(?:community_events|matches)\b/iu.test(value)
      ? fallback
      : generatedTextForLanguage(value, fallback, language))
  );
}

function localizeDraftReply(
  conversationId: string,
  value: string,
  language: OrbitLanguage = "zh"
): string {
  return (
    (language === "zh" ? KNOWN_THREAD_COPY[conversationId]?.draftReply : undefined) ??
    mailContent(value, "")
  );
}

function localizeMessageBody(
  conversationId: string,
  messageId: string,
  value: string,
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): string {
  return (
    (language === "zh" ? KNOWN_THREAD_COPY[conversationId]?.messages?.[messageId] : undefined) ??
    mailContent(value, t("inbox.noMessageBody"))
  );
}

function nextActionLabel(
  value: string,
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): string {
  return (
    (language === "zh" ? NEXT_ACTIONS[value] : undefined) ??
    generatedTextForLanguage(value, t("inboxVm.prepareReply"), language)
  );
}

function unwrappedPayload(data: unknown): UnknownRecord {
  if (!isRecord(data)) {
    return {};
  }

  if (data.success === true && isRecord(data.data)) {
    return data.data;
  }

  return data;
}

function currentUserName(value: string, t: OrbitTranslator): string {
  if (/^(alex tan|orbit operator|profile_orbit_generated_operator)$/iu.test(value.trim())) {
    return t("inboxVm.me");
  }

  return value.trim() || t("inboxVm.me");
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

function safetyText(sideEffects: UnknownRecord, t: OrbitTranslator): string {
  if (allSideEffectsFalse(sideEffects)) {
    return t("inboxVm.draftSafety");
  }

  return t("inboxVm.draftReview");
}

function conversationView(
  item: UnknownRecord,
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): RelationshipConversationView {
  const id = stringField(item, "conversationId", "conversation");
  const unreadCount = Math.max(0, numberField(item, "unreadCount"));

  return {
    contactId: stringField(item, "contactId", "contact"),
    id,
    lastAt: formatDateTime(stringField(item, "lastCorrespondenceAt"), language),
    name: stringField(item, "participantName", t("inboxVm.contactFallback")),
    nextAction: nextActionLabel(stringField(item, "nextActionLabel"), language, t),
    organization: stringField(item, "organization"),
    preview: localizePreview(id, stringField(item, "preview"), language, t),
    sourceLabels: localizeSourceLabels(listField(item, "sourceContextLabels"), language, t),
    subject: localizeSubject(id, stringField(item, "subject"), language, t),
    unreadCount,
    unreadLabel: unreadCount > 0 ? t("inboxVm.newMessages", { count: unreadCount }) : ""
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

export function relationshipInboxSelectedContactId(data: unknown): string {
  if (!isRecord(data)) return "";
  const selectedThread = selectedThreadFromPayload(data);
  if (!selectedThread) return "";
  const directContactId = stringField(selectedThread, "contactId");
  if (directContactId) return directContactId;
  const selectedId = stringField(selectedThread, "conversationId");
  if (!selectedId) return "";
  const inbox = nestedRecord(data, "inbox");
  const selectedConversation = listField(inbox, "conversations")
    .filter(isRecord)
    .find((conversation) => stringField(conversation, "conversationId") === selectedId);
  return selectedConversation ? stringField(selectedConversation, "contactId") : "";
}

function deduplicateMessages(
  messages: UnknownRecord[]
): UnknownRecord[] {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const signature = [
      stringField(message, "senderRole"),
      stringField(message, "senderName"),
      stringField(message, "body"),
      stringField(message, "occurredAt")
    ].join("\u001f");

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

function threadDetailView(
  thread: UnknownRecord,
  currentUser: string,
  sideEffects: UnknownRecord,
  fallbackParticipantName = "",
  language: OrbitLanguage = "zh",
  t = createTranslator(language)
): RelationshipThreadDetailView {
  const conversationId = stringField(thread, "conversationId", "conversation");
  const messages = deduplicateMessages(
    listField(thread, "messages").filter(isRecord)
  );
  const localizedMessages = messages.map((message) => {
    const fromMe = stringField(message, "senderRole") === "orbit_user";
    const messageId = stringField(message, "messageId", "message");

    return {
      body: localizeMessageBody(
        conversationId,
        messageId,
        stringField(message, "body"),
        language,
        t
      ),
      fromMe,
      id: messageId,
      sender: fromMe
        ? t("inboxVm.me")
        : stringField(message, "senderName", fallbackParticipantName || t("inboxVm.contactFallback")),
      time: formatDateTime(stringField(message, "occurredAt"), language)
    };
  });

  return {
    conversationId,
    currentUserName: currentUserName(currentUser, t),
    draftReply: "",
    messages: localizedMessages,
    participantName: fallbackParticipantName || t("inboxVm.contactFallback"),
    safetyText: safetyText(sideEffects, t),
    sourceLabels: localizeSourceLabels(listField(thread, "sourceContextLabels"), language, t),
    subject: localizeSubject(conversationId, stringField(thread, "subject"), language, t),
    summary: localizeSummary(conversationId, stringField(thread, "summary"), language, t)
  };
}

export function relationshipInboxToView(
  data: unknown,
  language: OrbitLanguage = "zh"
): RelationshipInboxView {
  const t = createTranslator(language);
  if (!isRecord(data)) {
    return {
      conversations: [],
      selected: null,
      summary: t("inboxVm.noConversations"),
      title: t("inbox.title")
    };
  }

  const inbox = nestedRecord(data, "inbox");
  const currentUser = nestedRecord(data, "currentUser");
  const sideEffects = nestedRecord(data, "sideEffects");
  const conversations = listField(inbox, "conversations")
    .filter(isRecord)
    .map(item => conversationView(item, language, t));
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
          stringField(currentUser, "displayName", t("inboxVm.me")),
          sideEffects,
          selectedItem?.name,
          language,
          t
        ),
        draftReply: localizeDraftReply(
          selectedId,
          stringField(draftReply, "body"),
          language
        )
      }
    : null;

  return {
    conversations,
    selected,
    summary: conversations.length
      ? t("inboxVm.conversationsSummary", {
          count: conversations.length,
          unread: unreadTotal
        })
      : t("inboxVm.noConversations"),
    title: t("inbox.title")
  };
}

function createdSummary(
  value: string,
  participantName: string,
  language: OrbitLanguage,
  t: OrbitTranslator
): string {
  const fallback = t("inboxVm.createdSummary", { name: participantName });

  if (/new relationship thread staged from a reviewed draft/i.test(value)) {
    return fallback;
  }

  if (language !== "zh" && value.trim() && !containsImplementationLabel(value)) {
    return value.trim();
  }

  return userFacingText(value, fallback);
}

export function createdRelationshipThreadToView(
  data: unknown,
  language: OrbitLanguage = "zh"
): RelationshipCreatedThreadView {
  const t = createTranslator(language);
  const record = isRecord(data) ? data : {};
  const inboxItem = nestedRecord(record, "inboxItem");
  const thread = nestedRecord(record, "thread");
  const sideEffects = nestedRecord(record, "sideEffects");
  const conversation = conversationView(inboxItem, language, t);
  const detail = threadDetailView(
    thread,
    t("inboxVm.me"),
    sideEffects,
    conversation.name,
    language,
    t
  );

  return {
    conversation,
    detail: {
      ...detail,
      draftReply: "",
      sourceLabels: localizeSourceLabels(
        listField(thread, "sourceContextLabels"),
        language,
        t
      ),
      summary: createdSummary(
        stringField(thread, "summary"),
        conversation.name,
        language,
        t
      )
    }
  };
}

function trimmed(value: string): string {
  return value.trim();
}

export function buildRelationshipThreadDraftRequest(
  input: RelationshipThreadDraftInput,
  language: OrbitLanguage = "zh"
): RelationshipThreadDraftRequestResult {
  const t = createTranslator(language);
  const participantName = trimmed(input.participantName);
  const subject = trimmed(input.subject);
  const body = trimmed(input.body);
  const organization = trimmed(input.organization);
  const contactId = input.contactId?.trim();

  if (!participantName) {
    return {
      error: t("inboxVm.recipientRequired"),
      success: false
    };
  }

  if (!subject) {
    return {
      error: t("inboxVm.subjectRequired"),
      success: false
    };
  }

  if (!body) {
    return {
      error: t("inboxVm.bodyRequired"),
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

export function buildRelationshipRewriteRequest(
  input: RelationshipRewriteRequestInput,
  language: OrbitLanguage = "zh"
): RelationshipRewriteRequestResult {
  const t = createTranslator(language);
  const conversationId = trimmed(input.conversationId);
  const organization = trimmed(input.organization);
  const participantName = trimmed(input.participantName);
  const sourceText = trimmed(input.sourceText);

  if (!sourceText) {
    return {
      error: t("inboxVm.draftRequired"),
      success: false
    };
  }

  return {
    request: {
      body: {
        conversationId,
        organization,
        participantName,
        sourceText
      },
      endpoint: ORBIT_API_ENDPOINTS.chatAssistRewrite
    },
    success: true
  };
}

export function relationshipRewriteToDraft(
  payload: unknown
): RelationshipRewriteDraftView | null {
  const record = isRecord(payload) ? payload : {};
  const assist = listField(record, "assists").filter(isRecord)[0];

  if (!assist) {
    return null;
  }

  const body = stringField(assist, "suggestedText").trim();

  if (!body) {
    return null;
  }

  return {
    body,
    label: userFacingText(stringField(assist, "label"), "润色建议"),
    rationale: userFacingText(
      stringField(assist, "rationale"),
      "请检查语气和事实，再决定是否暂存。"
    ),
    safetyText: "这里只润色草稿，不会发送消息。",
    sourceLabel: localizeSourceLabel(
      stringField(nestedRecord(assist, "source"), "label"),
      "来源已记录"
    )
  };
}

function privacyDeletionLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, ReturnType<OrbitTranslator>> = {
    available: t("inboxVm.deletionAvailable"),
    deleted_mock_only: t("inboxVm.deletionRequested"),
    pending: t("inboxVm.deletionPending")
  };

  return labels[value.trim().toLowerCase()] ?? t("inboxVm.deletionAvailable");
}

function privacyShareLabel(record: UnknownRecord, t: OrbitTranslator): string {
  const confirmationRequired = record.confirmationRequired === true;

  if (confirmationRequired) {
    return t("inboxVm.shareRequired");
  }

  return t("inboxVm.shareConfirmed");
}

export function relationshipPrivacyControlsToView(
  payload: unknown,
  language: OrbitLanguage = "zh"
): RelationshipPrivacyControlsView {
  const t = createTranslator(language);
  const record = isRecord(payload) ? payload : {};
  const analysis = nestedRecord(record, "analysisOptIn");
  const deletion = nestedRecord(record, "analysisDeletion");
  const share = nestedRecord(record, "sensitiveShareConfirmation");
  const provenance = nestedRecord(record, "provenance");
  const privateNoteCount = listField(record, "privateNotes").filter(isRecord)
    .length;
  const analysisEnabled = analysis.enabled === true;
  const analysisLabel = analysisEnabled
    ? t("inboxVm.analysisAllowed")
    : t("inboxVm.analysisStopped");
  const privateNotesLabel = privateNoteCount === 1
    ? t("inboxVm.privateNoteOne")
    : privateNoteCount
      ? t("inboxVm.privateNotesCount", { count: privateNoteCount })
      : t("inboxVm.privateNotesNone");

  return {
    analysisDetail: analysisEnabled
      ? t("inboxVm.analysisDetailOn")
      : t("inboxVm.analysisDetailOff"),
    analysisLabel,
    deletionLabel: privacyDeletionLabel(stringField(deletion, "status"), t),
    nextEnabled: !analysisEnabled,
    privateNotesLabel,
    safetyText: t("inboxVm.privacySafety"),
    shareLabel: privacyShareLabel(share, t),
    sourceLabel: sourceLabelForLanguage(
      stringField(provenance, "sourceLabel"),
      t("inboxVm.sourceRecorded"),
      language
    ),
    summary: `${analysisLabel} · ${privateNotesLabel}`,
    title: t("inboxVm.privacyTitle"),
    toggleLabel: analysisEnabled
      ? t("inboxVm.stopAnalysis")
      : t("inboxVm.allowAnalysis")
  };
}

export function buildRelationshipPrivacyToggleRequest(
  input: RelationshipPrivacyToggleInput,
  language: OrbitLanguage = "zh"
): RelationshipPrivacyToggleRequestResult {
  const t = createTranslator(language);
  const conversationId = trimmed(input.conversationId);

  if (!conversationId) {
    return {
      error: t("inboxVm.conversationRequired"),
      success: false
    };
  }

  return {
    request: {
      body: {
        enabled: input.enabled
      },
      endpoint: chatPrivacyAnalysisTogglePath(conversationId)
    },
    success: true
  };
}

function relationshipSignalSourceLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    gmail: t("inboxVm.signalSourceEmail"),
    google_calendar: t("inboxVm.signalSourceCalendar"),
    microsoft_graph: t("inboxVm.signalSourceBoth")
  };

  return labels[value.trim().toLowerCase()] ?? t("inboxVm.signalFallback");
}

function relationshipSignalKindLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    calendar_meeting: t("inboxVm.signalKindMeeting"),
    email_calendar_overlap: t("inboxVm.signalKindOverlap"),
    email_intro: t("inboxVm.signalKindIntro")
  };

  return labels[value.trim().toLowerCase()] ?? t("inboxVm.signalFallback");
}

function relationshipSignalConfidenceLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    high: t("inboxVm.confidenceHigh"),
    low: t("inboxVm.confidenceLow"),
    medium: t("inboxVm.confidenceMedium")
  };

  return labels[value.trim().toLowerCase()] ?? t("inboxVm.signalPending");
}

function relationshipSignalStatusLabel(
  confirmation: UnknownRecord,
  t: OrbitTranslator
): string {
  return stringField(confirmation, "state") === "confirmed"
    ? t("inboxVm.signalConfirmed")
    : t("inboxVm.signalPending");
}

function relationshipSignalCanConfirm(confirmation: UnknownRecord): boolean {
  return stringField(confirmation, "state") !== "confirmed";
}

function relationshipSignalPermissionLabel(
  permission: UnknownRecord,
  t: OrbitTranslator
): string {
  const state = stringField(permission, "state");

  if (state.includes("pending")) {
    return t("inboxVm.permissionPending");
  }

  if (state.includes("missing")) {
    return t("inboxVm.permissionMissing");
  }

  return t("inboxVm.permissionReviewable");
}

function relationshipSignalContextText(
  value: string,
  sourceKind: string,
  language: OrbitLanguage,
  t: OrbitTranslator
): string {
  if (/intro email metadata|warm climate-infrastructure founder/iu.test(value)) {
    return t("inboxVm.contextIntro");
  }

  if (/calendar fixture shows|shared LP breakfast/iu.test(value)) {
    return t("inboxVm.contextCalendar");
  }

  if (/metadata fixture links|partner follow-up thread|calendar overlap/iu.test(value)) {
    return t("inboxVm.contextOverlap");
  }

  return generatedTextForLanguage(
    value,
    sourceKind === "google_calendar"
      ? t("inboxVm.contextCalendar")
      : t("inboxVm.contextReview"),
    language
  );
}

function relationshipSignalNextActionText(
  value: string,
  language: OrbitLanguage,
  t: OrbitTranslator
): string {
  if (/context from the introducer/iu.test(value)) {
    return t("inboxVm.nextIntro");
  }

  if (/calendar signal|post-breakfast note/iu.test(value)) {
    return t("inboxVm.nextCalendar");
  }

  if (/metadata-only signal|partnership follow-ups/iu.test(value)) {
    return t("inboxVm.nextPartnership");
  }

  return generatedTextForLanguage(value, t("inboxVm.nextReview"), language);
}

function relationshipSignalEvidenceText(
  value: string,
  language: OrbitLanguage,
  t: OrbitTranslator
): string {
  if (/header and subject fixture|intro for Aiko/iu.test(value)) {
    return t("inboxVm.evidenceEmail");
  }

  if (/calendar title fixture|Climate LP breakfast/iu.test(value)) {
    return t("inboxVm.evidenceCalendar");
  }

  if (/subject and calendar overlap fixture|metadata/iu.test(value)) {
    return t("inboxVm.evidenceOverlap");
  }

  return generatedTextForLanguage(value, t("inboxVm.evidenceReview"), language);
}

function relationshipSignalView(
  signal: UnknownRecord,
  language: OrbitLanguage,
  t: OrbitTranslator
): RelationshipSignalView {
  const confirmation = nestedRecord(signal, "confirmation");
  const permission = nestedRecord(signal, "permission");
  const evidence = listField(signal, "evidence").filter(isRecord)[0];
  const sourceKind = stringField(signal, "sourceKind");

  return {
    canConfirm: relationshipSignalCanConfirm(confirmation),
    confidenceLabel: relationshipSignalConfidenceLabel(
      stringField(signal, "confidence"),
      t
    ),
    context: relationshipSignalContextText(
      stringField(signal, "relationshipContext"),
      sourceKind,
      language,
      t
    ),
    evidenceExcerpt: relationshipSignalEvidenceText(
      evidence ? stringField(evidence, "excerpt") : "",
      language,
      t
    ),
    id: stringField(signal, "id", "relationship-signal"),
    metaLine: [
      stringField(signal, "organization"),
      stringField(signal, "role"),
      relationshipSignalKindLabel(stringField(signal, "signalKind"), t)
    ]
      .filter(Boolean)
      .join(" · "),
    nextAction: relationshipSignalNextActionText(
      stringField(signal, "suggestedNextAction")
      , language, t
    ),
    occurredAt: formatDateTime(stringField(signal, "occurredAt"), language),
    permissionLabel: relationshipSignalPermissionLabel(permission, t),
    sourceLabel: relationshipSignalSourceLabel(sourceKind, t),
    statusLabel: relationshipSignalStatusLabel(confirmation, t),
    title: stringField(signal, "displayName", t("inboxVm.signalFallback"))
  };
}

export function relationshipSignalsToView(
  payload: unknown,
  language: OrbitLanguage = "zh"
): RelationshipSignalsView {
  const t = createTranslator(language);
  const record = unwrappedPayload(payload);
  const signals = listField(record, "signals")
    .filter(isRecord)
    .map(signal => relationshipSignalView(signal, language, t));

  return {
    emptyText: signals.length ? "" : t("inboxVm.signalsEmpty"),
    nextAction: signals.length
      ? t("inboxVm.signalsReview")
      : t("inboxVm.signalsWait"),
    safetyText: t("inboxVm.signalsSafety"),
    signals,
    summary: signals.length
      ? t("inboxVm.signalsSummary", { count: signals.length })
      : t("inbox.noSignals"),
    title: t("inbox.signalsTitle")
  };
}

export function buildRelationshipSignalConfirmRequest(
  id: string,
  language: OrbitLanguage = "zh"
): RelationshipSignalConfirmRequestResult {
  const t = createTranslator(language);
  const signalId = trimmed(id);

  if (!signalId) {
    return {
      error: t("inboxVm.signalRequired"),
      success: false
    };
  }

  return {
    request: {
      body: {
        actorLabel: "Orbit iOS"
      },
      endpoint: relationshipSignalConfirmPath(signalId)
    },
    success: true
  };
}

export function relationshipSignalConfirmToView(
  payload: unknown,
  language: OrbitLanguage = "zh"
): RelationshipSignalConfirmView {
  const t = createTranslator(language);
  const record = unwrappedPayload(payload);
  const signal = nestedRecord(record, "confirmedSignal");

  return {
    confirmedAt: formatDateTime(stringField(record, "confirmedAt"), language),
    contactLine: [
      stringField(signal, "displayName", t("inboxVm.signalFallback")),
      stringField(signal, "organization"),
      stringField(signal, "role")
    ]
      .filter(Boolean)
      .join(" · "),
    detail: t("inboxVm.signalConfirmedDetail"),
    safetyText:
      record.externalActionExecuted === false &&
      record.relationshipWriteExecuted === false
        ? t("inboxVm.signalConfirmedSafe")
        : t("inboxVm.signalConfirmedReview"),
    title: t("inboxVm.signalConfirmedTitle")
  };
}

export function defaultRelationshipDraft(input: {
  organization?: string;
  participantName?: string;
}): { body: string; subject: string } {
  const participantName = input.participantName?.trim() || "";
  const greeting = participantName ? `${participantName}，您好：` : "您好：";
  const organization = input.organization?.trim() || "这件事";

  return {
    body: `${greeting}\n\n我想继续聊聊${organization}相关的事情。为了避免信息遗漏，我先把背景和下一步写成草稿，确认后再发送。\n\n如果您方便，我们可以约 15 分钟把重点对齐一下。`,
    subject: `关于${organization}的后续沟通`
  };
}

export function formatRelationshipDateForDisplay(value: string): string {
  return formatDateWithWeekday(value);
}

function priorityLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    high: t("inboxVm.priorityHigh"),
    low: t("inboxVm.priorityLow"),
    normal: t("inboxVm.priorityNormal")
  };

  return labels[value.trim().toLowerCase()] ?? t("inboxVm.priorityNormal");
}

function reminderTitle(
  reminder: UnknownRecord,
  language: OrbitLanguage,
  t: OrbitTranslator
): string {
  const contactName = stringField(
    reminder,
    "contactName",
    t("inboxVm.contactFallback")
  );
  const title = stringField(reminder, "title");
  const fallback = t("inboxVm.contactTitle", { name: contactName });

  if (/^review follow-up for /iu.test(title)) {
    return fallback;
  }

  return generatedTextForLanguage(title, fallback, language);
}

function reminderAlert(
  reminder: UnknownRecord,
  language: OrbitLanguage,
  t: OrbitTranslator
): RelationshipAlertView {
  return {
    detail: stringField(reminder, "organization"),
    dueLabel: formatDateWithWeekday(stringField(reminder, "dueAt"), language),
    id: stringField(reminder, "reminderId", "reminder"),
    kind: "reminder",
    priorityLabel: priorityLabel(stringField(reminder, "priority"), t),
    title: reminderTitle(reminder, language, t)
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

function proactiveTitle(
  signal: UnknownRecord,
  message: string,
  language: OrbitLanguage,
  t: OrbitTranslator
): string {
  const title = stringField(signal, "title");
  const participantMatch = /^Breakfast with (.+) tomorrow$/iu.exec(title);
  const clock = proactiveClock(message, stringField(signal, "occursAt"));

  if (participantMatch?.[1]?.trim() && clock) {
    return t("inboxVm.tomorrowContact", {
      clock,
      name: participantMatch[1].trim()
    });
  }

  return generatedTextForLanguage(title, t("inboxVm.proactiveTitle"), language);
}

function proactiveAlert(
  data: UnknownRecord,
  language: OrbitLanguage,
  t: OrbitTranslator
): RelationshipAlertView | null {
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
      ? formatDateWithClock(
          occursAt,
          proactiveClock(messageText, occursAt),
          language
        )
      : "",
    id: stringField(message, "messageId", stringField(signal, "signalId", "proactive")),
    kind: "proactive",
    priorityLabel: t("inboxVm.prepare"),
    title: proactiveTitle(signal, messageText, language, t)
  };
}

export function relationshipAlertsToView(
  notificationsData: unknown,
  proactiveData?: unknown,
  language: OrbitLanguage = "zh"
): RelationshipAlertsView {
  const t = createTranslator(language);
  const notificationRecord = isRecord(notificationsData) ? notificationsData : {};
  const actions = inboxNotificationActions(notificationsData);
  const reminders = listField(notificationRecord, "reminders")
    .filter(isRecord)
    .flatMap(reminder => {
      const alert = reminderAlert(reminder, language, t);
      const action = actions.get(alert.id);
      return action?.ignored ? [] : [{
        ...alert,
        ...(action?.unavailable ? { title: t("typedInbox.unavailable"), detail: "" } : {}),
        ...(action?.href ? { href: action.href } : {}),
        ...(action?.canPersist ? { canPersistState: true, read: action.read } : {}),
      }];
    });
  const proactive = isRecord(proactiveData)
    ? proactiveAlert(proactiveData, language, t)
    : null;
  const alerts = proactive ? [...reminders, proactive] : reminders;

  return {
    alerts,
    safetyText: t("inboxVm.alertsSafety"),
    summary: alerts.length === 1
      ? t("inboxVm.alertsOne")
      : alerts.length
        ? t("inbox.alertsCount", { count: alerts.length })
        : t("inbox.noAlerts")
  };
}

export function relationshipInboxBadgeCount(
  inbox: RelationshipInboxView,
  alerts: RelationshipAlertsView
): number {
  const unreadThreads = inbox.conversations.reduce(
    (total, conversation) => total + Math.max(0, conversation.unreadCount),
    0
  );

  return (inbox.unreadTotal ?? unreadThreads) + alerts.alerts.filter(alert => !alert.read).length;
}

export function relationshipConversationIdForContact(
  inbox: RelationshipInboxView,
  contactId: string
): string | null {
  const targetContactId = contactId.trim();

  if (!targetContactId) {
    return null;
  }

  return (
    inbox.conversations.find(
      (conversation) => conversation.contactId === targetContactId
    )?.id ?? null
  );
}
