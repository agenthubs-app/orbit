import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockRelationshipStageAndProfileService } from "./mock-profile-service";
import { createMockConnectionEvidenceService } from "./mock-service";
import type { RelationshipStageAndProfileService } from "./profile-contract";
import type { ConnectionEvidenceService } from "./service";

export {
  relationshipProfileFailureContext,
  relationshipProfileFailureToAppError,
} from "./mock-profile-service";

export const connectionEvidenceServiceFactory =
  createModuleServiceFactory<ConnectionEvidenceService>({
    capabilityId: "connection-evidence",
    implementations: {
      mock: () => createMockConnectionEvidenceService(),
    },
  });

export const relationshipStageAndProfileServiceFactory =
  createModuleServiceFactory<RelationshipStageAndProfileService>({
    capabilityId: "relationship-stage-profile",
    implementations: {
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
