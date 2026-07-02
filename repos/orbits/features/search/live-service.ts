import {
  RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS,
  RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
  type RelationshipNaturalSearchAppliedFilters,
  type RelationshipNaturalSearchBusinessIntent,
  type RelationshipNaturalSearchEvidence,
  type RelationshipNaturalSearchFailure,
  type RelationshipNaturalSearchFollowUpStatus,
  type RelationshipNaturalSearchIndustry,
  type RelationshipNaturalSearchInput,
  type RelationshipNaturalSearchInvalidBodyFailure,
  type RelationshipNaturalSearchPayload,
  type RelationshipNaturalSearchProvenance,
  type RelationshipNaturalSearchResult,
  type RelationshipNaturalSearchResultItem,
  type RelationshipNaturalSearchSourceReference,
  type RelationshipNaturalSearchSourceType,
  type RelationshipNaturalSearchState,
  type RelationshipNaturalSearchSuggestion,
  type RelationshipNaturalSearchSuggestionsInput,
  type RelationshipNaturalSearchSuggestionsPayload,
  type RelationshipNaturalSearchSuggestionsResult,
  type RelationshipNaturalSearchValueType,
} from "./contract";
import type { RelationshipSearchStore } from "./backend";
import { createBasicRulesRelationshipSearchBackend } from "./backends/basic-rules-backend";
import {
  emptyRelationshipNaturalSearchAppliedFilters,
  relationshipNaturalSearchAvailableFilters,
} from "./fixtures";
import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import type { RelationshipValueType } from "../../shared/domain/source-types";
import type { RelationshipNaturalSearchService } from "./service";
import type {
  LiveConnectionEvidenceGraph,
} from "../connections/storage/connection-live-record-provider";
import {
  createConfiguredStorageConnectionEvidenceProvider,
} from "../connections/storage/connection-live-record-provider";
import type { LiveConnectionEvidenceProvider } from "../connections/live-service";

export interface LiveRelationshipNaturalSearchServiceOptions {
  provider?: LiveConnectionEvidenceProvider | null;
}

const supportedSearchSourceTypes = new Set<RelationshipNaturalSearchSourceType>(
  RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function contactById(graph: LiveConnectionEvidenceGraph): Map<string, ContactDTO> {
  return new Map(graph.contacts.map((contact) => [contact.id, contact]));
}

function evidenceById(
  graph: LiveConnectionEvidenceGraph,
): Map<string, RelationshipEvidenceDTO> {
  return new Map(graph.evidence.map((evidence) => [evidence.id, evidence]));
}

function sourceTypeFor(value: string): RelationshipNaturalSearchSourceType {
  return supportedSearchSourceTypes.has(value as RelationshipNaturalSearchSourceType)
    ? (value as RelationshipNaturalSearchSourceType)
    : "manual";
}

function industryFor(input: {
  connection: ConnectionDTO;
  contact?: ContactDTO;
  evidence: readonly RelationshipEvidenceDTO[];
}): RelationshipNaturalSearchIndustry {
  const text = [
    input.contact?.organization,
    input.contact?.role,
    input.contact?.profileSnippet,
    input.connection.summary,
    ...(input.connection.sharedTopics ?? []),
    ...input.evidence.map((evidence) => evidence.summary),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/climate|energy|storage|carbon|solar|battery/.test(text)) {
    return "climate";
  }

  if (/fintech|venture|investor|fundraising|payment|bank/.test(text)) {
    return "fintech";
  }

  if (/health|medical|clinic|care/.test(text)) {
    return "healthcare";
  }

  if (/mobility|transport|logistics|travel|tourism/.test(text)) {
    return "mobility";
  }

  return "enterprise_saas";
}

function valueTypeFor(
  valueType: RelationshipValueType,
): RelationshipNaturalSearchValueType | null {
  switch (valueType) {
    case "commercial_opportunity":
    case "community_context":
    case "knowledge_exchange":
    case "referral_path":
      return valueType;
    case "strategic_fit":
      return "strategic_intro";
    default:
      return null;
  }
}

function valueTypesFor(
  connection: ConnectionDTO,
): readonly RelationshipNaturalSearchValueType[] {
  const values = connection.valueTypes
    .map(valueTypeFor)
    .filter(
      (valueType): valueType is RelationshipNaturalSearchValueType =>
        valueType !== null,
    );

  return values.length > 0 ? [...new Set(values)] : ["community_context"];
}

function followUpStatusFor(
  connection: ConnectionDTO,
): RelationshipNaturalSearchFollowUpStatus {
  switch (connection.stage) {
    case "needs_follow_up":
      return "needs_follow_up";
    case "archived":
    case "nurture":
      return "dormant";
    case "captured":
    case "reviewing":
      return "active";
    case "active":
    default:
      return "active";
  }
}

function businessIntentsFor(input: {
  connection: ConnectionDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  valueTypes: readonly RelationshipNaturalSearchValueType[];
}): readonly RelationshipNaturalSearchBusinessIntent[] {
  const text = [
    input.connection.summary,
    ...(input.connection.sharedTopics ?? []),
    ...(input.connection.suggestedActions ?? []),
    ...input.evidence.map((evidence) => evidence.summary),
  ]
    .join(" ")
    .toLowerCase();
  const intents: RelationshipNaturalSearchBusinessIntent[] = [];

  if (
    input.valueTypes.includes("referral_path") ||
    /intro|紹介|引荐|referral|investor|fundraising/.test(text)
  ) {
    intents.push("find_warm_intro");
  }

  if (
    input.valueTypes.includes("commercial_opportunity") ||
    /customer|buyer|pilot|poc|commercial|operator/.test(text)
  ) {
    intents.push("source_customer_reference");
  }

  if (input.connection.stage === "needs_follow_up" || /event|follow-up|会后/.test(text)) {
    intents.push("recover_event_follow_up");
  }

  intents.push("explore_partnership");

  return [...new Set(intents)];
}

function sourceReferenceFor(input: {
  connection: ConnectionDTO;
  evidence: RelationshipEvidenceDTO | null;
  evidenceId: string;
}): RelationshipNaturalSearchSourceReference {
  const type = sourceTypeFor(
    input.evidence?.sourceType ?? input.connection.source.type,
  );

  return {
    type,
    id: input.evidence?.sourceId ?? input.connection.source.id,
    label:
      input.connection.source.label ??
      input.evidence?.sourceId ??
      "Live relationship source",
    evidenceId: input.evidenceId,
  };
}

function evidenceFor(input: {
  connection: ConnectionDTO;
  evidence: RelationshipEvidenceDTO | null;
  evidenceId: string;
}): RelationshipNaturalSearchEvidence {
  return {
    evidenceId: input.evidenceId,
    source: sourceReferenceFor(input),
    excerpt:
      input.evidence?.summary ??
      input.connection.summary ??
      "Live relationship evidence is present without a summary.",
    capturedAt: input.evidence?.occurredAt ?? input.connection.updatedAt,
    createdBy: input.evidence?.createdBy ?? "relationship-natural-search-live",
  };
}

function scoreBand(score: number): "high" | "medium" | "low" {
  if (score >= 85) {
    return "high";
  }

  if (score >= 65) {
    return "medium";
  }

  return "low";
}

function relationshipContextFor(input: {
  connection: ConnectionDTO;
  contact?: ContactDTO;
  evidence: readonly RelationshipEvidenceDTO[];
}): string {
  return [
    input.connection.summary,
    input.contact?.profileSnippet,
    ...(input.connection.sharedTopics ?? []),
    ...input.evidence.map((evidence) => evidence.summary),
  ]
    .filter(Boolean)
    .join(" ");
}

function resultItemFor(input: {
  connection: ConnectionDTO;
  contact?: ContactDTO;
  evidenceMap: Map<string, RelationshipEvidenceDTO>;
}): RelationshipNaturalSearchResultItem {
  const evidenceRecords = input.connection.evidenceIds
    .map((evidenceId) => input.evidenceMap.get(evidenceId))
    .filter(
      (evidence): evidence is RelationshipEvidenceDTO => evidence !== undefined,
    );
  const evidence = input.connection.evidenceIds.map((evidenceId) =>
    evidenceFor({
      connection: input.connection,
      evidence: input.evidenceMap.get(evidenceId) ?? null,
      evidenceId,
    }),
  );
  const primaryEvidence = evidence[0];
  const valueTypes = valueTypesFor(input.connection);
  const score =
    input.connection.businessRelevanceScore ??
    input.connection.relationshipStrength ??
    50;

  return {
    id: `relationship-search-result:${input.connection.id}`,
    contactId: input.connection.contactId,
    displayName: input.contact?.displayName ?? input.connection.contactId,
    role: input.contact?.role ?? "",
    organization: input.contact?.organization ?? "",
    industry: industryFor({
      connection: input.connection,
      contact: input.contact,
      evidence: evidenceRecords,
    }),
    location: input.contact?.location ?? "",
    relationshipContext: relationshipContextFor({
      connection: input.connection,
      contact: input.contact,
      evidence: evidenceRecords,
    }),
    matchedBusinessIntents: businessIntentsFor({
      connection: input.connection,
      evidence: evidenceRecords,
      valueTypes,
    }),
    source:
      primaryEvidence?.source ??
      sourceReferenceFor({
        connection: input.connection,
        evidence: null,
        evidenceId: input.connection.evidenceIds[0],
      }),
    evidence,
    value: {
      score,
      valueTypes,
      rationale: input.connection.summary,
      evidenceIds: input.connection.evidenceIds,
    },
    followUpStatus: followUpStatusFor(input.connection),
    recommendedAction:
      input.connection.suggestedActions?.[0] ??
      "Review the live relationship context before taking action.",
    matchScore: {
      value: score,
      band: scoreBand(score),
      rationale:
        "Live rule-based search matched stored contact, connection, topic, and evidence fields.",
      matchedFields: [
        "displayName",
        "organization",
        "relationshipContext",
        "evidence",
        "value.valueTypes",
      ],
    },
    semanticSearchExecuted: false,
    embeddingGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: true,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function relationshipSearchSource(
  provider?: LiveConnectionEvidenceProvider | null,
): string {
  const source = provider?.source ?? "live-record-store:relationship-search:unconfigured";

  return source
    .replace(":connections:", ":relationship-search:")
    .replace("connections:", "relationship-search:");
}

function provenanceFor(input: {
  collectedAt?: string;
  databaseQueryExecuted: boolean;
  evidenceIds: readonly string[];
  provider?: LiveConnectionEvidenceProvider | null;
}): RelationshipNaturalSearchProvenance {
  return {
    source: relationshipSearchSource(input.provider),
    sourceLabel:
      input.provider?.sourceLabel ?? "Unconfigured relationship search live store",
    evidenceIds:
      input.evidenceIds.length > 0
        ? input.evidenceIds
        : ["evidence:relationship-search-live-store-unconfigured"],
    collectedAt: input.collectedAt ?? new Date(0).toISOString(),
    privacy: "live-relationship-natural-search",
    generationMethod: "live-store-query",
    semanticSearchExecuted: false,
    embeddingsGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: input.databaseQueryExecuted,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function normalizeQuery(query?: string | null): string {
  return query?.trim() ?? "";
}

function normalizeFilters(
  input: RelationshipNaturalSearchInput = {},
): RelationshipNaturalSearchAppliedFilters {
  return {
    businessIntent:
      typeof input.businessIntent === "string"
        ? (input.businessIntent as RelationshipNaturalSearchBusinessIntent)
        : null,
    followUpStatuses:
      input.followUpStatusFilters?.filter(
        (status): status is RelationshipNaturalSearchFollowUpStatus =>
          ["active", "dormant", "needs_follow_up", "waiting_on_them"].includes(
            status,
          ),
      ) ?? [],
    industries:
      input.industryFilters?.filter(
        (industry): industry is RelationshipNaturalSearchIndustry =>
          [
            "climate",
            "enterprise_saas",
            "fintech",
            "healthcare",
            "mobility",
          ].includes(industry),
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
          [
            "commercial_opportunity",
            "community_context",
            "knowledge_exchange",
            "referral_path",
            "strategic_intro",
          ].includes(valueType),
      ) ?? [],
  };
}

function evidenceIdsFor(
  results: readonly RelationshipNaturalSearchResultItem[],
): readonly string[] {
  return [
    ...new Set(
      results.flatMap((result) =>
        result.evidence.map((evidence) => evidence.evidenceId),
      ),
    ),
  ];
}

function payloadFor(input: {
  collectedAt: string;
  provider: LiveConnectionEvidenceProvider;
  request?: RelationshipNaturalSearchInput;
  results: readonly RelationshipNaturalSearchResultItem[];
  state?: RelationshipNaturalSearchState;
}): RelationshipNaturalSearchPayload {
  const state = input.state ?? (input.results.length > 0 ? "success" : "empty");

  return {
    state,
    query: normalizeQuery(input.request?.query),
    results: input.results,
    appliedFilters: normalizeFilters(input.request),
    availableFilters: relationshipNaturalSearchAvailableFilters,
    summary:
      state === "success"
        ? `${input.results.length} relationship result(s) matched the live relationship search boundary.`
        : state === "pending"
          ? "Live relationship search is waiting for relationship data review."
          : "No relationship results are available for this live search state.",
    provenance: provenanceFor({
      collectedAt: input.collectedAt,
      databaseQueryExecuted: true,
      evidenceIds: evidenceIdsFor(input.results),
      provider: input.provider,
    }),
    nextAction:
      state === "success"
        ? "Review live source evidence before taking any follow-up action."
        : state === "pending"
          ? "Keep the pending state visible until live relationship data review completes."
          : "Clear the query or choose supported filters before searching relationships again.",
  };
}

function suggestionsFor(
  provider: LiveConnectionEvidenceProvider,
  collectedAt: string,
): readonly RelationshipNaturalSearchSuggestion[] {
  return [
    {
      id: "relationship-search-suggestion:live-follow-up",
      query: "Who needs a follow-up from my live relationship graph?",
      businessIntent: "recover_event_follow_up",
      filterPreview: {
        ...emptyRelationshipNaturalSearchAppliedFilters,
        followUpStatuses: ["needs_follow_up"],
      },
      evidenceHint: provider.sourceLabel,
    },
    {
      id: "relationship-search-suggestion:live-intro",
      query: "Find warm introduction paths in my live relationship graph",
      businessIntent: "find_warm_intro",
      filterPreview: {
        ...emptyRelationshipNaturalSearchAppliedFilters,
        valueTypes: ["referral_path", "strategic_intro"],
      },
      evidenceHint: collectedAt,
    },
    {
      id: "relationship-search-suggestion:live-customer-reference",
      query: "Find customer reference opportunities from live contacts",
      businessIntent: "source_customer_reference",
      filterPreview: {
        ...emptyRelationshipNaturalSearchAppliedFilters,
        valueTypes: ["commercial_opportunity"],
      },
      evidenceHint: provider.sourceLabel,
    },
  ];
}

function suggestionsPayloadFor(input: {
  collectedAt: string;
  provider: LiveConnectionEvidenceProvider;
  state?: RelationshipNaturalSearchState;
  suggestions: readonly RelationshipNaturalSearchSuggestion[];
}): RelationshipNaturalSearchSuggestionsPayload {
  const state = input.state ?? (input.suggestions.length > 0 ? "success" : "empty");

  return {
    state,
    suggestions: input.suggestions,
    summary:
      state === "success"
        ? "Live suggestions expose supported relationship search prompts and filters."
        : state === "pending"
          ? "Live relationship search suggestions are waiting for data review."
          : "No live relationship search suggestions are available.",
    provenance: provenanceFor({
      collectedAt: input.collectedAt,
      databaseQueryExecuted: true,
      evidenceIds: input.suggestions.map((suggestion) => suggestion.id),
      provider: input.provider,
    }),
    nextAction:
      state === "success"
        ? "Choose one prompt and review returned source evidence."
        : state === "pending"
          ? "Keep the pending suggestions state visible until live data review completes."
          : "Run relationship search after live relationship data is available.",
  };
}

function relationshipResultsFor(
  graph: LiveConnectionEvidenceGraph,
): readonly RelationshipNaturalSearchResultItem[] {
  const contacts = contactById(graph);
  const evidence = evidenceById(graph);

  return graph.connections.map((connection) =>
    resultItemFor({
      connection,
      contact: contacts.get(connection.contactId),
      evidenceMap: evidence,
    }),
  );
}

function storeFor(input: {
  graph: LiveConnectionEvidenceGraph;
  provider: LiveConnectionEvidenceProvider;
}): RelationshipSearchStore {
  const results = relationshipResultsFor(input.graph);
  const suggestions = suggestionsFor(input.provider, input.graph.generatedAt);

  return {
    kind: "live_record",

    buildRelationshipPayload(payloadInput) {
      return clonePayload(
        payloadFor({
          collectedAt: input.graph.generatedAt,
          provider: input.provider,
          request: payloadInput.input,
          results: payloadInput.results,
          state: payloadInput.state,
        }),
      );
    },

    readFailureProvenance() {
      return provenanceFor({
        collectedAt: input.graph.generatedAt,
        databaseQueryExecuted: true,
        evidenceIds: [],
        provider: input.provider,
      });
    },

    readRelationshipResults() {
      return clonePayload(results);
    },

    readScenarioPayloads() {
      return {
        empty: clonePayload(
          payloadFor({
            collectedAt: input.graph.generatedAt,
            provider: input.provider,
            results: [],
            state: "empty",
          }),
        ),
        pending: clonePayload(
          payloadFor({
            collectedAt: input.graph.generatedAt,
            provider: input.provider,
            results: [],
            state: "pending",
          }),
        ),
        success: clonePayload(
          payloadFor({
            collectedAt: input.graph.generatedAt,
            provider: input.provider,
            results,
          }),
        ),
      };
    },

    readSuggestionScenarioPayloads() {
      return {
        empty: clonePayload(
          suggestionsPayloadFor({
            collectedAt: input.graph.generatedAt,
            provider: input.provider,
            state: "empty",
            suggestions: [],
          }),
        ),
        pending: clonePayload(
          suggestionsPayloadFor({
            collectedAt: input.graph.generatedAt,
            provider: input.provider,
            state: "pending",
            suggestions: [],
          }),
        ),
        success: clonePayload(
          suggestionsPayloadFor({
            collectedAt: input.graph.generatedAt,
            provider: input.provider,
            suggestions,
          }),
        ),
      };
    },
  };
}

function failure(
  code: RelationshipNaturalSearchFailure["error"]["code"],
  provenance: RelationshipNaturalSearchProvenance,
): RelationshipNaturalSearchFailure {
  const definition = RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function unconfiguredFailure(): RelationshipNaturalSearchFailure {
  return failure(
    "RELATIONSHIP_NATURAL_SEARCH_LIVE_STORE_UNCONFIGURED",
    provenanceFor({
      databaseQueryExecuted: false,
      evidenceIds: [],
    }),
  );
}

async function storeOrFailure(
  provider: LiveConnectionEvidenceProvider | null,
): Promise<RelationshipSearchStore | RelationshipNaturalSearchFailure> {
  if (!provider) {
    return unconfiguredFailure();
  }

  const graph = await provider.readConnectionEvidenceGraph();

  return storeFor({ graph, provider });
}

function isFailure(
  value: RelationshipSearchStore | RelationshipNaturalSearchFailure,
): value is RelationshipNaturalSearchFailure {
  return "success" in value && value.success === false;
}

export function createLiveRelationshipNaturalSearchService({
  provider = null,
}: LiveRelationshipNaturalSearchServiceOptions = {}): RelationshipNaturalSearchService {
  return {
    async getSearchSuggestions(
      input: RelationshipNaturalSearchSuggestionsInput = {},
    ): Promise<RelationshipNaturalSearchSuggestionsResult> {
      const store = await storeOrFailure(provider);

      if (isFailure(store)) {
        return store;
      }

      return createBasicRulesRelationshipSearchBackend({ store })
        .getSearchSuggestions(input);
    },

    invalidQueryBody(): RelationshipNaturalSearchInvalidBodyFailure {
      return failure(
        "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY",
        provenanceFor({
          databaseQueryExecuted: false,
          evidenceIds: [],
          provider,
        }),
      ) as RelationshipNaturalSearchInvalidBodyFailure;
    },

    async queryRelationships(
      input: RelationshipNaturalSearchInput = {},
    ): Promise<RelationshipNaturalSearchResult> {
      const store = await storeOrFailure(provider);

      if (isFailure(store)) {
        return store;
      }

      return createBasicRulesRelationshipSearchBackend({ store })
        .queryRelationships(input);
    },
  };
}

export function createConfiguredLiveRelationshipNaturalSearchService(): RelationshipNaturalSearchService {
  return createLiveRelationshipNaturalSearchService({
    provider: createConfiguredStorageConnectionEvidenceProvider({
      sourceLabel: "Relationship search Postgres live storage",
    }),
  });
}
