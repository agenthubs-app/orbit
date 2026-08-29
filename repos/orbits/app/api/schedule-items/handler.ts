import { NextResponse } from "next/server";

import {
  createConfiguredTodayScheduleProvider,
  type TodayScheduleProvider,
} from "../../../features/tasks/today-schedule-provider";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

interface ScheduleItemsRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  scheduleProvider?: TodayScheduleProvider;
}

export function createScheduleItemsGetHandler(dependencies?: ScheduleItemsRouteDependencies) {
  return async function GET(): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (dependencies?.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const scheduleItems = await (
        dependencies?.scheduleProvider ?? createConfiguredTodayScheduleProvider()
      ).list({ actorId: actor.id });
      return NextResponse.json(success({ scheduleItems }), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    } catch (error) {
      const appError = new AppError(
        "SERVICE_UNAVAILABLE",
        "Schedule items are temporarily unavailable.",
        { cause: error },
      );
      return NextResponse.json(
        failure(appError, {
          boundary: "runtime",
          mode,
          privacy: "actor-scoped-schedule-data",
          service: "schedule-items",
        }),
        { headers: runtimeBoundaryHeaders(mode), status: 503 },
      );
    }
  };
}
