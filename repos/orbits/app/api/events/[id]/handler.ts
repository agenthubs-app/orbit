import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "../../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../../features/events/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

// 单个 event 的详情入口。
// path param 提供 eventId，query scenario 用于 mock 场景切换；
// route 不直接组装活动详情，统一交给 event CRUD/import service。
interface EventDetailRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export function createEventDetailGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(
    request: Request,
    context: EventDetailRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const eventService = createEventCrudAndImportService();
    const result = await eventService.getEvent({
      actorId: actor.id,
      eventId: id,
      scenario: searchParams.get("scenario"),
    });

    if (result.success === false) {
      const appError = eventCrudImportFailureToAppError(result);

      return NextResponse.json(
        failure(appError, eventCrudImportFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
