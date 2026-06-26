import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ContactsListSearchFailure,
  ContactsListSearchFilterInput,
  ContactsListSearchResult,
} from "./contract";

export interface ContactsListSearchAndFilterService {
  listContacts: (
    input?: ContactsListSearchFilterInput,
  ) => ContactsListSearchResult;
  searchContacts: (
    input?: ContactsListSearchFilterInput,
  ) => ContactsListSearchResult;
}

export function contactsListSearchFailureToAppError(
  failure: ContactsListSearchFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function contactsListSearchFailureContext(
  failure: ContactsListSearchFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    contactsListSearchFilterErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock contacts list search and filter failure came from deterministic fixture rules.",
    service: "contacts-list-search-and-filter-mock",
  };
}

export type { ContactsListSearchResult };
