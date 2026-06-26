import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockMessageDraftGeneratorService } from "./mock-message-draft-service";
import { createMockFollowupTaskGenerationService } from "./mock-service";
import type { MessageDraftGeneratorService } from "./message-draft-contract";
import type { FollowupTaskGenerationService } from "./service";

export const followupTaskGenerationServiceFactory =
  createModuleServiceFactory<FollowupTaskGenerationService>({
    capabilityId: "followup-task-generation",
    implementations: {
      mock: () => createMockFollowupTaskGenerationService(),
    },
  });

export const messageDraftGeneratorServiceFactory =
  createModuleServiceFactory<MessageDraftGeneratorService>({
    capabilityId: "message-draft-generator",
    implementations: {
      mock: () => createMockMessageDraftGeneratorService(),
    },
  });

export function resolveFollowupTaskGenerationService(
  mode?: ModuleMode | string,
) {
  return followupTaskGenerationServiceFactory.create(mode);
}

export function createFollowupTaskGenerationService(
  mode?: ModuleMode | string,
): FollowupTaskGenerationService {
  const resolution = resolveFollowupTaskGenerationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveMessageDraftGeneratorService(
  mode?: ModuleMode | string,
) {
  return messageDraftGeneratorServiceFactory.create(mode);
}

export function createMessageDraftGeneratorService(
  mode?: ModuleMode | string,
): MessageDraftGeneratorService {
  const resolution = resolveMessageDraftGeneratorService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
