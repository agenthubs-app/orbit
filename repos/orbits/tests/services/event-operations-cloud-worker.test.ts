import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_OPERATIONS_QUEUE_TOPIC,
  isEventOperationsQueueWake,
  publishEventOperationsWake,
  readEventOperationsPendingWork,
  runEventOperationsCloudTick,
  type EventOperationsQueueWake,
  type EventOperationsWorkerTickResult,
} from "../../features/events/event-operations/cloud-worker";
import type { EventOperationsRepository } from "../../features/events/event-operations/repository";
import { withEventOperationsOutboxWake } from "../../features/events/event-operations/storage/worker-wake";

const wake: EventOperationsQueueWake = {
  kind: "event-operations-wake",
  reason: "generation",
  version: 1,
  wakeId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "workspace:test",
};

test("event operations queue messages accept only the exact workspace wake shape", () => {
  assert.equal(isEventOperationsQueueWake(wake), true);
  assert.equal(isEventOperationsQueueWake({ ...wake, reason: "unknown" }), false);
  assert.equal(isEventOperationsQueueWake({ ...wake, wakeId: "not-a-uuid" }), false);
  assert.equal(isEventOperationsQueueWake({ ...wake, extra: true }), false);
  assert.equal(isEventOperationsQueueWake(null), false);
});

test("publishing a wake uses a bounded retention, delay and idempotency key", async () => {
  const calls: Array<{ topic: string; message: EventOperationsQueueWake; options: Record<string, unknown> }> = [];
  await publishEventOperationsWake({
    enabled: true,
    id: () => wake.wakeId,
    reason: wake.reason,
    sendMessage: async (topic, message, options) => {
      calls.push({ topic, message, options: options as Record<string, unknown> });
      return { messageId: "message:test" };
    },
    workspaceId: wake.workspaceId,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.topic, EVENT_OPERATIONS_QUEUE_TOPIC);
  assert.deepEqual(calls[0]?.message, wake);
  assert.deepEqual(calls[0]?.options, {
    delaySeconds: 0,
    idempotencyKey: wake.wakeId,
    retentionSeconds: 7 * 24 * 60 * 60,
  });
});

test("a cloud tick runs one bounded drain and schedules continuation only after claiming work", async () => {
  const sent: Array<{ workspaceId: string; reason: string; delaySeconds?: number }> = [];
  const workerResult: EventOperationsWorkerTickResult = {
    errors: [],
    generationBatches: 1,
    generationIds: ["generation:test"],
    outboxCompleted: 0,
    outboxFailed: 0,
    outboxRetried: 0,
    workClaimed: 1,
  };
  const result = await runEventOperationsCloudTick({
    ready: Promise.resolve(),
    publish: async (input) => {
      sent.push(input);
    },
    worker: { drainOnce: async () => workerResult },
    workspaceId: wake.workspaceId,
  });

  assert.deepEqual(result, { ...workerResult, continuationEnqueued: true });
  assert.deepEqual(sent, [{
    delaySeconds: 1,
    reason: "continuation",
    workspaceId: wake.workspaceId,
  }]);
});

test("a cloud tick surfaces worker errors and does not acknowledge by scheduling more work", async () => {
  let published = false;
  await assert.rejects(
    () => runEventOperationsCloudTick({
      ready: Promise.resolve(),
      publish: async () => {
        published = true;
      },
      worker: {
        drainOnce: async () => ({
          errors: [{ id: "generation:test", message: "database unavailable", scope: "generation" as const }],
          generationBatches: 1,
          generationIds: ["generation:test"],
          outboxCompleted: 0,
          outboxFailed: 0,
          outboxRetried: 0,
          workClaimed: 0,
        }),
      },
      workspaceId: wake.workspaceId,
    }),
    /cloud worker drain failed/i,
  );
  assert.equal(published, false);
});

test("maintenance probe is read-only and reports runnable generation or outbox work", async () => {
  let queryText = "";
  let queryValues: readonly unknown[] = [];
  const summary = await readEventOperationsPendingWork({
    aiRequestFingerprint: "fingerprint:test",
    client: {
      async query<TRow = Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ) {
        queryText = text;
        queryValues = values ?? [];
        return {
          rowCount: 1,
          rows: [{ generation_pending: true, outbox_pending: false } as TRow],
        };
      },
    },
    workspaceId: "workspace:maintenance",
  });

  assert.deepEqual(summary, { generationPending: true, outboxPending: false });
  assert.deepEqual(queryValues, ["workspace:maintenance", "fingerprint:test"]);
  assert.match(queryText, /event_ops_generations/);
  assert.match(queryText, /generation\.ai_request_fingerprint = \$2/);
  assert.match(queryText, /event_ops_outbox/);
  assert.match(queryText, /depends_on_task_ids/);
  assert.match(queryText, /outbox\.attempts < outbox\.attempt_limit/);
  assert.match(queryText, /outbox\.available_at <= statement_timestamp\(\)/);
  assert.match(queryText, /outbox\.lease_expires_at <= statement_timestamp\(\)/);
});

test("event operations outbox writers wake only after their transaction resolves", async () => {
  const events: string[] = [];
  const base = {
    activateCanonicalRegistrations: async (..._args: never[]) => {
      events.push("activate:committed");
      return { count: 1, hash: "hash", state: "canonical" as const };
    },
    cancelCanonicalRegistration: async (..._args: never[]) => {
      events.push("cancel:committed");
      return null;
    },
    checkInAtomically: async (..._args: never[]) => {
      events.push("check-in:committed");
      return {};
    },
    createContactRequestAtomically: async (..._args: never[]) => {
      events.push("create-request:committed");
      return {};
    },
    registerCanonicalParticipant: async (..._args: never[]) => {
      events.push("register:committed");
      return {};
    },
    respondToContactRequestAtomically: async (..._args: never[]) => {
      events.push("respond:committed");
      return {};
    },
    seedCanonicalRegistration: async (..._args: never[]) => {
      events.push("seed:committed");
      return {};
    },
    withdrawContactRequestAtomically: async (..._args: never[]) => {
      events.push("withdraw:committed");
      return {};
    },
  } as unknown as EventOperationsRepository;
  const wrapped = withEventOperationsOutboxWake(base, {
    notifyWorker: async ({ reason, workspaceId }) => {
      assert.equal(reason, "outbox");
      assert.equal(workspaceId, "workspace:wake-test");
      assert.match(events.at(-1) ?? "", /committed$/);
      events.push("wake");
    },
    workspaceId: "workspace:wake-test",
  });

  await wrapped.activateCanonicalRegistrations("event:test", [], undefined);
  await wrapped.cancelCanonicalRegistration({ eventId: "event:test", userId: "actor:test" });
  await wrapped.checkInAtomically({} as never);
  await wrapped.createContactRequestAtomically({} as never);
  await wrapped.registerCanonicalParticipant({} as never);
  await wrapped.respondToContactRequestAtomically({} as never);
  await wrapped.seedCanonicalRegistration({} as never);
  await wrapped.withdrawContactRequestAtomically({} as never);

  assert.deepEqual(events, [
    "activate:committed", "wake",
    "cancel:committed", "wake",
    "check-in:committed", "wake",
    "create-request:committed", "wake",
    "register:committed", "wake",
    "respond:committed", "wake",
    "seed:committed", "wake",
    "withdraw:committed", "wake",
  ]);
});
