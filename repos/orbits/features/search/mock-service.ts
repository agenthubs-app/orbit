import {
  createBackendRelationshipNaturalSearchService,
} from "./backend-factory";
import type { RelationshipSearchServiceOptions } from "./backend";
import type { RelationshipNaturalSearchService } from "./service";

// 兼容旧入口：调用方仍可创建 mock search service，但内部已经通过
// RelationshipSearchBackend + RelationshipSearchStore 组合出基础实现。
export function createMockRelationshipNaturalSearchService(
  options: RelationshipSearchServiceOptions = {},
): RelationshipNaturalSearchService {
  return createBackendRelationshipNaturalSearchService(options);
}

export type {
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchSuggestionsResult,
} from "./contract";
export type { RelationshipNaturalSearchService } from "./service";
