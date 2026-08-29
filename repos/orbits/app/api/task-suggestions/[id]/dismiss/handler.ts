import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse } from "../../../_shared/authenticated-actor";
import {
  suggestionActorResolver,
  suggestionBody,
  suggestionError,
  suggestionExactKeys,
  suggestionNow,
  suggestionService,
  suggestionString,
  suggestionSuccess,
  type TaskSuggestionRouteContext,
  type TaskSuggestionRouteDependencies,
} from "../../route-support";

export function createTaskSuggestionDismissPostHandler(
  dependencies?: TaskSuggestionRouteDependencies,
) {
  return async function POST(
    request: Request,
    context: TaskSuggestionRouteContext,
  ): Promise<Response> {
    const actor = await suggestionActorResolver(dependencies)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const { id } = await context.params;
      const body = await suggestionBody(request);
      suggestionExactKeys(body, ["idempotencyKey"]);
      const suggestion = await suggestionService(dependencies).dismiss({
        actorId: actor.id,
        suggestionId: id,
        idempotencyKey: suggestionString(body.idempotencyKey, "idempotencyKey"),
        now: suggestionNow(dependencies),
      });
      return suggestionSuccess({ suggestion });
    } catch (error) {
      return suggestionError(error);
    }
  };
}
