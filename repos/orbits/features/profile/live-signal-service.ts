import {
  PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS,
  type ProfileSignalEvidence,
  type ProfileSignalProfileField,
  type ProfileSignalReviewQueueErrorCode,
  type ProfileSignalReviewQueueFailure,
  type ProfileSignalReviewQueuePayload,
  type ProfileSignalReviewQueueProvenance,
  type ProfileSignalReviewQueueResult,
  type ProfileSignalReviewQueueService,
  type ProfileSignalReviewQueueState,
  type ProfileSignalSourceKind,
  type ProfileSignalSuggestionAcceptedPayload,
  type ProfileSignalSuggestionAcceptedSuccess,
  type ProfileSignalSuggestionAcceptResult,
  type ProfileUpdateSuggestion,
} from "./signal-contract";
import type {
  LiveProfileSignalGraph,
  LiveProfileSignalProfileRecord,
  LiveProfileSignalProvider,
} from "./storage/profile-signal-live-record-provider";

export interface LiveProfileSignalReviewQueueServiceOptions {
  now?: () => string;
  provider: LiveProfileSignalProvider | null;
}

const emptyEvidenceId = "evidence:profile-signal-live-empty";
const unconfiguredEvidenceId = "evidence:profile-signal-live-unconfigured";

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function stableProfile(
  graph: LiveProfileSignalGraph,
): LiveProfileSignalProfileRecord | null {
  return (
    graph.profiles.find((profile) =>
      profile.id.includes("generated_operator"),
    ) ??
    [...graph.profiles].sort((left, right) => left.id.localeCompare(right.id))[0] ??
    null
  );
}

function evidenceSummary(
  graph: LiveProfileSignalGraph,
  evidenceId: string,
  fallback: string,
): string {
  return (
    graph.evidence.find((evidence) => evidence.id === evidenceId)?.summary ??
    fallback
  );
}

function truncateExcerpt(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function sourceEvidence(input: {
  collectedAt: string;
  evidenceId: string;
  excerpt: string;
  sourceKind: ProfileSignalSourceKind;
  sourceLabel: string;
}): ProfileSignalEvidence {
  return {
    evidenceId: input.evidenceId,
    sourceKind: input.sourceKind,
    sourceLabel: input.sourceLabel,
    excerpt: truncateExcerpt(input.excerpt),
    collectedAt: input.collectedAt,
  };
}

function provenance(input: {
  collectedAt: string;
  evidenceIds: readonly string[];
  provider: LiveProfileSignalProvider | null;
  source?: string;
  sourceLabel?: string;
}): ProfileSignalReviewQueueProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:profile-signals:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Profile signal live storage is not configured",
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "demo-profile-signals-only",
    generationMethod: "rule-based-signal-match",
  };
}

function failure(
  code: ProfileSignalReviewQueueErrorCode,
  input: {
    evidenceIds?: readonly string[];
    now: string;
    provider: LiveProfileSignalProvider | null;
  },
): ProfileSignalReviewQueueFailure {
  const failureProvenance = provenance({
    collectedAt: input.now,
    evidenceIds: input.evidenceIds ?? [`evidence:${code.toLowerCase()}`],
    provider: input.provider,
  });

  return {
    success: false,
    error: {
      ...PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: failureProvenance,
      evidenceIds: failureProvenance.evidenceIds,
    },
  };
}

function success(data: ProfileSignalReviewQueuePayload): {
  success: true;
  data: ProfileSignalReviewQueuePayload;
} {
  return {
    success: true,
    data,
  };
}

function accepted(
  data: ProfileSignalSuggestionAcceptedPayload,
): ProfileSignalSuggestionAcceptedSuccess {
  return {
    success: true,
    data,
  };
}

function profileCurrentValue(
  profile: LiveProfileSignalProfileRecord | null,
  field: ProfileSignalProfileField,
): string | readonly string[] {
  if (!profile) {
    return "";
  }

  const value = profile[field];

  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === "string" && value.trim() ? value : "";
}

function createSuggestion(input: {
  confidence: ProfileUpdateSuggestion["confidence"];
  createdAt: string;
  currentValue: string | readonly string[];
  evidence: ProfileSignalEvidence;
  id: string;
  provenance: ProfileSignalReviewQueueProvenance;
  rationale: string;
  sourceKind: ProfileSignalSourceKind;
  sourceLabel: string;
  suggestedValue: string | readonly string[];
  targetProfileField: ProfileSignalProfileField;
}): ProfileUpdateSuggestion {
  return {
    id: input.id,
    sourceKind: input.sourceKind,
    sourceLabel: input.sourceLabel,
    targetProfileField: input.targetProfileField,
    currentValue: input.currentValue,
    suggestedValue: input.suggestedValue,
    rationale: input.rationale,
    confidence: input.confidence,
    status: "pending",
    createdAt: input.createdAt,
    evidence: [input.evidence],
    provenance: input.provenance,
  };
}

function buildSuggestions(input: {
  graph: LiveProfileSignalGraph;
  now: string;
  profile: LiveProfileSignalProfileRecord | null;
  provider: LiveProfileSignalProvider;
}): readonly ProfileUpdateSuggestion[] {
  const latestMessage = [...input.graph.messages].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  )[0];
  const latestFollowUpMemory =
    [...input.graph.interactionMemories]
      .filter((memory) => memory.memoryType === "follow_up_request")
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0] ??
    [...input.graph.interactionMemories].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    )[0];
  const strongestConnection = [...input.graph.connections].sort(
    (left, right) =>
      (right.businessRelevanceScore ?? 0) - (left.businessRelevanceScore ?? 0),
  )[0];
  const contactForConnection = input.graph.contacts.find(
    (contact) => contact.id === strongestConnection?.contactId,
  );
  const suggestions: ProfileUpdateSuggestion[] = [];

  if (latestMessage) {
    const evidenceId = latestMessage.evidenceIds[0] ?? latestMessage.id;
    const suggestionProvenance = provenance({
      collectedAt: latestMessage.occurredAt,
      evidenceIds: [evidenceId],
      provider: input.provider,
    });

    suggestions.push(
      createSuggestion({
        confidence: "high",
        createdAt: input.now,
        currentValue: profileCurrentValue(input.profile, "relationshipGoal"),
        evidence: sourceEvidence({
          collectedAt: latestMessage.occurredAt,
          evidenceId,
          excerpt: evidenceSummary(input.graph, evidenceId, latestMessage.body),
          sourceKind: "chat",
          sourceLabel: latestMessage.source.label,
        }),
        id: `live-profile-suggestion-chat-${latestMessage.id}`,
        provenance: suggestionProvenance,
        rationale:
          "Recent chat notes repeatedly frame Orbit's value around concrete follow-up decisions.",
        sourceKind: "chat",
        sourceLabel: "Chat signal",
        suggestedValue: `Use recent relationship context to prioritize concrete follow up: ${latestMessage.body}`,
        targetProfileField: "relationshipGoal",
      }),
    );
  }

  if (latestFollowUpMemory) {
    const evidenceId =
      latestFollowUpMemory.evidenceIds[0] ?? latestFollowUpMemory.id;
    const suggestionProvenance = provenance({
      collectedAt: latestFollowUpMemory.occurredAt,
      evidenceIds: [evidenceId],
      provider: input.provider,
    });

    suggestions.push(
      createSuggestion({
        confidence: "medium",
        createdAt: input.now,
        currentValue: profileCurrentValue(
          input.profile,
          "preferredFollowUpWindow",
        ),
        evidence: sourceEvidence({
          collectedAt: latestFollowUpMemory.occurredAt,
          evidenceId,
          excerpt: evidenceSummary(
            input.graph,
            evidenceId,
            latestFollowUpMemory.summary,
          ),
          sourceKind: "activity",
          sourceLabel: latestFollowUpMemory.source.label,
        }),
        id: `live-profile-suggestion-activity-${latestFollowUpMemory.id}`,
        provenance: suggestionProvenance,
        rationale:
          "Recent interaction memory includes follow-up requests, so the operator should review a shorter follow-up window.",
        sourceKind: "activity",
        sourceLabel: "Activity signal",
        suggestedValue: "24 hours after sourced follow-up requests",
        targetProfileField: "preferredFollowUpWindow",
      }),
    );
  }

  if (strongestConnection && contactForConnection) {
    const evidenceId =
      strongestConnection.evidenceIds[0] ??
      contactForConnection.evidenceIds[0] ??
      strongestConnection.id;
    const suggestionProvenance = provenance({
      collectedAt: strongestConnection.updatedAt,
      evidenceIds: [evidenceId],
      provider: input.provider,
    });

    suggestions.push(
      createSuggestion({
        confidence: "medium",
        createdAt: input.now,
        currentValue: profileCurrentValue(
          input.profile,
          "targetRelationshipTypes",
        ),
        evidence: sourceEvidence({
          collectedAt: strongestConnection.updatedAt,
          evidenceId,
          excerpt: evidenceSummary(
            input.graph,
            evidenceId,
            `${contactForConnection.displayName}: ${strongestConnection.summary}`,
          ),
          sourceKind: "contact",
          sourceLabel: contactForConnection.source.label,
        }),
        id: `live-profile-suggestion-contact-${strongestConnection.id}`,
        provenance: suggestionProvenance,
        rationale:
          "The strongest generated relationship graph edges cluster around operators, founders, and community introduction paths.",
        sourceKind: "contact",
        sourceLabel: "Contact signal",
        suggestedValue: ["founders", "operators", "community leads"],
        targetProfileField: "targetRelationshipTypes",
      }),
    );
  }

  return suggestions.slice(0, 3);
}

function payload(input: {
  forceEmpty?: boolean;
  graph: LiveProfileSignalGraph;
  now: string;
  provider: LiveProfileSignalProvider;
  state?: ProfileSignalReviewQueueState;
}): ProfileSignalReviewQueuePayload {
  const profile = stableProfile(input.graph);
  const suggestions = buildSuggestions({
    graph: input.graph,
    now: input.now,
    profile,
    provider: input.provider,
  });
  const visibleSuggestions =
    input.forceEmpty === true
      ? []
      : input.state === "pending"
        ? suggestions.slice(0, 1)
        : suggestions;
  const evidenceIds =
    visibleSuggestions.flatMap((suggestion) => suggestion.provenance.evidenceIds);
  const signalProvenance = provenance({
    collectedAt: input.graph.generatedAt,
    evidenceIds: evidenceIds.length > 0 ? evidenceIds : [emptyEvidenceId],
    provider: input.provider,
  });

  if (visibleSuggestions.length === 0) {
    return {
      state: "empty",
      suggestions: [],
      summary: "No sourced profile suggestions are ready for review.",
      provenance: signalProvenance,
      nextAction:
        "Keep the profile unchanged until a sourced signal creates a suggestion.",
    };
  }

  return {
    state: input.state ?? "success",
    suggestions: visibleSuggestions,
    summary: `${visibleSuggestions.length} sourced profile suggestions are waiting for operator review.`,
    provenance: signalProvenance,
    nextAction: "Review each suggestion before applying any change to the profile.",
  };
}

function acceptSuggestion(input: {
  id: string;
  now: string;
  payload: ProfileSignalReviewQueuePayload;
  provider: LiveProfileSignalProvider;
}): ProfileSignalSuggestionAcceptResult {
  const suggestion = input.payload.suggestions.find(
    (candidate) => candidate.id === input.id,
  );

  if (!suggestion) {
    return failure("PROFILE_SIGNAL_SUGGESTION_NOT_FOUND", {
      evidenceIds: [`evidence:profile-signal-suggestion-not-found:${input.id}`],
      now: input.now,
      provider: input.provider,
    });
  }

  if (suggestion.status !== "pending") {
    return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED", {
      evidenceIds: [
        `evidence:profile-signal-suggestion-already-resolved:${input.id}`,
      ],
      now: input.now,
      provider: input.provider,
    });
  }

  return accepted({
    state: "accepted",
    acceptedSuggestion: {
      ...suggestion,
      status: "accepted",
    },
    profilePatch: {
      [suggestion.targetProfileField]: suggestion.suggestedValue,
    },
    appliedFields: [suggestion.targetProfileField],
    acceptedAt: input.now,
    provenance: suggestion.provenance,
    nextAction:
      "Apply this patch only after the operator confirms the profile save.",
  });
}

export function createLiveProfileSignalReviewQueueService({
  now = () => new Date().toISOString(),
  provider,
}: LiveProfileSignalReviewQueueServiceOptions): ProfileSignalReviewQueueService {
  async function readPayload(
    state?: ProfileSignalReviewQueueState,
  ): Promise<ProfileSignalReviewQueueResult> {
    const capturedNow = now();

    if (!provider) {
      return failure("PROFILE_SIGNAL_LIVE_STORE_UNCONFIGURED", {
        evidenceIds: [unconfiguredEvidenceId],
        now: capturedNow,
        provider,
      });
    }

    const graph = await provider.readSignalGraph();

    return success(
      payload({
        graph,
        forceEmpty: state === "empty",
        now: capturedNow,
        provider,
        state: state === "empty" ? undefined : state,
      }),
    );
  }

  return {
    async listUpdateSuggestions(input = {}) {
      switch (input.scenario) {
        case "empty":
          return readPayload("empty");
        case "pending":
          return readPayload("pending");
        case "failure":
          return failure("PROFILE_SIGNAL_REVIEW_QUEUE_FAILED", {
            now: now(),
            provider,
          });
        case "success":
        default:
          return readPayload();
      }
    },

    async acceptUpdateSuggestion(id) {
      const capturedNow = now();

      if (!provider) {
        return failure("PROFILE_SIGNAL_LIVE_STORE_UNCONFIGURED", {
          evidenceIds: [unconfiguredEvidenceId],
          now: capturedNow,
          provider,
        });
      }

      const graphResult = provider.readSignalGraph();
      const graph = isThenable(graphResult) ? await graphResult : graphResult;
      const queuePayload = payload({
        graph,
        now: capturedNow,
        provider,
      });

      return acceptSuggestion({
        id,
        now: capturedNow,
        payload: queuePayload,
        provider,
      });
    },
  };
}
