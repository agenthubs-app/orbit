import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createConfiguredReminderPlanService } from "../notifications/reminder-plan-service-factory";
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
    }),
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
