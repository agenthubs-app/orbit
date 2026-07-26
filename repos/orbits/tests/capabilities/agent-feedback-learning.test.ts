import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFeedbackRecordPayload } from "../../features/agent/feedback/contract";
import { createStorageAgentFeedbackService } from "../../features/agent/feedback/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("Agent result learning merges explicit ratings and business outcomes for one Run", async () => {
  const store = createMemoryLiveRecordStore<AgentFeedbackRecordPayload>();
  const timestamps = [
    "2026-07-27T01:00:00.000Z",
    "2026-07-27T02:00:00.000Z",
  ];
  const service = createStorageAgentFeedbackService({
    actorId: "user:alice",
    now: () => timestamps.shift() ?? "2026-07-27T03:00:00.000Z",
    store,
    workspaceId: "workspace:orbit",
  });

  await service.upsert({
    evidenceIds: ["event:1", "event:2", "event:1"],
    rating: "helpful",
    runId: "run:recommend-events",
    sourceModules: ["events", "events"],
  });
  const feedback = await service.upsert({
    outcome: "contacted",
    runId: "run:recommend-events",
  });

  assert.deepEqual(feedback, {
    createdAt: "2026-07-27T01:00:00.000Z",
    evidenceIds: ["event:1", "event:2"],
    feedbackId: "feedback:run:recommend-events",
    outcome: "contacted",
    rating: "helpful",
    runId: "run:recommend-events",
    sourceModules: ["events"],
    updatedAt: "2026-07-27T02:00:00.000Z",
  });
  assert.deepEqual(await service.list(), [feedback]);
  assert.deepEqual(await service.context(), [
    {
      summary:
        "The user marked an earlier Agent result helpful. The reported business outcome was contacted. The result used events data.",
    },
  ]);
});

test("Agent result learning is actor-scoped and can be deleted by the same actor", async () => {
  const store = createMemoryLiveRecordStore<AgentFeedbackRecordPayload>();
  const alice = createStorageAgentFeedbackService({
    actorId: "user:alice",
    store,
    workspaceId: "workspace:orbit",
  });
  const bob = createStorageAgentFeedbackService({
    actorId: "user:bob",
    store,
    workspaceId: "workspace:orbit",
  });

  await alice.upsert({
    rating: "not_relevant",
    runId: "run:private",
    sourceModules: ["contacts"],
  });

  assert.equal(await bob.get("run:private"), null);
  assert.deepEqual(await bob.list(), []);
  assert.equal((await alice.list()).length, 1);

  await alice.remove("run:private");
  assert.equal(await alice.get("run:private"), null);
  assert.deepEqual(await alice.context(), []);
});

test("Agent result learning rejects empty or malformed records", async () => {
  const service = createStorageAgentFeedbackService({
    actorId: "user:alice",
    store: createMemoryLiveRecordStore<AgentFeedbackRecordPayload>(),
    workspaceId: "workspace:orbit",
  });

  await assert.rejects(
    service.upsert({ runId: "run:empty" }),
    /rating or business outcome is required/,
  );
  await assert.rejects(
    service.upsert({
      rating: "unexpected" as "helpful",
      runId: "run:invalid",
    }),
    /Unknown Agent feedback rating/,
  );
});
