import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse } from "../../../_shared/authenticated-actor";
import {
  taskErrorResponse,
  taskRouteActorResolver,
  taskRouteService,
  taskSuccessResponse,
  type TaskRouteDependencies,
} from "../../route-support";
import type { TaskDetailRouteContext } from "../handler";

export function createTaskActivitiesGetHandler(
  dependencies?: TaskRouteDependencies,
) {
  return async function GET(
    _request: Request,
    context: TaskDetailRouteContext,
  ): Promise<Response> {
    const actor = await taskRouteActorResolver(dependencies)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const { id } = await context.params;
      const activities = (await taskRouteService(dependencies).history({ actorId: actor.id }))
        .filter((item) => item.taskId === id);
      return taskSuccessResponse({ activities });
    } catch (error) {
      return taskErrorResponse(error);
    }
  };
}
