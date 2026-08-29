import { TASK_CATEGORIES, type TaskCategory } from "../../../../features/tasks/contract";
import { AppError } from "../../../../shared/errors/app-error";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse } from "../../_shared/authenticated-actor";
import {
  taskErrorResponse,
  taskRouteActorResolver,
  taskRouteService,
  taskSuccessResponse,
  type TaskRouteDependencies,
} from "../route-support";

export function createTaskHistoryGetHandler(dependencies?: TaskRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const actor = await taskRouteActorResolver(dependencies)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const searchParams = new URL(request.url).searchParams;
      const category = searchParams.get("category");
      if (category && !TASK_CATEGORIES.includes(category as TaskCategory)) {
        throw new AppError("VALIDATION_ERROR", "category is invalid.");
      }
      const activities = await taskRouteService(dependencies).history({
        actorId: actor.id,
        ...(category ? { category: category as TaskCategory } : {}),
        ...(searchParams.get("from") ? { from: searchParams.get("from")! } : {}),
        ...(searchParams.get("to") ? { to: searchParams.get("to")! } : {}),
      });
      return taskSuccessResponse({ activities });
    } catch (error) {
      return taskErrorResponse(error);
    }
  };
}
