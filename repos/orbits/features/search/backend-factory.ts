import {
  RELATIONSHIP_SEARCH_BACKEND_ENV,
  RELATIONSHIP_SEARCH_BACKENDS,
  RELATIONSHIP_SEARCH_STORE_ENV,
  RELATIONSHIP_SEARCH_STORES,
  type RelationshipSearchBackend,
  type RelationshipSearchBackendKind,
  type RelationshipSearchBackendResolution,
  type RelationshipSearchConfigurationFailure,
  type RelationshipSearchServiceOptions,
  type RelationshipSearchStore,
  type RelationshipSearchStoreKind,
  type RelationshipSearchStoreResolution,
} from "./backend";
import { RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS } from "./contract";
import type {
  RelationshipNaturalSearchErrorCode,
  RelationshipNaturalSearchFailure,
  RelationshipNaturalSearchInvalidBodyFailure,
} from "./contract";
import { createBasicRulesRelationshipSearchBackend } from "./backends/basic-rules-backend";
import { createFixtureRelationshipSearchStore } from "./stores/fixture-store";
import type { RelationshipNaturalSearchService } from "./service";

export {
  RELATIONSHIP_SEARCH_BACKEND_ENV,
  RELATIONSHIP_SEARCH_BACKENDS,
  RELATIONSHIP_SEARCH_STORE_ENV,
  RELATIONSHIP_SEARCH_STORES,
};

function isBackendKind(value: string): value is RelationshipSearchBackendKind {
  return RELATIONSHIP_SEARCH_BACKENDS.includes(
    value as RelationshipSearchBackendKind,
  );
}

function isStoreKind(value: string): value is RelationshipSearchStoreKind {
  return RELATIONSHIP_SEARCH_STORES.includes(value as RelationshipSearchStoreKind);
}

function normalizeSelector(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

export function resolveRelationshipSearchBackendKind(
  value = process.env[RELATIONSHIP_SEARCH_BACKEND_ENV],
): RelationshipSearchBackendResolution {
  const requestedValue = normalizeSelector(value);

  if (!requestedValue) {
    return {
      kind: "basic_rules",
      success: true,
    };
  }

  if (isBackendKind(requestedValue)) {
    return {
      kind: requestedValue,
      success: true,
    };
  }

  return {
    code: "unsupported_backend",
    requestedValue,
    success: false,
  };
}

export function resolveRelationshipSearchStoreKind(
  value = process.env[RELATIONSHIP_SEARCH_STORE_ENV],
): RelationshipSearchStoreResolution {
  const requestedValue = normalizeSelector(value);

  if (!requestedValue) {
    return {
      kind: "fixture",
      success: true,
    };
  }

  if (isStoreKind(requestedValue)) {
    return {
      kind: requestedValue,
      success: true,
    };
  }

  return {
    code: "unsupported_store",
    requestedValue,
    success: false,
  };
}

function configurationErrorCode(
  failure: RelationshipSearchConfigurationFailure,
): RelationshipNaturalSearchErrorCode {
  return failure.code === "unsupported_backend"
    ? "RELATIONSHIP_NATURAL_SEARCH_BACKEND_NOT_SUPPORTED"
    : "RELATIONSHIP_NATURAL_SEARCH_STORE_NOT_SUPPORTED";
}

function isConfigurationFailure(
  value: RelationshipSearchStore | RelationshipSearchConfigurationFailure,
): value is RelationshipSearchConfigurationFailure {
  return "success" in value && value.success === false;
}

function configurationFailure(
  failure: RelationshipSearchConfigurationFailure,
): RelationshipNaturalSearchFailure {
  const definition =
    RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS[
      configurationErrorCode(failure)
    ];
  const provenance = createFixtureRelationshipSearchStore().readFailureProvenance();

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

function createConfigurationFailureBackend(
  failure: RelationshipSearchConfigurationFailure,
): RelationshipSearchBackend {
  return {
    kind: "basic_rules",

    getSearchSuggestions() {
      return configurationFailure(failure);
    },

    invalidQueryBody() {
      return configurationFailure(
        failure,
      ) as RelationshipNaturalSearchInvalidBodyFailure;
    },

    queryRelationships() {
      return configurationFailure(failure);
    },
  };
}

export function createRelationshipSearchStore(
  options: RelationshipSearchServiceOptions = {},
): RelationshipSearchStore | RelationshipSearchConfigurationFailure {
  if (options.store) {
    return options.store;
  }

  const storeResolution = resolveRelationshipSearchStoreKind(options.storeKind);

  if (storeResolution.success === false) {
    return storeResolution;
  }

  return createFixtureRelationshipSearchStore();
}

export function createRelationshipSearchBackend(
  options: RelationshipSearchServiceOptions = {},
): RelationshipSearchBackend {
  const backendResolution = resolveRelationshipSearchBackendKind(
    options.backendKind,
  );

  if (backendResolution.success === false) {
    return createConfigurationFailureBackend(backendResolution);
  }

  const store = createRelationshipSearchStore(options);

  if (isConfigurationFailure(store)) {
    return createConfigurationFailureBackend(store);
  }

  return createBasicRulesRelationshipSearchBackend({ store });
}

export function createBackendRelationshipNaturalSearchService(
  options: RelationshipSearchServiceOptions = {},
): RelationshipNaturalSearchService {
  const backend = createRelationshipSearchBackend(options);

  return {
    getSearchSuggestions(input) {
      return backend.getSearchSuggestions(input);
    },

    invalidQueryBody() {
      return backend.invalidQueryBody();
    },

    queryRelationships(input) {
      return backend.queryRelationships(input);
    },
  };
}
