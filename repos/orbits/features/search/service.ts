import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  RelationshipNaturalSearchFailure,
  RelationshipNaturalSearchInput,
  RelationshipNaturalSearchInvalidBodyFailure,
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchSuggestionsInput,
  RelationshipNaturalSearchSuggestionsResult,
} from "./contract";

// RelationshipNaturalSearchService 是关系图自然语言搜索的服务边界。
// 它把用户查询转换成可展示结果，不直接暴露底层联系人数据结构。
export interface RelationshipNaturalSearchService {
  // 执行自然语言关系查询。
  queryRelationships: (
    input?: RelationshipNaturalSearchInput,
  ) => RelationshipNaturalSearchResult;
  // 返回搜索建议，帮助 UI 提示可查询的问题类型。
  getSearchSuggestions: (
    input?: RelationshipNaturalSearchSuggestionsInput,
  ) => RelationshipNaturalSearchSuggestionsResult;
  // 请求体不合法时返回领域失败，保持 route 错误结构一致。
  invalidQueryBody: () => RelationshipNaturalSearchInvalidBodyFailure;
}

// 将自然语言搜索失败转换成统一 AppError。
export function relationshipNaturalSearchFailureToAppError(
  failure: RelationshipNaturalSearchFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

// 失败上下文进入 API envelope，用于调试 mock search 边界。
export function relationshipNaturalSearchFailureContext(
  failure: RelationshipNaturalSearchFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock relationship natural search failure came from deterministic fixture rules.",
    relationshipNaturalSearchErrorCode: failure.error.code,
    service: "relationship-natural-search-mock",
  };
}

export type {
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchSuggestionsResult,
};
