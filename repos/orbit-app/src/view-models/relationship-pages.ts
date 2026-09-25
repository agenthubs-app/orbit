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

export function conversationSummaryView(page: RelationshipConversationSummaryPageDTO, actorId: string, language: OrbitLanguage): RelationshipInboxView {
  const t = createTranslator(language);
  const conversations = page.items.map(item => {
    const remote = item.participantAccountIds.find(id => id !== actorId)!;
    const name = item.participantDisplayNames[remote]!;
    return {
      id: item.conversationId, contactId: item.contactId, name, organization: "",
      subject: name, preview: item.lastMessage?.bodyPreview ?? t("inbox.noMessages"),
      lastAt: new Date(item.lastMessage?.sentAt ?? item.updatedAt).toLocaleString(language),
      nextAction: "", sourceLabels: [], unreadCount: item.unreadCount,
      unreadLabel: item.unreadCount ? t("inboxVm.newMessages", { count: item.unreadCount }) : "",
    };
  });
  return { conversations, selected: null, summary: "", title: t("inbox.title") };
}

/** These are the current page's explicit read targets, never a global mark-all. */
export function conversationSummaryReadItems(page: RelationshipConversationSummaryPageDTO, actorId: string, language: OrbitLanguage): InboxFeedItem[] {
  const view = conversationSummaryView(page, actorId, language);
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

export function relationshipMessagePageView(page: RelationshipMessagePageDTO, actorId: string, language: OrbitLanguage): RelationshipThreadDetailView {
  const t = createTranslator(language), conversation = page.conversation;
  const remote = conversation.participantAccountIds.find(id => id !== actorId)!;
  return {
    conversationId: conversation.conversationId, currentUserName: conversation.participantDisplayNames[actorId]!,
    participantName: conversation.participantDisplayNames[remote]!, subject: conversation.participantDisplayNames[remote]!,
    draftReply: "", safetyText: "", sourceLabels: [], summary: "",
    messages: page.items.map(message => ({
      id: message.messageId, body: message.body, fromMe: message.senderAccountId === actorId,
      sender: message.senderAccountId === actorId ? t("inboxVm.me") : message.senderDisplayName,
      time: new Date(message.sentAt).toLocaleString(language),
    })),
  };
}
