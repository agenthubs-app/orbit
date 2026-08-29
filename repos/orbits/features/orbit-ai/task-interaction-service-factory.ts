import { createConfiguredTaskService } from "../tasks/service-factory";
import { createConfiguredTaskSuggestionService } from "../tasks/suggestion-service-factory";
import { createOrbitAiTaskInteractionService } from "./task-interaction-service";

export function createConfiguredOrbitAiTaskInteractionService() {
  return createOrbitAiTaskInteractionService({
    taskService: createConfiguredTaskService(),
    suggestionService: createConfiguredTaskSuggestionService(),
  });
}
