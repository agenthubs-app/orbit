import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecommendationTaskEvaluationRecords,
  hashEvaluationValue,
  parseEvaluationOptions,
  redactEvaluationRecord,
} from "../../scripts/evaluate-event-operations-recommendations";

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
    participants,
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
      participants,
      recommendationCount: 3,
      tasks: [...tasks].reverse() as never,
    });
  assert.deepEqual(reordered, records);
  const otherFingerprint = createRecommendationTaskEvaluationRecords({
    aiRequestFingerprint: "fingerprint:two",
    candidates,
    eventId: "event:private",
    participants,
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
    ),
    recommendationCount: 3,
    tasks: tasks as never,
  });
  assert.notEqual(
    changedProfile[0]?.requestContentHash,
    records[0]?.requestContentHash,
  );
});
