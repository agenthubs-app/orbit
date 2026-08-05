import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { createPostgresAppointmentNotificationProjector } from "../features/appointments/notification-projector";
import { runAppointmentOutboxBatch } from "../features/appointments/outbox-worker";
import { runAppointmentMigrations } from "../features/appointments/storage/migrations";
import { createStorageBusinessCardContactWriteProvider } from "../features/contacts/storage/contact-write-live-record-provider";
import { createPostgresHumanEncounterProjectionRepository } from "../features/encounters/projection-repository";
import { projectPendingHumanEncounters } from "../features/encounters/projector";
import { processAttendeePostEventAiTask } from "../features/events/post-event-artifact/processor";
import { resolveAttendeePostEventAiProviderConfiguration } from "../features/events/post-event-artifact/provider-config";
import { createAttendeePostEventAiTaskRepository } from "../features/events/post-event-artifact/task-repository";
import { createConfiguredEventOperationsAiProvider } from "../features/events/event-operations/ai-provider";
import { createEventOperationsEngine } from "../features/events/event-operations/engine";
import { createStorageEventContactRequestNotificationWriter } from "../features/events/event-operations/contact-request-notification-writer";
import { createEventOperationsOutboxProjector } from "../features/events/event-operations/outbox-projector";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { createPostgresEventOperationsOutboxRepository } from "../features/events/event-operations/storage/postgres-outbox-repository";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../features/events/event-operations/storage/migrations";
import { createEventOperationsWorker } from "../features/events/event-operations/worker";
import { createEventRegistrationLiveRecordProvider } from "../features/events/registration/storage/live-record-provider";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { abortableWait } from "./abortable-wait";
import { loadLocalEnv } from "./load-local-env";

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || !raw.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime({
    max: positiveInteger("ORBIT_EVENT_OPERATIONS_DB_POOL_MAX", 12),
  });
  const liveRecords = createConfiguredPostgresLiveRecordStore({
    max: positiveInteger("ORBIT_EVENT_OPERATIONS_PROJECTION_DB_POOL_MAX", 8),
  });
  if (!runtime || !liveRecords) {
    throw new Error(
      "Event operations worker requires ORBIT_EVENT_DATABASE_URL and a workspace id.",
    );
  }
  if (runtime.workspaceId !== liveRecords.workspaceId) {
    throw new Error(
      "Event operations and legacy projection stores resolved different workspaces.",
    );
  }

  await runEventOperationsMigrations(runtime.client);
  await runAppointmentMigrations(runtime.client);

  const workerId =
    process.env.ORBIT_EVENT_OPERATIONS_WORKER_ID?.trim() ||
    `event-operations:${hostname()}:${process.pid}:${randomUUID()}`;
  const taskLeaseMs = positiveInteger(
    "ORBIT_EVENT_OPERATIONS_TASK_LEASE_MS",
    5 * 60_000,
  );
  const taskConcurrency = positiveInteger(
    "ORBIT_EVENT_OPERATIONS_TASK_CONCURRENCY",
    8,
  );
  const repository = createPostgresEventOperationsRepository(runtime);
  const aiProvider = createConfiguredEventOperationsAiProvider({
    requestTimeoutMs: positiveInteger(
      "ORBIT_EVENT_OPERATIONS_MODEL_TIMEOUT_MS",
      90_000,
    ),
  });
  const aiRequestFingerprint = aiProvider.requestFingerprint?.trim();
  if (!aiRequestFingerprint) {
    throw new Error("The Event Operations AI provider has no request fingerprint.");
  }
  const engine = createEventOperationsEngine({
    aiProvider,
    heartbeatMs: positiveInteger(
      "ORBIT_EVENT_OPERATIONS_TASK_HEARTBEAT_MS",
      Math.floor(taskLeaseMs / 3),
    ),
    leaseMs: taskLeaseMs,
    maxConcurrency: taskConcurrency,
    repository,
  });
  const relationshipProvider = createStorageBusinessCardContactWriteProvider({
    recordProvider: "event-operations-outbox-projector",
    store: liveRecords.store,
    workspaceId: liveRecords.workspaceId,
  });
  const registrationProvider = createEventRegistrationLiveRecordProvider({
    source: "event-operations-outbox-projector:registration",
    store: liveRecords.store,
    workspaceId: liveRecords.workspaceId,
  });
  const worker = createEventOperationsWorker({
    aiRequestFingerprint,
    engine,
    generationConcurrency: positiveInteger(
      "ORBIT_EVENT_OPERATIONS_GENERATION_CONCURRENCY",
      2,
    ),
    outboxConcurrency: positiveInteger(
      "ORBIT_EVENT_OPERATIONS_OUTBOX_CONCURRENCY",
      8,
    ),
    outboxHeartbeatMs: positiveInteger(
      "ORBIT_EVENT_OPERATIONS_OUTBOX_HEARTBEAT_MS",
      20_000,
    ),
    outboxLeaseMs: positiveInteger(
      "ORBIT_EVENT_OPERATIONS_OUTBOX_LEASE_MS",
      60_000,
    ),
    outboxProjector: createEventOperationsOutboxProjector({
      contactRequestNotifications: createStorageEventContactRequestNotificationWriter({
        store: liveRecords.store,
        workspaceId: liveRecords.workspaceId,
      }),
      registrationProvider,
      relationshipProvider,
    }),
    outboxRepository: createPostgresEventOperationsOutboxRepository(runtime),
    runtime,
    taskConcurrency,
    workerId,
  });
  const appointmentProjector = createPostgresAppointmentNotificationProjector(runtime);
  const encounterRepository = createPostgresHumanEncounterProjectionRepository(runtime);
  const postEventProvider = resolveAttendeePostEventAiProviderConfiguration();
  const postEventRepository = createAttendeePostEventAiTaskRepository({ client: liveRecords.client, store: liveRecords.store, workspaceId: liveRecords.workspaceId });

  let stopping = false;
  const stopController = new AbortController();
  const stop = () => {
    stopping = true;
    stopController.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const pollMs = positiveInteger("ORBIT_EVENT_OPERATIONS_POLL_MS", 1_000);

  process.stdout.write(
    `${JSON.stringify({ event: "event_operations_worker_started", workerId })}\n`,
  );
  try {
    async function runDrainLoop(
      scope: "generation" | "outbox" | "appointment" | "encounter" | "post_event_ai",
      drain: () => Promise<{ errors: readonly unknown[]; workClaimed: number }>,
    ): Promise<void> {
      let consecutiveDrainFailures = 0;
      while (!stopping) {
        try {
          const result = await drain();
          consecutiveDrainFailures = 0;
          if (result.workClaimed > 0 || result.errors.length > 0) {
            process.stdout.write(
              `${JSON.stringify({ event: "event_operations_worker_drain", scope, workerId, ...result })}\n`,
            );
          }
          if (result.workClaimed > 0) {
            // A different worker can win between runnable discovery and claim.
            // Yield briefly even after work so that race cannot busy-spin.
            await abortableWait(Math.min(25, pollMs), stopController.signal);
            continue;
          }
          await abortableWait(pollMs, stopController.signal);
        } catch (error) {
          consecutiveDrainFailures += 1;
          const backoffMs = Math.min(
            30_000,
            pollMs * 2 ** Math.min(5, consecutiveDrainFailures - 1),
          );
          process.stdout.write(
            `${JSON.stringify({
              backoffMs,
              error:
                error instanceof Error ? error.message : "Worker drain failed.",
              event: "event_operations_worker_drain_failed",
              scope,
              workerId,
            })}\n`,
          );
          await abortableWait(backoffMs, stopController.signal);
        }
      }
    }

    await Promise.all([
      runDrainLoop("generation", () =>
        worker.drainGenerationsOnce({ signal: stopController.signal }),
      ),
      runDrainLoop("outbox", () => worker.drainOutboxOnce()),
      runDrainLoop("appointment", async () => {
        const result = await runAppointmentOutboxBatch({ projector: appointmentProjector, runtime });
        return { ...result, errors: [], workClaimed: result.completed + result.failed + result.retried };
      }),
      runDrainLoop("encounter", async () => {
        const result = await projectPendingHumanEncounters({ repository: encounterRepository, workerId: `${workerId}:encounter` });
        return { ...result, errors: [], workClaimed: result.completed + result.failed + result.retried + result.leaseLost };
      }),
      ...(postEventProvider ? [runDrainLoop("post_event_ai", async () => {
        const outcome = await processAttendeePostEventAiTask({ config: postEventProvider.config, repository: postEventRepository, workerId: `${workerId}:post-event-ai` });
        return { errors: [], workClaimed: outcome === "empty" ? 0 : 1 };
      })] : []),
    ]);
  } finally {
    process.stdout.write(
      `${JSON.stringify({ event: "event_operations_worker_stopped", workerId })}\n`,
    );
    await Promise.allSettled([runtime.client.close(), liveRecords.client.close()]);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      error: error instanceof Error ? error.message : "Worker startup failed.",
      event: "event_operations_worker_start_failed",
    })}\n`,
  );
  process.exitCode = 1;
});
