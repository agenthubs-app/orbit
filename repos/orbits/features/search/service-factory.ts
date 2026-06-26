import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockRelationshipNaturalSearchService } from "./mock-service";
import type { RelationshipNaturalSearchService } from "./service";

export const relationshipNaturalSearchServiceFactory =
  createModuleServiceFactory<RelationshipNaturalSearchService>({
    capabilityId: "relationship-natural-search",
    implementations: {
      mock: () => createMockRelationshipNaturalSearchService(),
    },
  });

export function resolveRelationshipNaturalSearchService(
  mode?: ModuleMode | string,
) {
  return relationshipNaturalSearchServiceFactory.create(mode);
}

export function createRelationshipNaturalSearchService(
  mode?: ModuleMode | string,
): RelationshipNaturalSearchService {
  const resolution = resolveRelationshipNaturalSearchService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
