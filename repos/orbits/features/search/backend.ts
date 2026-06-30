import type {
  RelationshipNaturalSearchFailure,
  RelationshipNaturalSearchInput,
  RelationshipNaturalSearchInvalidBodyFailure,
  RelationshipNaturalSearchPayload,
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchResultItem,
  RelationshipNaturalSearchScenario,
  RelationshipNaturalSearchSuggestionsInput,
  RelationshipNaturalSearchSuggestionsPayload,
  RelationshipNaturalSearchSuggestionsResult,
} from "./contract";

export const RELATIONSHIP_SEARCH_BACKEND_ENV =
  "ORBIT_RELATIONSHIP_SEARCH_BACKEND" as const;
export const RELATIONSHIP_SEARCH_STORE_ENV =
  "ORBIT_RELATIONSHIP_SEARCH_STORE" as const;

export const RELATIONSHIP_SEARCH_BACKENDS = ["basic_rules"] as const;
export const RELATIONSHIP_SEARCH_STORES = ["fixture"] as const;

export type RelationshipSearchBackendKind =
  (typeof RELATIONSHIP_SEARCH_BACKENDS)[number];
export type RelationshipSearchStoreKind =
  (typeof RELATIONSHIP_SEARCH_STORES)[number];

export interface RelationshipSearchScenarioPayloads {
  empty: RelationshipNaturalSearchPayload;
  pending: RelationshipNaturalSearchPayload;
  success: RelationshipNaturalSearchPayload;
}

export interface RelationshipSearchSuggestionScenarioPayloads {
  empty: RelationshipNaturalSearchSuggestionsPayload;
  pending: RelationshipNaturalSearchSuggestionsPayload;
  success: RelationshipNaturalSearchSuggestionsPayload;
}

export interface RelationshipSearchStore {
  kind: RelationshipSearchStoreKind;
  readFailureProvenance: () => RelationshipNaturalSearchFailure["error"]["provenance"];
  readRelationshipResults: () => readonly RelationshipNaturalSearchResultItem[];
  readScenarioPayloads: () => RelationshipSearchScenarioPayloads;
  readSuggestionScenarioPayloads: () => RelationshipSearchSuggestionScenarioPayloads;
}

export interface RelationshipSearchBackend {
  kind: RelationshipSearchBackendKind;
  getSearchSuggestions: (
    input?: RelationshipNaturalSearchSuggestionsInput,
  ) => RelationshipNaturalSearchSuggestionsResult;
  invalidQueryBody: () => RelationshipNaturalSearchInvalidBodyFailure;
  queryRelationships: (
    input?: RelationshipNaturalSearchInput,
  ) => RelationshipNaturalSearchResult;
}

export type RelationshipSearchConfigurationFailureCode =
  | "unsupported_backend"
  | "unsupported_store";

export interface RelationshipSearchConfigurationFailure {
  code: RelationshipSearchConfigurationFailureCode;
  requestedValue: string;
  success: false;
}

export type RelationshipSearchKindResolution<TKind extends string> =
  | {
      kind: TKind;
      success: true;
    }
  | RelationshipSearchConfigurationFailure;

export type RelationshipSearchBackendResolution =
  RelationshipSearchKindResolution<RelationshipSearchBackendKind>;
export type RelationshipSearchStoreResolution =
  RelationshipSearchKindResolution<RelationshipSearchStoreKind>;

export interface RelationshipSearchBackendOptions {
  store?: RelationshipSearchStore;
  storeKind?: RelationshipSearchStoreKind | string;
}

export interface RelationshipSearchStoreOptions {
  store?: RelationshipSearchStore;
}

export interface RelationshipSearchServiceOptions {
  backendKind?: RelationshipSearchBackendKind | string;
  store?: RelationshipSearchStore;
  storeKind?: RelationshipSearchStoreKind | string;
}

export function isRelationshipSearchScenario(
  value: string,
): value is RelationshipNaturalSearchScenario {
  return ["empty", "failure", "pending", "success"].includes(value);
}
