import assert from "node:assert/strict";
import test from "node:test";

import {
  RecommendationValidationError,
  type RecommendationValidationReason,
  validateRecommendations,
} from "../../features/events/event-operations/recommendation-validation";

const participantIds = ["source", "other", "target", "outside"];

function row(overrides: Record<string, unknown> = {}) {
  return {
    noMatchReason: null,
    recommendations: [
      {
        icebreakers: ["first", "second"],
        memberHint: "specific",
        rank: 1,
        reasons: ["compatible"],
        score: 80,
        targetParticipantId: "target",
      },
    ],
    sourceParticipantId: "source",
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    allowedTargetIdsBySource: new Map([
      ["source", new Set(["target"])],
      ["other", new Set(["target"])],
    ]),
    participantIds: ["source"],
    recommendationCount: 2,
    snapshotParticipants: participantIds.map((participantId) => ({ participantId })),
    value: [row()],
    ...overrides,
  } as unknown as Parameters<typeof validateRecommendations>[0];
}

test("recommendation validation accepts the valid fixture unchanged", () => {
  const valid = input();
  assert.strictEqual(validateRecommendations(valid), valid.value);
});

test("recommendation validation rejects every diagnostic reason with the fixed schema code", () => {
  const cases: readonly {
    build: () => ReturnType<typeof input>;
    reason: RecommendationValidationReason;
  }[] = [
    { reason: "source_count_mismatch", build: () => input({ value: [] }) },
    { reason: "unknown_source", build: () => input({ value: [row({ sourceParticipantId: "participant:canary" })] }) },
    {
      reason: "duplicate_source",
      build: () => input({ participantIds: ["source", "other"], value: [row(), row()] }),
    },
    {
      reason: "invalid_no_match_reason",
      build: () => input({ value: [row({ noMatchReason: null, recommendations: [] })] }),
    },
    {
      reason: "recommendation_count_exceeded",
      build: () => input({ recommendationCount: 1, value: [row({ recommendations: [row().recommendations[0], { ...row().recommendations[0], rank: 2, targetParticipantId: "outside" }] })] }),
    },
    { reason: "rank_mismatch", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], rank: 2 }] })] }) },
    { reason: "self_target", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], targetParticipantId: "source" }] })] }) },
    { reason: "unknown_target", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], targetParticipantId: "missing" }] })] }) },
    { reason: "target_outside_shortlist", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], targetParticipantId: "outside" }] })] }) },
    {
      reason: "duplicate_target",
      build: () => input({ value: [row({ recommendations: [row().recommendations[0], { ...row().recommendations[0], rank: 2 }] })] }),
    },
    { reason: "invalid_score", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], score: 101 }] })] }) },
    { reason: "invalid_reasons", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], reasons: [] }] })] }) },
    { reason: "invalid_icebreakers", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], icebreakers: ["only"] }] })] }) },
    { reason: "invalid_member_hint", build: () => input({ value: [row({ recommendations: [{ ...row().recommendations[0], memberHint: "" }] })] }) },
  ];

  for (const item of cases) {
    assert.throws(
      () => validateRecommendations(item.build()),
      (error: unknown) => {
        assert.ok(error instanceof RecommendationValidationError);
        assert.equal(error.code, "EVENT_OPERATIONS_AI_SCHEMA_INVALID");
        assert.equal(error.reason, item.reason);
        assert.doesNotMatch(error.message, /participant:canary/u);
        return true;
      },
      item.reason,
    );
  }
});
