import {
  RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS,
  RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES,
  RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES,
  RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
  RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES,
  type RelationshipNaturalSearchAppliedFilters,
  type RelationshipNaturalSearchAvailableFilters,
  type RelationshipNaturalSearchBusinessIntent,
  type RelationshipNaturalSearchFollowUpStatus,
  type RelationshipNaturalSearchIndustry,
  type RelationshipNaturalSearchSourceType,
  type RelationshipNaturalSearchValueType,
} from "./contract";

const businessIntentLabels: Record<RelationshipNaturalSearchBusinessIntent, string> = {
  explore_partnership: "Explore partnership",
  find_warm_intro: "Find warm intro",
  recover_event_follow_up: "Recover event follow-up",
  source_customer_reference: "Source customer reference",
};

const industryLabels: Record<RelationshipNaturalSearchIndustry, string> = {
  climate: "Climate",
  enterprise_saas: "Enterprise SaaS",
  fintech: "Fintech",
  healthcare: "Healthcare",
  mobility: "Mobility",
};

const sourceLabels: Record<RelationshipNaturalSearchSourceType, string> = {
  calendar_signal: "Calendar signal",
  email_signal: "Email signal",
  event_import: "Event import",
  external_contacts: "External contacts",
  manual: "Manual note",
  referral: "Referral",
};

const valueLabels: Record<RelationshipNaturalSearchValueType, string> = {
  commercial_opportunity: "Commercial opportunity",
  community_context: "Community context",
  knowledge_exchange: "Knowledge exchange",
  referral_path: "Referral path",
  strategic_intro: "Strategic intro",
};

const followUpLabels: Record<RelationshipNaturalSearchFollowUpStatus, string> = {
  active: "Active",
  dormant: "Dormant",
  needs_follow_up: "Needs follow-up",
  waiting_on_them: "Waiting on them",
};

function filterOptions<TValue extends string>(
  values: readonly TValue[],
  labels: Record<TValue, string>,
) {
  return values.map((value) => ({
    value,
    label: labels[value],
  }));
}

export const relationshipNaturalSearchAvailableFilters: RelationshipNaturalSearchAvailableFilters = {
  businessIntents: filterOptions(
    RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS,
    businessIntentLabels,
  ),
  followUpStatuses: filterOptions(
    RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES,
    followUpLabels,
  ),
  industries: filterOptions(
    RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES,
    industryLabels,
  ),
  sources: filterOptions(
    RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
    sourceLabels,
  ),
  valueTypes: filterOptions(
    RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES,
    valueLabels,
  ),
};

export const emptyRelationshipNaturalSearchAppliedFilters: RelationshipNaturalSearchAppliedFilters = {
  businessIntent: null,
  followUpStatuses: [],
  industries: [],
  sources: [],
  valueTypes: [],
};
