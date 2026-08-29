import { TASK_CATEGORIES, type TaskCategory } from "../../../features/tasks/contract";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse } from "../_shared/authenticated-actor";
import {
  suggestionActorResolver,
  suggestionError,
  suggestionNow,
  suggestionService,
  suggestionSuccess,
  type TaskSuggestionRouteDependencies,
} from "./route-support";

export function createTaskSuggestionsGetHandler(
  dependencies?: TaskSuggestionRouteDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    const actor = await suggestionActorResolver(dependencies)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const category = new URL(request.url).searchParams.get("category");
      if (category && !TASK_CATEGORIES.includes(category as TaskCategory)) {
        throw new AppError("VALIDATION_ERROR", "category is invalid.");
      }
      const suggestions = await suggestionService(dependencies).list({
        actorId: actor.id,
        now: suggestionNow(dependencies),
        ...(category ? { category: category as TaskCategory } : {}),
      });
      return suggestionSuccess({ suggestions });
    } catch (error) {
      return suggestionError(error);
    }
  };
}
