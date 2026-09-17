import type {
  MaintenanceTask,
  MaintenanceTaskOutcome,
} from "../operations/maintenance/pass";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

/**
 * The canonical ReminderPlan path is intentionally separate from the durable
 * push-delivery ledger. This task only discovers canonical reminderPlans and
 * delegates an actor-scoped, bounded dispatch operation supplied by the
 * runtime wiring.
 */
export const CANONICAL_REMINDER_PLAN_COLLECTION = "reminderPlans" as const;
export const DEFAULT_CANONICAL_REMINDER_MAX_ACTORS = 25;
export const DEFAULT_CANONICAL_REMINDER_MAX_PLANS_PER_ACTOR = 10;
export const MAX_CANONICAL_REMINDER_ACTORS = 100;
export const MAX_CANONICAL_REMINDER_PLANS_PER_ACTOR = 50;

export interface CanonicalReminderDispatchResult {
  claimed: number;
  inAppDelivered: number;
  pushDelivered: number;
  pushFailed: number;
  quietHoursSuppressed: number;
}

export interface CanonicalReminderDueActorScanner {
  listDueActorIds(input: {
    now: string;
    limit: number;
  }): Promise<readonly string[]>;
}

export interface CanonicalReminderActorDispatcher {
  /**
   * The implementation must build an actor-scoped ReminderPlanService and
   * enforce `limit` while reading due plans. The existing unscoped
   * ReminderPlanService.dispatchDue cannot be called directly by a cloud task.
   */
  dispatchDueForActor(input: {
    actorId: string;
    now: string;
    limit: number;
    workerId: string;
  }): Promise<CanonicalReminderDispatchResult>;
}

export interface CanonicalReminderMaintenanceTaskInput {
  actorScanner: CanonicalReminderDueActorScanner;
  dispatcher: CanonicalReminderActorDispatcher;
  workerId: string;
  maxActors?: number;
  maxPlansPerActor?: number;
  now?: () => Date;
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`canonical reminder maintenance bound must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function uniqueBoundedActorIds(values: readonly string[], limit: number): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const actorId = value.trim();
    if (!actorId || seen.has(actorId)) continue;
    seen.add(actorId);
    unique.push(actorId);
    if (unique.length >= limit) break;
  }
  return unique;
}

function addCounts(
  target: Record<string, number>,
  value: CanonicalReminderDispatchResult,
): void {
  target.claimed += value.claimed;
  target.inAppDelivered += value.inAppDelivered;
  target.pushDelivered += value.pushDelivered;
  target.pushFailed += value.pushFailed;
  target.quietHoursSuppressed += value.quietHoursSuppressed;
}

export function createCanonicalReminderMaintenanceTask(
  input: CanonicalReminderMaintenanceTaskInput,
): MaintenanceTask {
  const maxActors = bounded(
    input.maxActors,
    DEFAULT_CANONICAL_REMINDER_MAX_ACTORS,
    MAX_CANONICAL_REMINDER_ACTORS,
  );
  const maxPlansPerActor = bounded(
    input.maxPlansPerActor,
    DEFAULT_CANONICAL_REMINDER_MAX_PLANS_PER_ACTOR,
    MAX_CANONICAL_REMINDER_PLANS_PER_ACTOR,
  );
  const workerId = input.workerId.trim();
  if (!workerId) throw new Error("canonical reminder maintenance workerId is required");
  const now = input.now ?? (() => new Date());

  return {
    name: "canonical_reminder_dispatch",
    async run(context): Promise<MaintenanceTaskOutcome> {
      const startedAt = now();
      const timestamp = startedAt.toISOString();
      const scanned = await input.actorScanner.listDueActorIds({
        now: timestamp,
        limit: maxActors,
      });
      const actorIds = uniqueBoundedActorIds(scanned, maxActors);
      const counts: Record<string, number> = {
        actorLimit: maxActors,
        actorsScanned: actorIds.length,
        actorsDeferred: 0,
        actorsFailed: 0,
        claimed: 0,
        inAppDelivered: 0,
        pushDelivered: 0,
        pushFailed: 0,
        quietHoursSuppressed: 0,
        failed: 0,
        truncatedActors: Math.max(0, new Set(scanned.map((value) => value.trim()).filter(Boolean)).size - actorIds.length),
        plansLimitPerActor: maxPlansPerActor,
      };

      for (const [index, actorId] of actorIds.entries()) {
        if (now().getTime() >= context.deadline) {
          counts.actorsDeferred += actorIds.length - index;
          break;
        }
        try {
          const result = await input.dispatcher.dispatchDueForActor({
            actorId,
            limit: maxPlansPerActor,
            now: timestamp,
            workerId: `${workerId}:${index}`,
          });
          addCounts(counts, result);
          // A push failure must make the maintenance pass fail visibly. The
          // next heartbeat may retry the task, but ReminderPlanService itself
          // currently marks that plan failed and does not reschedule it.
          counts.failed += result.pushFailed;
        } catch {
          // Keep other actors moving. The aggregate failed count makes the
          // enclosing maintenance pass return 503 and lets heartbeat recovery
          // retry the bounded task on a later tick.
          counts.actorsFailed += 1;
          counts.failed += 1;
        }
      }
      return counts;
    },
  };
}

const dueActorQuery = `
  select user_id as actor_id
  from orbit_records
  where workspace_id = $1
    and collection_name = $2
    and lifecycle_state <> 'deleted'
    and user_id is not null
    and payload->'entity'->>'status' = 'scheduled'
    and payload->'entity'->>'fireAt' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$'
    and (payload->'entity'->>'fireAt')::timestamptz <= $3::timestamptz
  group by user_id
  order by min((payload->'entity'->>'fireAt')::timestamptz), user_id
  limit $4
`;

export function createPostgresCanonicalReminderDueActorScanner(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): CanonicalReminderDueActorScanner {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) throw new Error("canonical reminder maintenance workspaceId is required");
  return {
    async listDueActorIds({ now, limit }) {
      const boundedLimit = bounded(limit, DEFAULT_CANONICAL_REMINDER_MAX_ACTORS, MAX_CANONICAL_REMINDER_ACTORS);
      const result = await input.client.query<{ actor_id: string | null }>(dueActorQuery, [
        workspaceId,
        CANONICAL_REMINDER_PLAN_COLLECTION,
        now,
        boundedLimit,
      ]);
      return result.rows.flatMap((row) => row.actor_id?.trim() ? [row.actor_id.trim()] : []);
    },
  };
}

export const CANONICAL_REMINDER_DUE_ACTOR_QUERY = dueActorQuery;
