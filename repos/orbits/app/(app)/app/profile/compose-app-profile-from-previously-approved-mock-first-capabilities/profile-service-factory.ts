import type { ProfileDocumentExtractionService } from "../../../../../features/profile/extraction-contract";
import type { ProfileService } from "../../../../../features/profile/service";
import {
  createProfileDocumentExtractionService,
  createProfileService,
  createProfileSignalReviewQueueService,
} from "../../../../../features/profile/service-factory";
import type { ProfileSignalReviewQueueService } from "../../../../../features/profile/signal-contract";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

// Profile 页面由手动资料、文档草稿策略和信号复核队列共同组成。
// 页面级 bundle 避免 route model 直接散落多个 feature factory 调用。
export interface AppProfileRouteServices {
  extractionService: ProfileDocumentExtractionService;
  profileService: ProfileService;
  signalService: ProfileSignalReviewQueueService;
}

export const appProfileProfileServiceFactory =
  createModuleServiceFactory<ProfileService>({
    capabilityId: "app-profile:manual-profile",
    implementations: {
      live: ({ requestedMode }) => createProfileService(requestedMode),
      mock: ({ requestedMode }) => createProfileService(requestedMode),
    },
  });

export const appProfileDocumentExtractionServiceFactory =
  createModuleServiceFactory<ProfileDocumentExtractionService>({
    capabilityId: "app-profile:document-extraction",
    implementations: {
      live: ({ requestedMode }) =>
        createProfileDocumentExtractionService(requestedMode),
      mock: ({ requestedMode }) =>
        createProfileDocumentExtractionService(requestedMode),
    },
  });

export const appProfileSignalServiceFactory =
  createModuleServiceFactory<ProfileSignalReviewQueueService>({
    capabilityId: "app-profile:signal-review-queue",
    implementations: {
      live: ({ requestedMode }) =>
        createProfileSignalReviewQueueService(requestedMode),
      mock: ({ requestedMode }) =>
        createProfileSignalReviewQueueService(requestedMode),
    },
  });

export function resolveAppProfileRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppProfileRouteServices> {
  const profileResolution = appProfileProfileServiceFactory.create(mode);
  const extractionResolution =
    appProfileDocumentExtractionServiceFactory.create(mode);
  const signalResolution = appProfileSignalServiceFactory.create(mode);

  if (profileResolution.success === false) {
    return profileResolution;
  }

  if (extractionResolution.success === false) {
    return extractionResolution;
  }

  if (signalResolution.success === false) {
    return signalResolution;
  }

  return {
    success: true,
    mode: profileResolution.mode,
    service: {
      extractionService: extractionResolution.service,
      profileService: profileResolution.service,
      signalService: signalResolution.service,
    },
  };
}

export function createAppProfileRouteServices(
  mode?: ModuleMode | string,
): AppProfileRouteServices {
  const resolution = resolveAppProfileRouteServices(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
