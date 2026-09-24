import type {
  AsyncConversationCreatePayload,
  AsyncConversationInboxItem,
  AsyncConversationMessage,
  AsyncConversationWorkspacePayload,
} from "../../../../features/chat/contract";
import type { ReminderScheduleNotificationPayload } from "../../../../features/notifications/contract";
import type { OrbitAiProactiveAgentPayload } from "../../../../features/orbit-ai/proactive-contract";
import type { OrbitLanguage } from "../orbit-language-core";
import {
  localizeDraftReply,
  localizeProactive,
  localizeReminderTitle,
  localizeReminderWindow,
  localizeSourceLabels,
  localizeThreadMessage,
  localizeThreadPreview,
  localizeThreadSubject,
  localizeThreadSummary,
} from "./inbox-demo-localization";

// 关系收件箱面板的 view model：把 async correspondence 的 feature DTO 映射成
// UI-neutral 结构。这是面板的唯一 DTO→UI 转换点；面板组件只消费这里的类型，
// 不直接 import features/* 契约（沿用 presenter 解耦规则）。
// 用 `import type` 确保 contract 的运行时代码不会进客户端 bundle。

export interface InboxThreadListItem {
  conversationId: string;
  contactId: string;
  participantName: string;
  organization: string;
  subject: string;
  preview: string;
  lastCorrespondenceAt: string;
  unreadCount: number;
  nextActionLabel: string;
  sourceContextLabels: readonly string[];
}

export interface InboxThreadMessage {
  messageId: string;
  senderName: string;
  fromMe: boolean;
  body: string;
  occurredAt: string;
  sourceContextLabel: string;
}

export interface InboxThreadDetail {
  conversationId: string;
  subject: string;
  summary: string;
  participantName: string;
  organization: string;
  messages: readonly InboxThreadMessage[];
  sourceContextLabels: readonly string[];
  draftReplyBody: string;
  draftReplyTone: string;
  // 外发边界：async 契约固定为 "not_requested"，UI 据此显示"发送需确认"。
  externalSendStatus: string;
  noExternalSideEffect: boolean;
}

export interface InboxPanelViewModel {
  title: string;
  currentUserName: string;
  threads: readonly InboxThreadListItem[];
  selected: InboxThreadDetail | null;
}

function threadListItem(
  item: AsyncConversationInboxItem,
  language: OrbitLanguage,
): InboxThreadListItem {
  return {
    conversationId: item.conversationId,
    contactId: item.contactId,
    participantName: item.participantName,
    organization: item.organization,
    subject: localizeThreadSubject(item.conversationId, item.subject, language),
    preview: localizeThreadPreview(item.conversationId, item.preview, language),
    lastCorrespondenceAt: item.lastCorrespondenceAt,
    unreadCount: item.unreadCount,
    nextActionLabel: item.nextActionLabel,
    sourceContextLabels: localizeSourceLabels(item.sourceContextLabels, language),
  };
}

function threadMessage(
  message: AsyncConversationMessage,
  conversationId: string,
  language: OrbitLanguage,
): InboxThreadMessage {
  return {
    messageId: message.messageId,
    senderName: message.senderName,
    fromMe: message.senderRole === "orbit_user",
    body: localizeThreadMessage(
      conversationId,
      message.messageId,
      message.body,
      language,
    ),
    occurredAt: message.occurredAt,
    sourceContextLabel: message.sourceContextLabel,
  };
}

export function toInboxPanelViewModel(
  payload: AsyncConversationWorkspacePayload,
  language: OrbitLanguage = "zh",
): InboxPanelViewModel {
  if (payload.state === "empty") {
    return {
      title: payload.inbox.title,
      currentUserName: payload.currentUser.displayName,
      threads: [],
      selected: null,
    };
  }

  const selectedId = payload.selectedThread.conversationId;
  const sideEffects = payload.sideEffects;
  const noExternalSideEffect =
    sideEffects.externalMessageSent === false &&
    sideEffects.notificationDelivered === false &&
    sideEffects.calendarEntryCreated === false &&
    sideEffects.networkRequestMade === false;

  return {
    title: payload.inbox.title,
    currentUserName: payload.currentUser.displayName,
    threads: payload.inbox.conversations.map((item) =>
      threadListItem(item, language),
    ),
    selected: {
      conversationId: selectedId,
      subject: localizeThreadSubject(
        selectedId,
        payload.selectedThread.subject,
        language,
      ),
      summary: localizeThreadSummary(
        selectedId,
        payload.selectedThread.summary,
        language,
      ),
      participantName: payload.contact.displayName,
      organization: payload.contact.organization,
      messages: payload.selectedThread.messages.map((message) =>
        threadMessage(message, selectedId, language),
      ),
      sourceContextLabels: localizeSourceLabels(
        payload.selectedThread.sourceContextLabels,
        language,
      ),
      draftReplyBody: localizeDraftReply(
        selectedId,
        payload.draftReply.body,
        language,
      ),
      draftReplyTone: payload.draftReply.tone,
      externalSendStatus: payload.draftReply.externalSendStatus,
      noExternalSideEffect,
    },
  };
}

// draft→thread：把新建的 staged 对话映射成面板结构（列表条目 + 线程详情）。
// 新线程没有回复草稿（draftReplyBody 为空），发送边界固定 not_requested。
export function toCreatedThread(
  payload: AsyncConversationCreatePayload,
  language: OrbitLanguage = "zh",
): {
  item: InboxThreadListItem;
  detail: InboxThreadDetail;
} {
  const sideEffects = payload.sideEffects;
  const noExternalSideEffect =
    sideEffects.externalMessageSent === false &&
    sideEffects.notificationDelivered === false &&
    sideEffects.calendarEntryCreated === false &&
    sideEffects.networkRequestMade === false;

  // 用户新建的线程内容由用户输入（通常已是中文），localization 对未知 id 原样返回。
  return {
    item: threadListItem(payload.inboxItem, language),
    detail: {
      conversationId: payload.thread.conversationId,
      subject: payload.thread.subject,
      summary: payload.thread.summary,
      participantName: payload.inboxItem.participantName,
      organization: payload.inboxItem.organization,
      messages: payload.thread.messages.map((message) =>
        threadMessage(message, payload.thread.conversationId, language),
      ),
      sourceContextLabels: payload.thread.sourceContextLabels,
      draftReplyBody: "",
      draftReplyTone: "",
      externalSendStatus: "not_requested",
      noExternalSideEffect,
    },
  };
}

// —— 提醒 tab（Alerts）：合并 notifications reminders 与 orbit-ai proactive nudges ——

export interface InboxReminderAlert {
  id: string;
  title: string;
  contactName: string;
  organization: string;
  dueLabel: string;
  priority: "high" | "normal" | "low";
  href: string;
}

export interface InboxProactiveAlert {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  href: string;
}

export interface InboxAlertsViewModel {
  reminders: readonly InboxReminderAlert[];
  proactive: readonly InboxProactiveAlert[];
}

// Canonical task reminders share App deep links; adapt them at the Web boundary.
function reminderWebHref(href: string | undefined): string {
  if (href?.startsWith("/app/")) return href;
  if (href && /^\/tasks\/[^/?#]+$/u.test(href)) {
    try {
      if (!decodeURIComponent(href).includes("..")) return `/app${href}`;
    } catch { /* Invalid encoded paths keep the legacy fallback. */ }
  }
  return "/app/agent/plan";
}

export function toReminderAlerts(
  payload: ReminderScheduleNotificationPayload,
  language: OrbitLanguage = "zh",
): readonly InboxReminderAlert[] {
  return payload.reminders.map((reminder) => ({
    id: reminder.reminderId,
    title: localizeReminderTitle(reminder.title, language, reminder.contactName),
    contactName: reminder.contactName,
    organization: reminder.organization,
    dueLabel: localizeReminderWindow(
      reminder.recommendedWindow || reminder.dueAt,
      language,
    ),
    priority: reminder.priority,
    href: reminderWebHref(reminder.href),
  }));
}

// 主动提示的动作目标面到路由的映射。
const proactiveSurfaceHref: Record<string, string> = {
  orbit_ai_chat: "/app/agent",
  events: "/app/events",
  contacts: "/app/contacts",
  followups: "/app/agent/plan",
  messages: "/app/agent",
};

// proactive 当前每次返回一条主动 turn；映射成一条提示。
export function toProactiveAlerts(
  payload: OrbitAiProactiveAgentPayload,
  language: OrbitLanguage = "zh",
): readonly InboxProactiveAlert[] {
  const action = payload.suggestedActions[0];
  const surface = action?.targetSurface ?? "orbit_ai_chat";

  return [
    {
      id: payload.message.messageId,
      title: localizeProactive(payload.signal.title ?? "Relationship nudge", language),
      body: payload.message.content,
      actionLabel: localizeProactive(action?.label ?? "Open in Orbit AI", language),
      href: proactiveSurfaceHref[surface] ?? "/app/agent",
    },
  ];
}

// 未读/待处理聚合：面板 badge 用（对话未读 + 提醒条数）。
export function unreadThreadCount(threads: readonly InboxThreadListItem[]): number {
  return threads.reduce((total, thread) => total + Math.max(0, thread.unreadCount), 0);
}

export interface ContactMessageInboxItem {
  id: string;
  name: string;
  preview: string;
  unreadCount: number;
  conversation: import('../../../../shared/contract/relationship-communication').RelationshipConversationDTO;
}

/** Real Orbit messages are literal user content, never demo-localized. */
export function toContactMessageInbox(payload: unknown, actorId: string): ContactMessageInboxItem[] {
  const data = payload as import('../../../../shared/contract/relationship-communication').RelationshipConversationListDTO | null;
  if (!actorId || !data || !Array.isArray(data.conversations) || !Number.isFinite(Date.parse(data.refreshedAt))) throw new Error('Invalid message inbox');
  const seen = new Set<string>();
  return data.conversations.map(conversation => {
    const participants = conversation.participantAccountIds;
    if (!Array.isArray(participants) || participants.length !== 2 || new Set(participants).size !== 2 || !participants.includes(actorId)
      || !conversation.conversationId || seen.has(conversation.conversationId) || conversation.status !== 'active'
      || !conversation.qualificationVersion || !conversation.contactId || !Array.isArray(conversation.messages)
      || !Number.isInteger(conversation.unreadCount) || conversation.unreadCount < 0) throw new Error('Invalid message ownership');
    seen.add(conversation.conversationId);
    const remote = participants.find(id => id !== actorId)!;
    const name = conversation.participantDisplayNames?.[remote];
    if (typeof name !== 'string' || !name.trim()) throw new Error('Missing contact name');
    const ids = new Set<string>();
    for (const message of conversation.messages) {
      if (!message.messageId || ids.has(message.messageId) || message.conversationId !== conversation.conversationId
        || !participants.includes(message.senderAccountId) || typeof message.body !== 'string' || !message.body.trim()
        || typeof message.senderDisplayName !== 'string' || !message.senderDisplayName.trim()
        || !Number.isFinite(Date.parse(message.sentAt)) || message.deliveryState !== 'delivered') throw new Error('Invalid message');
      ids.add(message.messageId);
    }
    return { id: conversation.conversationId, name, preview: conversation.messages.at(-1)?.body ?? '', unreadCount: conversation.unreadCount, conversation };
  });
}
