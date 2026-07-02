import type {
  ContactDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS,
  REFERRAL_SOURCE_KINDS,
  type RecommendedContact,
  type RecommendedContactConfirmInput,
  type RecommendedContactConfirmationPayload,
  type RecommendedContactConfirmationResult,
  type RecommendedContactConfirmationSuccess,
  type RecommenderContext,
  type ReferralContactDraft,
  type ReferralRecommendationConfirmScenario,
  type ReferralRecommendationErrorCode,
  type ReferralRecommendationEvidence,
  type ReferralRecommendationFailure,
  type ReferralRecommendationInput,
  type ReferralRecommendationPayload,
  type ReferralRecommendationProvenance,
  type ReferralRecommendationResult,
  type ReferralRecommendationScenario,
  type ReferralRecommendationService,
  type ReferralRecommendationSuccess,
  type ReferralSourceKind,
  type ReferralSourceReference,
  type ReferralSourceSummary,
  type UserConfirmedRecommendedContact,
} from "./referral-contract";
import type {
  LiveReferralRecommendationGraph,
  LiveReferralRecommendationProvider,
} from "./storage/referral-live-record-provider";

export interface LiveReferralRecommendationServiceOptions {
  now?: () => string;
  provider?: LiveReferralRecommendationProvider | null;
}

interface LiveRecommendedContactRecord {
  contact: ContactDTO | null;
  draft: ReferralContactDraft;
  recommendation: RecommendedContact;
  sourceSummary: ReferralSourceSummary;
}

interface ReadReferralGraphSuccess {
  graph: LiveReferralRecommendationGraph;
  provider: LiveReferralRecommendationProvider;
}

type ReadReferralGraphResult =
  | ReadReferralGraphSuccess
  | ReferralRecommendationFailure;

const supportedScenarios = new Set<ReferralRecommendationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<ReferralRecommendationConfirmScenario>([
    "success",
    "pending",
    "blocked",
    "failure",
  ]);

const supportedSourceKinds = new Set<ReferralSourceKind>(
  REFERRAL_SOURCE_KINDS,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ReferralRecommendationPayload,
): ReferralRecommendationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: RecommendedContactConfirmationPayload,
): RecommendedContactConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeScenario(
  scenario?: ReferralRecommendationInput["scenario"],
): ReferralRecommendationScenario {
  if (scenario && supportedScenarios.has(scenario as ReferralRecommendationScenario)) {
    return scenario as ReferralRecommendationScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: RecommendedContactConfirmInput["scenario"],
): ReferralRecommendationConfirmScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as ReferralRecommendationConfirmScenario,
    )
  ) {
    return scenario as ReferralRecommendationConfirmScenario;
  }

  return "success";
}

function normalizeSourceKind(
  sourceKind?: ReferralRecommendationInput["sourceKind"],
): ReferralSourceKind | null {
  const normalized = sourceKind?.trim();

  if (!normalized) {
    return null;
  }

  return supportedSourceKinds.has(normalized as ReferralSourceKind)
    ? normalized as ReferralSourceKind
    : null;
}

function sourceKindFailure(
  sourceKind?: ReferralRecommendationInput["sourceKind"],
  provenance?: ReferralRecommendationProvenance,
): ReferralRecommendationFailure | null {
  const normalized = sourceKind?.trim();

  if (!normalized || supportedSourceKinds.has(normalized as ReferralSourceKind)) {
    return null;
  }

  return failure(
    "REFERRAL_SOURCE_NOT_SUPPORTED",
    provenance ?? unconfiguredProvenance(new Date(0).toISOString()),
  );
}

function sourceKindFor(
  recommendation: MatchRecommendationDTO,
): ReferralSourceKind {
  switch (recommendation.recommendationType) {
    case "warm_intro":
      return "investor_intro";
    case "context_share":
      return "community_referral";
    case "event_follow_up":
    default:
      return "founder_referral";
  }
}

function unconfiguredProvenance(now: string): ReferralRecommendationProvenance {
  return {
    source: "live-record-store:referral-recommendations:unconfigured",
    sourceLabel: "Unconfigured referral recommendation live store",
    evidenceIds: ["evidence:referral-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-referral-recommendations",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    deviceContactReadExecuted: false,
    calendarReadExecuted: false,
    emailReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod: ReferralRecommendationProvenance["generationMethod"];
  provider: LiveReferralRecommendationProvider;
  readExecuted?: boolean;
}): ReferralRecommendationProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:referral-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-referral-recommendations",
    generationMethod: input.generationMethod,
    liveDatabaseReadExecuted: input.readExecuted ?? true,
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    deviceContactReadExecuted: false,
    calendarReadExecuted: false,
    emailReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: ReferralRecommendationErrorCode,
  provenance: ReferralRecommendationProvenance,
): ReferralRecommendationFailure {
  const definition = REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS[code];

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

function sourceFor(input: {
  recommendation: MatchRecommendationDTO;
  sourceKind: ReferralSourceKind;
}): ReferralSourceReference {
  return {
    type: "referral",
    id: input.recommendation.source.id,
    label:
      input.recommendation.source.label ??
      "Live referral recommendation",
    sourceKind: input.sourceKind,
    referralId: input.recommendation.id,
  };
}

function confidenceFor(
  recommendation: MatchRecommendationDTO,
): "high" | "low" | "medium" {
  if (recommendation.score >= 0.82) {
    return "high";
  }

  if (recommendation.score >= 0.62) {
    return "medium";
  }

  return "low";
}

function contactFor(
  recommendation: MatchRecommendationDTO,
  contactsById: ReadonlyMap<string, ContactDTO>,
): ContactDTO | null {
  return recommendation.contactId
    ? contactsById.get(recommendation.contactId) ?? null
    : null;
}

function targetPersonFor(
  recommendation: MatchRecommendationDTO,
  peopleById: ReadonlyMap<string, NetworkPersonDTO>,
): NetworkPersonDTO | null {
  return recommendation.targetPersonId
    ? peopleById.get(recommendation.targetPersonId) ?? null
    : null;
}

function recommenderFor(
  recommendation: MatchRecommendationDTO,
  peopleById: ReadonlyMap<string, NetworkPersonDTO>,
): NetworkPersonDTO | null {
  return recommendation.introducedByPersonId
    ? peopleById.get(recommendation.introducedByPersonId) ?? null
    : null;
}

function displayNameFor(input: {
  contact: ContactDTO | null;
  person: NetworkPersonDTO | null;
  recommendation: MatchRecommendationDTO;
}): string {
  return (
    input.contact?.displayName ??
    input.person?.displayName ??
    `Recommended contact ${input.recommendation.id}`
  );
}

function roleFor(input: {
  contact: ContactDTO | null;
  person: NetworkPersonDTO | null;
}): string {
  return input.contact?.role ?? input.person?.role ?? "Recommended contact";
}

function organizationFor(input: {
  contact: ContactDTO | null;
  person: NetworkPersonDTO | null;
}): string {
  return input.contact?.organization ?? input.person?.organization ?? "";
}

function evidenceFor(input: {
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
  recommendation: MatchRecommendationDTO;
  source: ReferralSourceReference;
}): readonly ReferralRecommendationEvidence[] {
  return input.recommendation.evidenceIds.map((evidenceId) => {
    const evidence = input.evidenceById.get(evidenceId);

    return {
      evidenceId,
      source: input.source,
      sourceLabel: evidence?.sourceId ?? input.source.label,
      excerpt:
        evidence?.summary ??
        `${input.recommendation.id} came from live referral recommendation storage.`,
      capturedFields: ["recommender", "recommendedContact", "reason"],
      createdAt: evidence?.occurredAt ?? input.recommendation.createdAt,
      createdBy: "live-referral-recommendation-service",
    };
  });
}

function recommenderContextFor(input: {
  recommendation: MatchRecommendationDTO;
  recommender: NetworkPersonDTO | null;
  source: ReferralSourceReference;
}): RecommenderContext {
  const recommender = input.recommender;

  return {
    recommenderId: recommender?.id ?? `recommender:${input.recommendation.id}`,
    displayName: recommender?.displayName ?? "Orbit live recommendation source",
    role: recommender?.role ?? "Source-backed recommender",
    organization: recommender?.organization ?? "Orbit network",
    relationshipToUser:
      recommender?.profileSnippet ?? "Live source-backed recommendation path",
    warmPath:
      input.recommendation.suggestedActions[0] ??
      "Review source evidence before requesting any introduction.",
    trustSignal: `${Math.round(input.recommendation.score * 100)}% live recommendation confidence.`,
    source: input.source,
    evidenceIds: input.recommendation.evidenceIds,
    externalNetworkDiscoveryExecuted: false,
    automaticOutreachExecuted: false,
  };
}

function recommendationRecordFor(input: {
  contact: ContactDTO | null;
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
  generatedAt: string;
  peopleById: ReadonlyMap<string, NetworkPersonDTO>;
  provider: LiveReferralRecommendationProvider;
  recommendation: MatchRecommendationDTO;
}): LiveRecommendedContactRecord {
  const person = targetPersonFor(input.recommendation, input.peopleById);
  const recommender = recommenderFor(input.recommendation, input.peopleById);
  const sourceKind = sourceKindFor(input.recommendation);
  const source = sourceFor({
    recommendation: input.recommendation,
    sourceKind,
  });
  const evidence = evidenceFor({
    evidenceById: input.evidenceById,
    recommendation: input.recommendation,
    source,
  });
  const displayName = displayNameFor({
    contact: input.contact,
    person,
    recommendation: input.recommendation,
  });
  const role = roleFor({
    contact: input.contact,
    person,
  });
  const organization = organizationFor({
    contact: input.contact,
    person,
  });
  const recommenderContext = recommenderContextFor({
    recommendation: input.recommendation,
    recommender,
    source,
  });
  const provenance = provenanceFor({
    evidenceIds: input.recommendation.evidenceIds,
    generatedAt: input.generatedAt,
    generationMethod: "live-store-query",
    provider: input.provider,
  });
  const recommendedContact: RecommendedContact = {
    id: input.recommendation.id,
    displayName,
    role,
    organization,
    sourceKind,
    recommender: recommenderContext,
    relationshipContext:
      person?.profileSnippet ??
      input.contact?.profileSnippet ??
      input.recommendation.reason,
    reasonForRecommendation: input.recommendation.reason,
    suggestedNextAction:
      input.recommendation.suggestedActions[0] ??
      "Review recommender context before confirming this recommended contact.",
    introductionPath:
      input.recommendation.suggestedActions[0] ??
      "Ask the recommender for opt-in before any outreach.",
    confidence: confidenceFor(input.recommendation),
    confirmation: {
      required: true,
      state: "pending",
      question: `Confirm whether ${displayName} should become a live referral contact draft?`,
    },
    source,
    evidenceIds: input.recommendation.evidenceIds,
    evidence,
    provenance,
    readyForReview: true,
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
  const draft: ReferralContactDraft = {
    id: `referral-draft:live:${input.recommendation.id}`,
    recommendationId: input.recommendation.id,
    displayName,
    role,
    organization,
    sourceKind,
    recommender: recommenderContext,
    relationshipContext: recommendedContact.relationshipContext,
    suggestedNextAction: recommendedContact.suggestedNextAction,
    confidence: recommendedContact.confidence,
    source,
    evidence,
    provenance,
    confirmationRequired: true,
    userConfirmed: false,
    readyForReview: true,
    contactWriteExecuted: false,
    externalActionExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  };
  const sourceSummary: ReferralSourceSummary = {
    kind: sourceKind,
    label: source.label,
    recommenderCount: recommender ? 1 : 0,
    source,
    externalNetworkRequested: false,
    automaticOutreachExecuted: false,
    providerSyncRequested: false,
  };

  return {
    contact: input.contact,
    draft,
    recommendation: recommendedContact,
    sourceSummary,
  };
}

function recordsFor(input: {
  graph: LiveReferralRecommendationGraph;
  provider: LiveReferralRecommendationProvider;
}): readonly LiveRecommendedContactRecord[] {
  const contactsById = new Map(
    input.graph.contacts.map((contact) => [contact.id, contact]),
  );
  const peopleById = new Map(
    input.graph.networkPeople.map((person) => [person.id, person]),
  );
  const evidenceById = new Map(
    input.graph.evidence.map((evidence) => [evidence.id, evidence]),
  );

  return input.graph.recommendations.map((recommendation) =>
    recommendationRecordFor({
      contact: contactFor(recommendation, contactsById),
      evidenceById,
      generatedAt: input.graph.generatedAt,
      peopleById,
      provider: input.provider,
      recommendation,
    }),
  );
}

function sourceSummariesFor(
  records: readonly LiveRecommendedContactRecord[],
): readonly ReferralSourceSummary[] {
  const byKind = new Map<ReferralSourceKind, ReferralSourceSummary>();

  for (const record of records) {
    const existing = byKind.get(record.sourceSummary.kind);

    byKind.set(record.sourceSummary.kind, {
      ...record.sourceSummary,
      recommenderCount:
        (existing?.recommenderCount ?? 0) + record.sourceSummary.recommenderCount,
    });
  }

  return Array.from(byKind.values());
}

function listPayloadFor(input: {
  generatedAt: string;
  provider: LiveReferralRecommendationProvider;
  records: readonly LiveRecommendedContactRecord[];
  state?: "empty" | "pending" | "success";
}): ReferralRecommendationPayload {
  const state =
    input.state ?? (input.records.length > 0 ? "success" : "empty");
  const evidenceIds = unique(
    input.records.flatMap((record) => record.recommendation.evidenceIds),
  );

  return {
    state,
    referralSources: sourceSummariesFor(input.records),
    recommendations: input.records.map((record) => record.recommendation),
    contactDrafts: input.records.map((record) => record.draft),
    summary:
      state === "success"
        ? `${input.records.length} live referral recommendation(s) are staged for review.`
        : "No live referral recommendations are available for review.",
    provenance: provenanceFor({
      evidenceIds,
      generatedAt: input.generatedAt,
      generationMethod: "live-store-query",
      provider: input.provider,
    }),
    nextAction:
      state === "success"
        ? "Review recommender context before confirming any recommended contact."
        : "Wait for source-backed recommendations before staging referral drafts.",
  };
}

function scenarioResult(input: {
  generatedAt: string;
  provider: LiveReferralRecommendationProvider;
  records: readonly LiveRecommendedContactRecord[];
  scenario: ReferralRecommendationScenario;
}): ReferralRecommendationResult | null {
  switch (input.scenario) {
    case "empty":
      return success(
        listPayloadFor({
          generatedAt: input.generatedAt,
          provider: input.provider,
          records: [],
          state: "empty",
        }),
      );
    case "pending":
      return success(
        listPayloadFor({
          generatedAt: input.generatedAt,
          provider: input.provider,
          records: [],
          state: "pending",
        }),
      );
    case "failure":
      return failure(
        "REFERRAL_RECOMMENDATION_LIVE_STORE_FAILED",
        provenanceFor({
          evidenceIds: ["evidence:referral-live-controlled-failure"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-query",
          provider: input.provider,
        }),
      );
    case "success":
    default:
      return null;
  }
}

function scenarioConfirmationResult(input: {
  generatedAt: string;
  provider: LiveReferralRecommendationProvider;
  scenario: ReferralRecommendationConfirmScenario;
}): RecommendedContactConfirmationResult | null {
  switch (input.scenario) {
    case "pending":
      return failure(
        "REFERRAL_RECOMMENDATION_PENDING",
        provenanceFor({
          evidenceIds: ["evidence:referral-live-pending"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-query",
          provider: input.provider,
        }),
      );
    case "blocked":
      return failure(
        "REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED",
        provenanceFor({
          evidenceIds: ["evidence:referral-live-confirmation-blocked"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-confirmation",
          provider: input.provider,
        }),
      );
    case "failure":
      return failure(
        "REFERRAL_RECOMMENDATION_LIVE_STORE_FAILED",
        provenanceFor({
          evidenceIds: ["evidence:referral-live-controlled-failure"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-query",
          provider: input.provider,
        }),
      );
    case "success":
    default:
      return null;
  }
}

function confirmedContactFor(input: {
  actorLabel: string;
  confirmedAt: string;
  record: LiveRecommendedContactRecord;
  provenance: ReferralRecommendationProvenance;
}): UserConfirmedRecommendedContact {
  return {
    id: `confirmed-referral:live:${input.record.recommendation.id}`,
    recommendationId: input.record.recommendation.id,
    displayName: input.record.recommendation.displayName,
    role: input.record.recommendation.role,
    organization: input.record.recommendation.organization,
    sourceKind: input.record.recommendation.sourceKind,
    recommender: input.record.recommendation.recommender,
    confirmedAt: input.confirmedAt,
    confirmedBy: input.actorLabel,
    userConfirmed: true,
    source: input.record.recommendation.source,
    evidence: input.record.recommendation.evidence,
    provenance: input.provenance,
    nextAction:
      "Keep the confirmed referral in review until a future contact writer persists it.",
    contactWriteExecuted: false,
    externalOutreachExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  };
}

function confirmationPayloadFor(input: {
  actorLabel: string;
  confirmedAt: string;
  provider: LiveReferralRecommendationProvider;
  record: LiveRecommendedContactRecord;
}): RecommendedContactConfirmationPayload {
  const evidenceId = `evidence:referral-live-confirmed:${input.record.recommendation.id}`;
  const provenance = provenanceFor({
    evidenceIds: [...input.record.recommendation.evidenceIds, evidenceId],
    generatedAt: input.confirmedAt,
    generationMethod: "live-store-confirmation",
    provider: input.provider,
  });
  const createdEvidence: ReferralRecommendationEvidence = {
    evidenceId,
    source: input.record.recommendation.source,
    sourceLabel: "Live referral confirmation",
    excerpt: `${input.actorLabel} confirmed ${input.record.recommendation.displayName} from live referral recommendation evidence.`,
    capturedFields: ["recommendationId", "actorLabel", "confirmedAt"],
    createdAt: input.confirmedAt,
    createdBy: "live-referral-recommendation-service",
  };

  return {
    state: "confirmed",
    confirmedContact: confirmedContactFor({
      actorLabel: input.actorLabel,
      confirmedAt: input.confirmedAt,
      provenance,
      record: input.record,
    }),
    createdEvidence,
    confirmedAt: input.confirmedAt,
    confirmedBy: input.actorLabel,
    provenance,
    nextAction:
      "Review the confirmed referral contact before any future outreach or contact write.",
    contactWriteExecuted: false,
    externalActionExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  };
}

function actorLabelFor(actorLabel?: string | null): string {
  return nonEmpty(actorLabel) ?? "Live reviewer";
}

function isReferralFailure(
  result: ReadReferralGraphResult,
): result is ReferralRecommendationFailure {
  return "success" in result && result.success === false;
}

async function readGraph(input: {
  now: string;
  provider: LiveReferralRecommendationProvider | null | undefined;
}): Promise<ReadReferralGraphResult> {
  if (!input.provider) {
    return failure(
      "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  try {
    return {
      graph: await input.provider.readReferralRecommendationGraph(),
      provider: input.provider,
    };
  } catch {
    return failure(
      "REFERRAL_RECOMMENDATION_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:referral-live-store-failed"],
        generatedAt: input.now,
        generationMethod: "live-store-query",
        provider: input.provider,
        readExecuted: true,
      }),
    );
  }
}

export function createLiveReferralRecommendationService({
  now = () => new Date().toISOString(),
  provider,
}: LiveReferralRecommendationServiceOptions = {}): ReferralRecommendationService {
  return {
    async createReferralContactDrafts(
      input = {},
    ): Promise<ReferralRecommendationResult> {
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isReferralFailure(readResult)) {
        return readResult;
      }

      const unsupportedSourceKind = sourceKindFailure(
        input.sourceKind,
        provenanceFor({
          evidenceIds: ["evidence:referral-live-source-kind-unsupported"],
          generatedAt: readResult.graph.generatedAt,
          generationMethod: "live-store-query",
          provider: readResult.provider,
        }),
      );

      if (unsupportedSourceKind) {
        return unsupportedSourceKind;
      }

      const sourceKind = normalizeSourceKind(input.sourceKind);
      const allRecords = recordsFor(readResult);
      const filteredRecords = sourceKind
        ? allRecords.filter(
            (record) => record.recommendation.sourceKind === sourceKind,
          )
        : allRecords;
      const scenario = scenarioResult({
        generatedAt: readResult.graph.generatedAt,
        provider: readResult.provider,
        records: filteredRecords,
        scenario: normalizeScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      return success(
        listPayloadFor({
          generatedAt: readResult.graph.generatedAt,
          provider: readResult.provider,
          records: filteredRecords,
        }),
      );
    },

    async confirmRecommendedContact(
      input: RecommendedContactConfirmInput,
    ): Promise<RecommendedContactConfirmationResult> {
      const generatedAt = now();
      const readResult = await readGraph({
        now: generatedAt,
        provider,
      });

      if (isReferralFailure(readResult)) {
        return readResult;
      }

      const scenario = scenarioConfirmationResult({
        generatedAt: readResult.graph.generatedAt,
        provider: readResult.provider,
        scenario: normalizeConfirmationScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      const record = recordsFor(readResult).find(
        (candidate) => candidate.recommendation.id === input.recommendationId,
      );

      if (!record) {
        return failure(
          "REFERRAL_RECOMMENDATION_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:referral-live-not-found"],
            generatedAt: readResult.graph.generatedAt,
            generationMethod: "live-store-query",
            provider: readResult.provider,
          }),
        );
      }

      return confirmationSuccess(
        confirmationPayloadFor({
          actorLabel: actorLabelFor(input.actorLabel),
          confirmedAt: generatedAt,
          provider: readResult.provider,
          record,
        }),
      );
    },
  };
}
