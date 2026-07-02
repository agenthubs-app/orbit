import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  RELATIONSHIP_VALUE_ERROR_DEFINITIONS,
  type RelationshipValueAssessment,
  type RelationshipValueErrorCode,
  type RelationshipValueFailure,
  type RelationshipValueFailureForCode,
  type RelationshipValueInvalidBodyFailure,
  type RelationshipValuePayload,
  type RelationshipValuePriorityBand,
  type RelationshipValuePriorityFactor,
  type RelationshipValueProvenance,
  type RelationshipValueRecomputeInput,
  type RelationshipValueResult,
  type RelationshipValueScoringService,
  type RelationshipValueSourceEvidence,
  type RelationshipValueState,
  type RelationshipValueSuggestedNextAction,
  type RelationshipValueType,
} from "./value-contract";
import type {
  LiveRelationshipValueProvider,
} from "./storage/relationship-value-live-record-provider";

export interface LiveRelationshipValueScoringServiceOptions {
  now?: () => string;
  provider: LiveRelationshipValueProvider | null;
}

const emptyEvidenceId = "evidence:relationship-value-live-empty";
const pendingEvidenceId = "evidence:relationship-value-live-pending";
const unconfiguredEvidenceId =
  "evidence:relationship-value-live-unconfigured";

function valueTypeFor(connection: ConnectionDTO): RelationshipValueType {
  if (connection.valueTypes.includes("referral_path")) {
    return "strategic_intro";
  }

  if (connection.valueTypes.includes("community_context")) {
    return "community_bridge";
  }

  if (connection.stage === "needs_follow_up") {
    return "event_follow_up";
  }

  return "low_context";
}

function priorityBand(value: number): RelationshipValuePriorityBand {
  if (value >= 85) {
    return "critical";
  }

  if (value >= 70) {
    return "high";
  }

  if (value >= 55) {
    return "medium";
  }

  return "low";
}

function safeSourceType(
  sourceType: RelationshipEvidenceDTO["sourceType"],
): RelationshipValueSourceEvidence["sourceType"] {
  if (
    sourceType === "event_import" ||
    sourceType === "manual" ||
    sourceType === "email_signal"
  ) {
    return sourceType;
  }

  return "manual";
}

function contributionFor(
  evidence: RelationshipEvidenceDTO,
): RelationshipValueSourceEvidence["contribution"] {
  if (evidence.sourceType === "event_import") {
    return "met_at_event";
  }

  if (evidence.sourceType === "email_signal") {
    return "decision_window";
  }

  if (/follow[- ]?up/i.test(evidence.summary)) {
    return "follow_up_urgency";
  }

  return "business_context";
}

function sourceEvidenceFor(
  evidence: RelationshipEvidenceDTO,
): RelationshipValueSourceEvidence {
  return {
    evidenceId: evidence.id,
    label: evidence.summary,
    sourceType: safeSourceType(evidence.sourceType),
    contribution: contributionFor(evidence),
    capturedAt: evidence.occurredAt,
  };
}

function provenance(input: {
  collectedAt: string;
  databaseReadExecuted: boolean;
  evidenceIds: readonly string[];
  provider: LiveRelationshipValueProvider | null;
  source?: string;
  sourceLabel?: string;
}): RelationshipValueProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:relationship-value:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Relationship value live storage is not configured",
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "demo-relationship-value-only",
    generationMethod: "rule-based",
    databaseReadExecuted: input.databaseReadExecuted,
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

function failure<TCode extends RelationshipValueErrorCode>(
  code: TCode,
  input: {
    now: string;
    provider: LiveRelationshipValueProvider | null;
  },
): RelationshipValueFailureForCode<TCode> {
  const failureProvenance = provenance({
    collectedAt: input.now,
    databaseReadExecuted: input.provider !== null,
    evidenceIds: [unconfiguredEvidenceId],
    provider: input.provider,
  });

  return {
    success: false,
    error: {
      ...RELATIONSHIP_VALUE_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: failureProvenance,
      evidenceIds: failureProvenance.evidenceIds,
    },
  } as RelationshipValueFailureForCode<TCode>;
}

function success(data: RelationshipValuePayload): RelationshipValueResult {
  return {
    success: true,
    data,
  };
}

function emptyPayload(input: {
  evidenceId: string;
  now: string;
  provider: LiveRelationshipValueProvider;
  state: RelationshipValueState;
  summary: string;
  nextAction: string;
}): RelationshipValuePayload {
  return {
    state: input.state,
    assessment: null,
    summary: input.summary,
    provenance: provenance({
      collectedAt: input.now,
      databaseReadExecuted: true,
      evidenceIds: [input.evidenceId],
      provider: input.provider,
    }),
    nextAction: input.nextAction,
  };
}

function evidenceForConnection(input: {
  connection: ConnectionDTO;
  contact: ContactDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  selectedEvidenceIds?: readonly string[] | null;
}): readonly RelationshipEvidenceDTO[] {
  const defaultIds = [
    ...input.connection.evidenceIds,
    ...input.contact.evidenceIds,
  ];
  const selectedIds = input.selectedEvidenceIds?.length
    ? input.selectedEvidenceIds
    : defaultIds;
  const selected = selectedIds
    .map((evidenceId) =>
      input.evidence.find((evidence) => evidence.id === evidenceId),
    )
    .filter((evidence): evidence is RelationshipEvidenceDTO => Boolean(evidence));

  return selected.length > 0
    ? selected
    : input.evidence.filter((evidence) => defaultIds.includes(evidence.id));
}

function factorForEvidence(
  evidence: RelationshipEvidenceDTO,
): RelationshipValuePriorityFactor {
  return {
    label:
      contributionFor(evidence) === "follow_up_urgency"
        ? "Evidence confirms follow-up urgency"
        : "Evidence confirms business context",
    points: 5,
    evidenceIds: [evidence.id],
  };
}

function scoreFor(input: {
  connection: ConnectionDTO;
  evidence: readonly RelationshipEvidenceDTO[];
}): {
  calculation: string;
  factors: readonly RelationshipValuePriorityFactor[];
  value: number;
} {
  const base = input.connection.businessRelevanceScore ?? 40;
  const stagePoints = 0;
  const evidencePoints = input.evidence.length * 5;
  const value = Math.min(100, base + stagePoints + evidencePoints);
  const factors: RelationshipValuePriorityFactor[] = [
    {
      label: "Generated relationship relevance score",
      points: base,
      evidenceIds: input.connection.evidenceIds,
    },
  ];

  factors.push(...input.evidence.map(factorForEvidence));

  return {
    calculation: `live rule: base ${base} + stage ${stagePoints} + evidence ${evidencePoints}`,
    factors,
    value,
  };
}

function suggestedNextAction(
  connection: ConnectionDTO,
): RelationshipValueSuggestedNextAction {
  const action = connection.suggestedActions?.[0] ?? "review sourced context";

  return {
    label: `Follow up about ${action}`,
    dueWindow:
      connection.stage === "needs_follow_up" ? "within 24 hours" : "this week",
    channel:
      connection.stage === "needs_follow_up" ? "email" : "manual_note",
    confidence:
      (connection.businessRelevanceScore ?? 0) >= 70 ? "high" : "medium",
    reason: `The generated relationship graph suggests ${action}.`,
  };
}

function assessment(input: {
  connection: ConnectionDTO;
  contact: ContactDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  now: string;
}): RelationshipValueAssessment {
  const score = scoreFor(input);
  const evidence = input.evidence.map(sourceEvidenceFor);
  const sourceEvidenceIds = evidence.map((item) => item.evidenceId);

  return {
    id: `relationship-value:${input.connection.id}`,
    connectionId: input.connection.id,
    contactId: input.contact.id,
    contactDisplayName: input.contact.displayName,
    relationshipValueType: valueTypeFor(input.connection),
    priorityScore: {
      value: score.value,
      band: priorityBand(score.value),
      calculation: score.calculation,
      factors: score.factors,
    },
    rationale: {
      summary: `${input.contact.displayName} has relationship value because ${input.connection.summary}`,
      evidence,
      limitations: [
        "Live rule scoring reads generated relationship records only; it does not use email, calendar, notification, or AI providers.",
      ],
    },
    suggestedNextAction: suggestedNextAction(input.connection),
    sourceEvidenceIds,
    scoredAt: input.now,
    createdBy: "live-relationship-value-scoring-service",
  };
}

async function payload(input: {
  connectionId: string;
  now: string;
  provider: LiveRelationshipValueProvider;
  selectedEvidenceIds?: readonly string[] | null;
}): Promise<RelationshipValueResult> {
  const graph = await input.provider.readRelationshipGraph();
  const connection = graph.connections.find(
    (candidate) => candidate.id === input.connectionId,
  );

  if (!connection) {
    return failure("RELATIONSHIP_VALUE_NOT_FOUND", {
      now: input.now,
      provider: input.provider,
    });
  }

  const contact = graph.contacts.find(
    (candidate) => candidate.id === connection.contactId,
  );

  if (!contact) {
    return failure("RELATIONSHIP_VALUE_NOT_FOUND", {
      now: input.now,
      provider: input.provider,
    });
  }

  const selectedEvidence = evidenceForConnection({
    connection,
    contact,
    evidence: graph.evidence,
    selectedEvidenceIds: input.selectedEvidenceIds,
  });
  const valueAssessment = assessment({
    connection,
    contact,
    evidence: selectedEvidence,
    now: input.now,
  });
  const evidenceIds = valueAssessment.sourceEvidenceIds;

  return success({
    state: "success",
    assessment: valueAssessment,
    summary: `${contact.displayName} is in the ${valueAssessment.priorityScore.band} relationship value band.`,
    provenance: provenance({
      collectedAt: graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds,
      provider: input.provider,
    }),
    nextAction: input.selectedEvidenceIds?.length
      ? "Use the selected evidence before acting on the suggested follow-up."
      : `${valueAssessment.suggestedNextAction.label}.`,
  });
}

export function createLiveRelationshipValueScoringService({
  now = () => new Date().toISOString(),
  provider,
}: LiveRelationshipValueScoringServiceOptions): RelationshipValueScoringService {
  return {
    async getRelationshipValue(input) {
      const capturedNow = now();

      if (!provider) {
        return failure("RELATIONSHIP_VALUE_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }

      switch (input.scenario) {
        case "empty":
          return success(
            emptyPayload({
              evidenceId: emptyEvidenceId,
              now: capturedNow,
              provider,
              state: "empty",
              summary: "No live relationship value can be scored without evidence.",
              nextAction:
                "Select a live connection with evidence before scoring relationship value.",
            }),
          );
        case "pending":
          return success(
            emptyPayload({
              evidenceId: pendingEvidenceId,
              now: capturedNow,
              provider,
              state: "pending",
              summary:
                "Relationship value scoring is waiting for live source review before a priority score is exposed.",
              nextAction:
                "Wait for live source review before recomputing relationship value.",
            }),
          );
        case "failure":
          return failure("RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED", {
            now: capturedNow,
            provider,
          });
        case "success":
        default:
          return payload({
            connectionId: input.connectionId,
            now: capturedNow,
            provider,
          });
      }
    },

    async recomputeRelationshipValue(input: RelationshipValueRecomputeInput) {
      const capturedNow = now();

      if (!provider) {
        return failure("RELATIONSHIP_VALUE_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }

      if (input.scenario === "pending") {
        return failure("RELATIONSHIP_VALUE_RECOMPUTE_PENDING", {
          now: capturedNow,
          provider,
        });
      }

      if (input.scenario === "empty") {
        return this.getRelationshipValue(input);
      }

      if (input.scenario === "failure") {
        return failure("RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED", {
          now: capturedNow,
          provider,
        });
      }

      return payload({
        connectionId: input.connectionId,
        now: capturedNow,
        provider,
        selectedEvidenceIds: input.evidenceIds,
      });
    },

    invalidRecomputeBody(): RelationshipValueInvalidBodyFailure {
      return failure("RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY", {
        now: now(),
        provider,
      });
    },
  };
}
