// Profile service factory 管理用户画像、文档抽取和信号复核队列。
// 当前 mock 不读取真实文档或外部账号，抽取结果来自 fixture 边界。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveProfileDocumentExtractionService } from "./live-extraction-service";
import { createLiveProfileSignalReviewQueueService } from "./live-signal-service";
import { createLiveProfileService } from "./live-service";
import { createMockProfileDocumentExtractionService } from "./mock-extraction-service";
import { createMockProfileService } from "./mock-service";
import { createMockProfileSignalReviewQueueService } from "./mock-signal-service";
import type { ProfileDocumentExtractionService } from "./extraction-contract";
import type { ProfileService } from "./service";
import type { ProfileSignalReviewQueueService } from "./signal-contract";
import { createConfiguredStorageProfileProvider } from "./storage/profile-live-record-provider";
import { createConfiguredStorageProfileSignalProvider } from "./storage/profile-signal-live-record-provider";

export {
  profileDocumentExtractionFailureContext,
  profileDocumentExtractionFailureToAppError,
} from "./mock-extraction-service";
export {
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "./mock-signal-service";

export const profileServiceFactory =
  createModuleServiceFactory<ProfileService>({
    capabilityId: "profile",
    implementations: {
      live: () =>
        createLiveProfileService({
          provider: createConfiguredStorageProfileProvider(),
        }),
      mock: () => createMockProfileService(),
    },
  });

export const profileDocumentExtractionServiceFactory =
  createModuleServiceFactory<ProfileDocumentExtractionService>({
    capabilityId: "profile-document-extraction",
    implementations: {
      live: () => createLiveProfileDocumentExtractionService(),
      mock: () => createMockProfileDocumentExtractionService(),
    },
  });

export const profileSignalReviewQueueServiceFactory =
  createModuleServiceFactory<ProfileSignalReviewQueueService>({
    capabilityId: "profile-signal-review-queue",
    implementations: {
      live: () =>
        createLiveProfileSignalReviewQueueService({
          provider: createConfiguredStorageProfileSignalProvider(),
        }),
      mock: () => createMockProfileSignalReviewQueueService(),
    },
  });

export function resolveProfileService(mode?: ModuleMode | string) {
  return profileServiceFactory.create(mode);
}

export function createProfileService(mode?: ModuleMode | string): ProfileService {
  const resolution = resolveProfileService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveProfileDocumentExtractionService(
  mode?: ModuleMode | string,
) {
  return profileDocumentExtractionServiceFactory.create(mode);
}

export function createProfileDocumentExtractionService(
  mode?: ModuleMode | string,
): ProfileDocumentExtractionService {
  const resolution = resolveProfileDocumentExtractionService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveProfileSignalReviewQueueService(
  mode?: ModuleMode | string,
) {
  return profileSignalReviewQueueServiceFactory.create(mode);
}

export function createProfileSignalReviewQueueService(
  mode?: ModuleMode | string,
): ProfileSignalReviewQueueService {
  const resolution = resolveProfileSignalReviewQueueService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
