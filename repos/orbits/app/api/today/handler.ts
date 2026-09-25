import { NextResponse } from "next/server";

import type { TodayService } from "../../../features/tasks/today-service";
import { createConfiguredTodayService } from "../../../features/tasks/today-service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { todayTaskModeQuerySchema } from "../../../shared/api-schema/today";
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
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some((key) =>
        !["timeZone", "taskMode", "limit"].includes(key) || params.getAll(key).length !== 1,
      )) {
        throw new AppError("VALIDATION_ERROR", "Today query is invalid.");
      }
      const parsedMode = todayTaskModeQuerySchema.safeParse({
        ...(params.has("taskMode") ? { taskMode: params.get("taskMode") } : {}),
        ...(params.has("limit") ? { limit: params.get("limit") } : {}),
      });
      if (!parsedMode.success) {
        throw new AppError("VALIDATION_ERROR", "Today task mode is invalid.");
      }
      const timeZone = params.get("timeZone") ?? "Asia/Tokyo";
      if (!validTimeZone(timeZone)) {
        throw new AppError("VALIDATION_ERROR", "timeZone is invalid.");
      }
      const taskMode = parsedMode.data.taskMode ?? "page";
      const limit = taskMode === "page" ? Number(parsedMode.data.limit ?? 20) : undefined;
      const data = await (
        dependencies?.service ?? createConfiguredTodayService()
      ).getToday({
        actorId: actor.id,
        now: dependencies?.now?.() ?? new Date().toISOString(),
        timeZone,
        taskMode,
        ...(limit === undefined ? {} : { limit }),
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
