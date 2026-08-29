import { NextResponse } from "next/server";

import type { TaskSuggestionService } from "../../../features/tasks/suggestion-service";
import { TaskSuggestionServiceError } from "../../../features/tasks/suggestion-service";
import { createConfiguredTaskSuggestionService } from "../../../features/tasks/suggestion-service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../shared/errors/app-error";
import {
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

export interface TaskSuggestionRouteDependencies {
  now?: () => string;
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: TaskSuggestionService;
}

export interface TaskSuggestionRouteContext {
  params: Promise<{ id: string }>;
}

export function suggestionActorResolver(
  dependencies?: TaskSuggestionRouteDependencies,
) {
  return dependencies?.resolveActor ?? resolveAuthenticatedApiActor;
}

export function suggestionService(
  dependencies?: TaskSuggestionRouteDependencies,
) {
  return dependencies?.service ?? createConfiguredTaskSuggestionService();
}

export function suggestionNow(
  dependencies?: TaskSuggestionRouteDependencies,
) {
  return dependencies?.now?.() ?? new Date().toISOString();
}

export function suggestionSuccess(data: unknown, status = 200): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(success(data), {
    headers: runtimeBoundaryHeaders(mode),
    status,
  });
}

export function suggestionError(error: unknown): Response {
  const mode = resolveFeatureMode();
  const appError =
    error instanceof AppError
      ? error
      : error instanceof TaskSuggestionServiceError
        ? new AppError(
            /not found/i.test(error.message) ? "NOT_FOUND" : "CONFLICT",
            error.message,
          )
        : new AppError("INTERNAL_ERROR", "An unexpected error occurred.", {
            cause: error,
          });
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      mode,
      privacy: "actor-scoped-task-suggestion-data",
      service: "task-suggestions",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

export async function suggestionBody(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be an object.");
  }
  return value as Record<string, unknown>;
}

export function suggestionExactKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
) {
  const keys = new Set(allowed);
  if (Object.keys(body).some((key) => !keys.has(key))) {
    throw new AppError("VALIDATION_ERROR", "Request contains unsupported fields.");
  }
}

export function suggestionString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("VALIDATION_ERROR", `${field} is required.`);
  }
  return value;
}
