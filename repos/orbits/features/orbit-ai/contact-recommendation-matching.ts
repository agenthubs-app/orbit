import {
  createContactsRecommendationSearchTool,
  type ContactRecommendationCandidate,
  type ContactRecommendationContextMessage,
  type ContactRecommendationCriteria,
  type ContactRecommendationResult as ContactsRecommendationResult,
  type ContactsRecommendationSearchTool,
} from "../contacts/contact-recommendation-search";
import type { RelationshipNaturalSearchService } from "../search/service";

export const CONTACT_RECOMMENDATION_METHODS = [
  "rules_v1",
  "structured_extraction_v1",
  "semantic_index_v1",
  "graph_gated_rag_v1",
] as const;

export const CONTACT_RECOMMENDATION_METHOD_ENV =
  "ORBIT_CONTACT_RECOMMENDATION_METHOD" as const;

export type ContactRecommendationMethod =
  (typeof CONTACT_RECOMMENDATION_METHODS)[number];

export type ContactRecommendationMethodResolution =
  | {
      method: ContactRecommendationMethod;
      success: true;
    }
  | {
      code: "unsupported_method";
      requestedMethod: string;
      success: false;
    };

export type {
  ContactRecommendationCandidate,
  ContactRecommendationContextMessage,
  ContactRecommendationCriteria,
};

export interface ContactRecommendationResult
  extends Omit<ContactsRecommendationResult, "method" | "state"> {
  method: ContactRecommendationMethod | "invalid";
  requestedMethod?: string;
  state: "success" | "empty" | "unimplemented" | "configuration_error";
}

export type ContactRecommendationMatcherResult =
  | ContactRecommendationResult
  | Promise<ContactRecommendationResult>;

export interface ContactRecommendationMatcher {
  method: ContactRecommendationMethod;
  recommend: (input: {
    contextMessages?: readonly ContactRecommendationContextMessage[];
    locale?: string | null;
    query: string;
    toolArguments?: Record<string, unknown> | null;
  }) => ContactRecommendationMatcherResult;
}

function isContactRecommendationMethod(
  value: string,
): value is ContactRecommendationMethod {
  return CONTACT_RECOMMENDATION_METHODS.includes(
    value as ContactRecommendationMethod,
  );
}

export function resolveContactRecommendationMethod(
  value = process.env[CONTACT_RECOMMENDATION_METHOD_ENV],
): ContactRecommendationMethodResolution {
  const requestedMethod = value?.trim();

  if (!requestedMethod) {
    return {
      method: "rules_v1",
      success: true,
    };
  }

  if (isContactRecommendationMethod(requestedMethod)) {
    return {
      method: requestedMethod,
      success: true,
    };
  }

  return {
    code: "unsupported_method",
    requestedMethod,
    success: false,
  };
}

export function createRuleBasedContactRecommendationMatcher(input: {
  recommendationSearchTool?: ContactsRecommendationSearchTool;
  relationshipSearchService?: RelationshipNaturalSearchService;
} = {}): ContactRecommendationMatcher {
  const recommendationSearchTool =
    input.recommendationSearchTool ??
    createContactsRecommendationSearchTool({
      relationshipSearchService: input.relationshipSearchService,
    });

  return {
    method: "rules_v1",
    recommend(request): ContactRecommendationMatcherResult {
      return recommendationSearchTool.recommend(request);
    },
  };
}
