import {
  RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS,
  RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS,
  RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES,
  RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES,
  RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
  RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES,
  type RelationshipNaturalSearchBusinessIntent,
  type RelationshipNaturalSearchErrorCode,
  type RelationshipNaturalSearchFailure,
  type RelationshipNaturalSearchFollowUpStatus,
  type RelationshipNaturalSearchIndustry,
  type RelationshipNaturalSearchInput,
  type RelationshipNaturalSearchInvalidBodyFailure,
  type RelationshipNaturalSearchResult,
  type RelationshipNaturalSearchResultItem,
  type RelationshipNaturalSearchScenario,
  type RelationshipNaturalSearchSourceType,
  type RelationshipNaturalSearchSuggestionsInput,
  type RelationshipNaturalSearchSuggestionsResult,
  type RelationshipNaturalSearchValueType,
} from "./contract";
import {
  buildRelationshipNaturalSearchPayload,
  mockEmptyRelationshipNaturalSearchFixture,
  mockEmptyRelationshipNaturalSearchSuggestionsFixture,
  mockPendingRelationshipNaturalSearchFixture,
  mockPendingRelationshipNaturalSearchSuggestionsFixture,
  mockRelationshipNaturalSearchFailureProvenance,
  mockRelationshipNaturalSearchFixture,
  mockRelationshipNaturalSearchResults,
  mockRelationshipNaturalSearchSuggestionsFixture,
} from "./fixtures";
import type { RelationshipNaturalSearchService } from "./service";

// RelationshipNaturalSearch mock service 模拟自然语言关系搜索。
// 它使用本地 token/filter 匹配 fixtures，不调用向量库、全文索引或 live database。
const supportedScenarios = new Set<RelationshipNaturalSearchScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const supportedBusinessIntents =
  new Set<RelationshipNaturalSearchBusinessIntent>(
    RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS,
  );
const supportedIndustries = new Set<RelationshipNaturalSearchIndustry>(
  RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES,
);
const supportedSources = new Set<RelationshipNaturalSearchSourceType>(
  RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
);
const supportedValueTypes = new Set<RelationshipNaturalSearchValueType>(
  RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES,
);
const supportedFollowUpStatuses =
  new Set<RelationshipNaturalSearchFollowUpStatus>(
    RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES,
  );

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 搜索结果会被 UI 高亮/排序，返回 clone 防止修改全局 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: typeof mockRelationshipNaturalSearchFixture,
): RelationshipNaturalSearchResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function suggestionsSuccess(
  payload: typeof mockRelationshipNaturalSearchSuggestionsFixture,
): RelationshipNaturalSearchSuggestionsResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: RelationshipNaturalSearchErrorCode,
): RelationshipNaturalSearchFailure {
  // 失败结果使用 mock search provenance，说明没有执行真实搜索后端。
  const definition = RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockRelationshipNaturalSearchFailureProvenance,
      evidenceIds: mockRelationshipNaturalSearchFailureProvenance.evidenceIds,
    },
  };
}

function invalidQueryBodyFailure(): RelationshipNaturalSearchInvalidBodyFailure {
  return failure(
    "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY",
  ) as RelationshipNaturalSearchInvalidBodyFailure;
}

function normalizeScenario(
  scenario?: RelationshipNaturalSearchInput["scenario"],
): RelationshipNaturalSearchScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as RelationshipNaturalSearchScenario)
  ) {
    return scenario as RelationshipNaturalSearchScenario;
  }

  return "success";
}

function normalizedValues(values?: readonly string[] | null): string[] {
  return (
    values
      ?.map((value) => value.trim())
      .filter((value) => value.length > 0) ?? []
  );
}

function hasUnsupportedValue<TValue extends string>(
  values: readonly string[],
  supportedValues: ReadonlySet<TValue>,
): boolean {
  return values.some((value) => !supportedValues.has(value as TValue));
}

function unsupportedFilterFailure(
  input: RelationshipNaturalSearchInput,
): RelationshipNaturalSearchFailure | null {
  // filter 是 contract 白名单；不支持的过滤值直接失败，避免静默返回误导性结果。
  if (
    input.businessIntent &&
    !supportedBusinessIntents.has(
      input.businessIntent as RelationshipNaturalSearchBusinessIntent,
    )
  ) {
    return failure("RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED");
  }

  if (
    hasUnsupportedValue(
      normalizedValues(input.industryFilters),
      supportedIndustries,
    ) ||
    hasUnsupportedValue(normalizedValues(input.sourceFilters), supportedSources) ||
    hasUnsupportedValue(
      normalizedValues(input.valueTypeFilters),
      supportedValueTypes,
    ) ||
    hasUnsupportedValue(
      normalizedValues(input.followUpStatusFilters),
      supportedFollowUpStatuses,
    )
  ) {
    return failure("RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED");
  }

  return null;
}

function scenarioResult(
  scenario: RelationshipNaturalSearchScenario,
): RelationshipNaturalSearchResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyRelationshipNaturalSearchFixture);
    case "pending":
      return success(mockPendingRelationshipNaturalSearchFixture);
    case "failure":
      return failure("RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function suggestionsScenarioResult(
  scenario: RelationshipNaturalSearchScenario,
): RelationshipNaturalSearchSuggestionsResult | null {
  switch (scenario) {
    case "empty":
      return suggestionsSuccess(mockEmptyRelationshipNaturalSearchSuggestionsFixture);
    case "pending":
      return suggestionsSuccess(
        mockPendingRelationshipNaturalSearchSuggestionsFixture,
      );
    case "failure":
      return failure("RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function queryTokens(query?: string | null): string[] {
  // 自然语言查询被拆成小写 token；所有 token 都必须在 itemSearchText 中命中。
  return (
    query
      ?.toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean) ?? []
  );
}

function itemSearchText(item: RelationshipNaturalSearchResultItem): string {
  // 搜索文本显式包含身份、组织、上下文、意图、价值类型和 evidence excerpt。
  return [
    item.displayName,
    item.role,
    item.organization,
    item.industry,
    item.relationshipContext,
    item.recommendedAction,
    item.followUpStatus,
    item.source.type,
    ...item.matchedBusinessIntents,
    ...item.value.valueTypes,
    ...item.evidence.map((evidence) => evidence.excerpt),
  ]
    .join(" ")
    .toLowerCase();
}

function matchesQuery(
  item: RelationshipNaturalSearchResultItem,
  query?: string | null,
): boolean {
  const tokens = queryTokens(query);

  if (tokens.length === 0) {
    return true;
  }

  const searchText = itemSearchText(item);

  return tokens.every((token) => searchText.includes(token));
}

function matchesAny<TValue extends string>(
  currentValues: readonly TValue[],
  requestedValues?: readonly string[] | null,
): boolean {
  const normalized = normalizedValues(requestedValues);

  if (normalized.length === 0) {
    return true;
  }

  return normalized.some((value) => currentValues.includes(value as TValue));
}

function matchesRelationshipSearchInput(
  item: RelationshipNaturalSearchResultItem,
  input: RelationshipNaturalSearchInput,
): boolean {
  // query 与各类 filters 是 AND 关系；同一 filter 数组内部是 OR 关系。
  return (
    matchesQuery(item, input.query) &&
    (!input.businessIntent ||
      item.matchedBusinessIntents.includes(
        input.businessIntent as RelationshipNaturalSearchBusinessIntent,
      )) &&
    matchesAny([item.industry], input.industryFilters) &&
    matchesAny([item.source.type], input.sourceFilters) &&
    matchesAny(item.value.valueTypes, input.valueTypeFilters) &&
    matchesAny([item.followUpStatus], input.followUpStatusFilters)
  );
}

function hasSearchInput(input: RelationshipNaturalSearchInput): boolean {
  return (
    Boolean(input.query?.trim()) ||
    Boolean(input.businessIntent) ||
    Boolean(input.industryFilters?.length) ||
    Boolean(input.sourceFilters?.length) ||
    Boolean(input.valueTypeFilters?.length) ||
    Boolean(input.followUpStatusFilters?.length)
  );
}

function runRelationshipNaturalSearch(
  input: RelationshipNaturalSearchInput = {},
): RelationshipNaturalSearchResult {
  // 没有任何搜索输入时返回默认 fixture；有输入时按本地规则重新构建 payload。
  const resolvedScenario = scenarioResult(normalizeScenario(input.scenario));

  if (resolvedScenario) {
    return resolvedScenario;
  }

  const unsupported = unsupportedFilterFailure(input);

  if (unsupported) {
    return unsupported;
  }

  if (!hasSearchInput(input)) {
    return success(mockRelationshipNaturalSearchFixture);
  }

  const matchingResults = mockRelationshipNaturalSearchResults.filter((item) =>
    matchesRelationshipSearchInput(item, input),
  );

  return success(
    buildRelationshipNaturalSearchPayload({
      input,
      results: matchingResults,
      state: matchingResults.length > 0 ? "success" : "empty",
    }),
  );
}

export function createMockRelationshipNaturalSearchService(): RelationshipNaturalSearchService {
  // suggestions 是独立的轻量接口，只受 scenario 控制，不执行搜索过滤。
  return {
    queryRelationships(input = {}): RelationshipNaturalSearchResult {
      return runRelationshipNaturalSearch(input);
    },

    getSearchSuggestions(
      input: RelationshipNaturalSearchSuggestionsInput = {},
    ): RelationshipNaturalSearchSuggestionsResult {
      const scenario = suggestionsScenarioResult(
        normalizeScenario(input.scenario),
      );

      return scenario ?? suggestionsSuccess(
        mockRelationshipNaturalSearchSuggestionsFixture,
      );
    },

    invalidQueryBody(): RelationshipNaturalSearchInvalidBodyFailure {
      return invalidQueryBodyFailure();
    },
  };
}

export type {
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchService,
  RelationshipNaturalSearchSuggestionsResult,
};
