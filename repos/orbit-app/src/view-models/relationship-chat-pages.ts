import type { RelationshipConversationSummaryPageDTO } from "../api/contract/relationship-communication";
import type { RelationshipCommunicationConversationView } from "./contact-communication";

export function relationshipChatSummaryPageView(page: RelationshipConversationSummaryPageDTO, actorId: string) {
  const conversations: RelationshipCommunicationConversationView[] = page.items.map(item => {
    const remote = item.participantAccountIds.find(id => id !== actorId)!;
    const name = item.participantDisplayNames[remote]!;
    return {
      id: item.conversationId, contactId: item.contactId, name, title: `${name} 的关系对话`,
      detail: "已验证", lastAt: new Date(item.lastMessage?.sentAt ?? item.updatedAt).toLocaleString("zh-CN"),
      preview: item.lastMessage?.bodyPreview ?? "还没有消息。", nextAction: "打开对话继续联系。",
      sourceLabel: "Orbit 站内消息", unreadLabel: item.unreadCount > 0 ? `${item.unreadCount} 条未读` : "已读",
    };
  });
  return {
    title: "关系对话", summary: `本页 ${conversations.length} 段已验证关系对话。`, conversations,
    metrics: [
      { label: "本页对话", value: String(conversations.length) },
      { label: "本页未读", value: String(page.items.reduce((sum, item) => sum + item.unreadCount, 0)) },
    ],
  };
}
