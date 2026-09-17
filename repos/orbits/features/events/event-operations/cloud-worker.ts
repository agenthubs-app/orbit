import { randomUUID } from "node:crypto";

import { createStorageBusinessCardContactWriteProvider } from "../../contacts/storage/contact-write-live-record-provider";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createEventOperationsEngine } from "./engine";
import { createStorageEventContactRequestNotificationWriter } from "./contact-request-notification-writer";
import { createConfiguredEventOperationsAiProvider } from "./ai-provider";
import {
  createEventOperationsOutboxProjector,
} from "./outbox-projector";
import type {
  EventOperationsWorker,
  EventOperationsWorkerDrainResult,
} from "./worker";
import { createEventOperationsWorker } from "./worker";
import {
  createEventRegistrationLiveRecordProvider,
} from "../registration/storage/live-record-provider";
import {
  createConfiguredEventOperationsPostgresRuntime,
  type EventOperationsPostgresRuntime,
} from "./storage/postgres-client";
import {
  createPostgresEventOperationsOutboxRepository,
} from "./storage/postgres-outbox-repository";
import { createPostgresEventOperationsRepository } from "./storage/postgres-repository";
import { runEventOperationsMigrations } from "./storage/migrations";
import {
  publishEventOperationsWake,
  type EventOperationsQueueWakeReason,
} from "./queue";

export {
  EVENT_OPERATIONS_QUEUE_TOPIC,
  isEventOperationsQueueWake,
  publishEventOperationsWake,
} from "./queue";
export type {
  EventOperationsQueueSendOptions,
  EventOperationsQueueSender,
  EventOperationsQueueSendResult,
  EventOperationsQueueWake,
  EventOperationsQueueWakeReason,
  PublishEventOperationsWakeInput,
  PublishEventOperationsWakeResult,
} from "./queue";

export type EventOperationsWorkerTickResult = EventOperationsWorkerDrainResult;

export interface EventOperationsCloudTickResult
  extends EventOperationsWorkerTickResult {
  continuationEnqueued: boolean;
}

export interface EventOperationsCloudTickDependencies {
  publish?: (input: {
    delaySeconds?: number;
    reason: EventOperationsQueueWakeReason;
    workspaceId: string;
  }) => Promise<unknown>;
  ready?: Promise<void>;
  worker: Pick<EventOperationsWorker, "drainOnce">;
  workspaceId: string;
}

/**
 * One finite queue invocation. It deliberately does not loop: a continuation
 * message yields the next bounded invocation and a thrown error lets Vercel
 * redeliver the current message.
 */
export async function runEventOperationsCloudTick({
  publish = async (input) => {
    await publishEventOperationsWake({
      delaySeconds: input.delaySeconds,
      reason: input.reason,
      workspaceId: input.workspaceId,
    });
  },
  ready = Promise.resolve(),
  worker,
  workspaceId,
}: EventOperationsCloudTickDependencies): Promise<EventOperationsCloudTickResult> {
  await ready;
  const result = await worker.drainOnce();
  if (result.errors.length > 0) {
    throw new Error("Event operations cloud worker drain failed.");
  }

  let continuationEnqueued = false;
  if (result.workClaimed > 0) {
    await publish({
      delaySeconds: 1,
      reason: "continuation",
      workspaceId,
    });
    continuationEnqueued = true;
  }
  return { ...result, continuationEnqueued };
}

export interface EventOperationsPendingWorkSummary {
  generationPending: boolean;
  outboxPending: boolean;
}

/**
 * Used by the existing maintenance heartbeat as a lost-wake safety net. It
 * reads the same dependency and lease conditions as the worker and never
 * claims or mutates business rows.
 */
export async function readEventOperationsPendingWork({
  client,
  aiRequestFingerprint,
  workspaceId,
}: {
  aiRequestFingerprint: string;
  client: Pick<EventOperationsPostgresRuntime["client"], "query">;
  workspaceId: string;
}): Promise<EventOperationsPendingWorkSummary> {
  const result = await client.query<{
    generation_pending: boolean;
    outbox_pending: boolean;
  }>(
    `
      select
        exists (
          select 1
          from event_ops_outbox outbox
          where outbox.workspace_id = $1
            and (
              (
                outbox.status = 'pending'
                and outbox.available_at <= statement_timestamp()
                and outbox.attempts < outbox.attempt_limit
              )
              or (
                outbox.status = 'running'
                and outbox.lease_expires_at <= statement_timestamp()
                and outbox.attempts < outbox.attempt_limit
              )
            )
        ) as outbox_pending,
        exists (
          select 1
          from event_ops_generations generation
          where generation.workspace_id = $1
            and generation.ai_request_fingerprint = $2
            and generation.status in ('queued', 'running')
            and exists (
              select 1
              from event_ops_tasks task
              where task.workspace_id = generation.workspace_id
                and task.generation_id = generation.generation_id
                and (
                  task.status = 'queued'
                  or (task.status = 'failed' and task.attempts < task.attempt_limit)
                  or (task.status = 'running' and task.lease_expires_at <= statement_timestamp())
                )
                and not exists (
                  select 1
                  from unnest(task.depends_on_task_ids) dependency_id
                  left join event_ops_tasks dependency
                    on dependency.workspace_id = task.workspace_id
                    and dependency.generation_id = task.generation_id
                    and dependency.task_id = dependency_id
                  where dependency.status is distinct from 'completed'
                )
            )
        ) as generation_pending
    `,
    [workspaceId, aiRequestFingerprint],
  );
  const row = result.rows[0];
  return {
    generationPending: row?.generation_pending === true,
    outboxPending: row?.outbox_pending === true,
  };
}

export interface ConfiguredEventOperationsDispatchRuntime {
  aiRequestFingerprint: string;
  client: EventOperationsPostgresRuntime["client"];
  ready: Promise<void>;
  workspaceId: string;
}

export interface ConfiguredEventOperationsCloudWorker
  extends ConfiguredEventOperationsDispatchRuntime {
  worker: EventOperationsWorker;
}

interface CloudWorkerGlobalState {
  __orbitEventOperationsDispatchRuntime?: ConfiguredEventOperationsDispatchRuntime;
  __orbitEventOperationsCloudWorker?: ConfiguredEventOperationsCloudWorker;
}

const cloudWorkerGlobal = globalThis as typeof globalThis & CloudWorkerGlobalState;

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || !raw.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

/** Runtime used by maintenance to probe the durable event-operations ledger. */
export function getConfiguredEventOperationsDispatchRuntime(): ConfiguredEventOperationsDispatchRuntime | null {
  if (cloudWorkerGlobal.__orbitEventOperationsDispatchRuntime) {
    return cloudWorkerGlobal.__orbitEventOperationsDispatchRuntime;
  }
  const runtime = createConfiguredEventOperationsPostgresRuntime({
    max: positiveInteger("ORBIT_EVENT_OPERATIONS_DB_POOL_MAX", 12),
  });
  if (!runtime) return null;
  const aiProvider = createConfiguredEventOperationsAiProvider();
  const aiRequestFingerprint = aiProvider.requestFingerprint?.trim();
  if (!aiRequestFingerprint) {
    throw new Error("The Event Operations AI provider has no request fingerprint.");
  }
  const configured: ConfiguredEventOperationsDispatchRuntime = {
    aiRequestFingerprint,
    client: runtime.client,
    ready: runEventOperationsMigrations(runtime.client),
    workspaceId: runtime.workspaceId,
  };
  cloudWorkerGlobal.__orbitEventOperationsDispatchRuntime = configured;
  return configured;
}

/**
 * Build the production worker once per warm Vercel isolate. The same
 * repositories used by the local worker are retained; only the invocation
 * boundary changes to a finite queue tick.
 */
export function getConfiguredEventOperationsCloudWorker(): ConfiguredEventOperationsCloudWorker | null {
  if (cloudWorkerGlobal.__orbitEventOperationsCloudWorker) {
    return cloudWorkerGlobal.__orbitEventOperationsCloudWorker;
  }
  const dispatch = getConfiguredEventOperationsDispatchRuntime();
  if (!dispatch) return null;
  const runtime: EventOperationsPostgresRuntime = {
    client: dispatch.client,
    workspaceId: dispatch.workspaceId,
  };
  const liveRecords = createConfiguredPostgresLiveRecordStore({
    max: positiveInteger("ORBIT_EVENT_OPERATIONS_PROJECTION_DB_POOL_MAX", 8),
  });
  if (!liveRecords) return null;
  if (runtime.workspaceId !== liveRecords.workspaceId || runtime.workspaceId !== dispatch.workspaceId) {
    throw new Error("Event operations cloud stores resolved different workspaces.");
  }

  const taskLeaseMs = positiveInteger("ORBIT_EVENT_OPERATIONS_TASK_LEASE_MS", 5 * 60_000);
  const aiProvider = createConfiguredEventOperationsAiProvider({
    requestTimeoutMs: positiveInteger("ORBIT_EVENT_OPERATIONS_MODEL_TIMEOUT_MS", 90_000),
  });
  const aiRequestFingerprint = aiProvider.requestFingerprint?.trim();
  if (!aiRequestFingerprint) {
    throw new Error("The Event Operations AI provider has no request fingerprint.");
  }
  if (aiRequestFingerprint !== dispatch.aiRequestFingerprint) {
    throw new Error("The Event Operations AI provider configuration changed during worker setup.");
  }
  const workerId =
    process.env.ORBIT_EVENT_OPERATIONS_WORKER_ID?.trim() ||
    `event-operations:vercel:${randomUUID()}`;
  const repository = createPostgresEventOperationsRepository(runtime);
  const worker = createEventOperationsWorker({
    aiRequestFingerprint: dispatch.aiRequestFingerprint,
    engine: createEventOperationsEngine({
      aiProvider,
      heartbeatMs: positiveInteger(
        "ORBIT_EVENT_OPERATIONS_TASK_HEARTBEAT_MS",
        Math.max(1, Math.floor(taskLeaseMs / 3)),
      ),
      leaseMs: taskLeaseMs,
      maxConcurrency: positiveInteger("ORBIT_EVENT_OPERATIONS_TASK_CONCURRENCY", 8),
      repository,
    }),
    generationConcurrency: positiveInteger("ORBIT_EVENT_OPERATIONS_GENERATION_CONCURRENCY", 2),
    outboxConcurrency: positiveInteger("ORBIT_EVENT_OPERATIONS_OUTBOX_CONCURRENCY", 8),
    outboxHeartbeatMs: positiveInteger("ORBIT_EVENT_OPERATIONS_OUTBOX_HEARTBEAT_MS", 20_000),
    outboxLeaseMs: positiveInteger("ORBIT_EVENT_OPERATIONS_OUTBOX_LEASE_MS", 60_000),
    outboxProjector: createEventOperationsOutboxProjector({
      contactRequestNotifications: createStorageEventContactRequestNotificationWriter({
        store: liveRecords.store,
        workspaceId: liveRecords.workspaceId,
      }),
      registrationProvider: createEventRegistrationLiveRecordProvider({
        source: "event-operations-cloud-worker:registration",
        store: liveRecords.store,
        workspaceId: liveRecords.workspaceId,
      }),
      relationshipProvider: createStorageBusinessCardContactWriteProvider({
        recordProvider: "event-operations-cloud-worker",
        store: liveRecords.store,
        workspaceId: liveRecords.workspaceId,
      }),
    }),
    outboxRepository: createPostgresEventOperationsOutboxRepository(runtime),
    runtime,
    taskConcurrency: positiveInteger("ORBIT_EVENT_OPERATIONS_TASK_CONCURRENCY", 8),
    workerId,
  });
  const configured: ConfiguredEventOperationsCloudWorker = {
    aiRequestFingerprint: dispatch.aiRequestFingerprint,
    client: runtime.client,
    ready: dispatch.ready,
    worker,
    workspaceId: runtime.workspaceId,
  };
  cloudWorkerGlobal.__orbitEventOperationsCloudWorker = configured;
  return configured;
}
