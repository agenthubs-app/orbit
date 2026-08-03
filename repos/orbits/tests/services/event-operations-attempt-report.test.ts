import assert from "node:assert/strict";
import test from "node:test";

import type { EventOperationsTaskAttemptTelemetry } from "../../features/events/event-operations/repository";
import {
  buildEventOperationsAttemptReport,
  loadEventOperationsAttemptReport,
} from "../../scripts/report-event-operations-attempts";

function attempt(
  overrides: Partial<EventOperationsTaskAttemptTelemetry> = {},
): EventOperationsTaskAttemptTelemetry {
  return {
    attempt: 1,
    claimedAt: "2026-08-03T09:00:01.000Z",
    dependencyCount: 0,
    domainValidationDurationMs: 3,
    eligibleAt: "2026-08-03T09:00:00.000Z",
    failureCode: null,
    finishedAt: "2026-08-03T09:00:02.000Z",
    generationId: "generation:report",
    kind: "recommendation_shard",
    leaseEpoch: 1,
    model: "model:test",
    outcome: "completed",
    participantCount: 2,
    provider: "provider:test",
    providerAdapterDurationMs: 7,
    requestBytes: 128,
    responseBytes: 256,
    retryRound: 0,
    taskId: "task:report",
    workerId: "worker:report",
    ...overrides,
  };
}

test("attempt report excludes unknown lease-lost metrics instead of treating them as zero", async () => {
  const report = await buildEventOperationsAttemptReport(
    {
      async listTaskAttempts() {
        return [
          attempt(),
          attempt({
            attempt: 2,
            claimedAt: "2026-08-03T09:00:04.000Z",
            domainValidationDurationMs: null,
            eligibleAt: "2026-08-03T09:00:04.000Z",
            failureCode: "EVENT_OPERATIONS_LEASE_LOST",
            finishedAt: "2026-08-03T09:00:05.000Z",
            leaseEpoch: 2,
            model: null,
            outcome: "lease_lost",
            provider: null,
            providerAdapterDurationMs: null,
            requestBytes: null,
            responseBytes: null,
          }),
        ];
      },
    },
    "generation:report",
  );

  assert.equal(report.attemptCount, 2);
  assert.deepEqual(report.byKind.recommendation_shard, {
    attempts: 2,
    durationMs: { max: 1_000, p50: 1_000, p95: 1_000 },
    outcomes: { completed: 1, lease_lost: 1 },
    providerAdapterMsP95: 7,
    queueWaitMsP95: 1_000,
    retries: 1,
    validationMsP95: 3,
  });
});

test("attempt report closes its PostgreSQL runtime after success and read failure", async () => {
  let successCloseCount = 0;
  const report = await loadEventOperationsAttemptReport({
    close: async () => {
      successCloseCount += 1;
    },
    generationId: "generation:report",
    repository: { listTaskAttempts: async () => [] },
  });
  assert.equal(report.attemptCount, 0);
  assert.equal(successCloseCount, 1);

  let failureCloseCount = 0;
  await assert.rejects(
    loadEventOperationsAttemptReport({
      close: async () => {
        failureCloseCount += 1;
      },
      generationId: "generation:report",
      repository: {
        async listTaskAttempts() {
          throw new Error("injected report read failure");
        },
      },
    }),
    /injected report read failure/u,
  );
  assert.equal(failureCloseCount, 1);
});
