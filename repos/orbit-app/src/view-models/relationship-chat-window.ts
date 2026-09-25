import type { RelationshipMessagePageDTO } from "../api/contract/relationship-communication";
import type { RelationshipCommunicationThreadView } from "./contact-communication";

/** A window is not a full conversation and has no global unread count. */
export function relationshipChatWindowView(page: RelationshipMessagePageDTO, actorId: string): Omit<RelationshipCommunicationThreadView, "unreadCount"> {
  const conversation = page.conversation;
  const remote = conversation.participantAccountIds.find(id => id !== actorId)!;
  const participant = conversation.participantDisplayNames[remote]!;
  return {
    canSend: conversation.status === "active" && conversation.participantAccountIds.includes(actorId) && Boolean(conversation.qualificationVersion.trim()),
    contactId: conversation.contactId, conversationId: conversation.conversationId,
    qualificationVersion: conversation.qualificationVersion, participant,
    title: `${participant} 的关系对话`, sendBoundary: "消息会发送到已验证的 Orbit 账号。",
    messages: page.items.map(message => {
      const date = new Date(message.sentAt);
      return {
        id: message.messageId, body: message.body, fromMe: message.senderAccountId === actorId,
        sender: message.senderAccountId === actorId ? "我" : message.senderDisplayName,
        deliveryLabel: "已送达",
        time: `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
      };
    }),
  };
}
