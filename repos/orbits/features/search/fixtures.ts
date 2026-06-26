import {
  RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS,
  RELATIONSHIP_NATURAL_SEARCH_FIXTURE_SOURCE,
  RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES,
  RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES,
  RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
  RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES,
  type RelationshipNaturalSearchAppliedFilters,
  type RelationshipNaturalSearchAvailableFilters,
  type RelationshipNaturalSearchBusinessIntent,
  type RelationshipNaturalSearchEvidence,
  type RelationshipNaturalSearchFollowUpStatus,
  type RelationshipNaturalSearchIndustry,
  type RelationshipNaturalSearchInput,
  type RelationshipNaturalSearchPayload,
  type RelationshipNaturalSearchProvenance,
  type RelationshipNaturalSearchResultItem,
  type RelationshipNaturalSearchSourceReference,
  type RelationshipNaturalSearchSourceType,
  type RelationshipNaturalSearchState,
  type RelationshipNaturalSearchSuggestion,
  type RelationshipNaturalSearchSuggestionsPayload,
  type RelationshipNaturalSearchValueType,
} from "./contract";

const fixtureCollectedAt = "2026-06-25T21:00:00.000Z";
const fixtureCapturedAt = "2026-06-25T20:45:00.000Z";

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

export const mockRelationshipNaturalSearchSources = {
  hana: {
    type: "external_contacts",
    id: "source:relationship-search:hana-community-import",
    label: "External contacts community import fixture",
    evidenceId: "evidence:relationship-search-hana",
  },
  kenji: {
    type: "manual",
    id: "source:relationship-search:kenji-manual-note",
    label: "Manual climate dinner note fixture",
    evidenceId: "evidence:relationship-search-kenji",
  },
  mina: {
    type: "event_import",
    id: "source:relationship-search:mina-event-roster",
    label: "Event roster fixture",
    evidenceId: "evidence:relationship-search-mina",
  },
  omar: {
    type: "email_signal",
    id: "source:relationship-search:omar-email-signal",
    label: "Email signal fixture",
    evidenceId: "evidence:relationship-search-omar",
  },
} as const satisfies Record<string, RelationshipNaturalSearchSourceReference>;

export const mockRelationshipNaturalSearchEvidence: readonly RelationshipNaturalSearchEvidence[] = [
  {
    evidenceId: "evidence:relationship-search-kenji",
    source: mockRelationshipNaturalSearchSources.kenji,
    excerpt:
      "Manual dinner note says Kenji asked for a warm intro to climate pilot operators this week.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-relationship-natural-search-service",
  },
  {
    evidenceId: "evidence:relationship-search-omar",
    source: mockRelationshipNaturalSearchSources.omar,
    excerpt:
      "Email signal says Omar can broker fintech investor and partner referrals after a short context brief.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-relationship-natural-search-service",
  },
  {
    evidenceId: "evidence:relationship-search-hana",
    source: mockRelationshipNaturalSearchSources.hana,
    excerpt:
      "External contacts fixture links Hana to climate community context and founder roundtable planning.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-relationship-natural-search-service",
  },
  {
    evidenceId: "evidence:relationship-search-mina",
    source: mockRelationshipNaturalSearchSources.mina,
    excerpt:
      "Event roster fixture marks Mina as a climate storage distribution partner needing follow-up.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-relationship-natural-search-service",
  },
];

function evidenceFor(
  evidenceId: string,
): readonly RelationshipNaturalSearchEvidence[] {
  return mockRelationshipNaturalSearchEvidence.filter(
    (evidence) => evidence.evidenceId === evidenceId,
  );
}

export const mockRelationshipNaturalSearchResults: readonly RelationshipNaturalSearchResultItem[] = [
  {
    id: "relationship-search-result:kenji-watanabe",
    contactId: "contact:kenji-watanabe",
    displayName: "Kenji Watanabe",
    role: "Founder",
    organization: "Aster Grid",
    industry: "climate",
    location: "Tokyo",
    relationshipContext:
      "Met at the climate founders dinner and discussed storage pilot operators.",
    matchedBusinessIntents: [
      "find_warm_intro",
      "source_customer_reference",
    ],
    source: mockRelationshipNaturalSearchSources.kenji,
    evidence: evidenceFor("evidence:relationship-search-kenji"),
    value: {
      score: 94,
      valueTypes: ["commercial_opportunity", "strategic_intro"],
      rationale:
        "Kenji has a specific operator intro request and enough dinner context for a useful warm path.",
      evidenceIds: ["evidence:relationship-search-kenji"],
    },
    followUpStatus: "needs_follow_up",
    recommendedAction:
      "Send Kenji the climate pilot operator intro with the dinner context attached.",
    matchScore: {
      value: 96,
      band: "high",
      rationale:
        "Direct query language overlaps with pilot, operator, intro, climate, and follow-up evidence.",
      matchedFields: [
        "relationshipContext",
        "matchedBusinessIntents",
        "recommendedAction",
      ],
    },
    semanticSearchExecuted: false,
    embeddingGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "relationship-search-result:omar-rahman",
    contactId: "contact:omar-rahman",
    displayName: "Omar Rahman",
    role: "Platform Partner",
    organization: "Northstar Ventures",
    industry: "fintech",
    location: "San Francisco",
    relationshipContext:
      "Email signal says Omar offered fintech and venture ecosystem referrals.",
    matchedBusinessIntents: ["find_warm_intro", "explore_partnership"],
    source: mockRelationshipNaturalSearchSources.omar,
    evidence: evidenceFor("evidence:relationship-search-omar"),
    value: {
      score: 88,
      valueTypes: ["strategic_intro", "referral_path"],
      rationale:
        "Omar can broker partner and investor referrals if the ask includes a short context brief.",
      evidenceIds: ["evidence:relationship-search-omar"],
    },
    followUpStatus: "waiting_on_them",
    recommendedAction:
      "Send Omar a concise fintech partner diligence brief before asking for referrals.",
    matchScore: {
      value: 89,
      band: "high",
      rationale:
        "Fixture rules match fintech, referral, investor, and warm intro terms.",
      matchedFields: ["industry", "value.valueTypes", "relationshipContext"],
    },
    semanticSearchExecuted: false,
    embeddingGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "relationship-search-result:hana-sato",
    contactId: "contact:hana-sato",
    displayName: "Hana Sato",
    role: "Community Lead",
    organization: "Tokyo Climate Guild",
    industry: "climate",
    location: "Tokyo",
    relationshipContext:
      "Imported as a community contact connected to climate founder roundtables.",
    matchedBusinessIntents: [
      "explore_partnership",
      "recover_event_follow_up",
    ],
    source: mockRelationshipNaturalSearchSources.hana,
    evidence: evidenceFor("evidence:relationship-search-hana"),
    value: {
      score: 80,
      valueTypes: ["knowledge_exchange", "community_context"],
      rationale:
        "Hana can explain community context and help revive post-event climate founder follow-up.",
      evidenceIds: ["evidence:relationship-search-hana"],
    },
    followUpStatus: "active",
    recommendedAction:
      "Ask Hana whether the guild wants a founder roundtable follow-up.",
    matchScore: {
      value: 82,
      band: "medium",
      rationale:
        "Fixture rules match climate, community, partnership, and event follow-up context.",
      matchedFields: ["industry", "relationshipContext", "value.valueTypes"],
    },
    semanticSearchExecuted: false,
    embeddingGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "relationship-search-result:mina-tan",
    contactId: "contact:mina-tan",
    displayName: "Mina Tan",
    role: "Partnerships Director",
    organization: "Harbor Storage",
    industry: "climate",
    location: "Singapore",
    relationshipContext:
      "Event roster says Mina handles climate storage distribution partnerships.",
    matchedBusinessIntents: [
      "recover_event_follow_up",
      "source_customer_reference",
    ],
    source: mockRelationshipNaturalSearchSources.mina,
    evidence: evidenceFor("evidence:relationship-search-mina"),
    value: {
      score: 83,
      valueTypes: ["commercial_opportunity", "referral_path"],
      rationale:
        "Mina is relevant for post-event climate storage distribution and customer reference paths.",
      evidenceIds: ["evidence:relationship-search-mina"],
    },
    followUpStatus: "needs_follow_up",
    recommendedAction:
      "Send Mina a post-event storage partnership recap and ask for the customer reference path.",
    matchScore: {
      value: 84,
      band: "medium",
      rationale:
        "Fixture rules match event roster, climate storage, commercial opportunity, and follow-up context.",
      matchedFields: [
        "source.type",
        "industry",
        "relationshipContext",
        "followUpStatus",
      ],
    },
    semanticSearchExecuted: false,
    embeddingGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
];

export const mockRelationshipNaturalSearchProvenance: RelationshipNaturalSearchProvenance = {
  source: RELATIONSHIP_NATURAL_SEARCH_FIXTURE_SOURCE,
  sourceLabel: "Mock relationship natural search fixture",
  evidenceIds: mockRelationshipNaturalSearchEvidence.map(
    (evidence) => evidence.evidenceId,
  ),
  collectedAt: fixtureCollectedAt,
  privacy: "demo-relationship-natural-search-only",
  generationMethod: "fixture",
  semanticSearchExecuted: false,
  embeddingsGenerated: false,
  crossProviderIndexQueried: false,
  databaseQueryExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockRelationshipNaturalSearchFailureProvenance: RelationshipNaturalSearchProvenance = {
  ...mockRelationshipNaturalSearchProvenance,
  evidenceIds: ["evidence:relationship-search-controlled-failure"],
  generationMethod: "rule-based-relationship-natural-search",
};

function normalizeQuery(query?: string | null): string {
  return query?.trim() ?? "";
}

function normalizeFilters(
  input: RelationshipNaturalSearchInput = {},
): RelationshipNaturalSearchAppliedFilters {
  return {
    businessIntent:
      typeof input.businessIntent === "string" &&
      RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS.includes(
        input.businessIntent as RelationshipNaturalSearchBusinessIntent,
      )
        ? (input.businessIntent as RelationshipNaturalSearchBusinessIntent)
        : null,
    followUpStatuses:
      input.followUpStatusFilters?.filter(
        (status): status is RelationshipNaturalSearchFollowUpStatus =>
          RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES.includes(
            status as RelationshipNaturalSearchFollowUpStatus,
          ),
      ) ?? [],
    industries:
      input.industryFilters?.filter(
        (industry): industry is RelationshipNaturalSearchIndustry =>
          RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES.includes(
            industry as RelationshipNaturalSearchIndustry,
          ),
      ) ?? [],
    sources:
      input.sourceFilters?.filter(
        (source): source is RelationshipNaturalSearchSourceType =>
          RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES.includes(
            source as RelationshipNaturalSearchSourceType,
          ),
      ) ?? [],
    valueTypes:
      input.valueTypeFilters?.filter(
        (valueType): valueType is RelationshipNaturalSearchValueType =>
          RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES.includes(
            valueType as RelationshipNaturalSearchValueType,
          ),
      ) ?? [],
  };
}

export function buildRelationshipNaturalSearchPayload({
  input = {},
  results,
  state = "success",
}: {
  input?: RelationshipNaturalSearchInput;
  results: readonly RelationshipNaturalSearchResultItem[];
  state?: RelationshipNaturalSearchState;
}): RelationshipNaturalSearchPayload {
  const hasSearchInput =
    Boolean(normalizeQuery(input.query)) ||
    Boolean(input.businessIntent) ||
    Boolean(input.industryFilters?.length) ||
    Boolean(input.sourceFilters?.length) ||
    Boolean(input.valueTypeFilters?.length) ||
    Boolean(input.followUpStatusFilters?.length);
  const provenance: RelationshipNaturalSearchProvenance = {
    ...mockRelationshipNaturalSearchProvenance,
    evidenceIds: results.flatMap((result) =>
      result.evidence.map((evidence) => evidence.evidenceId),
    ),
    generationMethod: hasSearchInput
      ? "rule-based-relationship-natural-search"
      : "fixture",
  };

  return {
    state,
    query: normalizeQuery(input.query),
    results,
    appliedFilters: normalizeFilters(input),
    availableFilters: relationshipNaturalSearchAvailableFilters,
    summary:
      state === "success"
        ? `${results.length} relationship result(s) matched the mock natural search boundary.`
        : state === "pending"
          ? "Fixture review pending: relationship natural search has no released results yet."
          : "No relationship results are available for this mock state.",
    provenance,
    nextAction:
      state === "success"
        ? "Review source evidence before taking any follow-up action."
        : state === "pending"
          ? "Keep the pending state visible for operators; do not reinterpret it as empty results or start live semantic search."
          : "Clear the natural language query or choose a supported mock filter before searching relationships again.",
  };
}

export const mockRelationshipNaturalSearchFixture = buildRelationshipNaturalSearchPayload({
  results: mockRelationshipNaturalSearchResults,
});

export const mockPilotOperatorSearchFixture = buildRelationshipNaturalSearchPayload({
  input: {
    businessIntent: "find_warm_intro",
    followUpStatusFilters: ["needs_follow_up"],
    industryFilters: ["climate"],
    query: "pilot operator intro",
    sourceFilters: ["manual"],
    valueTypeFilters: ["strategic_intro"],
  },
  results: [mockRelationshipNaturalSearchResults[0]],
});

export const mockFintechReferralSearchFixture = buildRelationshipNaturalSearchPayload({
  input: {
    industryFilters: ["fintech"],
    query: "fintech referral",
    valueTypeFilters: ["referral_path"],
  },
  results: [mockRelationshipNaturalSearchResults[1]],
});

export const mockEmptyRelationshipNaturalSearchFixture = buildRelationshipNaturalSearchPayload({
  results: [],
  state: "empty",
});

export const mockPendingRelationshipNaturalSearchFixture = buildRelationshipNaturalSearchPayload({
  results: [],
  state: "pending",
});

export const mockRelationshipNaturalSearchSuggestions: readonly RelationshipNaturalSearchSuggestion[] = [
  {
    id: "relationship-search-suggestion:climate-operator-intro",
    query: "Who can introduce me to climate pilot operators?",
    businessIntent: "find_warm_intro",
    filterPreview: {
      ...emptyRelationshipNaturalSearchAppliedFilters,
      industries: ["climate"],
      valueTypes: ["strategic_intro"],
    },
    evidenceHint:
      "Uses manual dinner notes and event roster evidence in the fixture set.",
  },
  {
    id: "relationship-search-suggestion:investor-event-follow-up",
    query: "Which investors need an event follow-up this week?",
    businessIntent: "recover_event_follow_up",
    filterPreview: {
      ...emptyRelationshipNaturalSearchAppliedFilters,
      followUpStatuses: ["needs_follow_up"],
    },
    evidenceHint:
      "Uses event-import and source evidence with a follow-up status flag.",
  },
  {
    id: "relationship-search-suggestion:fintech-referral",
    query: "Find fintech partners with referral value",
    businessIntent: "explore_partnership",
    filterPreview: {
      ...emptyRelationshipNaturalSearchAppliedFilters,
      industries: ["fintech"],
      valueTypes: ["referral_path"],
    },
    evidenceHint:
      "Uses email signal evidence and relationship value tags from fixtures.",
  },
];

function buildSuggestionsPayload({
  suggestions,
  state = "success",
}: {
  suggestions: readonly RelationshipNaturalSearchSuggestion[];
  state?: RelationshipNaturalSearchState;
}): RelationshipNaturalSearchSuggestionsPayload {
  return {
    state,
    suggestions,
    summary:
      state === "success"
        ? "Mock suggestions expose supported natural search prompts and filters."
        : state === "pending"
          ? "Fixture review pending: mock natural search suggestions are not released yet."
          : "No mock natural search suggestions are available for this state.",
    provenance: {
      ...mockRelationshipNaturalSearchProvenance,
      evidenceIds: suggestions.map((suggestion) => suggestion.id),
    },
    nextAction:
      state === "success"
        ? "Choose one prompt and review the returned source evidence."
        : state === "pending"
          ? "Keep the pending suggestions state visible until fixture review completes."
          : "Use the default suggestions probe after fixture review completes.",
  };
}

export const mockRelationshipNaturalSearchSuggestionsFixture = buildSuggestionsPayload({
  suggestions: mockRelationshipNaturalSearchSuggestions,
});

export const mockEmptyRelationshipNaturalSearchSuggestionsFixture = buildSuggestionsPayload({
  suggestions: [],
  state: "empty",
});

export const mockPendingRelationshipNaturalSearchSuggestionsFixture = buildSuggestionsPayload({
  suggestions: [],
  state: "pending",
});
