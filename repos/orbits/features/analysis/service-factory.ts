// Analysis service factory 管理关系价值评分能力。
// 当前实现是 mock scorer，用于把来源证据转换成可解释的 value score 和分类。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockRelationshipValueScoringService } from "./mock-value-service";
import type { RelationshipValueScoringService } from "./value-contract";

export {
  relationshipValueFailureContext,
  relationshipValueFailureToAppError,
} from "./mock-value-service";

export const relationshipValueScoringServiceFactory =
  createModuleServiceFactory<RelationshipValueScoringService>({
    capabilityId: "relationship-value-scoring",
    implementations: {
      mock: () => createMockRelationshipValueScoringService(),
    },
  });

export function resolveRelationshipValueScoringService(
  mode?: ModuleMode | string,
) {
  return relationshipValueScoringServiceFactory.create(mode);
}

export function createRelationshipValueScoringService(
  mode?: ModuleMode | string,
): RelationshipValueScoringService {
  const resolution = resolveRelationshipValueScoringService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
