import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  eventValueRecommendationFailureContext,
  eventValueRecommendationFailureToAppError,
} from "../../../../../../features/recommendations/event-value-contract";
import { createEventValueRecommendationService } from "../../../../../../features/recommendations/service-factory";

export const dynamic = "force-dynamic";

// accept recommended event route 用于接受一条活动推荐。
// eventId 来自 path，scenario 来自 query；接受逻辑和状态更新由 recommendation service 负责。
interface EventValueAcceptRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  context: EventValueAcceptRouteContext,
): Promise<Response> {
  // route 不解析 body，避免调用方改写要接受的 eventId。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const eventValueService = createEventValueRecommendationService();
  const result = eventValueService.acceptRecommendedEvent({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // event value recommendation failure 统一映射成 AppError/envelope。
    const appError = eventValueRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventValueRecommendationFailureContext(result, mode)),
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
}
