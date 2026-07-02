// Chat service factory 管理传统聊天模块的四类能力：
// 会话/消息、写作辅助、摘要提取和隐私控制。
// 它和 Orbit Agent conversation 是不同 capability，避免旧 chat mock 与新 agent live 路径混在一起。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridChatConversationMessageService } from "./chat-conversation-and-message-mock/hybrid-service";
import { createLiveChatWritingAssistService } from "./live-assist-service";
import { createLiveChatConversationMessageService } from "./live-service";
import { createLiveChatPrivacyControlsService } from "./live-privacy-service";
import { createLiveChatSummaryExtractionService } from "./live-summary-service";
import { createMockChatWritingAssistService } from "./mock-assist-service";
import { createMockChatPrivacyControlsService } from "./mock-privacy-service";
import { createMockChatConversationMessageService } from "./mock-service";
import { createMockChatSummaryExtractionService } from "./mock-summary-service";
import { createConfiguredStorageChatConversationMessageProvider } from "./storage/chat-conversation-live-record-provider";
import { createConfiguredStorageChatPrivacyControlsProvider } from "./storage/chat-privacy-controls-live-record-provider";
import { createConfiguredStorageChatSummaryExtractionProvider } from "./storage/chat-summary-live-record-provider";
import { createConfiguredStorageChatWritingAssistProvider } from "./storage/chat-writing-assist-live-record-provider";
import type { ChatWritingAssistService } from "./assist-contract";
import type { ChatPrivacyControlsService } from "./privacy-contract";
import type { ChatConversationMessageService } from "./service";
import type { ChatSummaryExtractionService } from "./summary-contract";

export const chatConversationMessageServiceFactory =
  createModuleServiceFactory<ChatConversationMessageService>({
    capabilityId: "chat-conversation-message",
    implementations: {
      hybrid: () => createHybridChatConversationMessageService(),
      live: () =>
        createLiveChatConversationMessageService({
          provider: createConfiguredStorageChatConversationMessageProvider(),
        }),
      mock: () => createMockChatConversationMessageService(),
    },
  });

export const chatWritingAssistServiceFactory =
  createModuleServiceFactory<ChatWritingAssistService>({
    capabilityId: "chat-writing-assist",
    implementations: {
      live: () =>
        createLiveChatWritingAssistService({
          provider: createConfiguredStorageChatWritingAssistProvider(),
        }),
      mock: () => createMockChatWritingAssistService(),
    },
  });

export const chatSummaryExtractionServiceFactory =
  createModuleServiceFactory<ChatSummaryExtractionService>({
    capabilityId: "chat-summary-extraction",
    implementations: {
      live: () =>
        createLiveChatSummaryExtractionService({
          provider: createConfiguredStorageChatSummaryExtractionProvider(),
        }),
      mock: () => createMockChatSummaryExtractionService(),
    },
  });

export const chatPrivacyControlsServiceFactory =
  createModuleServiceFactory<ChatPrivacyControlsService>({
    capabilityId: "chat-privacy-controls",
    implementations: {
      live: () =>
        createLiveChatPrivacyControlsService({
          provider: createConfiguredStorageChatPrivacyControlsProvider(),
        }),
      mock: () => createMockChatPrivacyControlsService(),
    },
  });

export function resolveChatConversationMessageService(
  mode?: ModuleMode | string,
) {
  return chatConversationMessageServiceFactory.create(mode);
}

export function createChatConversationMessageService(
  mode?: ModuleMode | string,
): ChatConversationMessageService {
  const resolution = resolveChatConversationMessageService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveChatWritingAssistService(
  mode?: ModuleMode | string,
) {
  return chatWritingAssistServiceFactory.create(mode);
}

export function createChatWritingAssistService(
  mode?: ModuleMode | string,
): ChatWritingAssistService {
  const resolution = resolveChatWritingAssistService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveChatSummaryExtractionService(
  mode?: ModuleMode | string,
) {
  return chatSummaryExtractionServiceFactory.create(mode);
}

export function createChatSummaryExtractionService(
  mode?: ModuleMode | string,
): ChatSummaryExtractionService {
  const resolution = resolveChatSummaryExtractionService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveChatPrivacyControlsService(
  mode?: ModuleMode | string,
) {
  return chatPrivacyControlsServiceFactory.create(mode);
}

export function createChatPrivacyControlsService(
  mode?: ModuleMode | string,
): ChatPrivacyControlsService {
  const resolution = resolveChatPrivacyControlsService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
