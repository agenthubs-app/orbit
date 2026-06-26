import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockProfileDocumentExtractionService } from "./mock-extraction-service";
import { createMockProfileService } from "./mock-service";
import { createMockProfileSignalReviewQueueService } from "./mock-signal-service";
import type { ProfileDocumentExtractionService } from "./extraction-contract";
import type { ProfileService } from "./service";
import type { ProfileSignalReviewQueueService } from "./signal-contract";

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
      mock: () => createMockProfileService(),
    },
  });

export const profileDocumentExtractionServiceFactory =
  createModuleServiceFactory<ProfileDocumentExtractionService>({
    capabilityId: "profile-document-extraction",
    implementations: {
      mock: () => createMockProfileDocumentExtractionService(),
    },
  });

export const profileSignalReviewQueueServiceFactory =
  createModuleServiceFactory<ProfileSignalReviewQueueService>({
    capabilityId: "profile-signal-review-queue",
    implementations: {
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
