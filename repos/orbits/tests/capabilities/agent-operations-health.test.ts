import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentOperationsRecordPayload,
} from "../../features/agent/operations/contract";
import { createStorageAgentOperationsService } from "../../features/agent/operations/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("worker health is actor scoped and moves from not seen to healthy to stale", async () => {
  const store =
    createMemoryLiveRecordStore<AgentOperationsRecordPayload>();
  const alice = createStorageAgentOperationsService({
    actorId: "actor:alice",
    store,
    workspaceId: "operations-test",
  });
  const bob = createStorageAgentOperationsService({
    actorId: "actor:bob",
    store,
    workspaceId: "operations-test",
  });

  assert.equal((await alice.workerHealth()).state, "not_seen");
  await alice.recordHeartbeat({
    automationRuns: 2,
    outboxProcessed: 3,
    recordedAt: "2026-07-27T00:00:00.000Z",
    signalAutomationRuns: 1,
    workerId: "worker:alice",
  });

  const healthy = await alice.workerHealth({
    healthyWithinMs: 120_000,
    now: "2026-07-27T00:01:00.000Z",
  });
  assert.equal(healthy.state, "healthy");
  assert.equal(healthy.lastHeartbeat?.outboxProcessed, 3);
  assert.equal(
    (
      await alice.workerHealth({
        healthyWithinMs: 120_000,
        now: "2026-07-27T00:03:00.001Z",
      })
    ).state,
    "stale",
  );
  assert.equal((await bob.workerHealth()).state, "not_seen");
});
