import { createHash, randomUUID } from "node:crypto";
import { send } from "@vercel/queue";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
  type TransactionalSqlExecutor,
} from "../../shared/storage/transactional-postgres";
import { createTaskRepository } from "../tasks/repository";
import { createPersonalScheduleService } from "../personal-schedule/service";
import { AppError } from "../../shared/errors/app-error";
import { createReminderPlanRepository } from "./reminder-plan-repository";
import { createReminderPlanService, ReminderPlanServiceError } from "./reminder-plan-service";
import type { NotificationDeliveryDTO, NotificationPreferencesDTO, ReminderPlanDTO, ReminderTargetType } from "./reminder-plan-contract";
import { MAINTENANCE_HEARTBEAT_TOPIC } from "../operations/maintenance/heartbeat";
import {createInboxProjectionWorkRepository,type InboxProjectionSource} from './storage/inbox-projection-work';
import {canonicalInboxProjectionRevision} from './canonical-inbox-projection-revision';

export { MAINTENANCE_HEARTBEAT_TOPIC };

export const CANONICAL_REMINDER_WAKE_COLLECTION = "canonical_reminder_wakes";
export const CANONICAL_REMINDER_WAKE_KIND = "canonical-reminder-wake" as const;
export const CANONICAL_REMINDER_WAKE_VERSION = 1 as const;
export const CANONICAL_REMINDER_WAKE_TOPIC = MAINTENANCE_HEARTBEAT_TOPIC;
export const CANONICAL_REMINDER_WAKE_LEASE_MS = 5 * 60 * 1_000;
export const CANONICAL_REMINDER_WAKE_REPAIR_SECONDS = 600;
export const CANONICAL_REMINDER_WAKE_MAX_ACTORS = 25;
export const CANONICAL_REMINDER_WAKE_MAX_PLANS_PER_ACTOR = 10;
export const CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID = "canonical-reminder-scheduler:round-robin:v1";
export const CANONICAL_REMINDER_WAKE_SCHEDULER_KIND = "canonical-reminder-round-robin" as const;

// The scheduler row is system state in the canonical wake collection. There
// is no retention job in this path; any future terminal-retention query must
// keep this record id/kind out of its delete set.

// This is a cursor boundary, not an actor.  It must remain non-empty because
// the cursor parser deliberately rejects an empty/ambiguous boundary.
const CANONICAL_REMINDER_WAKE_SCHEDULER_INITIAL_ACTOR_ID = "canonical-reminder-round-robin:start";
const CANONICAL_REMINDER_WAKE_TRANSACTION_BUDGET_MS = 5_000;

export type CanonicalReminderWakeState = "pending" | "leased" | "delivered" | "cancelled" | "failed";

export interface CanonicalReminderWakeIntent {
  version: 1;
  kind: typeof CANONICAL_REMINDER_WAKE_KIND;
  workspaceId: string;
  actorId: string;
  planId: string;
  targetType: ReminderTargetType;
  targetId: string;
  fireAt: string;
  sourceRevision: string;
  generation: number;
  channels: readonly ["in_app"];
  state: CanonicalReminderWakeState;
  nextAttemptAt: string;
  attempts: number;
  leaseEpoch: number;
  leaseToken?: string;
  leaseExpiresAt?: string;
  leaseWorkerId?: string;
  lastClaimedAt?: string;
  lastErrorCode?: string;
  lastMutationKey?: string;
  lastMutationFingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalReminderWakeSchedulerState {
  version: 1;
  kind: typeof CANONICAL_REMINDER_WAKE_SCHEDULER_KIND;
  workspaceId: string;
  lastVisitedActorId: string;
  sequence: number;
  updatedAt: string;
}

export interface CanonicalReminderWakeMessageBase {
  version: 1;
  kind: typeof CANONICAL_REMINDER_WAKE_KIND;
  workspaceId: string;
  intentId: string;
  planId: string;
  generation: number;
}

export interface CanonicalReminderWakeLeaseMessage extends CanonicalReminderWakeMessageBase {
  leaseEpoch: number;
  leaseToken: string;
}

export type CanonicalReminderWakeMessage = CanonicalReminderWakeMessageBase | CanonicalReminderWakeLeaseMessage;

export interface CanonicalReminderWakePublisher {
  publish(message: CanonicalReminderWakeMessage): Promise<void>;
}

export interface CanonicalReminderWakeRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
  now?: () => string;
  publisher?: CanonicalReminderWakePublisher;
  /** Opt-in only after the additive work schema has been installed. */
  inboxProjection?: {enqueue(executor:TransactionalSqlExecutor,source:InboxProjectionSource):Promise<void>};
}

type WakeRecordPayload = CanonicalReminderWakeIntent & Record<string, unknown>;

type WakeRow = {
  workspace_id: string;
  collection_name?: string;
  record_id: string;
  user_id: string | null;
  source_id?: string;
  target_type?: string | null;
  target_id?: string | null;
  payload: unknown;
  created_at?: string | Date;
  updated_at?: string | Date;
};

type PlanRow = WakeRow;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function reminderPlanStatus(value: unknown): value is ReminderPlanDTO["status"] {
  return value === "scheduled" || value === "delivered" || value === "cancelled" || value === "failed";
}

function reminderCreatedBy(value: unknown): value is ReminderPlanDTO["createdBy"] {
  return value === "user" || value === "agent_confirmed";
}

function deliveryStatus(value: unknown): value is NotificationDeliveryDTO["status"] {
  return value === "claimed" || value === "delivered" || value === "failed" || value === "suppressed";
}

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return nonEmpty(value) ? value : null;
}

function optionalDate(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return validDate(value) ? value : null;
}

function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function targetType(value: unknown): value is ReminderTargetType {
  return value === "task" || value === "schedule_item";
}

function wakeState(value: unknown): value is CanonicalReminderWakeState {
  return value === "pending" || value === "leased" || value === "delivered" || value === "cancelled" || value === "failed";
}

export function parseCanonicalReminderWakeIntent(value: unknown): CanonicalReminderWakeIntent | null {
  if (!isRecord(value) || value.version !== CANONICAL_REMINDER_WAKE_VERSION || value.kind !== CANONICAL_REMINDER_WAKE_KIND ||
      !nonEmpty(value.workspaceId) || !nonEmpty(value.actorId) || !nonEmpty(value.planId) || !targetType(value.targetType) ||
      !nonEmpty(value.targetId) || !validDate(value.fireAt) || !validDate(value.sourceRevision) || !integer(value.generation, 1) ||
      !Array.isArray(value.channels) || value.channels.length !== 1 || value.channels[0] !== "in_app" || !wakeState(value.state) ||
      !validDate(value.nextAttemptAt) || !integer(value.attempts) || !integer(value.leaseEpoch) ||
      !validDate(value.createdAt) || !validDate(value.updatedAt)) return null;
  if (value.leaseToken !== undefined && !nonEmpty(value.leaseToken)) return null;
  if (value.leaseExpiresAt !== undefined && !validDate(value.leaseExpiresAt)) return null;
  if (value.leaseWorkerId !== undefined && !nonEmpty(value.leaseWorkerId)) return null;
  if (value.lastClaimedAt !== undefined && !validDate(value.lastClaimedAt)) return null;
  if (value.lastErrorCode !== undefined && !nonEmpty(value.lastErrorCode)) return null;
  if (value.lastMutationKey !== undefined && !nonEmpty(value.lastMutationKey)) return null;
  if (value.lastMutationFingerprint !== undefined && !nonEmpty(value.lastMutationFingerprint)) return null;
  return {
    version: 1,
    kind: CANONICAL_REMINDER_WAKE_KIND,
    workspaceId: value.workspaceId as string,
    actorId: value.actorId as string,
    planId: value.planId as string,
    targetType: value.targetType as ReminderTargetType,
    targetId: value.targetId as string,
    fireAt: value.fireAt as string,
    sourceRevision: value.sourceRevision as string,
    generation: value.generation as number,
    channels: ["in_app"],
    state: value.state as CanonicalReminderWakeState,
    nextAttemptAt: value.nextAttemptAt as string,
    attempts: value.attempts as number,
    leaseEpoch: value.leaseEpoch as number,
    ...(value.leaseToken !== undefined ? { leaseToken: value.leaseToken as string } : {}),
    ...(value.leaseExpiresAt !== undefined ? { leaseExpiresAt: value.leaseExpiresAt as string } : {}),
    ...(value.leaseWorkerId !== undefined ? { leaseWorkerId: value.leaseWorkerId as string } : {}),
    ...(value.lastClaimedAt !== undefined ? { lastClaimedAt: value.lastClaimedAt as string } : {}),
    ...(value.lastErrorCode !== undefined ? { lastErrorCode: value.lastErrorCode as string } : {}),
    ...(value.lastMutationKey !== undefined ? { lastMutationKey: value.lastMutationKey as string } : {}),
    ...(value.lastMutationFingerprint !== undefined ? { lastMutationFingerprint: value.lastMutationFingerprint as string } : {}),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function validUtcDate(value: unknown): value is string {
  return validDate(value) && value.endsWith("Z");
}

export function parseCanonicalReminderWakeScheduler(
  value: unknown,
  expectedWorkspaceId?: string,
): CanonicalReminderWakeSchedulerState | null {
  if (!isRecord(value) || value.version !== CANONICAL_REMINDER_WAKE_VERSION ||
      value.kind !== CANONICAL_REMINDER_WAKE_SCHEDULER_KIND || !nonEmpty(value.workspaceId) ||
      (expectedWorkspaceId !== undefined && value.workspaceId !== expectedWorkspaceId) ||
      !nonEmpty(value.lastVisitedActorId) || !integer(value.sequence) || !validUtcDate(value.updatedAt)) return null;
  return {
    version: 1,
    kind: CANONICAL_REMINDER_WAKE_SCHEDULER_KIND,
    workspaceId: value.workspaceId as string,
    lastVisitedActorId: value.lastVisitedActorId as string,
    sequence: value.sequence as number,
    updatedAt: value.updatedAt as string,
  };
}

const parseWakeIntent = parseCanonicalReminderWakeIntent;

function stableId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`;
}

export function canonicalReminderWakeId(planId: string): string {
  return stableId("canonical-reminder-wake", planId);
}

export function canonicalReminderDeliveryId(plan: Pick<ReminderPlanDTO, "ownerUserId" | "id" | "fireAt">): string {
  return stableId("notification-delivery", plan.ownerUserId, plan.id, "in_app", "app", plan.fireAt);
}

export function canonicalReminderActorLockKey(workspaceId: string, actorId: string): string {
  return JSON.stringify(["canonical-reminder-in-app", workspaceId, actorId]);
}

export function createCanonicalReminderWakeMessage(input: {
  workspaceId: string;
  planId: string;
  generation: number;
  leaseEpoch?: number;
  leaseToken?: string;
}): CanonicalReminderWakeMessage {
  if (!nonEmpty(input.workspaceId) || !nonEmpty(input.planId) || !integer(input.generation, 1)) {
    throw new Error("Invalid canonical reminder wake identity");
  }
  const hasLeaseEpoch = input.leaseEpoch !== undefined;
  const hasLeaseToken = input.leaseToken !== undefined;
  if (hasLeaseEpoch !== hasLeaseToken || (hasLeaseEpoch && !integer(input.leaseEpoch, 1)) || (hasLeaseToken && !nonEmpty(input.leaseToken))) {
    throw new Error("Invalid canonical reminder wake lease");
  }
  return {
    version: CANONICAL_REMINDER_WAKE_VERSION,
    kind: CANONICAL_REMINDER_WAKE_KIND,
    workspaceId: input.workspaceId,
    intentId: canonicalReminderWakeId(input.planId),
    planId: input.planId,
    generation: input.generation,
    ...(hasLeaseEpoch ? { leaseEpoch: input.leaseEpoch, leaseToken: input.leaseToken } : {}),
  } as CanonicalReminderWakeMessage;
}

export function isCanonicalReminderWakeMessage(value: unknown): value is CanonicalReminderWakeMessage {
  if (!isRecord(value) || value.version !== CANONICAL_REMINDER_WAKE_VERSION || value.kind !== CANONICAL_REMINDER_WAKE_KIND ||
      !nonEmpty(value.workspaceId) || !nonEmpty(value.intentId) || !nonEmpty(value.planId) || !integer(value.generation, 1) ||
      value.intentId !== canonicalReminderWakeId(value.planId)) return false;
  const keys = Object.keys(value).sort();
  const base = ["generation", "intentId", "kind", "planId", "version", "workspaceId"];
  const leased = [...base, "leaseEpoch", "leaseToken"].sort();
  if (keys.length !== base.length && keys.length !== leased.length) return false;
  if (!keys.every((key, index) => key === (keys.length === base.length ? base : leased)[index])) return false;
  const hasEpoch = Object.hasOwn(value, "leaseEpoch");
  const hasToken = Object.hasOwn(value, "leaseToken");
  return hasEpoch === hasToken && (!hasEpoch || (integer(value.leaseEpoch, 1) && nonEmpty(value.leaseToken)));
}

export function createCanonicalReminderWakePublisher({
  // A cloud deployment is not an activation grant for this pilot. The
  // configured factory must inject the publisher explicitly when the queue
  // path has been approved; local/default construction is always inert.
  enabled = false,
  sendMessage = (topic: string, message: CanonicalReminderWakeMessage) => send(topic, message),
}: {
  enabled?: boolean;
  sendMessage?: (topic: string, message: CanonicalReminderWakeMessage) => Promise<unknown>;
} = {}): CanonicalReminderWakePublisher {
  return {
    async publish(message) {
      if (!enabled) return;
      if (!isCanonicalReminderWakeMessage(message)) throw new Error("Invalid canonical reminder wake message");
      await sendMessage(CANONICAL_REMINDER_WAKE_TOPIC, message);
    },
  };
}

export const createDefaultCanonicalReminderWakePublisher = createCanonicalReminderWakePublisher;

export function createCanonicalReminderWakeIntent(input: {
  plan: ReminderPlanDTO;
  workspaceId: string;
  generation?: number;
  now?: string;
  mutationKey?: string;
  mutationFingerprint?: string;
}): CanonicalReminderWakeIntent {
  const timestamp = input.now ?? input.plan.updatedAt;
  const generation = input.generation ?? 1;
  if (!integer(generation, 1) || !validDate(timestamp)) throw new Error("Invalid canonical reminder wake intent timestamp");
  return {
    version: CANONICAL_REMINDER_WAKE_VERSION,
    kind: CANONICAL_REMINDER_WAKE_KIND,
    workspaceId: input.workspaceId,
    actorId: input.plan.ownerUserId,
    planId: input.plan.id,
    targetType: input.plan.targetType,
    targetId: input.plan.targetId,
    fireAt: input.plan.fireAt,
    sourceRevision: input.plan.updatedAt,
    generation,
    channels: ["in_app"],
    state: input.plan.status === "cancelled"
      ? "cancelled"
      : input.plan.status === "delivered"
        ? "delivered"
        : input.plan.status === "failed"
          ? "failed"
          : "pending",
    nextAttemptAt: input.plan.fireAt,
    attempts: 0,
    leaseEpoch: 0,
    ...(input.mutationKey ? { lastMutationKey: input.mutationKey } : {}),
    ...(input.mutationFingerprint ? { lastMutationFingerprint: input.mutationFingerprint } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function canonicalReminderWakeRecord(
  intent: CanonicalReminderWakeIntent,
  existing?: LiveRecord<WakeRecordPayload>,
): LiveRecord<WakeRecordPayload> {
  return {
    ...(existing ?? {}),
    workspaceId: intent.workspaceId,
    collectionName: CANONICAL_REMINDER_WAKE_COLLECTION,
    recordId: canonicalReminderWakeId(intent.planId),
    userId: intent.actorId,
    sourceType: existing?.sourceType ?? "system",
    sourceId: intent.planId,
    sourceLabel: existing?.sourceLabel ?? "Canonical in-app reminder wake",
    evidenceIds: existing?.evidenceIds ?? [],
    targetType: intent.targetType,
    targetId: intent.targetId,
    occurredAt: intent.fireAt,
    createdAt: existing?.createdAt ?? intent.createdAt,
    updatedAt: intent.updatedAt,
    lifecycleState: "active",
    searchText: existing?.searchText ?? "",
    payload: intent as WakeRecordPayload,
  };
}

export async function saveCanonicalReminderWakeIntent(
  store: LiveRecordStoreLike<WakeRecordPayload>,
  intent: CanonicalReminderWakeIntent,
  existing?: LiveRecord<WakeRecordPayload>,
): Promise<LiveRecord<WakeRecordPayload>> {
  return store.upsertRecord(canonicalReminderWakeRecord(intent, existing));
}

export async function readCanonicalReminderWakeIntent(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  planId: string,
): Promise<{ intent: CanonicalReminderWakeIntent; record: LiveRecord<Record<string, unknown>> } | null> {
  const record = await store.getRecord({ workspaceId, collectionName: CANONICAL_REMINDER_WAKE_COLLECTION, recordId: canonicalReminderWakeId(planId), includeDeleted: true });
  const intent = parseWakeIntent(record?.payload);
  if (!record || !intent || record.workspaceId !== workspaceId || record.userId !== intent.actorId || intent.planId !== planId || intent.workspaceId !== workspaceId) return null;
  return { intent, record };
}

export class CanonicalReminderTargetNotOwnedError extends ReminderPlanServiceError {
  constructor(message: string) {
    super("TARGET_NOT_OWNED", message);
    this.name = "CanonicalReminderTargetNotOwnedError";
  }
}

export async function assertCanonicalReminderTargetOwned(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  actorId: string;
  targetType: ReminderTargetType;
  targetId: string;
  requireActive?: boolean;
}): Promise<void> {
  if (!nonEmpty(input.actorId) || !nonEmpty(input.targetId)) throw new CanonicalReminderTargetNotOwnedError("Reminder target is not owned");
  const requireActive = input.requireActive !== false;
  if (input.targetType === "task") {
    const target = await createTaskRepository({ store: input.store, workspaceId: input.workspaceId }).get(input.actorId, input.targetId, { includeDeleted: !requireActive });
    const task = target?.payload.task;
    if (!task || task.id !== input.targetId || task.accountId !== input.actorId || task.ownerUserId !== input.actorId ||
        (requireActive && (task.status === "completed" || task.status === "cancelled"))) throw new CanonicalReminderTargetNotOwnedError("Reminder task target is not owned");
    return;
  }
  if (input.targetType === "schedule_item") {
    const id = input.targetId.startsWith("schedule:") ? input.targetId.slice("schedule:".length) : input.targetId;
    try {
      const target = await createPersonalScheduleService({ store: input.store, workspaceId: input.workspaceId }).get({ actorId: input.actorId, id });
      if (!target || target.accountId !== input.actorId || target.ownerUserId !== input.actorId || target.id !== id || (requireActive && target.state === "cancelled")) {
        throw new CanonicalReminderTargetNotOwnedError("Reminder schedule target is not owned");
      }
    } catch (error) {
      if (error instanceof CanonicalReminderTargetNotOwnedError) throw error;
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        throw new CanonicalReminderTargetNotOwnedError("Reminder schedule target is not owned");
      }
      throw error;
    }
    return;
  }
  throw new CanonicalReminderTargetNotOwnedError("Unsupported reminder target");
}

function monotonicMilliseconds(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function assertWakeTransactionBudget(startedAt: number): void {
  if (monotonicMilliseconds() - startedAt >= CANONICAL_REMINDER_WAKE_TRANSACTION_BUDGET_MS) {
    throw new Error("Canonical reminder wake transaction budget exceeded");
  }
}

type WakeClaimExecutionOptions = {
  deadline?: number;
  clock?: () => Date;
};

class CanonicalReminderWakeDeadlineExceeded extends Error {}

function assertWakeClaimDeadline(options?: WakeClaimExecutionOptions): void {
  if (options?.deadline !== undefined && (options.clock?.() ?? new Date()).getTime() >= options.deadline) {
    throw new CanonicalReminderWakeDeadlineExceeded("Canonical reminder wake repair deadline exceeded");
  }
}

async function boundTransaction(
  tx: TransactionalSqlExecutor,
  startedAt = monotonicMilliseconds(),
  options?: WakeClaimExecutionOptions,
): Promise<void> {
  assertWakeClaimDeadline(options);
  assertWakeTransactionBudget(startedAt);
  await tx.query("set local statement_timeout = '5s'");
  assertWakeClaimDeadline(options);
  assertWakeTransactionBudget(startedAt);
  await tx.query("set local lock_timeout = '1s'");
  assertWakeClaimDeadline(options);
  assertWakeTransactionBudget(startedAt);
  await tx.query("set local idle_in_transaction_session_timeout = '5s'");
  assertWakeClaimDeadline(options);
}

async function wakeQuery<TRow = Record<string, unknown>>(
  tx: TransactionalSqlExecutor,
  startedAt: number,
  statement: string,
  values?: readonly unknown[],
  options?: WakeClaimExecutionOptions,
): Promise<{ rows: readonly TRow[] }> {
  assertWakeClaimDeadline(options);
  assertWakeTransactionBudget(startedAt);
  const result = await tx.query<TRow>(statement, values);
  assertWakeClaimDeadline(options);
  assertWakeTransactionBudget(startedAt);
  return result;
}

function createBudgetedExecutor(tx: TransactionalSqlExecutor, startedAt: number): TransactionalSqlExecutor {
  return {
    query: <TRow = Record<string, unknown>>(statement: string, values?: readonly unknown[]) =>
      wakeQuery<TRow>(tx, startedAt, statement, values),
  };
}

const reminderOwnedCollections = ["reminderPlans", "notificationDeliveries", "notificationPreferences"] as const;
type ReminderOwnedCollection = (typeof reminderOwnedCollections)[number];

class CanonicalReminderScopeError extends Error {}

function reminderPlanFromEntity(value: Record<string, unknown>): ReminderPlanDTO | null {
  const id = value.id;
  const accountId = value.accountId;
  const ownerUserId = value.ownerUserId;
  const targetTypeValue = value.targetType;
  const targetId = value.targetId;
  const fireAt = value.fireAt;
  const timeZone = value.timeZone;
  const status = value.status;
  const title = value.title;
  const body = value.body;
  const deepLink = value.deepLink;
  const createdBy = value.createdBy;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const deliveredAt = optionalDate(value.deliveredAt);
  const cancelledAt = optionalDate(value.cancelledAt);
  const failureCode = optionalString(value.failureCode);
  if (!nonEmpty(id) || !nonEmpty(accountId) || !nonEmpty(ownerUserId) || !targetType(targetTypeValue) ||
      !nonEmpty(targetId) || !validDate(fireAt) || !nonEmpty(timeZone) ||
      !Array.isArray(value.channels) || value.channels.length !== 1 || value.channels[0] !== "in_app" ||
      !reminderPlanStatus(status) || !reminderCreatedBy(createdBy) || !nonEmpty(title) || !nonEmpty(body) ||
      !nonEmpty(deepLink) || !validDate(createdAt) || !validDate(updatedAt) ||
      deliveredAt === null || cancelledAt === null || failureCode === null) return null;
  return {
    id,
    accountId,
    ownerUserId,
    targetType: targetTypeValue,
    targetId,
    fireAt,
    timeZone,
    status,
    channels: ["in_app"],
    title,
    body,
    deepLink,
    createdBy,
    ...(deliveredAt !== undefined ? { deliveredAt } : {}),
    ...(cancelledAt !== undefined ? { cancelledAt } : {}),
    ...(failureCode !== undefined ? { failureCode } : {}),
    createdAt,
    updatedAt,
  };
}

function reminderDeliveryFromEntity(value: Record<string, unknown>): NotificationDeliveryDTO | null {
  const id = value.id;
  const accountId = value.accountId;
  const ownerUserId = value.ownerUserId;
  const reminderPlanId = value.reminderPlanId;
  const fireAt = value.fireAt;
  const status = value.status;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const deviceId = optionalString(value.deviceId);
  const providerMessageId = optionalString(value.providerMessageId);
  const failureCode = optionalString(value.failureCode);
  const deliveredAt = optionalDate(value.deliveredAt);
  if (!nonEmpty(id) || !nonEmpty(accountId) || !nonEmpty(ownerUserId) || !nonEmpty(reminderPlanId) ||
      value.channel !== "in_app" || !validDate(fireAt) || !deliveryStatus(status) ||
      !validDate(createdAt) || !validDate(updatedAt) || deviceId === null || providerMessageId === null ||
      failureCode === null || deliveredAt === null) return null;
  return {
    id,
    accountId,
    ownerUserId,
    reminderPlanId,
    ...(deviceId !== undefined ? { deviceId } : {}),
    channel: "in_app",
    fireAt,
    status,
    ...(providerMessageId !== undefined ? { providerMessageId } : {}),
    ...(failureCode !== undefined ? { failureCode } : {}),
    ...(deliveredAt !== undefined ? { deliveredAt } : {}),
    createdAt,
    updatedAt,
  };
}

function reminderPreferencesFromEntity(value: Record<string, unknown>): NotificationPreferencesDTO | null {
  const quietHours = value.quietHours;
  if (!nonEmpty(value.accountId) || !nonEmpty(value.ownerUserId) || typeof value.inAppEnabled !== "boolean" ||
      typeof value.iosPushEnabled !== "boolean" || (value.lockScreenContent !== "full" && value.lockScreenContent !== "private") ||
      !isRecord(quietHours) || typeof quietHours.enabled !== "boolean" || !nonEmpty(quietHours.start) ||
      !nonEmpty(quietHours.end) || !nonEmpty(quietHours.timeZone) || !validDate(value.updatedAt)) return null;
  return {
    accountId: value.accountId,
    ownerUserId: value.ownerUserId,
    inAppEnabled: value.inAppEnabled,
    iosPushEnabled: value.iosPushEnabled,
    lockScreenContent: value.lockScreenContent,
    quietHours: {
      enabled: quietHours.enabled,
      start: quietHours.start,
      end: quietHours.end,
      timeZone: quietHours.timeZone,
    },
    updatedAt: value.updatedAt,
  };
}

function isReminderOwnedCollection(value: string | undefined): value is ReminderOwnedCollection {
  return value !== undefined && reminderOwnedCollections.includes(value as ReminderOwnedCollection);
}

function assertReminderRecordOwned(record: LiveRecord<Record<string, unknown>>, workspaceId: string, actorId: string): void {
  if (record.workspaceId !== workspaceId || record.userId !== actorId || !isRecord(record.payload) || !isRecord(record.payload.entity)) {
    throw new CanonicalReminderScopeError("Reminder record ownership mismatch");
  }
  const entity = record.payload.entity;
  if (entity.accountId !== actorId || entity.ownerUserId !== actorId ||
      (record.collectionName === "notificationPreferences" ? record.recordId !== actorId : entity.id !== record.recordId)) {
    throw new CanonicalReminderScopeError("Reminder entity ownership mismatch");
  }
  if ((record.collectionName === "reminderPlans" && !reminderPlanFromEntity(entity)) ||
      (record.collectionName === "notificationDeliveries" && !reminderDeliveryFromEntity(entity)) ||
      (record.collectionName === "notificationPreferences" && !reminderPreferencesFromEntity(entity))) {
    throw new CanonicalReminderScopeError("Reminder entity shape is invalid");
  }
}

/**
 * The wake consumer already owns the actor lock and must not hand the domain
 * service a store that can read or write another actor's reminder records.
 * This adapter also keeps LiveRecord mapping at the storage boundary; the
 * reminder repository receives the same owned records as the legacy service.
 */
function createCanonicalReminderOwnedStore(
  tx: TransactionalSqlExecutor,
  workspaceId: string,
  actorId: string,
): LiveRecordStoreLike<Record<string, unknown>> {
  const store = createPostgresLiveRecordStore({ client: tx });
  const assertQuery = (query: { workspaceId: string; collectionName?: string; userId?: string }): void => {
    if (query.workspaceId !== workspaceId || !isReminderOwnedCollection(query.collectionName) ||
        (query.userId !== undefined && query.userId !== actorId)) {
      throw new CanonicalReminderScopeError("Reminder query is outside actor scope");
    }
  };
  const assertWrite = (record: LiveRecord<Record<string, unknown>>): void => {
    if (!isReminderOwnedCollection(record.collectionName)) throw new CanonicalReminderScopeError("Reminder write collection is not allowed");
    assertReminderRecordOwned(record, workspaceId, actorId);
    if (record.collectionName === "notificationPreferences") {
      throw new CanonicalReminderScopeError("Reminder consumer cannot write preferences");
    }
  };
  return {
    async getRecord(query) {
      assertQuery(query);
      const record = await store.getRecord(query);
      if (!record) return null;
      assertReminderRecordOwned(record, workspaceId, actorId);
      return record;
    },
    async listRecords(query) {
      assertQuery(query);
      const records = await store.listRecords({ ...query, workspaceId, userId: actorId });
      for (const record of records) assertReminderRecordOwned(record, workspaceId, actorId);
      return records;
    },
    async upsertRecord(record) {
      assertWrite(record);
      return store.upsertRecord(record);
    },
    async insertRecordIfAbsent(record) {
      assertWrite(record);
      return store.insertRecordIfAbsent?.(record) ?? null;
    },
    async deleteRecord() {
      throw new CanonicalReminderScopeError("Reminder consumer cannot delete records");
    },
  };
}

function timestamp(value: string): string {
  return validDate(value) ? value : new Date().toISOString();
}

function retryAt(now: string, attempts: number): string {
  const exponent = Math.min(9, Math.max(0, attempts));
  const delay = Math.min(CANONICAL_REMINDER_WAKE_REPAIR_SECONDS * 1_000, 1_000 * 2 ** exponent);
  return new Date(Date.parse(now) + delay).toISOString();
}

function isWakeEligible(intent: CanonicalReminderWakeIntent, now: string): boolean {
  if (intent.state === "pending") return Date.parse(intent.nextAttemptAt) <= Date.parse(now);
  if (intent.state === "leased") return validDate(intent.leaseExpiresAt) && Date.parse(intent.leaseExpiresAt) <= Date.parse(now);
  return false;
}

function wakeEligiblePredicate(alias: string, extra = ""): string {
  return `
      ${alias}.workspace_id = $1 and ${alias}.collection_name = '${CANONICAL_REMINDER_WAKE_COLLECTION}'
        and ${alias}.record_id <> '${CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID}'
        and ${alias}.lifecycle_state = 'active' and ${alias}.deleted_at is null
        and ${alias}.user_id is not null and btrim(${alias}.user_id) <> ''
        and ${alias}.payload->>'version' = '1' and ${alias}.payload->>'kind' = '${CANONICAL_REMINDER_WAKE_KIND}'
        and ${alias}.payload->>'actorId' = ${alias}.user_id
        and ${alias}.payload->>'workspaceId' = $1
        and ${alias}.payload->'channels' = '["in_app"]'::jsonb
        and ${alias}.payload->>'state' in ('pending', 'leased')
        and pg_input_is_valid(${alias}.payload->>'fireAt', 'timestamptz')
        and (
          (${alias}.payload->>'state' = 'pending' and case when pg_input_is_valid(${alias}.payload->>'nextAttemptAt', 'timestamptz') then (${alias}.payload->>'nextAttemptAt')::timestamptz else 'infinity'::timestamptz end <= $2::timestamptz)
          or
          (${alias}.payload->>'state' = 'leased' and case when pg_input_is_valid(${alias}.payload->>'leaseExpiresAt', 'timestamptz') then (${alias}.payload->>'leaseExpiresAt')::timestamptz else 'infinity'::timestamptz end <= $2::timestamptz)
        )
        ${extra}
  `;
}

function wakeVisitedActorSql(extra: string): string {
  return `
    with eligible_actors as (
      select r.user_id as actor_id
      from orbit_records r
      where ${wakeEligiblePredicate("r", extra)}
      group by r.user_id
    )
    select actor_id
    from eligible_actors
    order by
      case
        when $5::bigint = 0 then 0
        when actor_id collate "C" > $4::text collate "C" then 0
        else 1
      end,
      actor_id collate "C"
    limit $3
  `;
}

function wakeCandidateSql(extra: string): string {
  return `
    with selected_actors as (
      select actor_id, ordinal::integer as actor_rank
      from unnest($3::text[]) with ordinality as selected(actor_id, ordinal)
    )
    select candidate.workspace_id, candidate.collection_name, candidate.record_id,
      candidate.user_id, candidate.payload, candidate.created_at, candidate.updated_at,
      candidate.source_id, candidate.target_type, candidate.target_id
    from selected_actors selected
    cross join lateral (
      select r.workspace_id, r.collection_name, r.record_id, r.user_id, r.payload,
        r.created_at, r.updated_at, r.source_id, r.target_type, r.target_id,
        case when pg_input_is_valid(r.payload->>'fireAt', 'timestamptz') then (r.payload->>'fireAt')::timestamptz else 'infinity'::timestamptz end as fire_at
      from orbit_records r
      where ${wakeEligiblePredicate("r", extra)}
        and r.user_id = selected.actor_id
      order by fire_at, r.record_id collate "C"
      limit $4
      for update of r skip locked
    ) candidate
    order by selected.actor_rank, candidate.fire_at, candidate.record_id collate "C"
  `;
}

function wakeDirectCandidateSql(extra: string): string {
  return `
    select r.workspace_id, r.collection_name, r.record_id, r.user_id, r.payload,
      r.created_at, r.updated_at, r.source_id, r.target_type, r.target_id
    from orbit_records r
    where ${wakeEligiblePredicate("r", extra)}
    order by
      case when pg_input_is_valid(r.payload->>'fireAt', 'timestamptz') then (r.payload->>'fireAt')::timestamptz else 'infinity'::timestamptz end,
      r.record_id collate "C"
    limit $3
    for update of r skip locked
  `;
}

type SchedulerRow = {
  workspace_id: string;
  collection_name: string;
  record_id: string;
  user_id: string | null;
  source_type: string;
  source_id: string;
  target_type: string | null;
  target_id: string | null;
  lifecycle_state: string;
  deleted_at: string | Date | null;
  payload: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type WakeActorRow = { actor_id: string };

function schedulerTimestamp(now: string): string {
  return new Date(Date.parse(now)).toISOString();
}

function schedulerLockKey(workspaceId: string): string {
  return JSON.stringify(["canonical-reminder-wake-round-robin", workspaceId]);
}

function rowTimestamp(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && validDate(value) ? value : null;
}

async function readSchedulerCursorForUpdate(
  tx: TransactionalSqlExecutor,
  startedAt: number,
  workspaceId: string,
  now: string,
  options?: WakeClaimExecutionOptions,
): Promise<CanonicalReminderWakeSchedulerState> {
  const read = () => wakeQuery<SchedulerRow>(tx, startedAt, `
    select workspace_id, collection_name, record_id, user_id, source_type, source_id,
      target_type, target_id, lifecycle_state, deleted_at, payload, created_at, updated_at
    from orbit_records
    where workspace_id=$1 and collection_name='${CANONICAL_REMINDER_WAKE_COLLECTION}'
      and record_id=$2
      for update
  `, [workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID], options);

  let result = await read();
  if (result.rows.length === 0) {
    const updatedAt = schedulerTimestamp(now);
    const initial: CanonicalReminderWakeSchedulerState = {
      version: 1,
      kind: CANONICAL_REMINDER_WAKE_SCHEDULER_KIND,
      workspaceId,
      lastVisitedActorId: CANONICAL_REMINDER_WAKE_SCHEDULER_INITIAL_ACTOR_ID,
      sequence: 0,
      updatedAt,
    };
    await wakeQuery(tx, startedAt, `
      insert into orbit_records (
        workspace_id, collection_name, record_id, user_id, source_type, source_id,
        evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
      ) values ($1, '${CANONICAL_REMINDER_WAKE_COLLECTION}', $2, null, 'system', $1,
        '{}', 'active', '', $3::jsonb, $4::timestamptz, $4::timestamptz)
      on conflict (workspace_id, collection_name, record_id) do nothing
    `, [workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID, JSON.stringify(initial), updatedAt], options);
    result = await read();
  }

  const row = result.rows[0];
  const state = row ? parseCanonicalReminderWakeScheduler(row.payload, workspaceId) : null;
  if (!row || row.workspace_id !== workspaceId || row.collection_name !== CANONICAL_REMINDER_WAKE_COLLECTION ||
      row.record_id !== CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID || row.user_id !== null ||
      row.source_type !== "system" || row.source_id !== workspaceId || row.target_type !== null ||
      row.target_id !== null || row.lifecycle_state !== "active" || row.deleted_at !== null || !state ||
      rowTimestamp(row.updated_at) === null || Date.parse(rowTimestamp(row.updated_at)!) !== Date.parse(state.updatedAt)) {
    throw new Error("Canonical reminder wake scheduler cursor is corrupt");
  }
  return state;
}

async function advanceSchedulerCursor(
  tx: TransactionalSqlExecutor,
  startedAt: number,
  workspaceId: string,
  state: CanonicalReminderWakeSchedulerState,
  lastVisitedActorId: string,
  now: string,
  options?: WakeClaimExecutionOptions,
): Promise<CanonicalReminderWakeSchedulerState> {
  if (!nonEmpty(lastVisitedActorId) || state.sequence >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Canonical reminder wake scheduler sequence overflow");
  }
  const next: CanonicalReminderWakeSchedulerState = {
    ...state,
    lastVisitedActorId,
    sequence: state.sequence + 1,
    updatedAt: schedulerTimestamp(now),
  };
  const result = await wakeQuery<SchedulerRow>(tx, startedAt, `
    update orbit_records
    set payload=$1::jsonb, updated_at=$2::timestamptz
    where workspace_id=$3 and collection_name='${CANONICAL_REMINDER_WAKE_COLLECTION}'
      and record_id=$4 and user_id is null and source_type='system' and source_id=$3
      and lifecycle_state='active' and deleted_at is null
    returning workspace_id, collection_name, record_id, user_id, source_type, source_id,
      target_type, target_id, lifecycle_state, deleted_at, payload, created_at, updated_at
  `, [JSON.stringify(next), next.updatedAt, workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID], options);
  const persisted = result.rows[0];
  if (!persisted || !parseCanonicalReminderWakeScheduler(persisted.payload, workspaceId)) {
    throw new Error("Canonical reminder wake scheduler cursor fence failed");
  }
  return next;
}

async function hasEligibleWake(
  tx: TransactionalSqlExecutor,
  workspaceId: string,
  now: string,
  startedAt: number,
  extra = "",
  extraValues: readonly unknown[] = [],
  options?: WakeClaimExecutionOptions,
): Promise<boolean> {
  const result = await wakeQuery<{ eligible: boolean }>(
    tx,
    startedAt,
    `select exists (select 1 from orbit_records r where ${wakeEligiblePredicate("r", extra)}) as eligible`,
    [workspaceId, now, ...extraValues],
    options,
  );
  return result.rows[0]?.eligible === true;
}

type WakeLeasePatch = {
  record_id: string;
  lease_epoch: number;
  lease_token: string;
  lease_expires_at: string;
  lease_worker_id: string;
  attempts: number;
  last_claimed_at: string;
  updated_at: string;
};

type WakeFailurePatch = { record_id: string; error_code: string; updated_at: string };

async function bulkLeaseWakes(
  tx: TransactionalSqlExecutor,
  startedAt: number,
  workspaceId: string,
  patches: readonly WakeLeasePatch[],
  options?: WakeClaimExecutionOptions,
): Promise<readonly WakeRow[]> {
  if (patches.length === 0) return [];
  const result = await wakeQuery<WakeRow>(tx, startedAt, `
    with patches as (
      select * from jsonb_to_recordset($1::jsonb) as p(
        record_id text, lease_epoch bigint, lease_token text, lease_expires_at text,
        lease_worker_id text, attempts bigint, last_claimed_at text, updated_at text
      )
    )
    update orbit_records r
    set payload = r.payload || jsonb_build_object(
      'state', 'leased', 'leaseEpoch', p.lease_epoch, 'leaseToken', p.lease_token,
      'leaseExpiresAt', p.lease_expires_at, 'leaseWorkerId', p.lease_worker_id,
      'attempts', p.attempts, 'lastClaimedAt', p.last_claimed_at, 'updatedAt', p.updated_at
    ), updated_at = p.updated_at::timestamptz
    from patches p
    where r.workspace_id=$2 and r.collection_name='${CANONICAL_REMINDER_WAKE_COLLECTION}'
      and r.record_id <> '${CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID}' and r.record_id=p.record_id
      and r.lifecycle_state='active'
      and r.deleted_at is null and r.payload->>'state' in ('pending', 'leased')
    returning r.workspace_id, r.collection_name, r.record_id, r.user_id, r.source_id,
      r.target_type, r.target_id, r.payload, r.created_at, r.updated_at
  `, [JSON.stringify(patches), workspaceId], options);
  if (result.rows.length !== patches.length) throw new Error("Canonical reminder wake lease fence failed");
  return result.rows;
}

async function bulkFailWakes(
  tx: TransactionalSqlExecutor,
  startedAt: number,
  workspaceId: string,
  patches: readonly WakeFailurePatch[],
  options?: WakeClaimExecutionOptions,
): Promise<void> {
  if (patches.length === 0) return;
  const result = await wakeQuery<{ record_id: string }>(tx, startedAt, `
    with patches as (
      select * from jsonb_to_recordset($1::jsonb) as p(record_id text, error_code text, updated_at text)
    )
    update orbit_records r
    set payload = r.payload || jsonb_build_object('state', 'failed', 'lastErrorCode', p.error_code, 'updatedAt', p.updated_at),
      updated_at = p.updated_at::timestamptz
    from patches p
    where r.workspace_id=$2 and r.collection_name='${CANONICAL_REMINDER_WAKE_COLLECTION}'
      and r.record_id <> '${CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID}' and r.record_id=p.record_id
      and r.lifecycle_state='active' and r.deleted_at is null
    returning r.record_id
  `, [JSON.stringify(patches), workspaceId], options);
  if (result.rows.length !== patches.length) throw new Error("Canonical reminder wake failure fence failed");
}

function serializableCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

export interface ClaimCanonicalReminderWakesInput {
  runtime: CanonicalReminderWakeRuntime;
  workerId: string;
  now?: string;
  maxActors?: number;
  maxPlansPerActor?: number;
  intentId?: string;
  planId?: string;
  generation?: number;
}

export interface ClaimCanonicalReminderWakesResult {
  messages: readonly CanonicalReminderWakeMessage[];
  claimed: number;
  malformed: number;
  hasMore: boolean;
  continuation: number;
}

export async function claimCanonicalReminderWakes(input: ClaimCanonicalReminderWakesInput): Promise<ClaimCanonicalReminderWakesResult> {
  return claimCanonicalReminderWakesInternal(input);
}

async function claimCanonicalReminderWakesInternal(
  input: ClaimCanonicalReminderWakesInput,
  options?: WakeClaimExecutionOptions,
): Promise<ClaimCanonicalReminderWakesResult> {
  if (input.generation !== undefined && input.intentId === undefined && input.planId === undefined) {
    throw new Error("Canonical reminder wake generation requires intentId and planId");
  }
  const now = timestamp(input.now ?? input.runtime.now?.() ?? new Date().toISOString());
  const maxActors = Math.min(CANONICAL_REMINDER_WAKE_MAX_ACTORS, Math.max(1, input.maxActors ?? CANONICAL_REMINDER_WAKE_MAX_ACTORS));
  const maxPlansPerActor = Math.min(CANONICAL_REMINDER_WAKE_MAX_PLANS_PER_ACTOR, Math.max(1, input.maxPlansPerActor ?? CANONICAL_REMINDER_WAKE_MAX_PLANS_PER_ACTOR));
  const workerId = nonEmpty(input.workerId) ? input.workerId : "maintenance";
  const targeted = input.intentId !== undefined || input.planId !== undefined;

  const claimTransaction = async (): Promise<ClaimCanonicalReminderWakesResult> => input.runtime.client.transaction(async (tx) => {
    const startedAt = monotonicMilliseconds();
    await boundTransaction(tx, startedAt, options);

    const directExtraValues: unknown[] = [input.runtime.workspaceId, now, 1];
    const directExtra: string[] = [];
    if (input.intentId !== undefined) {
      directExtraValues.push(input.intentId);
      directExtra.push(`and r.record_id = $${directExtraValues.length}`);
    }
    if (input.planId !== undefined) {
      directExtraValues.push(input.planId);
      directExtra.push(`and r.payload->>'planId' = $${directExtraValues.length}`);
    }
    if (input.generation !== undefined) {
      directExtraValues.push(String(input.generation));
      directExtra.push(`and r.payload->>'generation' = $${directExtraValues.length}`);
    }

    let visitedActorIds: string[] = [];
    let schedulerState: CanonicalReminderWakeSchedulerState | undefined;
    let candidates: { rows: readonly WakeRow[] };
    let hasMoreExtra = "";
    let hasMoreValues: readonly unknown[] = [];

    if (targeted) {
      // Queue callbacks and repair retries target one exact intent/plan.  They
      // must never consume or mutate the global workspace cursor.
      candidates = await wakeQuery<WakeRow>(tx, startedAt, wakeDirectCandidateSql(directExtra.join("\n        ")), directExtraValues, options);
      hasMoreExtra = "";
    } else {
      const hasEligibleGenerationExtra = input.generation === undefined ? "" : "and r.payload->>'generation' = $3";
      const actorGenerationExtra = input.generation === undefined ? "" : "and r.payload->>'generation' = $6";
      const candidateGenerationExtra = input.generation === undefined ? "" : "and r.payload->>'generation' = $5";
      const generationValues = input.generation === undefined ? [] : [String(input.generation)];
      hasMoreExtra = hasEligibleGenerationExtra;
      hasMoreValues = generationValues;

      // This read-only EXISTS is intentionally before the advisory lock.  A
      // future-only/empty workspace therefore has no cursor initialization or
      // update (the SET LOCAL statements are not data writes).
      if (!await hasEligibleWake(tx, input.runtime.workspaceId, now, startedAt, hasEligibleGenerationExtra, generationValues, options)) {
        assertWakeTransactionBudget(startedAt);
        return { messages: [], claimed: 0, malformed: 0, hasMore: false, continuation: 0 };
      }
      await wakeQuery(tx, startedAt, "select pg_advisory_xact_lock(hashtextextended($1, 0))", [schedulerLockKey(input.runtime.workspaceId)], options);
      if (!await hasEligibleWake(tx, input.runtime.workspaceId, now, startedAt, hasEligibleGenerationExtra, generationValues, options)) {
        assertWakeTransactionBudget(startedAt);
        return { messages: [], claimed: 0, malformed: 0, hasMore: false, continuation: 0 };
      }
      schedulerState = await readSchedulerCursorForUpdate(tx, startedAt, input.runtime.workspaceId, now, options);
      const visited = await wakeQuery<WakeActorRow>(
        tx,
        startedAt,
        wakeVisitedActorSql(actorGenerationExtra),
        [input.runtime.workspaceId, now, maxActors, schedulerState.lastVisitedActorId, schedulerState.sequence, ...generationValues],
        options,
      );
      visitedActorIds = visited.rows.map((row) => row.actor_id).filter(nonEmpty);
      candidates = await wakeQuery<WakeRow>(
        tx,
        startedAt,
        wakeCandidateSql(candidateGenerationExtra),
        [input.runtime.workspaceId, now, visitedActorIds, maxPlansPerActor, ...generationValues],
        options,
      );
    }

    const messages: CanonicalReminderWakeMessage[] = [];
    const leasePatches: WakeLeasePatch[] = [];
    const failurePatches: WakeFailurePatch[] = [];
    for (const candidate of candidates.rows) {
      const intent = parseWakeIntent(candidate.payload);
      if (!intent || intent.workspaceId !== input.runtime.workspaceId || intent.planId !== candidate.source_id && candidate.source_id !== undefined ||
          !isWakeEligible(intent, now)) {
        failurePatches.push({ record_id: candidate.record_id, error_code: "INVALID_WAKE_INTENT", updated_at: timestamp(now) });
        continue;
      }
      const leaseToken = randomUUID();
      const leaseEpoch = intent.leaseEpoch + 1;
      const updatedAt = timestamp(now);
      const leaseExpiresAt = new Date(Date.parse(now) + CANONICAL_REMINDER_WAKE_LEASE_MS).toISOString();
      if (!integer(leaseEpoch, 1)) {
        failurePatches.push({ record_id: candidate.record_id, error_code: "LEASE_EPOCH_OVERFLOW", updated_at: updatedAt });
        continue;
      }
      const attempts = intent.attempts + 1;
      if (!integer(attempts, 1)) {
        failurePatches.push({ record_id: candidate.record_id, error_code: "ATTEMPTS_OVERFLOW", updated_at: updatedAt });
        continue;
      }
      leasePatches.push({ record_id: candidate.record_id, lease_epoch: leaseEpoch, lease_token: leaseToken, lease_expires_at: leaseExpiresAt, lease_worker_id: workerId, attempts, last_claimed_at: updatedAt, updated_at: updatedAt });
    }

    await bulkFailWakes(tx, startedAt, input.runtime.workspaceId, failurePatches, options);
    const leasedRows = await bulkLeaseWakes(tx, startedAt, input.runtime.workspaceId, leasePatches, options);
    const leasedById = new Map(leasedRows.map((row) => [row.record_id, row]));
    for (const patch of leasePatches) {
      const leased = parseWakeIntent(leasedById.get(patch.record_id)?.payload);
      if (!leased || leased.workspaceId !== input.runtime.workspaceId || leased.state !== "leased" ||
          leased.leaseEpoch !== patch.lease_epoch || leased.leaseToken !== patch.lease_token) {
        throw new Error("Canonical reminder wake lease payload is invalid");
      }
      messages.push(createCanonicalReminderWakeMessage({ workspaceId: input.runtime.workspaceId, planId: leased.planId, generation: leased.generation, leaseEpoch: leased.leaseEpoch, leaseToken: leased.leaseToken }));
    }

    if (schedulerState && visitedActorIds.length > 0) {
      await advanceSchedulerCursor(tx, startedAt, input.runtime.workspaceId, schedulerState, visitedActorIds[visitedActorIds.length - 1]!, now, options);
    }

    const hasMore = await hasEligibleWake(tx, input.runtime.workspaceId, now, startedAt, hasMoreExtra, hasMoreValues, options);
    assertWakeTransactionBudget(startedAt);
    return { messages, claimed: messages.length, malformed: failurePatches.length, hasMore, continuation: hasMore ? 1 : 0 };
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertWakeClaimDeadline(options);
    try {
      return await claimTransaction();
    } catch (error) {
      if (serializableCode(error) !== "40001" || attempt === 2) throw error;
    }
  }
  throw new Error("Canonical reminder wake transaction retry limit reached");
}

function planFromRow(row: PlanRow | null | undefined, actorId: string): ReminderPlanDTO | null {
  if (!row) return null;
  if (!isRecord(row.payload) || !isRecord(row.payload.entity)) return null;
  const plan = reminderPlanFromEntity(row.payload.entity);
  if (!plan) return null;
  const persistedUpdatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? "");
  if (row.user_id !== actorId || plan.id !== row.record_id || plan.ownerUserId !== actorId || plan.accountId !== actorId ||
      row.source_id !== plan.id || !validDate(persistedUpdatedAt) || Date.parse(persistedUpdatedAt) !== Date.parse(plan.updatedAt) ||
      (row.target_type !== undefined && row.target_type !== null && row.target_type !== plan.targetType) ||
      (row.target_id !== undefined && row.target_id !== null && row.target_id !== plan.targetId)) return null;
  return plan;
}

/** Read one authority source, not its workspace graph. No source row lock:
 * this runs under the projection-work lock and must not reverse writer order. */
export async function readCanonicalReminderProjectionSource(executor:TransactionalSqlExecutor,workspaceId:string,source:InboxProjectionSource):Promise<ReminderPlanDTO|null> {
  const rows=await executor.query<PlanRow>(`with source as (
    select workspace_id,collection_name,record_id,user_id,source_id,target_type,target_id,created_at,updated_at,
      (select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(payload->'entity')='object' then payload->'entity' else '{}'::jsonb end)
        where key in ('id','accountId','ownerUserId','targetType','targetId','fireAt','timeZone','status','title','body','deepLink','createdBy','createdAt','updatedAt','channels','deliveredAt','cancelledAt','failureCode')) as entity
    from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2 and user_id=$3 and lifecycle_state='active')
    select workspace_id,collection_name,record_id,user_id,source_id,target_type,target_id,created_at,updated_at,
      jsonb_build_object('entity',case when octet_length(entity::text)<=65536 then entity else null end) as payload from source`,[workspaceId,source.sourceId,source.actorId]);
  if(!rows.rows.length)return null;
  const plan=planFromRow(rows.rows[0],source.actorId);
  if(!plan)throw Error('CANONICAL_PROJECTION_SOURCE_INVALID');
  if(canonicalInboxProjectionRevision(plan)!==source.sourceRevision||plan.status==='cancelled')return null;
  if(plan.channels.length!==1||plan.channels[0]!=='in_app')throw Error('CANONICAL_PROJECTION_SOURCE_INVALID');
  // Match the existing reminder inbox: a due scheduled/failed plan is visible
  // even before successful delivery. Only a delivered claim needs its fence.
  if(plan.status!=='delivered')return plan;
  const id=canonicalReminderDeliveryId(plan);
  const deliveries=await executor.query<WakeRow>(`with source as (
    select record_id,user_id,(select jsonb_object_agg(key,value)
      from jsonb_each(case when jsonb_typeof(payload->'entity')='object' then payload->'entity' else '{}'::jsonb end)
      where key in ('id','accountId','ownerUserId','reminderPlanId','fireAt','channel','status','createdAt','updatedAt','deliveredAt','deviceId','providerMessageId','failureCode')) as entity
    from orbit_records where workspace_id=$1 and collection_name='notificationDeliveries' and record_id=$2 and user_id=$3 and lifecycle_state='active')
    select record_id,user_id,jsonb_build_object('entity',case when octet_length(entity::text)<=16384 then entity else null end) as payload from source`,[workspaceId,id,source.actorId]);
  const payload=deliveries.rows[0]?.payload;
  const delivery=isRecord(payload)&&isRecord(payload.entity)?reminderDeliveryFromEntity(payload.entity):null;
  if(!delivery||delivery.id!==id||delivery.accountId!==source.actorId||delivery.ownerUserId!==source.actorId||delivery.status!=='delivered'||delivery.channel!=='in_app'
    ||delivery.reminderPlanId!==plan.id||delivery.fireAt!==plan.fireAt)throw Error('CANONICAL_PROJECTION_SOURCE_INVALID');
  return plan;
}

function wakeRecordFromSqlRow(row: WakeRow, intent: CanonicalReminderWakeIntent): LiveRecord<WakeRecordPayload> {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? intent.createdAt);
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? intent.updatedAt);
  return {
    workspaceId: row.workspace_id,
    collectionName: CANONICAL_REMINDER_WAKE_COLLECTION,
    recordId: row.record_id,
    userId: row.user_id,
    sourceType: "system",
    sourceId: row.source_id ?? intent.planId,
    evidenceIds: [],
    targetType: row.target_type ?? intent.targetType,
    targetId: row.target_id ?? intent.targetId,
    occurredAt: intent.fireAt,
    createdAt,
    updatedAt,
    lifecycleState: "active",
    payload: intent as WakeRecordPayload,
  };
}

async function resolveWakeActor(runtime: CanonicalReminderWakeRuntime, message: CanonicalReminderWakeMessage): Promise<string | null> {
  return runtime.client.transaction(async (tx) => {
    const startedAt = monotonicMilliseconds();
    await boundTransaction(tx, startedAt);
    const budgetedTx = createBudgetedExecutor(tx, startedAt);
    const result = await budgetedTx.query<{ user_id: string | null }>(
      `select user_id from orbit_records
       where workspace_id=$1 and collection_name='${CANONICAL_REMINDER_WAKE_COLLECTION}'
         and record_id=$2 and record_id <> '${CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID}'
         and payload->>'kind' = '${CANONICAL_REMINDER_WAKE_KIND}' and lifecycle_state <> 'deleted'`,
      [runtime.workspaceId, message.intentId],
    );
    return result.rows[0]?.user_id ?? null;
  });
}

type WakeProcessResult = {
  outcome: "delivered" | "already_delivered" | "stale" | "ignored" | "not_due" | "failed";
  reason?: string;
  deliveryId?: string;
};

async function consumeLeasedWake(
  runtime: CanonicalReminderWakeRuntime,
  message: Extract<CanonicalReminderWakeMessage, { leaseEpoch: number; leaseToken: string }>,
): Promise<WakeProcessResult> {
  const actorId = await resolveWakeActor(runtime, message);
  if (!actorId) return { outcome: "stale", reason: "intent_not_found" };
  const now = timestamp(runtime.now?.() ?? new Date().toISOString());
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runtime.client.transaction(async (tx) => {
        const startedAt = monotonicMilliseconds();
        await boundTransaction(tx, startedAt);
        const budgetedTx = createBudgetedExecutor(tx, startedAt);
        await budgetedTx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [canonicalReminderActorLockKey(runtime.workspaceId, actorId)]);
        const planResult = await budgetedTx.query<PlanRow>(
          `select workspace_id, collection_name, record_id, user_id, source_id, target_type, target_id, payload, created_at, updated_at
           from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2 and lifecycle_state <> 'deleted' for update`,
          [runtime.workspaceId, message.planId],
        );
        const intentResult = await budgetedTx.query<WakeRow>(
          `select workspace_id, collection_name, record_id, user_id, source_id, target_type, target_id, payload, created_at, updated_at
           from orbit_records where workspace_id=$1 and collection_name='${CANONICAL_REMINDER_WAKE_COLLECTION}'
             and record_id=$2 and record_id <> '${CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID}'
             and payload->>'kind' = '${CANONICAL_REMINDER_WAKE_KIND}' and lifecycle_state <> 'deleted' for update`,
          [runtime.workspaceId, message.intentId],
        );
        const intentRecord = intentResult.rows[0];
        const intent = parseWakeIntent(intentRecord?.payload);
        if (!intent || !intentRecord || intentRecord.workspace_id !== runtime.workspaceId || intentRecord.source_id !== message.planId ||
            (intentRecord.target_type !== undefined && intentRecord.target_type !== null && intentRecord.target_type !== intent.targetType) ||
            (intentRecord.target_id !== undefined && intentRecord.target_id !== null && intentRecord.target_id !== intent.targetId) ||
            intent.workspaceId !== runtime.workspaceId || intent.actorId !== actorId || intent.planId !== message.planId ||
            intentRecord.user_id !== actorId || message.generation !== intent.generation || intent.state !== "leased" ||
            intent.leaseEpoch !== message.leaseEpoch || intent.leaseToken !== message.leaseToken ||
            !validDate(intent.leaseExpiresAt) || Date.parse(intent.leaseExpiresAt) <= Date.parse(now)) return { outcome: "stale", reason: "lease_fenced" };

        const planRow = planResult.rows[0];
        const plan = planFromRow(planRow, actorId);
        const txStore = createPostgresLiveRecordStore({ client: budgetedTx });
        const wakeStore = createPostgresLiveRecordStore<WakeRecordPayload>({ client: budgetedTx });
        const finishIntent = async (patch: Partial<CanonicalReminderWakeIntent>): Promise<void> => {
          const next = { ...intent, ...patch, updatedAt: now } as CanonicalReminderWakeIntent;
          await saveCanonicalReminderWakeIntent(wakeStore, next, wakeRecordFromSqlRow(intentRecord, intent));
        };
        if (!plan || !planRow) {
          await finishIntent({ state: "failed", lastErrorCode: "PLAN_SCOPE_INVALID", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: "failed", reason: "plan_scope_invalid" };
        }
        if (plan.ownerUserId !== intent.actorId || plan.accountId !== intent.actorId || plan.id !== intent.planId || plan.targetId !== intent.targetId || plan.targetType !== intent.targetType ||
            plan.channels.length !== 1 || plan.channels[0] !== "in_app" || plan.fireAt !== intent.fireAt) {
          await finishIntent({ state: "failed", lastErrorCode: "PLAN_INTENT_SCOPE_MISMATCH", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: "failed", reason: "plan_intent_scope_mismatch" };
        }
        const ownedStore = createCanonicalReminderOwnedStore(budgetedTx, runtime.workspaceId, actorId);
        const repository = createReminderPlanRepository({ store: ownedStore, workspaceId: runtime.workspaceId });
        const service = createReminderPlanService({
          now: () => now,
          repository: { ...repository, listDuePlans: async () => [plan] },
          withDeliveryGate: async (_actorId, operation) => operation(),
        });
        const deliveryId = canonicalReminderDeliveryId(plan);
        if (plan.status === "delivered") {
          let existingDelivery;
          try {
            existingDelivery = await repository.getDelivery(actorId, deliveryId);
          } catch (error) {
            if (!(error instanceof CanonicalReminderScopeError)) throw error;
            await finishIntent({ state: "failed", lastErrorCode: "DELIVERY_SCOPE_INVALID", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
            return { outcome: "failed", reason: "delivery_scope_invalid" };
          }
          const hasDeliveredDelivery = existingDelivery?.id === deliveryId && existingDelivery.status === "delivered" &&
            existingDelivery.ownerUserId === actorId && existingDelivery.accountId === actorId &&
            existingDelivery.reminderPlanId === plan.id && existingDelivery.fireAt === plan.fireAt && existingDelivery.channel === "in_app";
          if (!hasDeliveredDelivery) {
            await finishIntent({ state: "failed", lastErrorCode: "PLAN_DELIVERED_WITHOUT_FENCE", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
            return { outcome: "failed", reason: "plan_delivered_without_fence" };
          }
          await runtime.inboxProjection?.enqueue(budgetedTx,{actorId,sourceKind:'canonical_reminder',sourceId:plan.id,sourceRevision:canonicalInboxProjectionRevision(plan)});
          await finishIntent({ state: "delivered", sourceRevision: plan.updatedAt, leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined, lastErrorCode: undefined });
          return { outcome: "already_delivered", deliveryId };
        }
        if (plan.status !== "scheduled") {
          await finishIntent({ state: plan.status === "cancelled" ? "cancelled" : "failed", sourceRevision: plan.updatedAt, lastErrorCode: plan.status === "cancelled" ? undefined : "PLAN_NOT_SCHEDULED", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: plan.status === "cancelled" ? "stale" : "failed", reason: "plan_not_scheduled" };
        }
        if (plan.updatedAt !== intent.sourceRevision || Date.parse(plan.fireAt) > Date.parse(now)) {
          if (Date.parse(plan.fireAt) > Date.parse(now)) {
            await finishIntent({ state: "pending", nextAttemptAt: plan.fireAt, leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
            return { outcome: "not_due", reason: "fire_at_in_future" };
          }
          return { outcome: "stale", reason: "source_revision_changed" };
        }
        try {
          await assertCanonicalReminderTargetOwned({ store: txStore, workspaceId: runtime.workspaceId, actorId, targetType: plan.targetType, targetId: plan.targetId, requireActive: true });
        } catch (error) {
          if (!(error instanceof CanonicalReminderTargetNotOwnedError)) throw error;
          await finishIntent({ state: "failed", lastErrorCode: "TARGET_NOT_OWNED", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: "failed", reason: "target_not_owned" };
        }
        let dispatchResult;
        try {
          dispatchResult = await service.dispatchDue({
            now,
            provider: { async send() { throw new Error("External reminder sends are disabled"); } },
          });
        } catch (error) {
          if (!(error instanceof CanonicalReminderScopeError)) throw error;
          await finishIntent({ state: "failed", lastErrorCode: "REMINDER_SCOPE_INVALID", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: "failed", reason: "reminder_scope_invalid" };
        }
        const refreshed = await budgetedTx.query<PlanRow>(
          `select workspace_id, collection_name, record_id, user_id, source_id, target_type, target_id, payload, created_at, updated_at
           from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2 and lifecycle_state <> 'deleted' for update`,
          [runtime.workspaceId, plan.id],
        );
        const currentPlan = planFromRow(refreshed.rows[0], actorId);
        if (!currentPlan) {
          await finishIntent({ state: "failed", lastErrorCode: "PLAN_SCOPE_INVALID", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: "failed", reason: "plan_scope_invalid_after_dispatch" };
        }
        if (currentPlan.status === "delivered") {
          await runtime.inboxProjection?.enqueue(budgetedTx,{actorId,sourceKind:'canonical_reminder',sourceId:currentPlan.id,sourceRevision:canonicalInboxProjectionRevision(currentPlan)});
          await finishIntent({ state: "delivered", sourceRevision: currentPlan.updatedAt, leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined, lastErrorCode: undefined });
          return { outcome: dispatchResult.inAppDelivered > 0 ? "delivered" : "already_delivered", deliveryId };
        }
        if (currentPlan.status === "cancelled") {
          await finishIntent({ state: "cancelled", sourceRevision: currentPlan.updatedAt, leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined, lastErrorCode: undefined });
          return { outcome: "stale", reason: "plan_cancelled_during_dispatch" };
        }
        if (currentPlan.status === "failed") {
          await runtime.inboxProjection?.enqueue(budgetedTx,{actorId,sourceKind:'canonical_reminder',sourceId:currentPlan.id,sourceRevision:canonicalInboxProjectionRevision(currentPlan)});
          await finishIntent({ state: "failed", sourceRevision: currentPlan.updatedAt, lastErrorCode: currentPlan.failureCode ?? "DISPATCH_FAILED", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
          return { outcome: "failed", reason: currentPlan.failureCode ?? "dispatch_failed" };
        }
        await finishIntent({ state: "pending", nextAttemptAt: retryAt(now, intent.attempts), lastErrorCode: "DISPATCH_DID_NOT_CONVERGE", leaseToken: undefined, leaseExpiresAt: undefined, leaseWorkerId: undefined });
        return { outcome: "failed", reason: "dispatch_did_not_converge" };
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "40001" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Canonical reminder wake transaction retry limit reached");
}

export async function processCanonicalReminderWakeMessage(
  message: unknown,
  runtime: CanonicalReminderWakeRuntime,
  workerId = "queue",
): Promise<WakeProcessResult> {
  if (!isCanonicalReminderWakeMessage(message)) return { outcome: "ignored", reason: "invalid_message" };
  if (message.workspaceId !== runtime.workspaceId) return { outcome: "ignored", reason: "workspace_mismatch" };
  if (!("leaseEpoch" in message)) {
    const claim = await claimCanonicalReminderWakes({ runtime, workerId, now: runtime.now?.(), intentId: message.intentId, planId: message.planId, generation: message.generation, maxActors: 1, maxPlansPerActor: 1 });
    const leased = claim.messages[0];
    if (!leased || !("leaseEpoch" in leased)) return { outcome: "stale", reason: "wake_not_eligible" };
    return consumeLeasedWake(runtime, leased);
  }
  return consumeLeasedWake(runtime, message);
}

export interface RepairCanonicalReminderWakesInput {
  runtime: CanonicalReminderWakeRuntime;
  workerId?: string;
  now?: string;
  maxActors?: number;
  maxPlansPerActor?: number;
  deadline?: number;
  clock?: () => Date;
}

export interface RepairCanonicalReminderWakesResult {
  claimed: number;
  inAppDelivered: number;
  failed: number;
  publishFailed: number;
  deferred: number;
  wakeClaimed: number;
  wakeDelivered: number;
  wakeFailed: number;
  wakePublishFailed: number;
  wakeContinuation: number;
}

export async function repairCanonicalReminderWakes(input: RepairCanonicalReminderWakesInput): Promise<RepairCanonicalReminderWakesResult> {
  const now = timestamp(input.now ?? input.runtime.now?.() ?? new Date().toISOString());
  let claim: ClaimCanonicalReminderWakesResult;
  try {
    claim = await claimCanonicalReminderWakesInternal(
      { runtime: input.runtime, workerId: input.workerId ?? "maintenance", now, maxActors: input.maxActors, maxPlansPerActor: input.maxPlansPerActor },
      { deadline: input.deadline, clock: input.clock },
    );
  } catch (error) {
    if (!(error instanceof CanonicalReminderWakeDeadlineExceeded)) throw error;
    return {
      claimed: 0,
      inAppDelivered: 0,
      failed: 0,
      publishFailed: 0,
      deferred: 1,
      wakeClaimed: 0,
      wakeDelivered: 0,
      wakeFailed: 0,
      wakePublishFailed: 0,
      wakeContinuation: 1,
    };
  }
  const publisher = input.runtime.publisher ?? createDefaultCanonicalReminderWakePublisher();
  const result: RepairCanonicalReminderWakesResult = {
    claimed: claim.claimed,
    inAppDelivered: 0,
    failed: 0,
    publishFailed: 0,
    deferred: 0,
    wakeClaimed: claim.claimed,
    wakeDelivered: 0,
    wakeFailed: 0,
    wakePublishFailed: 0,
    wakeContinuation: claim.continuation,
  };
  for (const message of claim.messages) {
    if (input.deadline !== undefined && (input.clock?.() ?? new Date()).getTime() >= input.deadline) {
      result.deferred += 1;
      continue;
    }
    try {
      await publisher.publish(message);
    } catch {
      result.publishFailed += 1;
      result.wakePublishFailed += 1;
    }
    try {
      const outcome = await consumeLeasedWake(input.runtime, message as Extract<CanonicalReminderWakeMessage, { leaseEpoch: number; leaseToken: string }>);
      if (outcome.outcome === "delivered" || outcome.outcome === "already_delivered") {
        result.inAppDelivered += 1;
        result.wakeDelivered += 1;
      } else if (outcome.outcome === "failed") {
        result.failed += 1;
        result.wakeFailed += 1;
      }
    } catch {
      result.failed += 1;
      result.wakeFailed += 1;
    }
  }
  if (result.deferred > 0) result.wakeContinuation = 1;
  return result;
}

export async function processConfiguredCanonicalReminderWake(message: unknown): Promise<WakeProcessResult> {
  const runtime = createConfiguredTransactionalPostgresRuntime({ max: 2 });
  if (!runtime) return { outcome: "ignored", reason: "database_unconfigured" };
  const inboxProjection=process.env.ORBIT_CANONICAL_INBOX_PROJECTION==='1'?createInboxProjectionWorkRepository(runtime):undefined;
  return processCanonicalReminderWakeMessage(message, { client: runtime.client, workspaceId: runtime.workspaceId, inboxProjection }, "maintenance-queue");
}
