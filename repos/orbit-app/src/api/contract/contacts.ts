// 跨客户端契约：联系人列表搜索与筛选的响应形状。
// 对应 GET /api/contacts 与 POST /api/contacts/search 的 data 字段。
// 常量数组留在 features/contacts/contract.ts，那边有类型断言保证与这里一致。

import type {
  RelationshipValueTypeCode,
  SourceReferenceContract,
  SourceTypeCode
} from "./source";

export type ContactTagFilterCode =
  | "event:climate-founders-dinner"
  | "topic:storage-pilots"
  | "priority:warm-follow-up"
  | "source:external-import"
  | "topic:community"
  | "topic:venture-ecosystem"
  | "priority:nurture"
  | "source:event-import";

export type ContactSourceFilterCode = Extract<
  SourceTypeCode,
  | "manual"
  | "business_card_ocr"
  | "qr_scan"
  | "event_import"
  | "external_contacts"
  | "email_signal"
  | "calendar_signal"
  | "referral"
>;

export type ContactValueFilterCode = RelationshipValueTypeCode;

export type ContactStatusFilterCode =
  | "active"
  | "needs_follow_up"
  | "nurture"
  | "archived";

export type ContactsListStateCode = "success" | "empty" | "pending";

export interface ContactSourceReferenceContract
  extends SourceReferenceContract {
  type: ContactSourceFilterCode;
  label: string;
  evidenceId: string;
}

export interface ContactEvidenceContract {
  evidenceId: string;
  source: ContactSourceReferenceContract;
  excerpt: string;
  capturedAt: string;
  createdBy: string;
}

export interface ContactRelationshipValueContract {
  score: number;
  valueTypes: readonly ContactValueFilterCode[];
  rationale: string;
  evidenceIds: readonly string[];
}

// 客户端渲染一张联系人卡片所需的最小完整数据。
export interface ContactListItemContract {
  id: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  profileSnippet: string;
  relationshipContext: string;
  lastInteractionAt: string;
  nextAction: string;
  source: ContactSourceReferenceContract;
  evidence: readonly ContactEvidenceContract[];
  tags: readonly ContactTagFilterCode[];
  value: ContactRelationshipValueContract;
  status: ContactStatusFilterCode;
  databaseQueryExecuted: boolean;
  searchIndexReadExecuted: boolean;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ContactFilterOptionContract<TValue extends string> {
  value: TValue;
  label: string;
  count: number;
  selected: boolean;
}

export interface ContactsAvailableFiltersContract {
  tags: readonly ContactFilterOptionContract<ContactTagFilterCode>[];
  sources: readonly ContactFilterOptionContract<ContactSourceFilterCode>[];
  values: readonly ContactFilterOptionContract<ContactValueFilterCode>[];
  statuses: readonly ContactFilterOptionContract<ContactStatusFilterCode>[];
}

export interface ContactsAppliedFiltersContract {
  query: string;
  sourceFilters: readonly ContactSourceFilterCode[];
  statusFilters: readonly ContactStatusFilterCode[];
  tagFilters: readonly ContactTagFilterCode[];
  valueFilters: readonly ContactValueFilterCode[];
}

// provenance 记录这次列表请求碰了哪些数据源、有没有触发外部副作用。
export interface ContactsListProvenanceContract {
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

export interface ContactsListPayloadContract {
  state: ContactsListStateCode;
  query: string;
  appliedFilters: ContactsAppliedFiltersContract;
  availableFilters: ContactsAvailableFiltersContract;
  contacts: readonly ContactListItemContract[];
  summary: string;
  provenance: ContactsListProvenanceContract;
  nextAction: string;
}
