import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createConfiguredReminderPlanService } from "../notifications/reminder-plan-service-factory";
import { resolvePlanV2Parts } from "../plans/v2/service-factory";
import { isActivePlanTypeLink } from "./plan-link";
import { createTaskRepository } from "./repository";
import { createTaskService } from "./service";

export function createConfiguredTaskService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) {
    throw new Error("Task storage is not configured");
  }

  const reminders = createConfiguredReminderPlanService();
  return createTaskService({
    repository: createTaskRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
      transactionClient: createConfiguredTransactionalPostgresRuntime()?.client,
    }),
    planLinkReader: {
      async isActiveTypeLink({ actorId, planId, typeItemId }) {
        const parts = resolvePlanV2Parts({ actorId, mode: "live" });
        if (!parts.success) return false;
        return isActivePlanTypeLink(parts.service.repository, parts.service.scope, { planId, typeItemId });
      },
    },
    onTaskTerminated: async ({ actorId, taskId, reason }) => {
      await reminders.cancelFutureForTarget({
        actorId,
        idempotencyKey: `task:${reason}:${taskId}`,
        targetId: taskId,
        targetType: "task",
      });
    },
  });
}
