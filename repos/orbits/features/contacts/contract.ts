import type { AppErrorCode } from "../../shared/errors/app-error";
import type {
  RelationshipValueType,
  SourceReferenceDTO,
  SourceType,
} from "../../shared/domain/source-types";

export const CONTACTS_LIST_SEARCH_FILTER_FIXTURE_SOURCE =
  "fixture:features/contacts/fixtures.ts" as const;

export const CONTACT_TAG_FILTERS = [
  "event:climate-founders-dinner",
  "topic:storage-pilots",
  "priority:warm-follow-up",
  "source:external-import",
  "topic:community",
  "topic:venture-ecosystem",
  "priority:nurture",
  "source:event-import",
] as const;

export type ContactTagFilter = (typeof CONTACT_TAG_FILTERS)[number];

export const CONTACT_SOURCE_FILTERS = [
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
] as const satisfies readonly SourceType[];

export type ContactSourceFilter = (typeof CONTACT_SOURCE_FILTERS)[number];

export const CONTACT_VALUE_FILTERS = [
  "strategic_fit",
  "commercial_opportunity",
  "knowledge_exchange",
  "referral_path",
  "community_context",
] as const satisfies readonly RelationshipValueType[];

export type ContactValueFilter = (typeof CONTACT_VALUE_FILTERS)[number];

export const CONTACT_STATUS_FILTERS = [
  "active",
  "needs_follow_up",
  "nurture",
  "archived",
] as const;

export type ContactStatusFilter = (typeof CONTACT_STATUS_FILTERS)[number];

export const CONTACTS_LIST_SEARCH_FILTER_ERROR_CODES = [
  "CONTACTS_FILTER_NOT_SUPPORTED",
  "CONTACTS_SEARCH_PENDING",
  "CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED",
] as const;

export type ContactsListSearchFilterErrorCode =
  (typeof CONTACTS_LIST_SEARCH_FILTER_ERROR_CODES)[number];

export type ContactsListSearchFilterScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ContactsListSearchFilterState = "success" | "empty" | "pending";

export interface ContactsListSearchFilterInput {
  query?: string | null;
  scenario?: ContactsListSearchFilterScenario | string | null;
  sourceFilters?: readonly (ContactSourceFilter | string)[] | null;
  statusFilters?: readonly (ContactStatusFilter | string)[] | null;
  tagFilters?: readonly (ContactTagFilter | string)[] | null;
  valueFilters?: readonly (ContactValueFilter | string)[] | null;
}

export interface ContactsListSearchFilterErrorDefinition {
  code: ContactsListSearchFilterErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS = {
  CONTACTS_FILTER_NOT_SUPPORTED: {
    code: "CONTACTS_FILTER_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message:
      "That mock contacts list search or filter value is not supported by this sprint boundary.",
    recovery:
      "Use the local tag, source, relationship value, and status filters declared in the contacts contract.",
  },
  CONTACTS_SEARCH_PENDING: {
    code: "CONTACTS_SEARCH_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock contacts list search and filter boundary is waiting for fixture review.",
    recovery:
      "Render the pending state and avoid reading a live search index or database until the fixture is ready.",
  },
  CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED: {
    code: "CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock contacts list search and filter boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry a search index, database, provider, AI, calendar, email, notification, or device call.",
  },
} as const satisfies Record<
  ContactsListSearchFilterErrorCode,
  ContactsListSearchFilterErrorDefinition
>;

export interface ContactSourceReference extends SourceReferenceDTO {
  type: ContactSourceFilter;
  label: string;
  evidenceId: string;
}

export interface ContactEvidence {
  evidenceId: string;
  source: ContactSourceReference;
  excerpt: string;
  capturedAt: string;
  createdBy: "mock-contacts-list-search-and-filter-service";
}

export interface ContactRelationshipValue {
  score: number;
  valueTypes: readonly ContactValueFilter[];
  rationale: string;
  evidenceIds: readonly string[];
}

export interface ContactListItem {
  id: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  relationshipContext: string;
  lastInteractionAt: string;
  nextAction: string;
  source: ContactSourceReference;
  evidence: readonly ContactEvidence[];
  tags: readonly ContactTagFilter[];
  value: ContactRelationshipValue;
  status: ContactStatusFilter;
  databaseQueryExecuted: false;
  searchIndexReadExecuted: false;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ContactFilterOption<TValue extends string> {
  value: TValue;
  label: string;
  count: number;
  selected: boolean;
}

export interface ContactsAvailableFilters {
  tags: readonly ContactFilterOption<ContactTagFilter>[];
  sources: readonly ContactFilterOption<ContactSourceFilter>[];
  values: readonly ContactFilterOption<ContactValueFilter>[];
  statuses: readonly ContactFilterOption<ContactStatusFilter>[];
}

export interface ContactsAppliedFilters {
  query: string;
  sourceFilters: readonly ContactSourceFilter[];
  statusFilters: readonly ContactStatusFilter[];
  tagFilters: readonly ContactTagFilter[];
  valueFilters: readonly ContactValueFilter[];
}

export interface ContactsListSearchProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-contacts-list-search-filter-only";
  generationMethod: "fixture" | "rule-based-contacts-list-search-filter";
  searchIndexReadExecuted: false;
  databaseQueryExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ContactsListSearchPayload {
  state: ContactsListSearchFilterState;
  query: string;
  appliedFilters: ContactsAppliedFilters;
  availableFilters: ContactsAvailableFilters;
  contacts: readonly ContactListItem[];
  summary: string;
  provenance: ContactsListSearchProvenance;
  nextAction: string;
}

export interface ContactsListSearchSuccess {
  success: true;
  data: ContactsListSearchPayload;
}

export interface ContactsListSearchFailure {
  success: false;
  error: ContactsListSearchFilterErrorDefinition & {
    state: "failure";
    provenance: ContactsListSearchProvenance;
    evidenceIds: readonly string[];
  };
}

export type ContactsListSearchResult =
  | ContactsListSearchSuccess
  | ContactsListSearchFailure;
