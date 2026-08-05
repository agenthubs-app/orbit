import {
  EventOperationsError,
  type EventOperationsParticipant,
  type EventOperationsParticipantRecommendations,
} from "./contract";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRecommendations(input: {
  allowedTargetIdsBySource: ReadonlyMap<string, ReadonlySet<string>>;
  participantIds: readonly string[];
  recommendationCount: number;
  snapshotParticipants: readonly EventOperationsParticipant[];
  value: readonly EventOperationsParticipantRecommendations[];
}): readonly EventOperationsParticipantRecommendations[] {
  const expectedSources = new Set(input.participantIds);
  const allParticipants = new Set(
    input.snapshotParticipants.map((participant) => participant.participantId),
  );
  const seenSources = new Set<string>();

  if (input.value.length !== expectedSources.size) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
      "The AI shard did not return exactly one result for every source participant.",
    );
  }

  for (const row of input.value) {
    if (
      !expectedSources.has(row.sourceParticipantId) ||
      seenSources.has(row.sourceParticipantId)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "The AI shard returned an unknown or duplicate source participant.",
      );
    }
    seenSources.add(row.sourceParticipantId);

    if (row.recommendations.length === 0 && !nonEmpty(row.noMatchReason)) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "A participant with no AI match must include a concrete no-match reason.",
      );
    }
    if (row.recommendations.length > input.recommendationCount) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "The AI shard returned more recommendations than configured.",
      );
    }

    const seenTargets = new Set<string>();
    for (const [index, recommendation] of row.recommendations.entries()) {
      if (
        recommendation.rank !== index + 1 ||
        recommendation.targetParticipantId === row.sourceParticipantId ||
        !allParticipants.has(recommendation.targetParticipantId) ||
        !input.allowedTargetIdsBySource
          .get(row.sourceParticipantId)
          ?.has(recommendation.targetParticipantId) ||
        seenTargets.has(recommendation.targetParticipantId) ||
        !Number.isFinite(recommendation.score) ||
        recommendation.score < 0 ||
        recommendation.score > 100 ||
        !Array.isArray(recommendation.reasons) ||
        recommendation.reasons.length === 0 ||
        !recommendation.reasons.every(nonEmpty) ||
        !Array.isArray(recommendation.icebreakers) ||
        recommendation.icebreakers.length !== 2 ||
        !recommendation.icebreakers.every(nonEmpty) ||
        !nonEmpty(recommendation.memberHint)
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
          "An AI recommendation violated the event operations schema.",
        );
      }
      seenTargets.add(recommendation.targetParticipantId);
    }
    if (
      (row.recommendations.length === 0 && !nonEmpty(row.noMatchReason)) ||
      (row.recommendations.length > 0 && row.noMatchReason !== null)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "Recommendation rows must use noMatchReason only for an empty result.",
      );
    }
  }

  return input.value;
}
