import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createTaskRepository } from "./repository";
import { createTaskService } from "./service";
import { createTaskSuggestionRepository } from "./suggestion-repository";
import { createTaskSuggestionService } from "./suggestion-service";

export function createConfiguredTaskSuggestionService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) {
    throw new Error("Task suggestion storage is not configured");
  }
  const taskService = createTaskService({
    repository: createTaskRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
  });
  return createTaskSuggestionService({
    repository: createTaskSuggestionRepository({
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
    taskService,
  });
}
