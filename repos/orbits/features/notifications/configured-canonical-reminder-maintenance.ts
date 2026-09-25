import type { LiveDatabaseEnv } from "../../shared/storage/live-database-config";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
  type TransactionalSqlExecutor,
} from "../../shared/storage/transactional-postgres";
import type { MaintenanceTask } from "../operations/maintenance/pass";
import { createTaskRepository } from "../tasks/repository";
import { createPersonalScheduleService } from "../personal-schedule/service";
import { createCanonicalReminderMaintenanceTask } from "./canonical-reminder-maintenance-task";
import type { ReminderPlanDTO } from "./reminder-plan-contract";
import { createReminderPlanRepository } from "./reminder-plan-repository";
import { createReminderPlanService } from "./reminder-plan-service";
import {
  canonicalReminderActorLockKey,
  repairCanonicalReminderWakes,
  type RepairCanonicalReminderWakesResult,
  type CanonicalReminderWakePublisher,
  type CanonicalReminderWakeRuntime,
} from "./canonical-reminder-wake";
import {createInboxProjectionWorkRepository} from './storage/inbox-projection-work';
import {runInboxProjectionPass} from './inbox-projection-worker';
import {canonicalInboxProjectionRevision} from './canonical-inbox-projection-revision';

export { canonicalReminderActorLockKey } from "./canonical-reminder-wake";

// Mixed-channel plans must remain pending for their original worker. Dropping
// ios_push from a plan would falsely complete work that we have not performed.
const duePredicate = `
  workspace_id = $1 and collection_name = 'reminderPlans'
  and lifecycle_state = 'active' and deleted_at is null
  and user_id is not null and btrim(user_id) <> ''
  and payload->'entity'->>'ownerUserId' = user_id
  and payload->'entity'->>'accountId' = user_id
  and payload->'entity'->>'id' = record_id
  and payload->'entity'->>'status' = 'scheduled'
  and payload->'entity'->'channels' = '["in_app"]'::jsonb
  and (payload->'entity'->>'fireAt')::timestamptz <= $2::timestamptz
`;

export const CANONICAL_IN_APP_DUE_ACTORS_SQL = `
  select user_id as actor_id from orbit_records where ${duePredicate}
  group by user_id order by min((payload->'entity'->>'fireAt')::timestamptz), user_id
  limit 25
`;
export const CANONICAL_IN_APP_DUE_PLANS_SQL = `
  select record_id, user_id, payload from orbit_records where ${duePredicate}
    and user_id = $3
  order by (payload->'entity'->>'fireAt')::timestamptz, record_id
  limit 10 for update
`;

async function boundTransaction(tx: TransactionalSqlExecutor): Promise<void> {
  await tx.query("set local statement_timeout = '5s'");
  await tx.query("set local lock_timeout = '1s'");
  await tx.query("set local idle_in_transaction_session_timeout = '5s'");
}

/** A dedicated SQL connection spans the actor lock, domain reads and writes. */
export interface CanonicalReminderMaintenanceRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
  now?: () => string;
  publisher?: CanonicalReminderWakePublisher;
  inboxProjection?: CanonicalReminderWakeRuntime['inboxProjection'];
}

function ownedStore(tx: TransactionalSqlExecutor, workspaceId: string, actorId: string): LiveRecordStoreLike<Record<string, unknown>> {
  const store = createPostgresLiveRecordStore({ client: tx });
  return {
    async getRecord(query) {
      if (query.workspaceId !== workspaceId) throw new Error("Reminder workspace mismatch");
      const record = await store.getRecord(query);
      if (!record) return null;
      if (record.userId !== actorId) throw new Error("Reminder record ownership mismatch");
      if (["reminderPlans", "notificationDeliveries", "notificationPreferences"].includes(query.collectionName)) {
        const entity = record.payload.entity as Record<string, unknown> | undefined;
        if (!entity || entity.ownerUserId !== actorId || entity.accountId !== actorId ||
          (query.collectionName !== "notificationPreferences" && entity.id !== record.recordId)) {
          throw new Error("Reminder entity ownership mismatch");
        }
      }
      return record;
    },
    async upsertRecord(record) {
      const entity = record.payload.entity as Record<string, unknown> | undefined;
      if (record.workspaceId !== workspaceId || record.userId !== actorId ||
        !entity || entity.ownerUserId !== actorId || entity.accountId !== actorId || entity.id !== record.recordId ||
        !["reminderPlans", "notificationDeliveries"].includes(record.collectionName)) {
        throw new Error("Reminder write outside actor scope");
      }
      return store.upsertRecord(record);
    },
    async listRecords() { throw new Error("Unbounded reminder reads are forbidden"); },
    async deleteRecord() { throw new Error("Reminder maintenance cannot delete records"); },
  };
}

export async function dispatchActor(runtime: CanonicalReminderMaintenanceRuntime, actorId: string, now: string) {
  return runtime.client.transaction(async (tx) => {
    await boundTransaction(tx);
    const lock = await tx.query<{ acquired: boolean }>(
      "select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as acquired",
      [canonicalReminderActorLockKey(runtime.workspaceId, actorId)],
    );
    if (lock.rows[0]?.acquired !== true) {
      // Surface contention instead of claiming that scheduled work completed.
      // The next heartbeat retries; no lease row can remain stranded.
      throw new Error("Canonical reminder actor is busy");
    }
    const due = await tx.query<{ record_id: string; user_id: string; payload: { entity: ReminderPlanDTO } }>(
      CANONICAL_IN_APP_DUE_PLANS_SQL, [runtime.workspaceId, now, actorId],
    );
    if (due.rows.length > 10) throw new Error("Reminder query exceeded its bound");
    const plans = due.rows.map(({ record_id, user_id, payload }) => {
      const plan = payload.entity;
      if (user_id !== actorId || plan?.ownerUserId !== actorId || plan.accountId !== actorId || plan.id !== record_id ||
        plan.status !== "scheduled" || plan.channels.length !== 1 || plan.channels[0] !== "in_app" ||
        !Number.isFinite(Date.parse(plan.fireAt)) || Date.parse(plan.fireAt) > Date.parse(now)) {
        throw new Error("Reminder due-plan scope mismatch");
      }
      return plan;
    });
    const store = ownedStore(tx, runtime.workspaceId, actorId);
    const repository = createReminderPlanRepository({ store, workspaceId: runtime.workspaceId });
    const tasks = createTaskRepository({ store, workspaceId: runtime.workspaceId });
    const schedules = createPersonalScheduleService({ store, workspaceId: runtime.workspaceId, now: () => now });
    // Validate exact canonical targets, never arbitrary payload containsId hits.
    for (const plan of plans) {
      if (plan.targetType === "task") {
        const target = await tasks.get(actorId, plan.targetId);
        if (!target || target.payload.task.id !== plan.targetId ||
          ["completed", "cancelled"].includes(target.payload.task.status)) {
          throw new Error("Reminder task target is not active and owned");
        }
      } else if (plan.targetType === "schedule_item") {
        const id = plan.targetId.startsWith("schedule:") ? plan.targetId.slice("schedule:".length) : plan.targetId;
        const target = await schedules.get({ actorId, id });
        if (target.state === "cancelled") throw new Error("Reminder schedule target is cancelled");
      } else {
        throw new Error("Unsupported reminder target");
      }
    }
    const service = createReminderPlanService({
      now: () => now,
      repository: { ...repository, listDuePlans: async () => plans, savePlan:async plan=>{
        const saved=await repository.savePlan(plan);
        await runtime.inboxProjection?.enqueue(tx,{actorId,sourceKind:'canonical_reminder',sourceId:saved.id,sourceRevision:canonicalInboxProjectionRevision(saved)});
        return saved;
      } },
    });
    return service.dispatchDue({ now, provider: { async send() { throw new Error("External reminder sends are disabled"); } } });
  });
}

/** Ready for createConfiguredMaintenanceTasks: append this task after R3 wiring. */
export function createConfiguredCanonicalReminderMaintenanceTask({
  env, workerId = "maintenance", runtime,
}: {
  env?: LiveDatabaseEnv;
  workerId?: string;
  runtime?: CanonicalReminderMaintenanceRuntime;
} = {}): MaintenanceTask {
  return {
    name: "canonical_reminder_dispatch",
    async run(context) {
      if (context.now().getTime() >= context.deadline) return { skipped: "budget_exhausted" };
      const configured: CanonicalReminderMaintenanceRuntime | null = runtime ?? (() => {
        const value = createConfiguredTransactionalPostgresRuntime({ env, max: 2 });
        return value ? { client: value.client, workspaceId: value.workspaceId } : null;
      })();
      if (!configured) return { skipped: "database_unconfigured" };
      if (!configured.workspaceId.trim()) throw new Error("Reminder workspace is required");
      const projectionEnabled=(env??process.env).ORBIT_CANONICAL_INBOX_PROJECTION==='1';
      const inboxProjection=projectionEnabled?(configured.inboxProjection??createInboxProjectionWorkRepository({...configured,now:configured.now??(()=>context.now().toISOString())})):undefined;
      const wakeRuntime = {
        client: configured.client,
        workspaceId: configured.workspaceId,
        now: configured.now ?? (() => context.now().toISOString()),
        publisher: configured.publisher,
        inboxProjection,
      };
      const wakeResult: RepairCanonicalReminderWakesResult = await repairCanonicalReminderWakes({
        runtime: wakeRuntime,
        workerId,
        now: wakeRuntime.now(),
        maxActors: 25,
        maxPlansPerActor: 10,
        deadline: context.deadline,
        clock: context.now,
      }).catch(() => ({
        claimed: 0,
        inAppDelivered: 0,
        failed: 1,
        publishFailed: 0,
        deferred: 0,
        wakeClaimed: 0,
        wakeDelivered: 0,
        wakeFailed: 1,
        wakePublishFailed: 0,
        wakeContinuation: 1,
      }));
      const legacyResult = await createCanonicalReminderMaintenanceTask({
        workerId, maxActors: 25, maxPlansPerActor: 10, now: context.now,
        actorScanner: {
          async listDueActorIds({ now }) {
            return configured.client.transaction(async (tx) => {
              await boundTransaction(tx);
              const result = await tx.query<{ actor_id: string }>(CANONICAL_IN_APP_DUE_ACTORS_SQL, [configured.workspaceId, now]);
              return result.rows.map((row) => row.actor_id);
            });
          },
        },
        dispatcher: { dispatchDueForActor: ({ actorId, now }) => dispatchActor({...configured,inboxProjection}, actorId, now) },
      }).run(context);
      const projectionSummary=projectionEnabled?await runInboxProjectionPass({...configured,enabled:true,now:wakeRuntime.now,deadline:context.deadline,clock:context.now,limit:25}):{};
      const wakeSummary: Record<string, number> = { ...wakeResult,...projectionSummary };
      if ("skipped" in legacyResult) return wakeSummary;
      return {
        ...legacyResult,
        ...projectionSummary,
        claimed: legacyResult.claimed + wakeResult.claimed,
        inAppDelivered: legacyResult.inAppDelivered + wakeResult.inAppDelivered,
        failed: legacyResult.failed + wakeResult.failed,
        wakeClaimed: wakeResult.wakeClaimed,
        wakeDelivered: wakeResult.wakeDelivered,
        wakeFailed: wakeResult.wakeFailed,
        wakePublishFailed: wakeResult.wakePublishFailed,
        wakeContinuation: wakeResult.wakeContinuation,
      };
    },
  };
}
