import type {
  RelationshipConversationDTO,
  RelationshipConversationListDTO,
  RelationshipEligibilityDTO,
  RelationshipEligibilityStatus,
} from "../api/contract/relationship-communication";

export interface RelationshipCommunicationEligibilityView {
  canInvite: boolean;
  canSend: boolean;
  contactId: string;
  conversationId: string;
  qualificationVersion: string;
  remoteName: string;
  status: RelationshipEligibilityStatus;
  statusLabel: string;
}

export interface RelationshipCommunicationMessageView {
  body: string;
  deliveryLabel: string;
  fromMe: boolean;
  id: string;
  sender: string;
  time: string;
}

export interface RelationshipCommunicationThreadView {
  canSend: boolean;
  contactId: string;
  conversationId: string;
  messages: RelationshipCommunicationMessageView[];
  participant: string;
  qualificationVersion: string;
  sendBoundary: string;
  title: string;
  unreadCount: number;
}

export interface RelationshipCommunicationConversationView {
  contactId: string;
  detail: string;
  id: string;
  lastAt: string;
  name: string;
  nextAction: string;
  preview: string;
  sourceLabel: string;
  title: string;
  unreadLabel: string;
}

const STATUS_LABELS: Record<RelationshipEligibilityStatus, string> = {
  confirmed: "已验证，可聊天",
  conflict: "身份绑定有冲突",
  expired: "邀请已过期",
  forbidden: "当前账号无权限",
  pending: "等待对方接受邀请",
  revoked: "聊天资格已撤销",
  unregistered: "尚未邀请",
};

export function isRelationshipEligibility(value: unknown): value is RelationshipEligibilityDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const eligibility = value as Partial<RelationshipEligibilityDTO>;
  const validStatus = ["unregistered", "pending", "conflict", "confirmed", "revoked", "expired", "forbidden"].includes(eligibility.status ?? "");
  const baseValid = validStatus && typeof eligibility.contactId === "string" &&
    typeof eligibility.canInvite === "boolean" && typeof eligibility.canSend === "boolean";
  if (!baseValid) return false;
  if (eligibility.status !== "confirmed") return true;
  return typeof eligibility.conversationId === "string" && Boolean(eligibility.conversationId.trim()) &&
    typeof eligibility.qualificationVersion === "string" && Boolean(eligibility.qualificationVersion.trim()) &&
    Boolean(eligibility.remoteAccount) && typeof eligibility.remoteAccount?.accountId === "string" &&
    Boolean(eligibility.remoteAccount.accountId.trim()) && typeof eligibility.remoteAccount.displayName === "string";
}

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function isRelationshipConversationList(value: unknown): value is RelationshipConversationListDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const list = value as Partial<RelationshipConversationListDTO>;
  return typeof list.refreshedAt === "string" && Array.isArray(list.conversations) && list.conversations.every((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const conversation = candidate as Partial<RelationshipConversationDTO>;
    return typeof conversation.conversationId === "string" &&
      typeof conversation.contactId === "string" &&
      (conversation.status === "active" || conversation.status === "revoked") &&
      typeof conversation.qualificationVersion === "string" &&
      typeof conversation.updatedAt === "string" &&
      typeof conversation.unreadCount === "number" &&
      Array.isArray(conversation.participantAccountIds) &&
      conversation.participantAccountIds.length === 2 &&
      Boolean(conversation.participantDisplayNames) &&
      Array.isArray(conversation.messages) &&
      conversation.messages.every((message: unknown) => {
        if (!message || typeof message !== "object" || Array.isArray(message)) return false;
        const record = message as Partial<RelationshipConversationDTO["messages"][number]>;
        return typeof record.messageId === "string" &&
          record.conversationId === conversation.conversationId &&
          typeof record.senderAccountId === "string" &&
          typeof record.senderDisplayName === "string" &&
          typeof record.body === "string" &&
          typeof record.sentAt === "string" &&
          record.deliveryState === "delivered";
      });
  });
}

export function relationshipCommunicationEligibilityToView(
  data: RelationshipEligibilityDTO,
): RelationshipCommunicationEligibilityView {
  const completeConfirmed =
    data.status === "confirmed" &&
    data.canSend === true &&
    Boolean(data.conversationId?.trim()) &&
    Boolean(data.qualificationVersion?.trim()) &&
    Boolean(data.remoteAccount?.accountId.trim());
  return {
    canInvite: data.canInvite === true,
    canSend: completeConfirmed,
    contactId: data.contactId,
    conversationId: completeConfirmed ? data.conversationId!.trim() : "",
    qualificationVersion: completeConfirmed ? data.qualificationVersion!.trim() : "",
    remoteName: data.remoteAccount?.displayName.trim() ?? "",
    status: data.status,
    statusLabel: STATUS_LABELS[data.status],
  };
}

export function relationshipCommunicationThreadToView(
  data: RelationshipConversationDTO,
  currentAccountId: string,
): RelationshipCommunicationThreadView {
  const actorId = currentAccountId.trim();
  const remoteAccountId = data.participantAccountIds.find((id) => id !== actorId) ?? "";
  const participant = data.participantDisplayNames[remoteAccountId] ?? "联系人";
  const canSend =
    data.status === "active" &&
    data.participantAccountIds.includes(actorId) &&
    Boolean(data.qualificationVersion.trim());
  return {
    canSend,
    contactId: data.contactId,
    conversationId: data.conversationId,
    messages: data.messages.map((message) => ({
      body: message.body,
      deliveryLabel: message.deliveryState === "delivered" ? "已送达" : "未送达",
      fromMe: message.senderAccountId === actorId,
      id: message.messageId,
      sender: message.senderAccountId === actorId ? "我" : message.senderDisplayName,
      time: dateTime(message.sentAt),
    })),
    participant,
    qualificationVersion: data.qualificationVersion,
    sendBoundary: canSend ? "消息会发送到已验证的 Orbit 账号。" : "聊天资格已失效，请刷新。",
    title: `${participant} 的关系对话`,
    unreadCount: data.unreadCount,
  };
}

export function relationshipCommunicationListToView(
  data: RelationshipConversationListDTO,
  currentAccountId: string,
) {
  const conversations: RelationshipCommunicationConversationView[] = data.conversations.map((conversation) => {
    const thread = relationshipCommunicationThreadToView(conversation, currentAccountId);
    const latest = thread.messages.at(-1);
    return {
      contactId: thread.contactId,
      detail: conversation.status === "active" ? "已验证" : "已撤销",
      id: thread.conversationId,
      lastAt: dateTime(conversation.updatedAt),
      name: thread.participant,
      nextAction: thread.canSend ? "打开对话继续联系。" : "刷新资格后再联系。",
      preview: latest?.body ?? "还没有消息。",
      sourceLabel: "Orbit 站内消息",
      title: thread.title,
      unreadLabel: conversation.unreadCount > 0 ? `${conversation.unreadCount} 条未读` : "已读",
    };
  });
  return {
    conversations,
    metrics: [
      { label: "对话", value: String(conversations.length) },
      { label: "可聊天", value: String(conversations.filter((item) => item.detail === "已验证").length) },
      { label: "未读", value: String(data.conversations.reduce((sum, item) => sum + item.unreadCount, 0)) },
    ],
    summary: conversations.length ? `${conversations.length} 段已验证关系对话。` : "还没有已验证关系对话。",
    title: "关系对话",
  };
}
