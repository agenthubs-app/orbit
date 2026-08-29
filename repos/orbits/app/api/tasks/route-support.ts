import { NextResponse } from "next/server";

import type { TaskService } from "../../../features/tasks/service";
import { TaskServiceError } from "../../../features/tasks/service";
import { createConfiguredTaskService } from "../../../features/tasks/service-factory";
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

export interface TaskRouteDependencies {
  now?: () => string;
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: TaskService;
}

export function taskRouteNow(dependencies?: TaskRouteDependencies): string {
  return dependencies?.now?.() ?? new Date().toISOString();
}

export function taskRouteService(
  dependencies?: TaskRouteDependencies,
): TaskService {
  return dependencies?.service ?? createConfiguredTaskService();
}

export function taskRouteActorResolver(
  dependencies?: TaskRouteDependencies,
): ResolveAuthenticatedApiActor {
  return dependencies?.resolveActor ?? resolveAuthenticatedApiActor;
}

export function taskSuccessResponse(data: unknown, status = 200): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(success(data), {
    headers: runtimeBoundaryHeaders(mode),
    status,
  });
}

export function taskErrorResponse(error: unknown): Response {
  const mode = resolveFeatureMode();
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof TaskServiceError) {
    if (error.code === "TASK_NOT_FOUND") {
      appError = new AppError("NOT_FOUND", "Task not found.");
    } else if (error.code === "TASK_VERSION_CONFLICT") {
      appError = new AppError("CONFLICT", "Task has changed. Reload and try again.");
    } else {
      appError = new AppError("CONFLICT", error.message);
    }
  } else {
    appError = new AppError("INTERNAL_ERROR", "An unexpected error occurred.", {
      cause: error,
    });
  }

  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      mode,
      privacy: "actor-scoped-task-data",
      service: "tasks",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

export async function readTaskJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
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

export function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new AppError("VALIDATION_ERROR", "Request contains unsupported fields.");
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("VALIDATION_ERROR", `${field} is required.`);
  }
  return value;
}
