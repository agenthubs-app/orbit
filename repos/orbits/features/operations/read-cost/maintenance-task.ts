import { createInboxRuntime } from "../../notifications/inbox-record-service-factory";
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import type { MaintenanceTask } from "../maintenance/pass";
import { deliverReadCostAlerts, evaluateReadCostAlerts } from "./alerts";
import { ALERT_MAX_AGE_DAYS, readCostAdminAccountIds } from "./config";
import { createNeonUsageReader } from "./neon-usage";
import { addDays, applyReadCostRetention, pendingReadCostDays, reconcileReadCostDay, rollupReadCostDay, utcDay } from "./rollup";

// One maintenance task for monitoring O2/O3, run by the existing daily cron
// pass (and its heartbeat): roll up finalized days, reconcile with Neon, raise
// alerts for recent days, apply retention, then deliver pending alerts to the
// admin inboxes. A day already final is skipped, so frequent passes are cheap.

export interface ReadCostTaskRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
}

export function createReadCostMaintenanceTask(input: {
  resolve?: () => ReadCostTaskRuntime | null;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  upsert?: (runtime: ReadCostTaskRuntime) => (notification: InboxNotificationUpsert) => Promise<unknown>;
} = {}): MaintenanceTask {
  const env = input.env ?? process.env;
  const resolve = input.resolve ?? (() => {
    const runtime = createConfiguredTransactionalPostgresRuntime({ env, max: 2 });
    return runtime ? { client: runtime.client, workspaceId: runtime.workspaceId } : null;
  });
  const upsertFor = input.upsert ?? ((runtime: ReadCostTaskRuntime) => {
    const inbox = createInboxRuntime({ client: runtime.client, workspaceId: runtime.workspaceId });
    return (notification: InboxNotificationUpsert) => inbox.service.upsert(notification);
  });
  return {
    name: "read_cost_rollup",
    async run({ deadline, now: clock }) {
      const runtime = resolve();
      if (!runtime) return { skipped: "database_unconfigured" };
      const now = clock();
      const today = utcDay(now);
      const neon = createNeonUsageReader({ env, ...(input.fetch ? { fetch: input.fetch } : {}) });
      let daysRolled = 0;
      let alertsRaised = 0;
      let neonUnavailable = 0;
      let neonFailed = 0;
      for (const day of await pendingReadCostDays(runtime.client, now)) {
        if (clock().getTime() >= deadline) break;
        const rollup = await rollupReadCostDay(runtime.client, day, now);
        const status = await reconcileReadCostDay(runtime.client, { day, recordedBytes: rollup.recordedBytes, neon, computedAt: now });
        if (status === "unavailable") neonUnavailable++;
        if (status === "failed") neonFailed++;
        daysRolled++;
        if (day >= addDays(today, -ALERT_MAX_AGE_DAYS)) alertsRaised += await evaluateReadCostAlerts(runtime.client, day);
      }
      const retention = await applyReadCostRetention(runtime.client, { now, deadline, clock });
      const delivery = await deliverReadCostAlerts({
        client: runtime.client,
        adminIds: readCostAdminAccountIds(env),
        upsert: upsertFor(runtime),
        today,
        now,
      });
      return {
        daysRolled,
        neonUnavailable,
        neonFailed,
        alertsRaised,
        alertsDelivered: delivery.delivered,
        alertsPending: delivery.pending,
        ...retention,
        failed: delivery.failed,
      };
    },
  };
}
