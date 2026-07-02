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

// Chat 页面同时依赖消息线程、写作辅助、摘要抽取和隐私控制。
// 这里把它们聚合成页面级 service bundle，避免组件散落地 import feature factory。
export interface AppChatRouteServices {
  conversationService: ChatConversationMessageService;
  writingAssistService: ChatWritingAssistService;
  summaryExtractionService: ChatSummaryExtractionService;
  privacyControlsService: ChatPrivacyControlsService;
}

// 页面级 factory 使用 capabilityId 记录模块边界，后续接 live service 时集中替换这里。
export const appChatConversationServiceFactory =
  createModuleServiceFactory<ChatConversationMessageService>({
    capabilityId: "chat-conversations",
    implementations: {
      live: ({ requestedMode }) =>
        createChatConversationMessageService(requestedMode),
      mock: ({ requestedMode }) =>
        createChatConversationMessageService(requestedMode),
    },
  });

export const appChatWritingAssistServiceFactory =
  createModuleServiceFactory<ChatWritingAssistService>({
    capabilityId: "chat-writing-assist",
    implementations: {
      live: ({ requestedMode }) =>
        createChatWritingAssistService(requestedMode),
      mock: ({ requestedMode }) =>
        createChatWritingAssistService(requestedMode),
    },
  });

export const appChatSummaryExtractionServiceFactory =
  createModuleServiceFactory<ChatSummaryExtractionService>({
    capabilityId: "chat-summary-extraction",
    implementations: {
      live: ({ requestedMode }) =>
        createChatSummaryExtractionService(requestedMode),
      mock: ({ requestedMode }) =>
        createChatSummaryExtractionService(requestedMode),
    },
  });

export const appChatPrivacyControlsServiceFactory =
  createModuleServiceFactory<ChatPrivacyControlsService>({
    capabilityId: "chat-privacy-controls",
    implementations: {
      live: ({ requestedMode }) =>
        createChatPrivacyControlsService(requestedMode),
      mock: ({ requestedMode }) =>
        createChatPrivacyControlsService(requestedMode),
    },
  });

export function resolveAppChatRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppChatRouteServices> {
  // 逐个解析子能力；如果某个能力在指定 mode 下不可用，直接返回该失败原因。
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

  // 这个分支服务 TypeScript 收窄，也给异常模式保留统一的 chat 级错误。
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

  // 所有子服务解析成功后，页面只拿这一份聚合对象。
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
  // 页面组件使用 throwing 版本；需要无异常控制流的地方用 resolveAppChatRouteServices。
  const resolution = resolveAppChatRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
