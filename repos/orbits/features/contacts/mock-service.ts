import {
  CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS,
  CONTACT_SOURCE_FILTERS,
  CONTACT_STATUS_FILTERS,
  CONTACT_TAG_FILTERS,
  CONTACT_VALUE_FILTERS,
  type ContactSourceFilter,
  type ContactStatusFilter,
  type ContactTagFilter,
  type ContactValueFilter,
  type ContactsListSearchFailure,
  type ContactsListSearchFilterErrorCode,
  type ContactsListSearchFilterInput,
  type ContactsListSearchFilterScenario,
  type ContactsListSearchPayload,
  type ContactsListSearchResult,
  type ContactsListSearchSuccess,
} from "./contract";
import {
  buildContactsListSearchPayload,
  mockContactsListFailureProvenance,
  mockContactsListFixture,
  mockEmptyContactsListFixture,
  mockPendingContactsListFixture,
} from "./fixtures";
import type { ContactsListSearchAndFilterService } from "./service";

const supportedScenarios = new Set<ContactsListSearchFilterScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTags = new Set<ContactTagFilter>(CONTACT_TAG_FILTERS);
const supportedSources = new Set<ContactSourceFilter>(CONTACT_SOURCE_FILTERS);
const supportedValues = new Set<ContactValueFilter>(CONTACT_VALUE_FILTERS);
const supportedStatuses = new Set<ContactStatusFilter>(CONTACT_STATUS_FILTERS);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ContactsListSearchPayload,
): ContactsListSearchSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ContactsListSearchFilterErrorCode,
): ContactsListSearchFailure {
  const definition = CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockContactsListFailureProvenance,
      evidenceIds: mockContactsListFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ContactsListSearchFilterInput["scenario"],
): ContactsListSearchFilterScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ContactsListSearchFilterScenario)
  ) {
    return scenario as ContactsListSearchFilterScenario;
  }

  return "success";
}

function normalizedValues(values?: readonly (string | null)[] | null): string[] {
  return (
    values
      ?.map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0) ?? []
  );
}

function hasUnsupportedValue<TValue extends string>(
  values: readonly string[],
  supportedValuesSet: ReadonlySet<TValue>,
): boolean {
  return values.some((value) => !supportedValuesSet.has(value as TValue));
}

function unsupportedFilterFailure(
  input: ContactsListSearchFilterInput,
): ContactsListSearchFailure | null {
  if (
    hasUnsupportedValue(normalizedValues(input.tagFilters), supportedTags) ||
    hasUnsupportedValue(
      normalizedValues(input.sourceFilters),
      supportedSources,
    ) ||
    hasUnsupportedValue(normalizedValues(input.valueFilters), supportedValues) ||
    hasUnsupportedValue(normalizedValues(input.statusFilters), supportedStatuses)
  ) {
    return failure("CONTACTS_FILTER_NOT_SUPPORTED");
  }

  return null;
}

function scenarioResult(
  scenario: ContactsListSearchFilterScenario,
): ContactsListSearchResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyContactsListFixture);
    case "pending":
      return success(mockPendingContactsListFixture);
    case "failure":
      return failure("CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function runContactsListSearch(
  input: ContactsListSearchFilterInput = {},
): ContactsListSearchResult {
  const resolvedScenario = scenarioResult(normalizeScenario(input.scenario));

  if (resolvedScenario) {
    return resolvedScenario;
  }

  const unsupported = unsupportedFilterFailure(input);

  if (unsupported) {
    return unsupported;
  }

  if (
    !input.query &&
    !input.tagFilters?.length &&
    !input.sourceFilters?.length &&
    !input.valueFilters?.length &&
    !input.statusFilters?.length
  ) {
    return success(mockContactsListFixture);
  }

  return success(buildContactsListSearchPayload(input));
}

export function createMockContactsListSearchAndFilterService(): ContactsListSearchAndFilterService {
  return {
    listContacts(input = {}): ContactsListSearchResult {
      return runContactsListSearch(input);
    },

    searchContacts(input = {}): ContactsListSearchResult {
      return runContactsListSearch(input);
    },
  };
}

export type { ContactsListSearchResult };
