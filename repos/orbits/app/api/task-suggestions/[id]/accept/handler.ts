import {
  TASK_CATEGORIES,
  type TaskCategory,
  type TaskPriority,
} from "../../../../../features/tasks/contract";
import { AppError } from "../../../../../shared/errors/app-error";
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

function parseOverrides(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "overrides must be an object.");
  }
  const overrides = value as Record<string, unknown>;
  suggestionExactKeys(overrides, [
    "category",
    "dueAt",
    "plannedDate",
    "priority",
    "title",
  ]);
  if (
    overrides.category !== undefined &&
    !TASK_CATEGORIES.includes(overrides.category as TaskCategory)
  ) {
    throw new AppError("VALIDATION_ERROR", "category is invalid.");
  }
  if (
    overrides.priority !== undefined &&
    !["normal", "high"].includes(String(overrides.priority))
  ) {
    throw new AppError("VALIDATION_ERROR", "priority is invalid.");
  }
  return {
    ...(overrides.title !== undefined
      ? { title: suggestionString(overrides.title, "title") }
      : {}),
    ...(overrides.category !== undefined
      ? { category: overrides.category as TaskCategory }
      : {}),
    ...(overrides.plannedDate !== undefined
      ? { plannedDate: suggestionString(overrides.plannedDate, "plannedDate") }
      : {}),
    ...(overrides.dueAt !== undefined
      ? { dueAt: suggestionString(overrides.dueAt, "dueAt") }
      : {}),
    ...(overrides.priority !== undefined
      ? { priority: overrides.priority as TaskPriority }
      : {}),
  };
}

export function createTaskSuggestionAcceptPostHandler(
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
      suggestionExactKeys(body, ["idempotencyKey", "overrides"]);
      const result = await suggestionService(dependencies).accept({
        actorId: actor.id,
        suggestionId: id,
        idempotencyKey: suggestionString(body.idempotencyKey, "idempotencyKey"),
        overrides: parseOverrides(body.overrides),
        now: suggestionNow(dependencies),
      });
      return suggestionSuccess(result);
    } catch (error) {
      return suggestionError(error);
    }
  };
}
