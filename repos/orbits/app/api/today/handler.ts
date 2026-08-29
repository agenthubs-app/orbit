import { NextResponse } from "next/server";

import type { TodayService } from "../../../features/tasks/today-service";
import { createConfiguredTodayService } from "../../../features/tasks/today-service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

interface TodayRouteDependencies {
  now?: () => string;
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: TodayService;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function createTodayGetHandler(dependencies?: TodayRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (dependencies?.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const timeZone =
        new URL(request.url).searchParams.get("timeZone") ?? "Asia/Tokyo";
      if (!validTimeZone(timeZone)) {
        throw new AppError("VALIDATION_ERROR", "timeZone is invalid.");
      }
      const data = await (
        dependencies?.service ?? createConfiguredTodayService()
      ).getToday({
        actorId: actor.id,
        now: dependencies?.now?.() ?? new Date().toISOString(),
        timeZone,
      });
      return NextResponse.json(success(data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError("SERVICE_UNAVAILABLE", "Today is temporarily unavailable.", {
              cause: error,
            });
      return NextResponse.json(
        failure(appError, {
          boundary: "runtime",
          mode,
          privacy: "actor-scoped-today-data",
          service: "today",
        }),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: appError.code === "VALIDATION_ERROR" ? 400 : 503,
        },
      );
    }
  };
}
