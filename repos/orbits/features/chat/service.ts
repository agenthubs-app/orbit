import type {
  ChatConversationListInput,
  ChatConversationListResult,
  ChatConversationMockFailure,
  ChatMessageThreadInput,
  ChatMessageThreadResult,
  ChatSendMessageInput,
  ChatSendMessageResult,
} from "./contract";
import {
  chatConversationMockFailureContext,
  chatConversationMockFailureToAppError,
} from "./contract";

export type ChatConversationMessageServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

// ChatConversationMessageService 是传统聊天页的服务边界。
// 它和 Orbit Agent 的 live conversation service 分离：这里负责 mock-first 聊天线程，
// Orbit Agent 负责模型规划、artifact 和安全账本。
export interface ChatConversationMessageService {
  // 列出可显示在侧栏的会话摘要。
  listConversations: (
    input?: ChatConversationListInput,
  ) => ChatConversationMessageServiceResult<ChatConversationListResult>;
  // 读取单个会话的消息线程。
  getMessageThread: (
    input: ChatMessageThreadInput,
  ) => ChatConversationMessageServiceResult<ChatMessageThreadResult>;
  // 发送消息并返回当前 mock contract 下的线程结果。
  sendMessage: (
    input: ChatSendMessageInput,
  ) => ChatConversationMessageServiceResult<ChatSendMessageResult>;
}

export {
  chatConversationMockFailureContext,
  chatConversationMockFailureToAppError,
};

export type {
  ChatConversationListInput,
  ChatConversationListResult,
  ChatConversationMockFailure,
  ChatMessageThreadInput,
  ChatMessageThreadResult,
  ChatSendMessageInput,
  ChatSendMessageResult,
};
