import { NextResponse } from "next/server";

import type { ReminderPlanService } from "../../../features/notifications/reminder-plan-service";
import { ReminderPlanServiceError } from "../../../features/notifications/reminder-plan-service";
import { createConfiguredReminderPlanService } from "../../../features/notifications/reminder-plan-service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";

export interface ReminderRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: ReminderPlanService;
}

export function reminderRouteService(input?: ReminderRouteDependencies) {
  return input?.service ?? createConfiguredReminderPlanService();
}

export function reminderRouteActor(input?: ReminderRouteDependencies) {
  return input?.resolveActor ?? resolveAuthenticatedApiActor;
}

export function reminderSuccess(data: unknown, status = 200): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(success(data), { headers: runtimeBoundaryHeaders(mode), status });
}

export function reminderError(error: unknown): Response {
  const mode = resolveFeatureMode();
  let appError: AppError;
  if (error instanceof AppError) appError = error;
  else if (error instanceof ReminderPlanServiceError) {
    const code = error.code === "NOT_FOUND" || error.code === "TARGET_NOT_OWNED"
      ? "NOT_FOUND"
      : error.code === "CONFLICT" ? "CONFLICT" : "VALIDATION_ERROR";
    appError = new AppError(code, error.message);
  } else appError = new AppError("INTERNAL_ERROR", "An unexpected error occurred.", { cause: error });
  return NextResponse.json(failure(appError, { boundary: "runtime", mode, privacy: "actor-scoped-reminder-data", service: "reminders" }), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(appError.code),
  });
}

export async function reminderJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("VALIDATION_ERROR", "Request body must be an object.");
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const set = new Set(allowed);
  if (Object.keys(value).some((key) => !set.has(key))) throw new AppError("VALIDATION_ERROR", "Request contains unsupported fields.");
}

export function stringField(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError("VALIDATION_ERROR", `${name} is required.`);
  return value;
}

export function booleanField(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new AppError("VALIDATION_ERROR", `${name} must be boolean.`);
  return value;
}
