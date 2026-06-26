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
  return (
    query
      ?.toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean) ?? []
  );
}

function itemSearchText(item: RelationshipNaturalSearchResultItem): string {
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
