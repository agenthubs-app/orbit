import type { AppErrorCode } from "../../shared/errors/app-error";
import type {
  RelationshipValueType,
  SourceReferenceDTO,
  SourceType,
} from "../../shared/domain/source-types";

// Contacts list contract 描述联系人列表、搜索和过滤能力。
// mock/live 的数据来源和执行策略由各自实现提供。

// 这些过滤枚举既是 UI 可展示的选项，也是 mock service 的白名单。
// 传入不在白名单内的 filter 会被当作 validation error。
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
  "CONTACTS_LIVE_STORE_UNCONFIGURED",
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
  CONTACTS_LIVE_STORE_UNCONFIGURED: {
    code: "CONTACTS_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The live contacts store is not configured for this runtime.",
    recovery:
      "Configure a contacts live-store provider before running live contacts search, or switch the capability back to mock or hybrid mode.",
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
  createdBy: string;
}

export interface ContactRelationshipValue {
  score: number;
  valueTypes: readonly ContactValueFilter[];
  rationale: string;
  evidenceIds: readonly string[];
}

// ContactListItem 是列表页卡片的最小完整数据。
// 安全标记字段必须保留在每条联系人上，方便 UI 证明没有调用真实外部服务。
export interface ContactListItem {
  id: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  profileSnippet: string;
  relationshipContext: string;
  lastInteractionAt: string;
  nextAction: string;
  source: ContactSourceReference;
  evidence: readonly ContactEvidence[];
  tags: readonly ContactTagFilter[];
  value: ContactRelationshipValue;
  status: ContactStatusFilter;
  databaseQueryExecuted: boolean;
  searchIndexReadExecuted: boolean;
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

// provenance 聚合整个列表请求的来源和副作用审计。
// 即使未来替换成 live search，也应继续明确记录搜索索引、数据库和外部 provider 是否被访问。
export interface ContactsListSearchProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-contacts-list-search-filter-only"
    | "live-contacts-list-search-filter";
  generationMethod:
    | "fixture"
    | "live-store-query"
    | "local-remote-store-query"
    | "rule-based-contacts-list-search-filter";
  searchIndexReadExecuted: boolean;
  databaseQueryExecuted: boolean;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// Payload 是 contacts page 的服务端 view model 输入。
// appliedFilters/availableFilters 支撑筛选 UI，contacts 渲染列表，nextAction 指导安全下一步。
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
