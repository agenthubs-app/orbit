import type { RelationshipConversationSummaryPageDTO } from "../api/contract/relationship-communication";
import type { LocalSyncQueuedMutation } from "../data/sync/local-sync-repository";
import { parseOfflineMessageRequest } from "../data/sync/message-outbox-mutation";

/**
 * Sprint 0135 (message plan M4): messages written offline, read from the
 * device queue. They are shown after the server's messages with 「待发送」
 * instead of a time (D13: the time shown is the server's, once it is sent),
 * or 「未发送」 when the server refused them. A queued message whose
 * conversation has left the device (revoked or left) is only listed in the
 * inbox's 「未能发送」 line; its text never leaves this phone.
 */
export interface OutboxRelationshipMessage {
  mutationId: string;
  conversationId: string;
  body: string;
  createdAt: string;
  status: "pending" | "failed";
}

export function outboxRelationshipMessages(rows: readonly LocalSyncQueuedMutation[]): OutboxRelationshipMessage[] {
  const messages: OutboxRelationshipMessage[] = [];
  for (const row of rows) {
    try {
      const { conversationId, request } = parseOfflineMessageRequest(row);
      messages.push({ mutationId: row.mutationId, conversationId, body: request.body, createdAt: row.createdAt,
        status: row.state === "failed" || row.state === "conflict" ? "failed" : "pending" });
    } catch { /* A stored row that no longer validates is never shown or sent. */ }
  }
  return messages.sort((left, right) => left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : left.mutationId < right.mutationId ? -1 : left.mutationId > right.mutationId ? 1 : 0);
}

/** One conversation's queued messages, in the order they were written (they go after every server message). */
export function conversationOutboxMessages(messages: readonly OutboxRelationshipMessage[], conversationId: string): OutboxRelationshipMessage[] {
  return messages.filter(message => message.conversationId === conversationId);
}

/** Queued messages whose conversation is no longer on the device: the inbox's 「N 条消息未能发送」 line. */
export function endedConversationMessages(messages: readonly OutboxRelationshipMessage[], conversationIds: readonly string[]): OutboxRelationshipMessage[] {
  const present = new Set(conversationIds);
  return messages.filter(message => !present.has(message.conversationId));
}

/** True while this conversation has messages waiting: a new message must queue behind them to keep the order. */
export function hasQueuedMessages(messages: readonly OutboxRelationshipMessage[], conversationId: string): boolean {
  return messages.some(message => message.conversationId === conversationId);
}

/**
 * The inbox list with queued messages overlaid: a conversation's newest queued
 * message becomes its latest line and moves it up; unread counts are unchanged
 * (your own messages are never unread).
 */
export function overlayOutboxOnSummaryPage(page: RelationshipConversationSummaryPageDTO, messages: readonly OutboxRelationshipMessage[], actorId: string): RelationshipConversationSummaryPageDTO {
  if (messages.length === 0) return page;
  const latest = new Map<string, OutboxRelationshipMessage>();
  for (const message of messages) latest.set(message.conversationId, message);
  const items = page.items.map(item => {
    const queued = latest.get(item.conversationId);
    if (!queued) return item;
    return {
      ...item,
      updatedAt: queued.createdAt > item.updatedAt ? queued.createdAt : item.updatedAt,
      lastMessage: { messageId: queued.mutationId, senderAccountId: actorId, sentAt: queued.createdAt, bodyPreview: queued.body.slice(0, 160) },
    };
  });
  items.sort((left, right) => left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : left.conversationId < right.conversationId ? -1 : left.conversationId > right.conversationId ? 1 : 0);
  return { ...page, items };
}
