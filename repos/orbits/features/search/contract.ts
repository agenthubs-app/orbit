import type { AppErrorCode } from "../../shared/errors/app-error";

export const RELATIONSHIP_NATURAL_SEARCH_FIXTURE_SOURCE =
  "fixture:features/search/fixtures.ts" as const;
// Relationship Natural Search contract 描述关系图的自然语言搜索读模型。
// mock/live 的具体来源标记和执行策略由各自实现提供。

export const RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS = [
  "find_warm_intro",
  "explore_partnership",
  "recover_event_follow_up",
  "source_customer_reference",
] as const;

export type RelationshipNaturalSearchBusinessIntent =
  (typeof RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS)[number];

export const RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES = [
  "climate",
  "enterprise_saas",
  "fintech",
  "healthcare",
  "mobility",
] as const;

export type RelationshipNaturalSearchIndustry =
  (typeof RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES)[number];

export const RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES = [
  "manual",
  "event_import",
  "email_signal",
  "calendar_signal",
  "external_contacts",
  "referral",
] as const;

export type RelationshipNaturalSearchSourceType =
  (typeof RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES)[number];

export const RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES = [
  "commercial_opportunity",
  "strategic_intro",
  "knowledge_exchange",
  "referral_path",
  "community_context",
] as const;

export type RelationshipNaturalSearchValueType =
  (typeof RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES)[number];

export const RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES = [
  "needs_follow_up",
  "active",
  "waiting_on_them",
  "dormant",
] as const;

export type RelationshipNaturalSearchFollowUpStatus =
  (typeof RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES)[number];

export const RELATIONSHIP_NATURAL_SEARCH_ERROR_CODES = [
  "RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED",
  "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY",
  "RELATIONSHIP_NATURAL_SEARCH_PENDING",
  "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED",
] as const;

export type RelationshipNaturalSearchErrorCode =
  (typeof RELATIONSHIP_NATURAL_SEARCH_ERROR_CODES)[number];

export type RelationshipNaturalSearchScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type RelationshipNaturalSearchState = "success" | "empty" | "pending";

// 错误定义把不支持的过滤器、非法 body、pending 和受控失败拆开。
export interface RelationshipNaturalSearchErrorDefinition {
  code: RelationshipNaturalSearchErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS = {
  RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED: {
    code: "RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message:
      "That mock relationship natural search filter is not supported.",
    recovery:
      "Use the declared business intent, industry, source, value type, and follow-up status filters from the search contract.",
  },
  RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY: {
    code: "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY",
    appCode: "VALIDATION_ERROR",
    message:
      "The mock relationship natural search request body must be valid JSON or form data.",
    recovery:
      "Send a JSON object or form body with query and optional supported filter fields.",
  },
  RELATIONSHIP_NATURAL_SEARCH_PENDING: {
    code: "RELATIONSHIP_NATURAL_SEARCH_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock relationship natural search request is waiting for local fixture review.",
    recovery:
      "Render the pending state and avoid live semantic search, indexing, persistence, or delivery work.",
  },
  RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED: {
    code: "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock relationship natural search boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry external search, database, AI, calendar, email, device, or notification work.",
  },
} as const satisfies Record<
  RelationshipNaturalSearchErrorCode,
  RelationshipNaturalSearchErrorDefinition
>;

export interface RelationshipNaturalSearchFilterOption<TValue extends string> {
  value: TValue;
  label: string;
}

// AvailableFilters 是 UI 渲染筛选器的枚举来源。
export interface RelationshipNaturalSearchAvailableFilters {
  businessIntents: readonly RelationshipNaturalSearchFilterOption<RelationshipNaturalSearchBusinessIntent>[];
  industries: readonly RelationshipNaturalSearchFilterOption<RelationshipNaturalSearchIndustry>[];
  sources: readonly RelationshipNaturalSearchFilterOption<RelationshipNaturalSearchSourceType>[];
  valueTypes: readonly RelationshipNaturalSearchFilterOption<RelationshipNaturalSearchValueType>[];
  followUpStatuses: readonly RelationshipNaturalSearchFilterOption<RelationshipNaturalSearchFollowUpStatus>[];
}

// AppliedFilters 是一次查询真正生效的过滤器集合。
export interface RelationshipNaturalSearchAppliedFilters {
  businessIntent: RelationshipNaturalSearchBusinessIntent | null;
  industries: readonly RelationshipNaturalSearchIndustry[];
  sources: readonly RelationshipNaturalSearchSourceType[];
  valueTypes: readonly RelationshipNaturalSearchValueType[];
  followUpStatuses: readonly RelationshipNaturalSearchFollowUpStatus[];
}

export interface RelationshipNaturalSearchSourceReference {
  type: RelationshipNaturalSearchSourceType;
  id: string;
  label: string;
  evidenceId: string;
}

// Evidence 解释每条搜索结果匹配到的关系证据。
export interface RelationshipNaturalSearchEvidence {
  evidenceId: string;
  source: RelationshipNaturalSearchSourceReference;
  excerpt: string;
  capturedAt: string;
  createdBy: "mock-relationship-natural-search-service";
}

export interface RelationshipNaturalSearchValue {
  score: number;
  valueTypes: readonly RelationshipNaturalSearchValueType[];
  rationale: string;
  evidenceIds: readonly string[];
}

// MatchScore 让 UI 可以展示相关性分数、档位和命中字段。
export interface RelationshipNaturalSearchMatchScore {
  value: number;
  band: "high" | "medium" | "low";
  rationale: string;
  matchedFields: readonly string[];
}

// ResultItem 是自然语言搜索的一条关系结果。
export interface RelationshipNaturalSearchResultItem {
  id: string;
  contactId: string;
  displayName: string;
  role: string;
  organization: string;
  industry: RelationshipNaturalSearchIndustry;
  location: string;
  relationshipContext: string;
  matchedBusinessIntents: readonly RelationshipNaturalSearchBusinessIntent[];
  source: RelationshipNaturalSearchSourceReference;
  evidence: readonly RelationshipNaturalSearchEvidence[];
  value: RelationshipNaturalSearchValue;
  followUpStatus: RelationshipNaturalSearchFollowUpStatus;
  recommendedAction: string;
  matchScore: RelationshipNaturalSearchMatchScore;
  semanticSearchExecuted: false;
  embeddingGenerated: false;
  crossProviderIndexQueried: false;
  databaseQueryExecuted: false;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface RelationshipNaturalSearchProvenance {
  source: typeof RELATIONSHIP_NATURAL_SEARCH_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-relationship-natural-search-only";
  generationMethod: "fixture" | "rule-based-relationship-natural-search";
  semanticSearchExecuted: false;
  embeddingsGenerated: false;
  crossProviderIndexQueried: false;
  databaseQueryExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface RelationshipNaturalSearchInput {
  query?: string | null;
  businessIntent?: RelationshipNaturalSearchBusinessIntent | string | null;
  industryFilters?: readonly string[] | null;
  sourceFilters?: readonly string[] | null;
  valueTypeFilters?: readonly string[] | null;
  followUpStatusFilters?: readonly string[] | null;
  scenario?: RelationshipNaturalSearchScenario | string | null;
  limit?: number | null;
}

export interface RelationshipNaturalSearchPayload {
  state: RelationshipNaturalSearchState;
  query: string;
  results: readonly RelationshipNaturalSearchResultItem[];
  appliedFilters: RelationshipNaturalSearchAppliedFilters;
  availableFilters: RelationshipNaturalSearchAvailableFilters;
  summary: string;
  provenance: RelationshipNaturalSearchProvenance;
  nextAction: string;
}

export interface RelationshipNaturalSearchSuggestion {
  id: string;
  query: string;
  businessIntent: RelationshipNaturalSearchBusinessIntent;
  filterPreview: RelationshipNaturalSearchAppliedFilters;
  evidenceHint: string;
}

export interface RelationshipNaturalSearchSuggestionsPayload {
  state: RelationshipNaturalSearchState;
  suggestions: readonly RelationshipNaturalSearchSuggestion[];
  summary: string;
  provenance: RelationshipNaturalSearchProvenance;
  nextAction: string;
}

export interface RelationshipNaturalSearchSuggestionsInput {
  scenario?: RelationshipNaturalSearchScenario | string | null;
}

export interface RelationshipNaturalSearchSuccess {
  success: true;
  data: RelationshipNaturalSearchPayload;
}

export interface RelationshipNaturalSearchSuggestionsSuccess {
  success: true;
  data: RelationshipNaturalSearchSuggestionsPayload;
}

export interface RelationshipNaturalSearchFailure {
  success: false;
  error: RelationshipNaturalSearchErrorDefinition & {
    state: "failure";
    provenance: RelationshipNaturalSearchProvenance;
    evidenceIds: readonly string[];
  };
}

export type RelationshipNaturalSearchInvalidBodyFailure =
  RelationshipNaturalSearchFailure & {
    error: RelationshipNaturalSearchFailure["error"] & {
      code: "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY";
    };
  };

export type RelationshipNaturalSearchResult =
  | RelationshipNaturalSearchSuccess
  | RelationshipNaturalSearchFailure;

export type RelationshipNaturalSearchSuggestionsResult =
  | RelationshipNaturalSearchSuggestionsSuccess
  | RelationshipNaturalSearchFailure;
