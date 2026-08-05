import {
  EventOperationsError,
  type EventOperationsParticipant,
  type EventOperationsParticipantRecommendations,
} from "./contract";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type RecommendationValidationReason =
  | "source_count_mismatch"
  | "unknown_source"
  | "duplicate_source"
  | "invalid_no_match_reason"
  | "recommendation_count_exceeded"
  | "rank_mismatch"
  | "self_target"
  | "unknown_target"
  | "target_outside_shortlist"
  | "duplicate_target"
  | "invalid_score"
  | "invalid_reasons"
  | "invalid_icebreakers"
  | "invalid_member_hint";

export class RecommendationValidationError extends EventOperationsError {
  readonly reason: RecommendationValidationReason;

  constructor(reason: RecommendationValidationReason) {
    super(
      "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
      "Event operations recommendation validation failed.",
    );
    this.name = "RecommendationValidationError";
    this.reason = reason;
  }
}

function invalid(reason: RecommendationValidationReason): never {
  throw new RecommendationValidationError(reason);
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
    invalid("source_count_mismatch");
  }

  for (const row of input.value) {
    if (!expectedSources.has(row.sourceParticipantId)) invalid("unknown_source");
    if (seenSources.has(row.sourceParticipantId)) invalid("duplicate_source");
    seenSources.add(row.sourceParticipantId);

    if (row.recommendations.length === 0 && !nonEmpty(row.noMatchReason)) invalid("invalid_no_match_reason");
    if (row.recommendations.length > input.recommendationCount) {
      invalid("recommendation_count_exceeded");
    }

    const seenTargets = new Set<string>();
    for (const [index, recommendation] of row.recommendations.entries()) {
      if (recommendation.rank !== index + 1) invalid("rank_mismatch");
      if (recommendation.targetParticipantId === row.sourceParticipantId) invalid("self_target");
      if (!allParticipants.has(recommendation.targetParticipantId)) invalid("unknown_target");
      if (!input.allowedTargetIdsBySource.get(row.sourceParticipantId)?.has(recommendation.targetParticipantId)) {
        invalid("target_outside_shortlist");
      }
      if (seenTargets.has(recommendation.targetParticipantId)) invalid("duplicate_target");
      if (!Number.isFinite(recommendation.score) || recommendation.score < 0 || recommendation.score > 100) {
        invalid("invalid_score");
      }
      if (!Array.isArray(recommendation.reasons) || recommendation.reasons.length === 0 || !recommendation.reasons.every(nonEmpty)) {
        invalid("invalid_reasons");
      }
      if (!Array.isArray(recommendation.icebreakers) || recommendation.icebreakers.length !== 2 || !recommendation.icebreakers.every(nonEmpty)) {
        invalid("invalid_icebreakers");
      }
      if (!nonEmpty(recommendation.memberHint)) invalid("invalid_member_hint");
      seenTargets.add(recommendation.targetParticipantId);
    }
    if (
      (row.recommendations.length === 0 && !nonEmpty(row.noMatchReason)) ||
      (row.recommendations.length > 0 && row.noMatchReason !== null)
    ) {
      invalid("invalid_no_match_reason");
    }
  }

  return input.value;
}
