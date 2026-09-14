import type {
  RelationshipConversationDTO,
  RelationshipConversationListDTO,
  RelationshipMessageDTO,
  RelationshipReadReceiptDTO,
} from "./contract/relationship-communication";
import type {
  RelationshipConversationView,
  RelationshipInboxView,
  RelationshipMessageView,
  RelationshipThreadDetailView,
} from "../view-models/relationship-inbox";

export const MESSAGE_STATE_FOREGROUND_REFRESH_MS = 15_000;

type UnknownRecord = Record<string, unknown>;
type ReadTarget = Pick<RelationshipReadReceiptDTO, "conversationId" | "lastReadMessageId">;

const invalidationListeners = new Set<() => void>();

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function exactString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function timestamp(value: unknown): value is string {
  return exactString(value) && Number.isFinite(Date.parse(value));
}

function message(value: unknown, conversationId: string, participants: Set<string>): RelationshipMessageDTO | null {
  const item = record(value);
  if (!item || !exactString(item.messageId) || item.conversationId !== conversationId
    || !exactString(item.senderAccountId) || !participants.has(item.senderAccountId)
    || !exactString(item.senderDisplayName) || typeof item.body !== "string" || !item.body.trim()
    || !timestamp(item.sentAt) || item.deliveryState !== "delivered") return null;
  return item as unknown as RelationshipMessageDTO;
}

function conversation(value: unknown, actorId: string): RelationshipConversationDTO | null {
  const item = record(value);
  if (!item || !exactString(actorId) || !exactString(item.conversationId)
    || !exactString(item.contactId) || !exactString(item.qualificationVersion)
    || item.status !== "active" || !timestamp(item.createdAt) || !timestamp(item.updatedAt)
    || !Number.isInteger(item.unreadCount) || (item.unreadCount as number) < 0
    || !Array.isArray(item.participantAccountIds) || item.participantAccountIds.length !== 2
    || !item.participantAccountIds.every(exactString)) return null;
  const participants = new Set(item.participantAccountIds as string[]);
  if (participants.size !== 2 || !participants.has(actorId)) return null;
  const names = record(item.participantDisplayNames);
  if (!names || [...participants].some(id => !exactString(names[id]))) return null;
  if (!Array.isArray(item.messages)) return null;
  const messages = item.messages.map(value => message(value, item.conversationId as string, participants));
  if (messages.some(value => value === null)) return null;
  const decodedMessages = messages as RelationshipMessageDTO[];
  if (new Set(decodedMessages.map(value => value.messageId)).size !== decodedMessages.length) return null;
  const remoteMessageCount = decodedMessages.filter(value => value.senderAccountId !== actorId).length;
  if ((item.unreadCount as number) > remoteMessageCount) return null;
  if (item.lastReadMessageId !== undefined
    && (!exactString(item.lastReadMessageId)
      || !decodedMessages.some(value => value.messageId === item.lastReadMessageId))) return null;
  return {
    contactId: item.contactId,
    conversationId: item.conversationId,
    createdAt: item.createdAt,
    ...(item.lastReadMessageId ? { lastReadMessageId: item.lastReadMessageId as string } : {}),
    messages: decodedMessages,
    participantAccountIds: item.participantAccountIds as unknown as readonly [string, string],
    participantDisplayNames: names as Readonly<Record<string, string>>,
    qualificationVersion: item.qualificationVersion,
    status: "active",
    unreadCount: item.unreadCount as number,
    updatedAt: item.updatedAt,
  };
}

function formattedDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).replace(/\//gu, "/");
}

function remoteParticipant(value: RelationshipConversationDTO, actorId: string): { id: string; name: string } {
  const id = value.participantAccountIds.find(id => id !== actorId)!;
  return { id, name: value.participantDisplayNames[id]! };
}

function conversationView(value: RelationshipConversationDTO, actorId: string): RelationshipConversationView {
  const remote = remoteParticipant(value, actorId);
  const lastMessage = value.messages.at(-1);
  return {
    contactId: value.contactId,
    id: value.conversationId,
    lastAt: formattedDate(lastMessage?.sentAt ?? value.updatedAt),
    name: remote.name,
    nextAction: value.unreadCount > 0 ? "查看新消息" : "",
    organization: "",
    preview: lastMessage?.body ?? "暂无消息",
    sourceLabels: ["已验证联系人"],
    subject: `与${remote.name}的对话`,
    unreadCount: value.unreadCount,
    unreadLabel: value.unreadCount > 0 ? `${value.unreadCount} 条新消息` : "",
  };
}

function messageView(value: RelationshipMessageDTO, actorId: string): RelationshipMessageView {
  const fromMe = value.senderAccountId === actorId;
  return {
    body: value.body,
    fromMe,
    id: value.messageId,
    sender: fromMe ? "我" : value.senderDisplayName,
    time: formattedDate(value.sentAt),
  };
}

export function relationshipConversationListToInbox(value: unknown, actorId: string): RelationshipInboxView | null {
  const payload = record(value);
  if (!payload || !timestamp(payload.refreshedAt) || !Array.isArray(payload.conversations)) return null;
  const decoded = payload.conversations.map(value => conversation(value, actorId));
  if (decoded.some(value => value === null)) return null;
  const conversationDtos = decoded as RelationshipConversationDTO[];
  if (new Set(conversationDtos.map(value => value.conversationId)).size !== conversationDtos.length) return null;
  const conversations = conversationDtos.map(value => conversationView(value, actorId));
  const unreadTotal = conversations.reduce((total, item) => total + item.unreadCount, 0);
  return {
    conversations,
    selected: null,
    summary: conversations.length ? `${conversations.length} 段对话 · ${unreadTotal} 条未读消息` : "暂无对话",
    title: "收件箱",
  };
}

export function relationshipConversationToThread(value: unknown, actorId: string): RelationshipThreadDetailView | null {
  const decoded = conversation(value, actorId);
  if (!decoded) return null;
  const remote = remoteParticipant(decoded, actorId);
  return {
    conversationId: decoded.conversationId,
    currentUserName: decoded.participantDisplayNames[actorId]!,
    draftReply: "",
    messages: decoded.messages.map(value => messageView(value, actorId)),
    participantName: remote.name,
    safetyText: "消息来自已验证的联系人身份绑定。",
    sourceLabels: ["已验证联系人"],
    subject: `与${remote.name}的对话`,
    summary: decoded.messages.length ? `${decoded.messages.length} 条已投递消息` : "暂无消息",
  };
}

export function relationshipConversationContactId(value: unknown, actorId: string): string {
  return conversation(value, actorId)?.contactId ?? "";
}

export function relationshipReadTarget(value: unknown, actorId: string): ReadTarget | null {
  const decoded = conversation(value, actorId);
  if (!decoded || decoded.unreadCount === 0) return null;
  const last = decoded.messages.at(-1);
  return last ? { conversationId: decoded.conversationId, lastReadMessageId: last.messageId } : null;
}

export function relationshipReadReceiptMatches(value: unknown, expected: ReadTarget): value is RelationshipReadReceiptDTO {
  const receipt = record(value);
  return receipt !== null
    && receipt.conversationId === expected.conversationId
    && receipt.lastReadMessageId === expected.lastReadMessageId
    && timestamp(receipt.readAt);
}

export function emitMessageStateInvalidation(): void {
  for (const listener of invalidationListeners) listener();
}

export function subscribeMessageStateInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

export type { RelationshipConversationListDTO };
