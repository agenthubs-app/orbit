import { createChatWritingAssistService } from "../../../../../features/chat/service-factory";
import { createChatPrivacyControlsService } from "../../../../../features/chat/service-factory";
import { createChatConversationMessageService } from "../../../../../features/chat/service-factory";
import { createChatSummaryExtractionService } from "../../../../../features/chat/service-factory";
import type { ChatWritingAssistService } from "../../../../../features/chat/assist-contract";
import type { ChatPrivacyControlsService } from "../../../../../features/chat/privacy-contract";
import type { ChatSummaryExtractionService } from "../../../../../features/chat/summary-contract";
import type { ChatConversationMessageService } from "../../../../../features/chat/service";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

export interface AppChatRouteServices {
  conversationService: ChatConversationMessageService;
  writingAssistService: ChatWritingAssistService;
  summaryExtractionService: ChatSummaryExtractionService;
  privacyControlsService: ChatPrivacyControlsService;
}

export const appChatConversationServiceFactory =
  createModuleServiceFactory<ChatConversationMessageService>({
    capabilityId: "chat-conversations",
    implementations: {
      mock: () => createChatConversationMessageService(),
    },
  });

export const appChatWritingAssistServiceFactory =
  createModuleServiceFactory<ChatWritingAssistService>({
    capabilityId: "chat-writing-assist",
    implementations: {
      mock: () => createChatWritingAssistService(),
    },
  });

export const appChatSummaryExtractionServiceFactory =
  createModuleServiceFactory<ChatSummaryExtractionService>({
    capabilityId: "chat-summary-extraction",
    implementations: {
      mock: () => createChatSummaryExtractionService(),
    },
  });

export const appChatPrivacyControlsServiceFactory =
  createModuleServiceFactory<ChatPrivacyControlsService>({
    capabilityId: "chat-privacy-controls",
    implementations: {
      mock: () => createChatPrivacyControlsService(),
    },
  });

export function resolveAppChatRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppChatRouteServices> {
  const conversationResolution = appChatConversationServiceFactory.create(mode);
  const writingAssistResolution =
    appChatWritingAssistServiceFactory.create(mode);
  const summaryExtractionResolution =
    appChatSummaryExtractionServiceFactory.create(mode);
  const privacyControlsResolution =
    appChatPrivacyControlsServiceFactory.create(mode);
  const failedResolution = [
    conversationResolution,
    writingAssistResolution,
    summaryExtractionResolution,
    privacyControlsResolution,
  ].find((resolution) => resolution.success === false);

  if (failedResolution?.success === false) {
    return failedResolution;
  }

  if (
    conversationResolution.success === false ||
    writingAssistResolution.success === false ||
    summaryExtractionResolution.success === false ||
    privacyControlsResolution.success === false
  ) {
    return {
      success: false,
      error: {
        availableModes: [],
        capabilityId: "chat",
        code: "NOT_IMPLEMENTED",
        message: "Chat page services are unavailable in the requested mode.",
        requestedMode: "mock",
      },
    };
  }

  return {
    success: true,
    mode: conversationResolution.mode,
    service: {
      conversationService: conversationResolution.service,
      privacyControlsService: privacyControlsResolution.service,
      summaryExtractionService: summaryExtractionResolution.service,
      writingAssistService: writingAssistResolution.service,
    },
  };
}

export function createAppChatRouteServices(): AppChatRouteServices {
  const resolution = resolveAppChatRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
