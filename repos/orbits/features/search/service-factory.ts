// Search service factory 管理自然语言关系搜索能力。
// 当前 mock 不读搜索索引，只在 fixture 范围内返回可解释的关系搜索结果。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createConfiguredLiveRelationshipNaturalSearchService } from "./live-service";
import { createMockRelationshipNaturalSearchService } from "./mock-service";
import type { RelationshipNaturalSearchService } from "./service";

export const relationshipNaturalSearchServiceFactory =
  createModuleServiceFactory<RelationshipNaturalSearchService>({
    capabilityId: "relationship-natural-search",
    implementations: {
      live: () => createConfiguredLiveRelationshipNaturalSearchService(),
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
