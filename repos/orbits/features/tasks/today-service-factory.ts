import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createTaskRepository } from "./repository";
import { createTaskService } from "./service";
import { createTaskSuggestionRepository } from "./suggestion-repository";
import { createTaskSuggestionService } from "./suggestion-service";
import { createTodayService } from "./today-service";
import { createConfiguredTodayScheduleProvider } from "./today-schedule-provider";

export function createConfiguredTodayService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) {
    throw new Error("Today storage is not configured");
  }
  const taskService = createTaskService({
    repository: createTaskRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
  });
  return createTodayService({
    taskService,
    suggestionService: createTaskSuggestionService({
      repository: createTaskSuggestionRepository({
        store: configured.store,
        workspaceId: configured.workspaceId,
      }),
      taskService,
    }),
    scheduleProvider: createConfiguredTodayScheduleProvider(),
  });
}
