import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  type TaskCategory,
  type TaskStatus,
} from "../../../features/tasks/contract";
import { authenticatedApiActorRequiredResponse } from "../_shared/authenticated-actor";
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
} from "./route-support";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";

const createKeys = [
  "category",
  "dueAt",
  "idempotencyKey",
  "notes",
  "plannedDate",
  "priority",
  "relatedContactId",
  "relatedConversationId",
  "relatedEventId",
  "relatedMeetingId",
  "suggestionId",
  "title",
] as const;

function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  return requireString(value, field);
}

function parseCategory(value: unknown): TaskCategory {
  if (!TASK_CATEGORIES.includes(value as TaskCategory)) {
    throw new AppError("VALIDATION_ERROR", "category is invalid.");
  }
  return value as TaskCategory;
}

function parseCreateBody(body: Record<string, unknown>) {
  requireExactKeys(body, createKeys);
  const category = parseCategory(body.category);
  if (body.priority !== undefined && !["normal", "high"].includes(String(body.priority))) {
    throw new AppError("VALIDATION_ERROR", "priority is invalid.");
  }
  const notes = optionalString(body, "notes");
  const plannedDate = optionalString(body, "plannedDate");
  const dueAt = optionalString(body, "dueAt");
  const relatedContactId = optionalString(body, "relatedContactId");
  const relatedEventId = optionalString(body, "relatedEventId");
  const relatedMeetingId = optionalString(body, "relatedMeetingId");
  const relatedConversationId = optionalString(body, "relatedConversationId");
  const suggestionId = optionalString(body, "suggestionId");

  return {
    category,
    idempotencyKey: requireString(body.idempotencyKey, "idempotencyKey"),
    title: requireString(body.title, "title"),
    ...(notes ? { notes } : {}),
    ...(plannedDate ? { plannedDate } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(body.priority ? { priority: body.priority as "normal" | "high" } : {}),
    ...(relatedContactId ? { relatedContactId } : {}),
    ...(relatedEventId ? { relatedEventId } : {}),
    ...(relatedMeetingId ? { relatedMeetingId } : {}),
    ...(relatedConversationId ? { relatedConversationId } : {}),
    ...(suggestionId ? { suggestionId } : {}),
  };
}

export function createTaskCollectionHandlers(
  dependencies?: TaskRouteDependencies,
) {
  return {
    async GET(request: Request): Promise<Response> {
      const actor = await taskRouteActorResolver(dependencies)();
      if (!actor) {
        return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      }
      try {
        const searchParams = new URL(request.url).searchParams;
        const rawStatus = searchParams.get("status");
        const rawCategory = searchParams.get("category");
        if (rawStatus && !TASK_STATUSES.includes(rawStatus as TaskStatus)) {
          throw new AppError("VALIDATION_ERROR", "status is invalid.");
        }
        if (rawCategory && !TASK_CATEGORIES.includes(rawCategory as TaskCategory)) {
          throw new AppError("VALIDATION_ERROR", "category is invalid.");
        }
        const tasks = await taskRouteService(dependencies).list({
          actorId: actor.id,
          ...(rawStatus ? { status: rawStatus as TaskStatus } : {}),
          ...(rawCategory ? { category: rawCategory as TaskCategory } : {}),
        });
        return taskSuccessResponse({ tasks });
      } catch (error) {
        return taskErrorResponse(error);
      }
    },

    async POST(request: Request): Promise<Response> {
      const actor = await taskRouteActorResolver(dependencies)();
      if (!actor) {
        return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      }
      try {
        const parsed = parseCreateBody(await readTaskJsonObject(request));
        const result = await taskRouteService(dependencies).create({
          ...parsed,
          actorId: actor.id,
          now: taskRouteNow(dependencies),
          source: "manual",
        });
        return taskSuccessResponse(result, 201);
      } catch (error) {
        return taskErrorResponse(error);
      }
    },
  };
}
