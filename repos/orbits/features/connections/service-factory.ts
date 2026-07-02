// Connections service factory 管理关系证据和关系阶段/画像能力。
// mock 实现把来源证据转成可解释的关系状态，不读取真实 CRM 或通讯录。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveConnectionEvidenceService } from "./live-service";
import { createLiveRelationshipStageAndProfileService } from "./live-profile-service";
import { createMockRelationshipStageAndProfileService } from "./mock-profile-service";
import { createMockConnectionEvidenceService } from "./mock-service";
import type { RelationshipStageAndProfileService } from "./profile-contract";
import { createConfiguredStorageConnectionEvidenceProvider } from "./storage/connection-live-record-provider";
import type { ConnectionEvidenceService } from "./service";

export {
  relationshipProfileFailureContext,
  relationshipProfileFailureToAppError,
} from "./mock-profile-service";

export const connectionEvidenceServiceFactory =
  createModuleServiceFactory<ConnectionEvidenceService>({
    capabilityId: "connection-evidence",
    implementations: {
      live: () =>
        createLiveConnectionEvidenceService({
          provider: createConfiguredStorageConnectionEvidenceProvider(),
        }),
      mock: () => createMockConnectionEvidenceService(),
    },
  });

export const relationshipStageAndProfileServiceFactory =
  createModuleServiceFactory<RelationshipStageAndProfileService>({
    capabilityId: "relationship-stage-profile",
    implementations: {
      live: () =>
        createLiveRelationshipStageAndProfileService({
          provider: createConfiguredStorageConnectionEvidenceProvider(),
        }),
      mock: () => createMockRelationshipStageAndProfileService(),
    },
  });

export function resolveConnectionEvidenceService(
  mode?: ModuleMode | string,
) {
  return connectionEvidenceServiceFactory.create(mode);
}

export function createConnectionEvidenceService(
  mode?: ModuleMode | string,
): ConnectionEvidenceService {
  const resolution = resolveConnectionEvidenceService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveRelationshipStageAndProfileService(
  mode?: ModuleMode | string,
) {
  return relationshipStageAndProfileServiceFactory.create(mode);
}

export function createRelationshipStageAndProfileService(
  mode?: ModuleMode | string,
): RelationshipStageAndProfileService {
  const resolution = resolveRelationshipStageAndProfileService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
