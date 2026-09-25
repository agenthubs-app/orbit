import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createTaskRepository } from "./repository";
import { createTaskService } from "./service";
import { createTaskSuggestionRepository } from "./suggestion-repository";
import { createTaskSuggestionService } from "./suggestion-service";
import { createTodayService } from "./today-service";
import { createConfiguredTodayScheduleProvider } from "./today-schedule-provider";
import { createTodayCompletedCounter } from "./today-completed-counter";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createConfiguredTaskPageReader } from "./task-page";

export function createConfiguredTodayService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) {
    throw new Error("Today storage is not configured");
  }
  const taskService = createTaskService({
    repository: createTaskRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
      transactionClient: createConfiguredTransactionalPostgresRuntime()?.client,
    }),
  });
  const taskPageReader = createConfiguredTaskPageReader(configured.workspaceId);
  if (!taskPageReader) throw new Error("Today task-page storage is not configured");
  return createTodayService({
    taskPageReader,
    completedCounter: { count(query) {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "tasks" });
      return createTodayCompletedCounter({ client: configured.client, workspaceId: configured.workspaceId }).count(query);
    } },
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
