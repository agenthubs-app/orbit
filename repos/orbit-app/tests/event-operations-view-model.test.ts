import assert from "node:assert/strict";
import test from "node:test";

import {
  eventOperationsGenerationMutationMatches,
  eventOperationsToView
} from "../src/view-models/event-operations";

const configuration = {
  checkInOpensAt: "2026-08-19T08:00:00.000Z",
  eventEndsAt: "2026-08-19T13:00:00.000Z",
  eventId: "event:ops",
  eventStartsAt: "2026-08-19T09:00:00.000Z",
  maxAttemptsPerTask: 3,
  organizerActorId: "actor:owner",
  profileEditDeadlineAt: "2026-08-18T09:00:00.000Z",
  recommendationCount: 3,
  registrationCutoffAt: "2026-08-18T10:00:00.000Z",
  resultsAvailableAt: "2026-08-19T08:30:00.000Z",
  roundOneStartsAt: "2026-08-19T10:00:00.000Z",
  roundTwoStartsAt: "2026-08-19T11:00:00.000Z",
  shardSize: 20,
  tableSize: 6,
  updatedAt: "2026-08-18T12:00:00.000Z"
};

const generation = {
  aiRequestFingerprint: "fingerprint",
  completedAt: "2026-08-18T13:00:00.000Z",
  createdAt: "2026-08-18T12:30:00.000Z",
  errorCode: null,
  errorMessage: null,
  eventId: "event:ops",
  expectedTaskCount: 5,
  generationId: "generation:01",
  idempotencyKey: "key:01",
  organizerActorId: "actor:owner",
  publishedAt: null,
  snapshot: { capturedAt: "2026-08-18T12:30:00.000Z", hash: "abcdef1234567890", participants: [{ participantId: "p1" }, { participantId: "p2" }] },
  status: "completed",
  updatedAt: "2026-08-18T13:00:00.000Z"
};

test("event operations map metrics, generation controls, gates and published tables", () => {
  const view = eventOperationsToView({
    checkIns: [],
    configuration,
    contactRequests: [],
    eventId: "event:ops",
    generations: [{ generation, progress: { completedTasks: 5, failedTasks: 0, percent: 100, totalTasks: 5 } }],
    metrics: { acceptedContactRequests: 2, checkedIn: 7, contactRequests: 4, participantCount: 12, publishedGenerationId: "generation:00" },
    participants: [],
    publishedResult: {
      eventId: "event:ops",
      generationId: "generation:00",
      grouping: {
        roundOne: [{ icebreakers: ["a", "b", "c"], memberPrompts: {}, memberRationales: {}, members: [{ participantId: "p1", seat: "A" }], rationale: "互补", tableNumber: 1, theme: "AI 落地" }],
        roundTwo: []
      },
      publishedAt: "2026-08-18T13:30:00.000Z",
      snapshotHash: "hash"
    }
  }, new Date("2026-08-19T09:30:00.000Z"));

  assert.equal(view.contractValid, true);
  assert.deepEqual(view.metrics.map((metric) => metric.value), ["12", "7", "4", "2"]);
  assert.equal(view.generations[0]?.action, "publish");
  assert.equal(view.generations[0]?.progressLabel, "5/5 已完成 · 0 失败");
  assert.equal(view.gates.find((gate) => gate.key === "event")?.stateLabel, "进行中");
  assert.equal(view.rounds[0]?.tables[0]?.title, "1 号桌 · AI 落地");
});

test("event operations fail visibly when a generation record is malformed", () => {
  const view = eventOperationsToView({
    configuration,
    eventId: "event:ops",
    generations: [{ generation: { status: "completed" }, progress: {} }],
    metrics: { acceptedContactRequests: 0, checkedIn: 0, contactRequests: 0, participantCount: 0, publishedGenerationId: null },
    publishedResult: null
  });
  assert.equal(view.contractValid, false);
});

test("event generation mutation must match the event, id and expected status", () => {
  assert.equal(eventOperationsGenerationMutationMatches(generation, {
    eventId: "event:ops",
    generationId: "generation:01",
    statuses: ["completed"]
  }), true);
  assert.equal(eventOperationsGenerationMutationMatches({ ...generation, eventId: "event:other" }, {
    eventId: "event:ops",
    generationId: "generation:01",
    statuses: ["completed"]
  }), false);
});
