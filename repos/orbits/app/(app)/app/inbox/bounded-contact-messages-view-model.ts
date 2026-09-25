import { relationshipConversationSummaryPageSchema, relationshipMessagePageSchema } from "../../../../shared/api-schema/relationship-pages";

export class BoundedMessageReadError extends Error {
  constructor(readonly status: number) { super("Conversation page unavailable"); }
}
async function communicationFetch(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", ...options.headers } });
  if (!response.ok) throw new BoundedMessageReadError(response.status);
  const envelope = await response.json();
  if (envelope.success !== true) throw new BoundedMessageReadError(503);
  return envelope.data;
}
async function readContactMessageActor(signal: AbortSignal): Promise<string> {
  const value = await communicationFetch("/api/account/me", { signal });
  if (typeof value?.account?.id !== "string" || !value.account.id.trim()) throw new BoundedMessageReadError(403);
  return value.account.id;
}
export interface MessageCardView { id: string; name: string; preview: string; unread: number; updatedAt: string }
export interface MessageCardPageView { items: MessageCardView[]; nextCursor: string | null }
export interface MessageWindowView {
  id: string; name: string; version: string; nextCursor: string | null;
  messages: { id: string; authorId: string; author: string; body: string; at: string }[];
}
async function read(path: string, actorId: string, signal: AbortSignal) {
  const response = await fetch(path, { signal, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new BoundedMessageReadError(response.status);
  const envelope = await response.json();
  if (!envelope.success || envelope.data?.actorId !== actorId) throw new BoundedMessageReadError(403);
  if (await readContactMessageActor(signal) !== actorId) throw new BoundedMessageReadError(403);
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return envelope.data;
}
export async function readMessageCards(actorId: string, signal: AbortSignal, cursor?: string | null): Promise<MessageCardPageView> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const page = relationshipConversationSummaryPageSchema.parse(await read(`/api/relationship-communication/conversation-summaries?${params}`, actorId, signal));
  return { nextCursor: page.nextCursor ?? null, items: page.items.map(item => {
    const peer = item.participantAccountIds.find(id => id !== actorId);
    if (!peer || !item.participantAccountIds.includes(actorId)) throw new BoundedMessageReadError(403);
    return { id: item.conversationId, name: item.participantDisplayNames[peer] ?? "", preview: item.lastMessage?.bodyPreview ?? "", unread: item.unreadCount, updatedAt: item.updatedAt };
  }) };
}
export async function readMessageWindow(actorId: string, conversationId: string, signal: AbortSignal, cursor?: string | null): Promise<MessageWindowView> {
  const params = new URLSearchParams({ limit: "30", direction: "older" });
  if (cursor) params.set("cursor", cursor);
  const page = relationshipMessagePageSchema.parse(await read(`/api/relationship-communication/conversations/${encodeURIComponent(conversationId)}/messages?${params}`, actorId, signal));
  const peer = page.conversation.participantAccountIds.find(id => id !== actorId);
  if (!peer || !page.conversation.participantAccountIds.includes(actorId) || page.conversation.conversationId !== conversationId || page.items.some(item => item.conversationId !== conversationId || !page.conversation.participantAccountIds.includes(item.senderAccountId))) throw new BoundedMessageReadError(403);
  return { id: conversationId, name: page.conversation.participantDisplayNames[peer] ?? "", version: page.conversation.qualificationVersion,
    nextCursor: page.nextCursor ?? null, messages: page.items.map(item => ({ id: item.messageId, authorId: item.senderAccountId, author: item.senderDisplayName, body: item.body, at: item.sentAt })) };
}
export async function confirmMessageWindowRead(actorId: string, conversationId: string, messageId: string, signal: AbortSignal) {
  if (await readContactMessageActor(signal) !== actorId) throw new BoundedMessageReadError(403);
  const value = await communicationFetch(`/api/relationship-communication/conversations/${encodeURIComponent(conversationId)}/read`, {
    signal, method: "POST", body: JSON.stringify({ lastReadMessageId: messageId }),
  }) as { conversationId?: unknown; lastReadMessageId?: unknown; readAt?: unknown };
  if (value.conversationId !== conversationId || value.lastReadMessageId !== messageId || typeof value.readAt !== "string" || !Number.isFinite(Date.parse(value.readAt))) throw Error("Read receipt invalid");
}
export async function sendWindowMessage(actorId: string, request: { conversationId: string; body: string; id: string; version: string }, signal: AbortSignal) {
  if (await readContactMessageActor(signal) !== actorId) throw new BoundedMessageReadError(403);
  const value = await communicationFetch(`/api/relationship-communication/conversations/${encodeURIComponent(request.conversationId)}/messages`, {
    signal, method: "POST", body: JSON.stringify({ body: request.body, requestId: request.id, qualificationVersion: request.version }),
  }) as { conversationId?: unknown; deliveryState?: unknown; message?: { body?: unknown; senderAccountId?: unknown } };
  if (value.conversationId !== request.conversationId || value.deliveryState !== "delivered" || value.message?.body !== request.body || value.message.senderAccountId !== actorId) throw Error("Delivery receipt invalid");
}
