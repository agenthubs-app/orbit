import { conditionalJsonRead, defaultConditionalReadDependencies, type ConditionalReadDependencies } from "../_shared/conditional-read";
import { NextResponse } from "next/server";

import {
  createConfiguredTodayScheduleProvider,
  type TodayScheduleProvider,
} from "../../../features/tasks/today-schedule-provider";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import { createConfiguredPersonalScheduleService } from "../../../features/personal-schedule/service-factory";
import type { PersonalScheduleService } from "../../../features/personal-schedule/service";
import { personalScheduleRepresentation, personalScheduleAggregateRepresentation } from "../../../features/personal-schedule/representation";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

interface ScheduleItemsRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  scheduleProvider?: TodayScheduleProvider;
  personalService?: Pick<PersonalScheduleService, "list">;
  conditionalRead?: ConditionalReadDependencies;
}

// The personal scope reads two private collections; the today scope aggregates
// through providers whose dependencies are not statically known, so it is not conditional.
const PERSONAL_SCHEDULE_COLLECTIONS = ["personal_schedule_items", "personal_schedule_occurrence_exceptions"] as const;

export function createScheduleItemsGetHandler(dependencies?: ScheduleItemsRouteDependencies) {
  return async function GET(request?: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (dependencies?.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const personalScope = request && new URL(request.url).searchParams.get("scope") === "personal";
      const params = request ? new URL(request.url).searchParams : undefined;
      const window = personalScope && params && (params.has("from") || params.has("to")) ? { from: params.get("from") ?? "", to: params.get("to") ?? "" } : {};
      const produce = async () => {
        const scheduleItems = await (personalScope
          ? dependencies?.personalService ?? createConfiguredPersonalScheduleService()
          : dependencies?.scheduleProvider ?? createConfiguredTodayScheduleProvider()
        ).list({ actorId: actor.id, ...window });
        const represented = personalScope && request ? scheduleItems.map(item => personalScheduleRepresentation(item as Awaited<ReturnType<PersonalScheduleService["get"]>>, request)) : scheduleItems.map(item => item.kind === "personal" ? personalScheduleAggregateRepresentation(item) : item);
        return NextResponse.json(success({ scheduleItems: represented }), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      };
      if (!personalScope || !request) return await produce();
      return await conditionalJsonRead(
        { routeKey: "schedule-items.personal", request, actorId: actor.id, workspaceId: actor.workspaceId, collections: [...PERSONAL_SCHEDULE_COLLECTIONS], userScoped: true },
        dependencies?.conditionalRead ?? defaultConditionalReadDependencies(),
        produce,
      );
    } catch (error) {
      const appError = error instanceof AppError && error.code === "VALIDATION_ERROR" ? error : new AppError(
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
        { headers: runtimeBoundaryHeaders(mode), status: appError.code === "VALIDATION_ERROR" ? 400 : 503 },
      );
    }
  };
}
