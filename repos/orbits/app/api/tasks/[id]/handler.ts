import type { TaskUpdatePatch } from "../../../../features/tasks/service";
import { AppError } from "../../../../shared/errors/app-error";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse } from "../../_shared/authenticated-actor";
import {
  readTaskJsonObject,
  requireExactKeys,
  requireString,
  taskErrorResponse,
  taskRouteActorResolver,
  taskRouteNow,
  taskRouteService,
  taskSuccessResponse,
  type TaskRouteDependencies,
} from "../route-support";

export interface TaskDetailRouteContext {
  params: Promise<{ id: string }>;
}

const patchKeys = [
  "category",
  "dueAt",
  "notes",
  "plannedDate",
  "priority",
  "relatedContactId",
  "relatedConversationId",
  "relatedEventId",
  "relatedMeetingId",
  "title",
] as const;

function parsePatch(value: unknown): TaskUpdatePatch {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "patch must be an object.");
  }
  const patch = value as Record<string, unknown>;
  requireExactKeys(patch, patchKeys);
  const parsed: Record<string, string> = {};
  for (const key of Object.keys(patch)) {
    parsed[key] = requireString(patch[key], key);
  }
  return parsed as TaskUpdatePatch;
}

export function createTaskDetailHandlers(dependencies?: TaskRouteDependencies) {
  return {
    async GET(_request: Request, context: TaskDetailRouteContext): Promise<Response> {
      const actor = await taskRouteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const { id } = await context.params;
        const task = (await taskRouteService(dependencies).list({ actorId: actor.id }))
          .find((item) => item.id === id);
        if (!task) throw new AppError("NOT_FOUND", "Task not found.");
        return taskSuccessResponse({ task });
      } catch (error) {
        return taskErrorResponse(error);
      }
    },

    async PATCH(request: Request, context: TaskDetailRouteContext): Promise<Response> {
      const actor = await taskRouteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const { id } = await context.params;
        const body = await readTaskJsonObject(request);
        const action = requireString(body.action, "action");
        const idempotencyKey = requireString(body.idempotencyKey, "idempotencyKey");
        const service = taskRouteService(dependencies);
        let result;

        if (action === "update") {
          requireExactKeys(body, ["action", "expectedUpdatedAt", "idempotencyKey", "patch"]);
          result = await service.update({
            actorId: actor.id,
            taskId: id,
            expectedUpdatedAt: requireString(body.expectedUpdatedAt, "expectedUpdatedAt"),
            patch: parsePatch(body.patch),
            idempotencyKey,
            now: taskRouteNow(dependencies),
          });
        } else if (action === "complete") {
          requireExactKeys(body, ["action", "idempotencyKey"]);
          result = await service.complete({
            actorId: actor.id,
            taskId: id,
            completedBy: actor.id,
            completionSource: "user",
            idempotencyKey,
            now: taskRouteNow(dependencies),
          });
        } else if (action === "reopen") {
          requireExactKeys(body, ["action", "idempotencyKey"]);
          result = await service.reopen({
            actorId: actor.id,
            taskId: id,
            idempotencyKey,
            now: taskRouteNow(dependencies),
          });
        } else if (action === "cancel") {
          requireExactKeys(body, ["action", "idempotencyKey"]);
          result = await service.cancel({
            actorId: actor.id,
            taskId: id,
            idempotencyKey,
            now: taskRouteNow(dependencies),
          });
        } else {
          throw new AppError("VALIDATION_ERROR", "action is invalid.");
        }
        return taskSuccessResponse(result);
      } catch (error) {
        return taskErrorResponse(error);
      }
    },

    async DELETE(request: Request, context: TaskDetailRouteContext): Promise<Response> {
      const actor = await taskRouteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const { id } = await context.params;
        const body = await readTaskJsonObject(request);
        requireExactKeys(body, ["idempotencyKey"]);
        const result = await taskRouteService(dependencies).delete({
          actorId: actor.id,
          taskId: id,
          idempotencyKey: requireString(body.idempotencyKey, "idempotencyKey"),
          now: taskRouteNow(dependencies),
        });
        return taskSuccessResponse(result);
      } catch (error) {
        return taskErrorResponse(error);
      }
    },
  };
}
