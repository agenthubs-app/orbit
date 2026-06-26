import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockChatWritingAssistService } from "./mock-assist-service";
import { createMockChatPrivacyControlsService } from "./mock-privacy-service";
import { createMockChatConversationMessageService } from "./mock-service";
import { createMockChatSummaryExtractionService } from "./mock-summary-service";
import type { ChatWritingAssistService } from "./assist-contract";
import type { ChatPrivacyControlsService } from "./privacy-contract";
import type { ChatConversationMessageService } from "./service";
import type { ChatSummaryExtractionService } from "./summary-contract";

export const chatConversationMessageServiceFactory =
  createModuleServiceFactory<ChatConversationMessageService>({
    capabilityId: "chat-conversation-message",
    implementations: {
      mock: () => createMockChatConversationMessageService(),
    },
  });

export const chatWritingAssistServiceFactory =
  createModuleServiceFactory<ChatWritingAssistService>({
    capabilityId: "chat-writing-assist",
    implementations: {
      mock: () => createMockChatWritingAssistService(),
    },
  });

export const chatSummaryExtractionServiceFactory =
  createModuleServiceFactory<ChatSummaryExtractionService>({
    capabilityId: "chat-summary-extraction",
    implementations: {
      mock: () => createMockChatSummaryExtractionService(),
    },
  });

export const chatPrivacyControlsServiceFactory =
  createModuleServiceFactory<ChatPrivacyControlsService>({
    capabilityId: "chat-privacy-controls",
    implementations: {
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
