import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecommendationTaskEvaluationRecords,
  evaluateRecommendationTask,
  hashEvaluationValue,
  interleaveEvaluationArms,
  parseEvaluationOptions,
  redactEvaluationRecord,
} from "../../scripts/evaluate-event-operations-recommendations";

test("evaluation schedule pairs every shard and rotates arm ordering", () => {
  const planned = interleaveEvaluationArms(
    [
      ["warm:one", "warm:two"],
      ["cold:one", "cold:two"],
    ],
    2,
  );
  assert.deepEqual(
    planned.map((item) => item.value),
    [
      "warm:one", "cold:one", "cold:two", "warm:two",
      "cold:one", "warm:one", "warm:two", "cold:two",
    ],
  );
  assert.deepEqual(planned.map((item) => item.round), [1, 1, 1, 1, 2, 2, 2, 2]);
});

test("evaluation options default to read-only A/B settings", () => {
  assert.deepEqual(parseEvaluationOptions(["--generation-id", "generation:one"]), {
    concurrency: 1,
    execute: false,
    generationId: "generation:one",
    rounds: 3,
    temperatures: [1, 0.2],
  });
});

test("evaluation options accept an explicit execute switch", () => {
  assert.equal(
    parseEvaluationOptions(["--generation-id", "generation:one", "--execute", "--rounds", "2"]).execute,
    true,
  );
});

test("evaluation redaction contains hashes and counts but no identifiers", () => {
  const record = redactEvaluationRecord({
    candidateCount: 96,
    generationId: "generation:secret",
    requestFingerprint: "request:secret",
    snapshotHash: "snapshot:public-hash",
    taskCount: 6,
  });
  assert.equal(record.generationHash, hashEvaluationValue("generation:secret"));
  assert.doesNotMatch(JSON.stringify(record), /generation:secret|request:secret/u);
  assert.equal(record.candidateCount, 96);
});

test("evaluation builds a hash-only record for each recommendation task", () => {
  const participant = (participantId: string) => ({
    participantId,
    profileAnswers: { fullProfileCanary: `canary:${participantId}` },
  });
  const participants = Array.from({ length: 12 }, (_, index) => participant(`participant:${index}`));
  const tasks = Array.from({ length: 11 }, (_, index) => ({
    kind: "recommendation_shard" as const,
    participantIds: [`participant:${index}`],
    taskId: `task:${index}`,
  }));
  const candidates = tasks.map((task, index) => ({
    featurePayload: {},
    generationId: "generation:private",
    retrievalRank: 1,
    retrievalScore: 1,
    sourceParticipantId: task.participantIds[0],
    targetParticipantId: `participant:${index + 1}`,
  }));
  const records = createRecommendationTaskEvaluationRecords({
    aiRequestFingerprint: "fingerprint:one",
    candidates,
    eventId: "event:private",
    participants: participants as never,
    recommendationCount: 3,
    tasks: tasks as never,
  });
  assert.equal(records.length, 11);
  assert.equal(new Set(records.map((record) => record.requestHash)).size, 11);
  assert.doesNotMatch(
    JSON.stringify(records),
    /participant:|event:private|fullProfileCanary|canary:/u,
  );
  assert.equal(
    records[0]?.requestHash,
    hashEvaluationValue({
      aiRequestFingerprint: "fingerprint:one",
      request: {
        eventId: "event:private",
        recommendationCount: 3,
        sources: [
          {
            candidateParticipants: [participants[1]],
            sourceParticipant: participants[0],
          },
        ],
      },
    }),
  );
  const reordered = createRecommendationTaskEvaluationRecords({
      aiRequestFingerprint: "fingerprint:one",
      candidates: [...candidates].reverse(),
      eventId: "event:private",
      participants: participants as never,
      recommendationCount: 3,
      tasks: [...tasks].reverse() as never,
    });
  assert.deepEqual(reordered, records);
  const otherFingerprint = createRecommendationTaskEvaluationRecords({
    aiRequestFingerprint: "fingerprint:two",
    candidates,
    eventId: "event:private",
    participants: participants as never,
    recommendationCount: 3,
    tasks: tasks as never,
  });
  assert.deepEqual(
    otherFingerprint.map((record) => record.requestContentHash),
    records.map((record) => record.requestContentHash),
  );
  assert.notDeepEqual(
    otherFingerprint.map((record) => record.requestHash),
    records.map((record) => record.requestHash),
  );
  const changedProfile = createRecommendationTaskEvaluationRecords({
    aiRequestFingerprint: "fingerprint:one",
    candidates,
    eventId: "event:private",
    participants: participants.map((value, index) =>
      index === 0
        ? { ...value, profileAnswers: { fullProfileCanary: "changed" } }
        : value,
    ) as never,
    recommendationCount: 3,
    tasks: tasks as never,
  });
  assert.notEqual(
    changedProfile[0]?.requestContentHash,
    records[0]?.requestContentHash,
  );
});

const evaluationTask = {
  allowedTargetIdsBySource: new Map([["source", new Set(["target"])]]),
  participantIds: ["source"],
  record: {},
  request: { eventId: "event:private", recommendationCount: 1, sources: [] },
} as never;
const snapshotParticipants = [{ participantId: "source" }, { participantId: "target" }] as never;

test("evaluation classifies adapter failure without exposing its message", async () => {
  const result = await evaluateRecommendationTask({
    provider: {
      async generateRecommendations() {
        return {
          error: { code: "AI_TIMEOUT" as const, message: "participant:secret timeout" },
          success: false as const,
        };
      },
    },
    recommendationCount: 1,
    snapshotParticipants,
    task: evaluationTask,
  });
  assert.equal(result.adapterOutcome, "failed");
  assert.equal(result.domainValidation, "not-run");
  assert.equal(result.errorCode, "AI_TIMEOUT");
  assert.equal(result.messageCategory, "adapter-ai_timeout");
  assert.doesNotMatch(JSON.stringify(result), /participant:secret/u);
});

test("evaluation distinguishes domain validation failure from adapter success", async () => {
  const result = await evaluateRecommendationTask({
    provider: {
      async generateRecommendations() {
        return {
          data: [{ noMatchReason: null, recommendations: [], sourceParticipantId: "source" }],
          model: "test-model",
          provider: "test-provider",
          success: true as const,
        };
      },
    },
    recommendationCount: 1,
    snapshotParticipants,
    task: evaluationTask,
  });
  assert.equal(result.adapterOutcome, "succeeded");
  assert.equal(result.domainValidation, "failed");
  assert.equal(result.errorCode, "EVENT_OPERATIONS_AI_SCHEMA_INVALID");
  assert.equal(result.overallBusinessValid, false);
});

test("evaluation records a valid adapter result and provider telemetry", async () => {
  const result = await evaluateRecommendationTask({
    provider: {
      async generateRecommendations() {
        return {
          data: [
            {
              noMatchReason: null,
              recommendations: [{
                icebreakers: ["first", "second"],
                memberHint: "relevant",
                rank: 1,
                reasons: ["compatible"],
                score: 90,
                targetParticipantId: "target",
              }],
              sourceParticipantId: "source",
            },
          ],
          model: "test-model",
          provider: "test-provider",
          responseMetadata: {
            finishReason: "stop",
            providerResponseBytes: 321,
            usage: { cacheHitTokens: 3, completionTokens: 5, promptTokens: 7, reasoningTokens: 2 },
          },
          success: true as const,
        };
      },
    },
    recommendationCount: 1,
    snapshotParticipants,
    task: evaluationTask,
  });
  assert.equal(result.adapterOutcome, "succeeded");
  assert.equal(result.domainValidation, "passed");
  assert.equal(result.overallBusinessValid, true);
  assert.equal(result.promptTokens, 7);
  assert.equal(result.completionTokens, 5);
  assert.equal(result.cacheHitTokens, 3);
  assert.equal(result.finishReason, "stop");
  assert.equal(result.providerResponseBytes, 321);
});
