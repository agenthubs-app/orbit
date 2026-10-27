import type { OrbitLanguage } from "../api/contract/language";
import type { RelationshipConversationSummaryPageDTO, RelationshipMessagePageDTO } from "../api/contract/relationship-communication";
import { relationshipConversationSummaryPageSchema, relationshipMessagePageSchema } from "../api/schema/relationship-pages";
import { createTranslator } from "../i18n/messages";
import type { InboxFeedItem } from "./inbox-feed";
import type { RelationshipInboxView, RelationshipThreadDetailView } from "./relationship-inbox";

export function decodeConversationSummaryPage(value: unknown, actorId: string): RelationshipConversationSummaryPageDTO | null {
  const parsed = relationshipConversationSummaryPageSchema.safeParse(value);
  if (!parsed.success || parsed.data.actorId !== actorId) return null;
  const page = parsed.data;
  if (page.hasMore !== Boolean(page.nextCursor) || (page.hasMore && !page.items.length)) return null;
  const ids = new Set<string>();
  for (const item of page.items) {
    const participants = new Set(item.participantAccountIds);
    if (ids.has(item.conversationId) || participants.size !== 2 || !participants.has(actorId)
      || [...participants].some(id => !item.participantDisplayNames[id]?.trim())
      || (item.lastMessage && !participants.has(item.lastMessage.senderAccountId))
      || (!item.lastMessage && item.unreadCount > 0)) return null;
    ids.add(item.conversationId);
  }
  return page;
}

const LANGUAGE_TAGS: Record<OrbitLanguage, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };
const DAY_MS = 86_400_000;

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * QA-C3: like Messages — a time today, "Yesterday", a weekday this week, otherwise a date
 * (the year only when it is not this year). Was a full "10/26/2026, 7:41:02 PM".
 */
export function messageListTime(iso: string, language: OrbitLanguage, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const tag = LANGUAGE_TAGS[language] ?? language;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return at.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return createTranslator(language)("inbox.yesterday");
  if (days < 7) return at.toLocaleDateString(tag, { weekday: "short" });
  return at.toLocaleDateString(tag, { month: "short", day: "numeric", ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** QA-C3: the time under one message — the time today, otherwise date and time. */
export function messageBubbleTime(iso: string, language: OrbitLanguage, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const tag = LANGUAGE_TAGS[language] ?? language;
  const time = at.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit" });
  if (startOfDay(at) === startOfDay(now)) return time;
  const date = at.toLocaleDateString(tag, { month: "short", day: "numeric", ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  return `${date} ${time}`;
}

/**
 * QA-C3: the server keeps the account names from when the conversation started ("qa1026a");
 * where the conversation is about one of my own contacts, my name for that person is used.
 */
export type ConversationContactName = (contactId: string) => string | undefined;

export function conversationSummaryView(page: RelationshipConversationSummaryPageDTO, actorId: string, language: OrbitLanguage, contactName?: ConversationContactName): RelationshipInboxView {
  const t = createTranslator(language);
  const conversations = page.items.map(item => {
    const remote = item.participantAccountIds.find(id => id !== actorId)!;
    const name = contactName?.(item.contactId)?.trim() || item.participantDisplayNames[remote]!;
    return {
      id: item.conversationId, contactId: item.contactId, name, organization: "",
      subject: name, preview: item.lastMessage?.bodyPreview ?? t("inbox.noMessages"),
      lastAt: messageListTime(item.lastMessage?.sentAt ?? item.updatedAt, language),
      nextAction: "", sourceLabels: [], unreadCount: item.unreadCount,
      unreadLabel: item.unreadCount ? t("inboxVm.newMessages", { count: item.unreadCount }) : "",
    };
  });
  return { conversations, selected: null, summary: "", title: t("inbox.title") };
}

/** These are the current page's explicit read targets, never a global mark-all. */
export function conversationSummaryReadItems(page: RelationshipConversationSummaryPageDTO, actorId: string, language: OrbitLanguage, contactName?: ConversationContactName): InboxFeedItem[] {
  const view = conversationSummaryView(page, actorId, language, contactName);
  return page.items.map((item, index) => ({
    category: "contact", id: `conversation:${item.conversationId}`, occurredAt: item.updatedAt,
    read: item.unreadCount === 0, title: view.conversations[index]!.name, subtitle: view.conversations[index]!.preview,
    targetHref: `/inbox/${encodeURIComponent(item.conversationId)}`,
    ...(item.unreadCount && item.lastMessage ? { readAction: {
      body: { lastReadMessageId: item.lastMessage.messageId },
      endpoint: `/api/relationship-communication/conversations/${encodeURIComponent(item.conversationId)}/read`,
      expected: { conversationId: item.conversationId, lastReadMessageId: item.lastMessage.messageId },
    } } : {}),
  }));
}

export function decodeRelationshipMessagePage(value: unknown, actorId: string, conversationId: string): RelationshipMessagePageDTO | null {
  const parsed = relationshipMessagePageSchema.safeParse(value);
  if (!parsed.success || parsed.data.actorId !== actorId || parsed.data.conversation.conversationId !== conversationId) return null;
  const page = parsed.data, participants = new Set(page.conversation.participantAccountIds), ids = new Set<string>();
  if (participants.size !== 2 || !participants.has(actorId) || [...participants].some(id => !page.conversation.participantDisplayNames[id]?.trim())
    || page.hasMore !== Boolean(page.nextCursor) || (page.hasMore && !page.items.length) || (page.items.length && !page.newestCursor)) return null;
  for (const message of page.items) {
    if (ids.has(message.messageId) || message.conversationId !== conversationId || !participants.has(message.senderAccountId) || !message.body.trim()) return null;
    ids.add(message.messageId);
  }
  return page;
}

export function relationshipMessagePageView(page: RelationshipMessagePageDTO, actorId: string, language: OrbitLanguage, contactName?: ConversationContactName): RelationshipThreadDetailView {
  const t = createTranslator(language), conversation = page.conversation;
  const remote = conversation.participantAccountIds.find(id => id !== actorId)!;
  const remoteName = contactName?.(conversation.contactId)?.trim() || conversation.participantDisplayNames[remote]!;
  return {
    conversationId: conversation.conversationId, currentUserName: conversation.participantDisplayNames[actorId]!,
    participantName: remoteName, subject: remoteName,
    draftReply: "", safetyText: "", sourceLabels: [], summary: "",
    messages: page.items.map(message => ({
      id: message.messageId, body: message.body, fromMe: message.senderAccountId === actorId,
      sender: message.senderAccountId === actorId ? t("inboxVm.me") : remoteName,
      time: messageBubbleTime(message.sentAt, language),
    })),
  };
}
