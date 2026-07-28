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
  type RelationshipNaturalSearchPayload,
  type RelationshipNaturalSearchResult,
  type RelationshipNaturalSearchResultItem,
  type RelationshipNaturalSearchScenario,
  type RelationshipNaturalSearchSourceType,
  type RelationshipNaturalSearchSuggestionsInput,
  type RelationshipNaturalSearchSuggestionsPayload,
  type RelationshipNaturalSearchSuggestionsResult,
  type RelationshipNaturalSearchValueType,
} from "../contract";
import { buildRelationshipNaturalSearchPayload } from "../fixtures";
import type {
  RelationshipSearchBackend,
  RelationshipSearchStore,
} from "../backend";

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

function success(
  payload: RelationshipNaturalSearchPayload,
): RelationshipNaturalSearchResult {
  return {
    success: true,
    data: payload,
  };
}

function suggestionsSuccess(
  payload: RelationshipNaturalSearchSuggestionsPayload,
): RelationshipNaturalSearchSuggestionsResult {
  return {
    success: true,
    data: payload,
  };
}

function failure(
  store: RelationshipSearchStore,
  code: RelationshipNaturalSearchErrorCode,
): RelationshipNaturalSearchFailure {
  const definition = RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS[code];
  const provenance = store.readFailureProvenance();

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function invalidQueryBodyFailure(
  store: RelationshipSearchStore,
): RelationshipNaturalSearchInvalidBodyFailure {
  return failure(
    store,
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
  store: RelationshipSearchStore,
  input: RelationshipNaturalSearchInput,
): RelationshipNaturalSearchFailure | null {
  if (
    input.businessIntent &&
    !supportedBusinessIntents.has(
      input.businessIntent as RelationshipNaturalSearchBusinessIntent,
    )
  ) {
    return failure(store, "RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED");
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
    return failure(store, "RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED");
  }

  return null;
}

function scenarioResult(
  store: RelationshipSearchStore,
  scenario: RelationshipNaturalSearchScenario,
): RelationshipNaturalSearchResult | null {
  const payloads = store.readScenarioPayloads();

  switch (scenario) {
    case "empty":
      return success(payloads.empty);
    case "pending":
      return success(payloads.pending);
    case "failure":
      return failure(store, "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function suggestionsScenarioResult(
  store: RelationshipSearchStore,
  scenario: RelationshipNaturalSearchScenario,
): RelationshipNaturalSearchSuggestionsResult | null {
  const payloads = store.readSuggestionScenarioPayloads();

  switch (scenario) {
    case "empty":
      return suggestionsSuccess(payloads.empty);
    case "pending":
      return suggestionsSuccess(payloads.pending);
    case "failure":
      return failure(store, "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function queryTokens(query?: string | null): string[] {
  const normalizedQuery = query?.normalize("NFKC").toLowerCase().trim();

  if (!normalizedQuery) {
    return [];
  }

  const segmentedWords = [
    ...new Intl.Segmenter("zh", { granularity: "word" }).segment(
      normalizedQuery,
    ),
  ]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment.trim())
    .filter(Boolean);

  if (segmentedWords.length > 0) {
    return segmentedWords;
  }

  const segments =
    normalizedQuery.match(/\p{Script=Han}+|[\p{L}\p{N}]+/gu) ?? [];

  return segments.flatMap((segment) => {
    if (!/^\p{Script=Han}+$/u.test(segment) || [...segment].length <= 2) {
      return segment;
    }

    const characters = [...segment];

    return characters
      .slice(0, -1)
      .map((character, index) => `${character}${characters[index + 1]}`);
  });
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

function buildStorePayload(
  store: RelationshipSearchStore,
  input: {
    input?: RelationshipNaturalSearchInput;
    results: readonly RelationshipNaturalSearchResultItem[];
    state?: RelationshipNaturalSearchPayload["state"];
  },
): RelationshipNaturalSearchPayload {
  return store.buildRelationshipPayload?.(input) ??
    buildRelationshipNaturalSearchPayload(input);
}

function dedupeRelationshipResults(
  results: readonly RelationshipNaturalSearchResultItem[],
): readonly RelationshipNaturalSearchResultItem[] {
  const resultByContact = new Map<
    string,
    RelationshipNaturalSearchResultItem
  >();

  for (const result of results) {
    const current = resultByContact.get(result.contactId);

    if (
      !current ||
      result.matchScore.value > current.matchScore.value ||
      (result.matchScore.value === current.matchScore.value &&
        result.value.score > current.value.score) ||
      (result.matchScore.value === current.matchScore.value &&
        result.value.score === current.value.score &&
        result.id.localeCompare(current.id) < 0)
    ) {
      resultByContact.set(result.contactId, result);
    }
  }

  return [...resultByContact.values()];
}

function runRelationshipNaturalSearch(
  store: RelationshipSearchStore,
  input: RelationshipNaturalSearchInput = {},
): RelationshipNaturalSearchResult {
  const resolvedScenario = scenarioResult(store, normalizeScenario(input.scenario));

  if (resolvedScenario) {
    return resolvedScenario;
  }

  const unsupported = unsupportedFilterFailure(store, input);

  if (unsupported) {
    return unsupported;
  }

  const allResults = store.readRelationshipResults();
  const matchingResults = dedupeRelationshipResults(
    hasSearchInput(input)
      ? allResults.filter((item) =>
          matchesRelationshipSearchInput(item, input),
        )
      : allResults,
  );

  return success(
    buildStorePayload(store, {
      input,
      results: matchingResults,
      state: matchingResults.length > 0 ? "success" : "empty",
    }),
  );
}

export function createBasicRulesRelationshipSearchBackend(input: {
  store: RelationshipSearchStore;
}): RelationshipSearchBackend {
  const { store } = input;

  return {
    kind: "basic_rules",

    getSearchSuggestions(
      request: RelationshipNaturalSearchSuggestionsInput = {},
    ): RelationshipNaturalSearchSuggestionsResult {
      const scenario = suggestionsScenarioResult(
        store,
        normalizeScenario(request.scenario),
      );

      return scenario ?? suggestionsSuccess(
        store.readSuggestionScenarioPayloads().success,
      );
    },

    invalidQueryBody(): RelationshipNaturalSearchInvalidBodyFailure {
      return invalidQueryBodyFailure(store);
    },

    queryRelationships(
      request: RelationshipNaturalSearchInput = {},
    ): RelationshipNaturalSearchResult {
      return runRelationshipNaturalSearch(store, request);
    },
  };
}
