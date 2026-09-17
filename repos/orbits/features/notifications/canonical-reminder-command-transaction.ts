import { createHash } from "node:crypto";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import {
  assertCanonicalReminderTargetOwned,
  canonicalReminderActorLockKey,
  canonicalReminderWakeId,
  CANONICAL_REMINDER_WAKE_REPAIR_SECONDS,
  CanonicalReminderTargetNotOwnedError,
  createCanonicalReminderWakeIntent,
  createCanonicalReminderWakeMessage,
  createDefaultCanonicalReminderWakePublisher,
  parseCanonicalReminderWakeIntent,
  saveCanonicalReminderWakeIntent,
  type CanonicalReminderWakeIntent,
  type CanonicalReminderWakeMessage,
  type CanonicalReminderWakePublisher,
} from "./canonical-reminder-wake";
import {
  createReminderPlanService,
  ReminderPlanServiceError,
  type ReminderPlanService,
} from "./reminder-plan-service";
import { createReminderPlanRepository, type ReminderPlanRepository } from "./reminder-plan-repository";
import type { ReminderPlanDTO } from "./reminder-plan-contract";

export interface CanonicalReminderCommandRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
  now?: () => string;
  publisher?: CanonicalReminderWakePublisher;
}

export type CanonicalReminderCommandService = Pick<
  ReminderPlanService,
  "create" | "reschedule" | "cancel" | "cancelFutureForTarget"
>;

type WakeRow = {
  workspace_id: string;
  record_id: string;
  user_id: string | null;
  source_id: string;
  payload: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type WakePayload = CanonicalReminderWakeIntent & Record<string, unknown>;

function stableId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`;
}

function reminderId(actorId: string, idempotencyKey: string): string {
  return stableId("reminder", actorId, idempotencyKey.trim());
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nowFor(runtime: CanonicalReminderCommandRuntime): string {
  const value = runtime.now?.() ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(value))) throw new Error("Canonical reminder command clock is invalid");
  return value;
}

function isPureInApp(plan: ReminderPlanDTO): boolean {
  return Array.isArray(plan.channels) && plan.channels.length === 1 && plan.channels[0] === "in_app";
}

function validPlan(value: unknown, actorId: string, id?: string): value is ReminderPlanDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return (!id || plan.id === id) && plan.ownerUserId === actorId && plan.accountId === actorId &&
    typeof plan.id === "string" && plan.id.length > 0 && typeof plan.targetId === "string" && plan.targetId.length > 0 &&
    (plan.targetType === "task" || plan.targetType === "schedule_item") && typeof plan.fireAt === "string" && Number.isFinite(Date.parse(plan.fireAt)) &&
    typeof plan.updatedAt === "string" && Number.isFinite(Date.parse(plan.updatedAt)) && Array.isArray(plan.channels) && plan.channels.length > 0 &&
    plan.channels.every((channel) => channel === "in_app" || channel === "ios_push") &&
    typeof plan.status === "string" && ["scheduled", "delivered", "cancelled", "failed"].includes(plan.status);
}

function asIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function boundTransaction(tx: TransactionalSqlExecutor): Promise<void> {
  await tx.query("set local statement_timeout = '5s'");
  await tx.query("set local lock_timeout = '1s'");
  await tx.query("set local idle_in_transaction_session_timeout = '5s'");
}

async function lockPlan(tx: TransactionalSqlExecutor, workspaceId: string, actorId: string, planId: string): Promise<void> {
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["canonical-reminder-plan", workspaceId, planId])]);
  await tx.query(
    `select record_id from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2 and user_id=$3 and lifecycle_state <> 'deleted' for update`,
    [workspaceId, planId, actorId],
  );
}

async function readWakeForUpdate(tx: TransactionalSqlExecutor, workspaceId: string, planId: string): Promise<{ row: WakeRow; intent: CanonicalReminderWakeIntent } | null> {
  const result = await tx.query<WakeRow>(
    `select workspace_id, record_id, user_id, source_id, payload, created_at, updated_at
     from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2 and lifecycle_state <> 'deleted' for update`,
    [workspaceId, canonicalReminderWakeId(planId)],
  );
  const row = result.rows[0];
  if (!row) return null;
  const intent = parseCanonicalReminderWakeIntent(row.payload);
  if (!intent || row.workspace_id !== workspaceId || row.user_id !== intent.actorId || row.source_id !== planId || intent.planId !== planId) {
    throw new Error("Canonical reminder wake intent scope is invalid");
  }
  return { row, intent };
}

function wakeRecordFromRow(row: WakeRow, intent: CanonicalReminderWakeIntent): LiveRecord<WakePayload> {
  return {
    workspaceId: row.workspace_id,
    collectionName: "canonical_reminder_wakes",
    recordId: row.record_id,
    userId: row.user_id,
    sourceType: "system",
    sourceId: row.source_id,
    evidenceIds: [],
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    lifecycleState: "active",
    payload: intent as WakePayload,
  };
}

type PublishCandidate = { message: CanonicalReminderWakeMessage; fireAt: string };

function mutationConflict(intent: CanonicalReminderWakeIntent | null, key: string, operationFingerprint: string): "replay" | "conflict" | null {
  if (!intent?.lastMutationKey || intent.lastMutationKey !== key) return null;
  return intent.lastMutationFingerprint === operationFingerprint ? "replay" : "conflict";
}

async function transactionWithRetry<T>(client: TransactionalPostgresClient, operation: (tx: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await client.transaction(operation);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "40001" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Canonical reminder command retry limit reached");
}

export function createCanonicalReminderCommandService({
  runtime,
}: {
  runtime: CanonicalReminderCommandRuntime;
}): CanonicalReminderCommandService {
  async function publishAfterCommit(candidates: readonly PublishCandidate[], commandNow: string): Promise<void> {
    const publisher = runtime.publisher ?? createDefaultCanonicalReminderWakePublisher();
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (Date.parse(candidate.fireAt) > Date.parse(commandNow) + CANONICAL_REMINDER_WAKE_REPAIR_SECONDS * 1_000) continue;
      const key = JSON.stringify(candidate.message);
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await publisher.publish(candidate.message);
      } catch {
        // The transaction is already committed. A failed hint is repairable
        // from the durable intent and must never make the client repeat a
        // successful plan mutation.
      }
    }
  }

  async function run<T>(input: {
    actorId: string;
    operation: (args: {
      tx: TransactionalSqlExecutor;
      store: LiveRecordStoreLike<Record<string, unknown>>;
      repository: ReminderPlanRepository;
      service: ReminderPlanService;
      candidates: PublishCandidate[];
      setMutation: (key: string, operationFingerprint: string) => void;
    }) => Promise<T>;
  }): Promise<T> {
    const commandNow = nowFor(runtime);
    const committed = await transactionWithRetry(runtime.client, async (tx) => {
      await boundTransaction(tx);
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [canonicalReminderActorLockKey(runtime.workspaceId, input.actorId)]);
      const store = createPostgresLiveRecordStore({ client: tx });
      const baseRepository = createReminderPlanRepository({ store, workspaceId: runtime.workspaceId });
      const candidates: PublishCandidate[] = [];
      let mutationKey = "";
      let mutationFingerprint = "";

      const saveIntentForPlan = async (plan: ReminderPlanDTO, increment: boolean, onlyIfMissing = false): Promise<void> => {
        if (!isPureInApp(plan)) return;
        const existing = await readWakeForUpdate(tx, runtime.workspaceId, plan.id);
        if (!existing) {
          const intent = createCanonicalReminderWakeIntent({ plan, workspaceId: runtime.workspaceId, generation: 1, now: plan.updatedAt, mutationKey, mutationFingerprint });
          await saveCanonicalReminderWakeIntent(store as LiveRecordStoreLike<WakePayload>, intent);
          if (plan.status === "scheduled") candidates.push({ message: createCanonicalReminderWakeMessage({ workspaceId: runtime.workspaceId, planId: plan.id, generation: intent.generation }), fireAt: plan.fireAt });
          return;
        }
        if (onlyIfMissing) return;
        const nextGeneration = existing.intent.generation + (increment ? 1 : 0);
        const next: CanonicalReminderWakeIntent = {
          ...existing.intent,
          actorId: plan.ownerUserId,
          targetType: plan.targetType,
          targetId: plan.targetId,
          fireAt: plan.fireAt,
          sourceRevision: plan.updatedAt,
          generation: nextGeneration,
          state: plan.status === "cancelled" ? "cancelled" : plan.status === "scheduled" ? "pending" : plan.status === "delivered" ? "delivered" : "failed",
          nextAttemptAt: plan.fireAt,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          leaseWorkerId: undefined,
          lastErrorCode: undefined,
          ...(mutationKey ? { lastMutationKey: mutationKey, lastMutationFingerprint: mutationFingerprint } : {}),
          updatedAt: plan.updatedAt,
        };
        await saveCanonicalReminderWakeIntent(store as LiveRecordStoreLike<WakePayload>, next, wakeRecordFromRow(existing.row, existing.intent));
        if (plan.status === "scheduled") candidates.push({ message: createCanonicalReminderWakeMessage({ workspaceId: runtime.workspaceId, planId: plan.id, generation: next.generation }), fireAt: plan.fireAt });
      };

      const repository: ReminderPlanRepository = {
        ...baseRepository,
        async getPlan(actorId, planId) {
          const plan = await baseRepository.getPlan(actorId, planId);
          if (plan && !validPlan(plan, actorId, planId)) throw new Error("Canonical reminder plan scope is invalid");
          return plan;
        },
        async listPlans(query) {
          const plans = await baseRepository.listPlans(query);
          return plans.map((plan) => {
            if (!validPlan(plan, query.actorId)) throw new Error("Canonical reminder plan scope is invalid");
            return plan;
          }).sort((left, right) => left.id.localeCompare(right.id));
        },
        async savePlan(plan) {
          if (!validPlan(plan, plan.ownerUserId)) throw new Error("Canonical reminder plan scope is invalid");
          const saved = await baseRepository.savePlan(plan);
          await saveIntentForPlan(saved, true);
          return saved;
        },
      };

      const service = createReminderPlanService({
        now: () => commandNow,
        repository,
        targetAuthorizer: {
          assertOwned: (command) => assertCanonicalReminderTargetOwned({ store, workspaceId: runtime.workspaceId, ...command }),
        },
      });
      const result = await input.operation({
        tx,
        store,
        repository,
        service,
        candidates,
        setMutation: (key, operationFingerprint) => {
          mutationKey = key.trim();
          mutationFingerprint = operationFingerprint;
        },
      });

      // A replay of a legacy plan may have no intent yet. Backfill only that
      // missing row; an existing intent (including an active lease) is never
      // rewritten by the command replay path.
      if (validPlan(result, input.actorId)) await saveIntentForPlan(result, false, true);
      return { result, candidates };
    });
    await publishAfterCommit(committed.candidates, commandNow);
    return committed.result;
  }

  async function create(input: Parameters<CanonicalReminderCommandService["create"]>[0]): Promise<ReminderPlanDTO> {
    const id = reminderId(input.actorId, input.idempotencyKey);
    return run({ actorId: input.actorId, operation: async ({ tx, service, setMutation }) => {
      await lockPlan(tx, runtime.workspaceId, input.actorId, id);
      setMutation(input.idempotencyKey, fingerprint({ action: "create", actorId: input.actorId, idempotencyKey: input.idempotencyKey }));
      return service.create(input);
    } });
  }

  async function reschedule(input: Parameters<CanonicalReminderCommandService["reschedule"]>[0]): Promise<ReminderPlanDTO> {
    const operationFingerprint = fingerprint({ action: "reschedule", actorId: input.actorId, reminderId: input.reminderId, fireAt: input.fireAt, timeZone: input.timeZone, expectedUpdatedAt: input.expectedUpdatedAt });
    return run({ actorId: input.actorId, operation: async ({ tx, store, repository, service, setMutation }) => {
      await lockPlan(tx, runtime.workspaceId, input.actorId, input.reminderId);
      const plan = await repository.getPlan(input.actorId, input.reminderId);
      const lockedIntent = await readWakeForUpdate(tx, runtime.workspaceId, input.reminderId);
      const replay = mutationConflict(lockedIntent?.intent ?? null, input.idempotencyKey, operationFingerprint);
      if (replay === "conflict") throw new ReminderPlanServiceError("CONFLICT", "Idempotency key has different content");
      if (replay === "replay" && plan) return plan;
      if (plan && plan.status !== "cancelled") {
        try {
          await assertCanonicalReminderTargetOwned({
            store,
            workspaceId: runtime.workspaceId,
            actorId: input.actorId,
            targetType: plan.targetType,
            targetId: plan.targetId,
            requireActive: true,
          });
        } catch (error) {
          if (!(error instanceof CanonicalReminderTargetNotOwnedError)) throw error;
          throw new ReminderPlanServiceError("TARGET_NOT_OWNED", "Reminder target is not owned by this actor");
        }
      }
      setMutation(input.idempotencyKey, operationFingerprint);
      return service.reschedule(input);
    } });
  }

  async function cancel(input: Parameters<CanonicalReminderCommandService["cancel"]>[0]): Promise<ReminderPlanDTO> {
    const operationFingerprint = fingerprint({ action: "cancel", actorId: input.actorId, reminderId: input.reminderId });
    return run({ actorId: input.actorId, operation: async ({ tx, repository, service, setMutation }) => {
      await lockPlan(tx, runtime.workspaceId, input.actorId, input.reminderId);
      const plan = await repository.getPlan(input.actorId, input.reminderId);
      if (!plan) return service.cancel(input);
      const lockedIntent = await readWakeForUpdate(tx, runtime.workspaceId, input.reminderId);
      const replay = mutationConflict(lockedIntent?.intent ?? null, input.idempotencyKey, operationFingerprint);
      if (replay === "conflict") throw new ReminderPlanServiceError("CONFLICT", "Idempotency key has different content");
      if (replay === "replay") return plan;
      setMutation(input.idempotencyKey, operationFingerprint);
      return service.cancel(input);
    } });
  }

  async function cancelFutureForTarget(input: Parameters<CanonicalReminderCommandService["cancelFutureForTarget"]>[0]): Promise<number> {
    return run({ actorId: input.actorId, operation: async ({ tx, store, repository, service, setMutation }) => {
      await assertCanonicalReminderTargetOwned({ store, workspaceId: runtime.workspaceId, actorId: input.actorId, targetType: input.targetType, targetId: input.targetId, requireActive: false });
      const plans = await repository.listPlans({ actorId: input.actorId, includeCancelled: true, targetId: input.targetId, targetType: input.targetType });
      for (const plan of plans) await lockPlan(tx, runtime.workspaceId, input.actorId, plan.id);
      setMutation(input.idempotencyKey, fingerprint({ action: "cancelFutureForTarget", actorId: input.actorId, targetType: input.targetType, targetId: input.targetId }));
      return service.cancelFutureForTarget(input);
    } });
  }

  return { create, reschedule, cancel, cancelFutureForTarget };
}
