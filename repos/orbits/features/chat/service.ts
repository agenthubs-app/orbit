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

export interface ChatConversationMessageService {
  listConversations: (
    input?: ChatConversationListInput,
  ) => ChatConversationListResult;
  getMessageThread: (
    input: ChatMessageThreadInput,
  ) => ChatMessageThreadResult;
  sendMessage: (input: ChatSendMessageInput) => ChatSendMessageResult;
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
