import type { AppErrorCode } from "../../shared/errors/app-error";
import type { ContractMatches } from "../../shared/contract-check";
import type {
  ContactSourceFilterCode,
  ContactStatusFilterCode,
  ContactTagFilterCode,
  ContactValueFilterCode,
  ContactsListPayloadContract,
  ContactsListProvenanceContract,
  ContactsListStateCode,
} from "../../shared/contract/contacts";
import type {
  RelationshipValueType,
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
  "source:business-card",
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

// 筛选枚举的常量数组留在这里（service 要用），字符串联合另有一份在
// shared/contract/contacts.ts 供客户端拷贝。下面的断言保证两边一致。
export type ContactTagFilterMatchesContract = ContractMatches<
  ContactTagFilter,
  ContactTagFilterCode
>;
export type ContactSourceFilterMatchesContract = ContractMatches<
  ContactSourceFilter,
  ContactSourceFilterCode
>;
export type ContactValueFilterMatchesContract = ContractMatches<
  ContactValueFilter,
  ContactValueFilterCode
>;
export type ContactStatusFilterMatchesContract = ContractMatches<
  ContactStatusFilter,
  ContactStatusFilterCode
>;

export const CONTACTS_LIST_SEARCH_FILTER_ERROR_CODES = [
  "CONTACTS_ACTOR_REQUIRED",
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

export type ContactsListSearchFilterState = ContactsListStateCode;

export interface ContactsListSearchFilterInput {
  actorId?: string | null;
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
  CONTACTS_ACTOR_REQUIRED: {
    code: "CONTACTS_ACTOR_REQUIRED",
    appCode: "UNAUTHORIZED",
    message: "An authenticated actor is required for live contacts access.",
    recovery: "Sign in before reading or searching live contacts.",
  },
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

// 下面这一组是客户端可见的响应形状，声明在 shared/contract/contacts.ts，
// 这里只做改名转发，保持 features 内既有的引用名不变。
// 改形状要去契约文件改，网页版和 iOS App 会一起编译报错。
export type {
  ContactEvidenceContract as ContactEvidence,
  ContactFilterOptionContract as ContactFilterOption,
  ContactListItemContract as ContactListItem,
  ContactRelationshipValueContract as ContactRelationshipValue,
  ContactSourceReferenceContract as ContactSourceReference,
  ContactsAppliedFiltersContract as ContactsAppliedFilters,
  ContactsAvailableFiltersContract as ContactsAvailableFilters,
  ContactsListPayloadContract as ContactsListSearchPayload,
  ContactsListProvenanceContract as ContactsListSearchProvenance,
} from "../../shared/contract/contacts";

export interface ContactsListSearchSuccess {
  success: true;
  data: ContactsListPayloadContract;
}

export interface ContactsListSearchFailure {
  success: false;
  error: ContactsListSearchFilterErrorDefinition & {
    state: "failure";
    provenance: ContactsListProvenanceContract;
    evidenceIds: readonly string[];
  };
}

export type ContactsListSearchResult =
  | ContactsListSearchSuccess
  | ContactsListSearchFailure;
