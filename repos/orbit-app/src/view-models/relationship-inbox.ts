import {
  ORBIT_API_ENDPOINTS,
  chatPrivacyAnalysisTogglePath,
  relationshipSignalConfirmPath
} from "../api/endpoints";

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

export function relationshipInboxErrorText(
  value: unknown,
  fallback: string
): string {
  const rawText =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : "";

  return userFacingText(rawText, fallback) || fallback;
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

function localizeSourceLabel(value: string, fallback = ""): string {
  return SOURCE_LABELS[value] ?? userFacingText(value, fallback);
}

function localizeSourceLabels(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => localizeSourceLabel(value))
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

function unwrappedPayload(data: unknown): UnknownRecord {
  if (!isRecord(data)) {
    return {};
  }

  if (data.success === true && isRecord(data.data)) {
    return data.data;
  }

  return data;
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
    unreadCount,
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

export function buildRelationshipRewriteRequest(
  input: RelationshipRewriteRequestInput
): RelationshipRewriteRequestResult {
  const conversationId = trimmed(input.conversationId);
  const organization = trimmed(input.organization);
  const participantName = trimmed(input.participantName);
  const sourceText = trimmed(input.sourceText);

  if (!sourceText) {
    return {
      error: "先写草稿，再润色。",
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

function privacyDeletionLabel(value: string): string {
  const labels: Record<string, string> = {
    available: "可请求删除分析记录",
    deleted_mock_only: "已请求删除分析记录",
    pending: "删除请求待确认"
  };

  return labels[value.trim().toLowerCase()] ?? "可请求删除分析记录";
}

function privacyShareLabel(record: UnknownRecord): string {
  const confirmationRequired = record.confirmationRequired === true;

  if (confirmationRequired) {
    return "共享前需要确认";
  }

  return "共享预览已确认";
}

export function relationshipPrivacyControlsToView(
  payload: unknown
): RelationshipPrivacyControlsView {
  const record = isRecord(payload) ? payload : {};
  const analysis = nestedRecord(record, "analysisOptIn");
  const deletion = nestedRecord(record, "analysisDeletion");
  const share = nestedRecord(record, "sensitiveShareConfirmation");
  const provenance = nestedRecord(record, "provenance");
  const privateNoteCount = listField(record, "privateNotes").filter(isRecord)
    .length;
  const analysisEnabled = analysis.enabled === true;
  const analysisLabel = analysisEnabled ? "允许关系分析" : "已停止关系分析";
  const privateNotesLabel = privateNoteCount
    ? `${privateNoteCount} 条私密备注已隐藏`
    : "没有私密备注";

  return {
    analysisDetail: analysisEnabled
      ? "Orbit 可以用这段关系上下文生成提醒和草稿。"
      : "Orbit 不会用这段对话做后续分析。",
    analysisLabel,
    deletionLabel: privacyDeletionLabel(stringField(deletion, "status")),
    nextEnabled: !analysisEnabled,
    privateNotesLabel,
    safetyText: "私密备注默认隐藏，不会进入分享预览。",
    shareLabel: privacyShareLabel(share),
    sourceLabel: localizeSourceLabel(
      stringField(provenance, "sourceLabel"),
      "来源已记录"
    ),
    summary: `${analysisLabel} · ${privateNotesLabel}`,
    title: "隐私控制",
    toggleLabel: analysisEnabled ? "停止分析" : "允许分析"
  };
}

export function buildRelationshipPrivacyToggleRequest(
  input: RelationshipPrivacyToggleInput
): RelationshipPrivacyToggleRequestResult {
  const conversationId = trimmed(input.conversationId);

  if (!conversationId) {
    return {
      error: "先选择一段对话。",
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

function relationshipSignalSourceLabel(value: string): string {
  const labels: Record<string, string> = {
    gmail: "邮件线索",
    google_calendar: "日程线索",
    microsoft_graph: "邮件/日程线索"
  };

  return labels[value.trim().toLowerCase()] ?? "关系线索";
}

function relationshipSignalKindLabel(value: string): string {
  const labels: Record<string, string> = {
    calendar_meeting: "日程会面",
    email_calendar_overlap: "邮件/日程重叠",
    email_intro: "邮件引荐"
  };

  return labels[value.trim().toLowerCase()] ?? "关系线索";
}

function relationshipSignalConfidenceLabel(value: string): string {
  const labels: Record<string, string> = {
    high: "高可信",
    low: "低可信",
    medium: "中可信"
  };

  return labels[value.trim().toLowerCase()] ?? "待确认";
}

function relationshipSignalStatusLabel(confirmation: UnknownRecord): string {
  return stringField(confirmation, "state") === "confirmed" ? "已确认" : "待确认";
}

function relationshipSignalCanConfirm(confirmation: UnknownRecord): boolean {
  return stringField(confirmation, "state") !== "confirmed";
}

function relationshipSignalPermissionLabel(permission: UnknownRecord): string {
  const state = stringField(permission, "state");

  if (state.includes("pending")) {
    return "待授权";
  }

  if (state.includes("missing")) {
    return "缺少授权";
  }

  return "可复核";
}

function relationshipSignalContextText(value: string, sourceKind: string): string {
  if (/intro email metadata|warm climate-infrastructure founder/iu.test(value)) {
    return "邮件线索里出现了一条熟人引荐。";
  }

  if (/calendar fixture shows|shared LP breakfast/iu.test(value)) {
    return "日程线索里出现了一次值得复核的会面。";
  }

  if (/metadata fixture links|partner follow-up thread|calendar overlap/iu.test(value)) {
    return "邮件和日程里出现了同一个合作跟进对象。";
  }

  return userFacingText(
    value,
    sourceKind === "google_calendar"
      ? "日程线索里出现了一次值得复核的会面。"
      : "这条关系线索需要先复核来源。"
  );
}

function relationshipSignalNextActionText(value: string): string {
  if (/context from the introducer/iu.test(value)) {
    return "先向介绍人确认背景，再决定要不要跟进。";
  }

  if (/calendar signal|post-breakfast note/iu.test(value)) {
    return "先确认这次会面，再写一版简短跟进。";
  }

  if (/metadata-only signal|partnership follow-ups/iu.test(value)) {
    return "先确认来源，再决定是否加入合作跟进。";
  }

  return userFacingText(value, "先确认来源，再决定下一步。");
}

function relationshipSignalEvidenceText(value: string): string {
  if (/header and subject fixture|intro for Aiko/iu.test(value)) {
    return "邮件标题和参与人信息支持这条线索。";
  }

  if (/calendar title fixture|Climate LP breakfast/iu.test(value)) {
    return "日程标题和参与人信息支持这条线索。";
  }

  if (/subject and calendar overlap fixture|metadata/iu.test(value)) {
    return "邮件和日程的重叠信息支持这条线索。";
  }

  return userFacingText(value, "这条线索有来源记录，确认前先复核。");
}

function relationshipSignalView(signal: UnknownRecord): RelationshipSignalView {
  const confirmation = nestedRecord(signal, "confirmation");
  const permission = nestedRecord(signal, "permission");
  const evidence = listField(signal, "evidence").filter(isRecord)[0];
  const sourceKind = stringField(signal, "sourceKind");

  return {
    canConfirm: relationshipSignalCanConfirm(confirmation),
    confidenceLabel: relationshipSignalConfidenceLabel(
      stringField(signal, "confidence")
    ),
    context: relationshipSignalContextText(
      stringField(signal, "relationshipContext"),
      sourceKind
    ),
    evidenceExcerpt: relationshipSignalEvidenceText(
      evidence ? stringField(evidence, "excerpt") : ""
    ),
    id: stringField(signal, "id", "relationship-signal"),
    metaLine: [
      stringField(signal, "organization"),
      stringField(signal, "role"),
      relationshipSignalKindLabel(stringField(signal, "signalKind"))
    ]
      .filter(Boolean)
      .join(" · "),
    nextAction: relationshipSignalNextActionText(
      stringField(signal, "suggestedNextAction")
    ),
    occurredAt: formatDateTime(stringField(signal, "occurredAt")),
    permissionLabel: relationshipSignalPermissionLabel(permission),
    sourceLabel: relationshipSignalSourceLabel(sourceKind),
    statusLabel: relationshipSignalStatusLabel(confirmation),
    title: stringField(signal, "displayName", "关系线索")
  };
}

export function relationshipSignalsToView(
  payload: unknown
): RelationshipSignalsView {
  const record = unwrappedPayload(payload);
  const signals = listField(record, "signals")
    .filter(isRecord)
    .map(relationshipSignalView);

  return {
    emptyText: signals.length ? "" : "暂无需要确认的邮件或日程线索。",
    nextAction: signals.length
      ? "逐条确认。确认前不会写联系人，也不会发消息。"
      : "有新线索时会先放到这里复核。",
    safetyText: "这里只确认线索。不会读取正文、发送消息或写联系人。",
    signals,
    summary: signals.length
      ? `${signals.length} 条邮件/日程线索，确认前不会写联系人。`
      : "暂无邮件/日程线索",
    title: "关系线索"
  };
}

export function buildRelationshipSignalConfirmRequest(
  id: string
): RelationshipSignalConfirmRequestResult {
  const signalId = trimmed(id);

  if (!signalId) {
    return {
      error: "先选择一条线索。",
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
  payload: unknown
): RelationshipSignalConfirmView {
  const record = unwrappedPayload(payload);
  const signal = nestedRecord(record, "confirmedSignal");

  return {
    confirmedAt: formatDateTime(stringField(record, "confirmedAt")),
    contactLine: [
      stringField(signal, "displayName", "这条线索"),
      stringField(signal, "organization"),
      stringField(signal, "role")
    ]
      .filter(Boolean)
      .join(" · "),
    detail: "已作为后续跟进证据保留。",
    safetyText:
      record.externalActionExecuted === false &&
      record.relationshipWriteExecuted === false
        ? "没有发送消息，也没有写联系人。"
        : "请复核这次确认后的后续动作。",
    title: "线索已确认"
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

export function relationshipInboxBadgeCount(
  inbox: RelationshipInboxView,
  alerts: RelationshipAlertsView
): number {
  const unreadThreads = inbox.conversations.reduce(
    (total, conversation) => total + Math.max(0, conversation.unreadCount),
    0
  );

  return unreadThreads + alerts.alerts.length;
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
