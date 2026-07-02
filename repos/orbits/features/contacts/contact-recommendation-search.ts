import type {
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchBusinessIntent,
  RelationshipNaturalSearchIndustry,
  RelationshipNaturalSearchInput,
  RelationshipNaturalSearchResultItem,
  RelationshipNaturalSearchValueType,
} from "../search/contract";
import { createRelationshipNaturalSearchService } from "../search/service-factory";
import type {
  RelationshipNaturalSearchService,
  RelationshipNaturalSearchServiceResult,
} from "../search/service";

export interface ContactRecommendationContextMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
}

export interface ContactRecommendationCriteria {
  businessIntent: RelationshipNaturalSearchBusinessIntent | null;
  helpTypes: readonly string[];
  industries: readonly RelationshipNaturalSearchIndustry[];
  relationshipPolicy: "existing_links_only";
  searchQuery: string;
  valueTypes: readonly RelationshipNaturalSearchValueType[];
}

export interface ContactRecommendationCandidate {
  contactId: string;
  databaseQueryExecuted: boolean;
  displayName: string;
  evidenceIds: readonly string[];
  matchReasons: readonly string[];
  matchScore: number;
  organization: string;
  recommendedAction: string;
  relationshipPath: string;
  role: string;
  sourceLabel: string;
}

export interface ContactRecommendationResult {
  candidates: readonly ContactRecommendationCandidate[];
  criteria: ContactRecommendationCriteria;
  databaseQueryExecuted: boolean;
  method: "rules_v1";
  requestedMethod?: string;
  state: "success" | "empty";
  summary: string;
}

export type ContactsRecommendationSearchToolResult =
  | ContactRecommendationResult
  | Promise<ContactRecommendationResult>;

export interface ContactsRecommendationSearchTool {
  recommend: (input: {
    contextMessages?: readonly ContactRecommendationContextMessage[];
    locale?: string | null;
    query: string;
    toolArguments?: Record<string, unknown> | null;
  }) => ContactsRecommendationSearchToolResult;
}

export interface ContactsRecommendationSearchToolOptions {
  relationshipSearchService?: RelationshipNaturalSearchService;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contextText(input: {
  contextMessages?: readonly ContactRecommendationContextMessage[];
  query: string;
  toolArguments?: Record<string, unknown> | null;
}): string {
  const argumentQuery = readText(input.toolArguments?.query);

  return [
    input.query,
    argumentQuery,
    ...(input.contextMessages ?? []).map((message) => message.content),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function extractRuleCriteria(input: {
  contextMessages?: readonly ContactRecommendationContextMessage[];
  query: string;
  toolArguments?: Record<string, unknown> | null;
}): ContactRecommendationCriteria {
  const text = contextText(input);
  const industries: RelationshipNaturalSearchIndustry[] = [];
  const valueTypes: RelationshipNaturalSearchValueType[] = [];
  const helpTypes: string[] = [];
  let businessIntent: RelationshipNaturalSearchBusinessIntent | null = null;
  let searchQuery = input.query;

  if (
    includesAny(text, [
      /fintech/i,
      /finance/i,
      /financial/i,
      /banking/i,
      /payment/i,
      /金融/,
      /财务/,
      /銀行|银行/,
      /支付/,
    ])
  ) {
    industries.push("fintech");
    valueTypes.push("referral_path", "strategic_intro");
    searchQuery = "fintech referral";
  }

  if (includesAny(text, [/climate/i, /energy/i, /storage/i, /气候/, /能源/, /储能/])) {
    industries.push("climate");
    valueTypes.push("strategic_intro", "commercial_opportunity");
    searchQuery = searchQuery === input.query ? "climate intro" : searchQuery;
  }

  if (
    includesAny(text, [
      /合作/,
      /partner/i,
      /partnership/i,
      /collaborat/i,
      /产品开发/,
      /product/i,
    ])
  ) {
    helpTypes.push("explore_partnership");
    businessIntent = "explore_partnership";
  }

  if (includesAny(text, [/介绍/, /引荐/, /谁认识/, /誰認識/, /intro/i, /referral/i])) {
    helpTypes.push("find_warm_intro");
    businessIntent ??= "find_warm_intro";
    if (searchQuery === input.query && industries.length === 0) {
      searchQuery = "warm intro referral";
    }
  }

  if (includesAny(text, [/客户/, /客戶/, /customer/i, /reference/i])) {
    helpTypes.push("source_customer_reference");
    businessIntent ??= "source_customer_reference";
  }

  return {
    businessIntent,
    helpTypes: Array.from(new Set(helpTypes)),
    industries: Array.from(new Set(industries)),
    relationshipPolicy: "existing_links_only",
    searchQuery,
    valueTypes: Array.from(new Set(valueTypes)),
  };
}

function searchInputFor(criteria: ContactRecommendationCriteria): RelationshipNaturalSearchInput {
  return {
    businessIntent: criteria.businessIntent,
    industryFilters: criteria.industries,
    query: criteria.searchQuery,
    valueTypeFilters: criteria.valueTypes,
  };
}

function evidenceIdsFor(item: RelationshipNaturalSearchResultItem): readonly string[] {
  return Array.from(
    new Set([
      ...item.evidence.map((evidence) => evidence.evidenceId),
      ...item.value.evidenceIds,
      item.source.evidenceId,
    ]),
  );
}

function candidateFor(
  item: RelationshipNaturalSearchResultItem,
): ContactRecommendationCandidate | null {
  const evidenceIds = evidenceIdsFor(item);

  if (!item.contactId || evidenceIds.length === 0) {
    return null;
  }

  return {
    contactId: item.contactId,
    databaseQueryExecuted: item.databaseQueryExecuted,
    displayName: item.displayName,
    evidenceIds,
    matchReasons: [item.matchScore.rationale, item.value.rationale],
    matchScore: item.matchScore.value,
    organization: item.organization,
    recommendedAction: item.recommendedAction,
    relationshipPath: item.relationshipContext,
    role: item.role,
    sourceLabel: item.source.label,
  };
}

function isPromiseLike<TResult>(
  result: RelationshipNaturalSearchServiceResult<TResult>,
): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

function resultForSearch(
  criteria: ContactRecommendationCriteria,
  searchResult: RelationshipNaturalSearchResult,
): ContactRecommendationResult {
  const candidates =
    searchResult.success === true
      ? searchResult.data.results
          .map(candidateFor)
          .filter((candidate): candidate is ContactRecommendationCandidate =>
            Boolean(candidate),
          )
          .sort((left, right) => right.matchScore - left.matchScore)
      : [];

  return {
    candidates,
    criteria,
    databaseQueryExecuted:
      searchResult.success === true
        ? searchResult.data.provenance?.databaseQueryExecuted ??
          candidates.some((candidate) => candidate.databaseQueryExecuted)
        : false,
    method: "rules_v1",
    state: candidates.length > 0 ? "success" : "empty",
    summary:
      candidates.length > 0
        ? `${candidates.length} existing relationship candidate(s) matched the rules_v1 contact recommendation method.`
        : "No existing relationship candidate carried enough source evidence for the rules_v1 contact recommendation method.",
  };
}

export function createContactsRecommendationSearchTool(
  options: ContactsRecommendationSearchToolOptions = {},
): ContactsRecommendationSearchTool {
  const relationshipSearchService =
    options.relationshipSearchService ?? createRelationshipNaturalSearchService();

  return {
    recommend(request): ContactsRecommendationSearchToolResult {
      const criteria = extractRuleCriteria(request);
      const searchResult =
        relationshipSearchService.queryRelationships(searchInputFor(criteria));

      if (isPromiseLike(searchResult)) {
        return searchResult.then((resolved) => resultForSearch(criteria, resolved));
      }

      return resultForSearch(criteria, searchResult);
    },
  };
}
