import type { EventOperationsEngine } from "./engine";
import {
  EventOperationsOutboxProjectionError,
  type EventOperationsOutboxProjector,
} from "./outbox-projector";
import type {
  EventOperationsOutboxMessage,
  EventOperationsOutboxRepository,
} from "./storage/postgres-outbox-repository";
import type { EventOperationsPostgresRuntime } from "./storage/postgres-client";

interface RunnableGenerationRow {
  generation_id: string;
  organizer_actor_id: string;
}

export interface EventOperationsWorkerDrainResult {
  errors: readonly {
    id: string;
    message: string;
    scope: "generation" | "outbox";
  }[];
  generationBatches: number;
  generationIds: readonly string[];
  outboxCompleted: number;
  outboxFailed: number;
  outboxRetried: number;
  workClaimed: number;
}

export interface EventOperationsWorker {
  drainOnce(): Promise<EventOperationsWorkerDrainResult>;
}

export interface CreateEventOperationsWorkerOptions {
  aiRequestFingerprint: string;
  engine: EventOperationsEngine;
  generationConcurrency?: number;
  outboxConcurrency?: number;
  outboxHeartbeatMs?: number;
  outboxLeaseMs?: number;
  outboxProjector: EventOperationsOutboxProjector;
  outboxRepository: EventOperationsOutboxRepository;
  runtime: EventOperationsPostgresRuntime;
  taskConcurrency?: number;
  workerId: string;
}

const DEFAULT_GENERATION_CONCURRENCY = 2;
const DEFAULT_OUTBOX_CONCURRENCY = 8;
const DEFAULT_OUTBOX_LEASE_MS = 60_000;
const DEFAULT_TASK_CONCURRENCY = 8;

function bounded(value: number, maximum: number): number {
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 250 * 2 ** Math.min(8, Math.max(0, attempt - 1)));
}

async function mapBounded<TValue>(
  values: readonly TValue[],
  concurrency: number,
  operation: (value: TValue) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(values.length, concurrency) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        await operation(values[index]!);
      }
    }),
  );
}

export function createEventOperationsWorker({
  aiRequestFingerprint,
  engine,
  generationConcurrency = DEFAULT_GENERATION_CONCURRENCY,
  outboxConcurrency = DEFAULT_OUTBOX_CONCURRENCY,
  outboxHeartbeatMs: requestedOutboxHeartbeatMs,
  outboxLeaseMs = DEFAULT_OUTBOX_LEASE_MS,
  outboxProjector,
  outboxRepository,
  runtime,
  taskConcurrency = DEFAULT_TASK_CONCURRENCY,
  workerId,
}: CreateEventOperationsWorkerOptions): EventOperationsWorker {
  const workerFingerprint = aiRequestFingerprint.trim();
  if (!workerFingerprint) {
    throw new Error("Event operations worker requires an AI request fingerprint.");
  }
  const generationLimit = bounded(generationConcurrency, 16);
  const outboxLimit = bounded(outboxConcurrency, 64);
  const taskLimit = bounded(taskConcurrency, 32);
  const leaseMs = Math.max(1_000, Math.floor(outboxLeaseMs));
  const heartbeatMs = Math.max(
    50,
    Math.min(
      Math.floor(leaseMs / 3),
      Math.floor(requestedOutboxHeartbeatMs ?? leaseMs / 3),
    ),
  );

  async function runnableGenerations(): Promise<readonly RunnableGenerationRow[]> {
    const result = await runtime.client.query<RunnableGenerationRow>(
      `
        select generation.generation_id, generation.organizer_actor_id
        from event_ops_generations generation
        where generation.workspace_id = $1
          and generation.status in ('queued', 'running')
          and generation.ai_request_fingerprint = $3
          and exists (
            select 1
            from event_ops_tasks task
            where task.workspace_id = generation.workspace_id
              and task.generation_id = generation.generation_id
              and (
                task.status = 'queued'
                or (task.status = 'failed' and task.attempts < task.attempt_limit)
                or (task.status = 'running'
                  and task.lease_expires_at <= statement_timestamp())
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
        order by generation.updated_at, generation.generation_id
        limit $2
      `,
      [runtime.workspaceId, generationLimit, workerFingerprint],
    );
    return result.rows;
  }

  async function projectWithHeartbeat(
    message: EventOperationsOutboxMessage,
  ): Promise<"completed" | "failed" | "retried"> {
    let finished = false;
    let heartbeatFailure: unknown = null;
    let pendingHeartbeat = Promise.resolve();
    const timer = setInterval(() => {
      pendingHeartbeat = pendingHeartbeat.then(async () => {
        if (finished || heartbeatFailure) return;
        try {
          const retained = await outboxRepository.heartbeat({
            leaseEpoch: message.leaseEpoch,
            leaseMs,
            leaseToken: message.leaseToken,
            outboxId: message.outboxId,
          });
          if (!retained && !finished) {
            heartbeatFailure = new Error(
              `Outbox lease lost for ${message.outboxId}.`,
            );
          }
        } catch (error) {
          if (!finished) heartbeatFailure = error;
        }
      });
    }, heartbeatMs);
    timer.unref?.();

    try {
      const result = await outboxProjector.project(message);
      if (heartbeatFailure) throw heartbeatFailure;
      const completed = await outboxRepository.complete({
        completion: {
          policy: result.policy,
          projectedIds: [...result.projectedIds],
          projection: result.projection,
        },
        leaseEpoch: message.leaseEpoch,
        leaseToken: message.leaseToken,
        outboxId: message.outboxId,
      });
      if (!completed) {
        throw new Error(`Outbox completion fence rejected ${message.outboxId}.`);
      }
      return "completed";
    } catch (error) {
      const projectionError =
        error instanceof EventOperationsOutboxProjectionError
          ? error
          : new EventOperationsOutboxProjectionError(
              "EVENT_OPERATIONS_OUTBOX_PROVIDER_FAILED",
              error instanceof Error ? error.message : "Outbox projection failed.",
              true,
              error instanceof Error ? { cause: error } : undefined,
            );
      const retryDelay = projectionError.retryable
        ? retryDelayMs(message.attempts)
        : null;
      const failed = await outboxRepository.fail({
        code: projectionError.code,
        leaseEpoch: message.leaseEpoch,
        leaseToken: message.leaseToken,
        message: projectionError.message,
        outboxId: message.outboxId,
        retryDelayMs: retryDelay,
      });
      if (!failed) throw error;
      return retryDelay === null ? "failed" : "retried";
    } finally {
      finished = true;
      clearInterval(timer);
      await pendingHeartbeat;
    }
  }

  return {
    async drainOnce() {
      const generations = await runnableGenerations();
      let generationTasksClaimed = 0;
      const errors: {
        id: string;
        message: string;
        scope: "generation" | "outbox";
      }[] = [];
      await mapBounded(generations, generationLimit, async (generation) => {
        try {
          const progress = await engine.runGeneration({
            actorId: generation.organizer_actor_id,
            generationId: generation.generation_id,
            maxConcurrency: taskLimit,
            workerId,
          });
          generationTasksClaimed += progress.claimedTasks;
        } catch (error) {
          errors.push({
            id: generation.generation_id,
            message:
              error instanceof Error ? error.message : "Generation worker failed.",
            scope: "generation",
          });
        }
      });

      const outbox = await outboxRepository.claim({
        leaseMs,
        limit: outboxLimit,
        workerId,
      });
      let outboxCompleted = 0;
      let outboxFailed = 0;
      let outboxRetried = 0;
      await mapBounded(outbox, outboxLimit, async (message) => {
        try {
          const result = await projectWithHeartbeat(message);
          if (result === "completed") outboxCompleted += 1;
          else if (result === "failed") outboxFailed += 1;
          else outboxRetried += 1;
        } catch (error) {
          errors.push({
            id: message.outboxId,
            message:
              error instanceof Error ? error.message : "Outbox worker failed.",
            scope: "outbox",
          });
        }
      });

      return {
        errors,
        generationBatches: generations.length,
        generationIds: generations.map((value) => value.generation_id),
        outboxCompleted,
        outboxFailed,
        outboxRetried,
        workClaimed: generationTasksClaimed + outbox.length,
      };
    },
  };
}
