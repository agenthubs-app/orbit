import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createEventRecommendationService } from "../../../../../features/recommendations/service-factory";
import {
  eventRecommendationFailureContext,
  eventRecommendationFailureToAppError,
} from "../../../../../features/recommendations/service";
import type { EventRecommendationInput } from "../../../../../features/recommendations/contract";

export const dynamic = "force-dynamic";

// event recommendation detail route 返回某个活动内建议认识的人。
// route 只读取 eventId/limit/scenario；推荐逻辑在 event recommendation service 中。
interface EventRecommendationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  // 非法 limit 回落为 null，由 service 使用默认数量。
  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

export async function GET(
  request: Request,
  context: EventRecommendationRouteContext,
): Promise<Response> {
  // eventId 来自 path，避免 query/body 改写目标活动。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const input: EventRecommendationInput = {
    eventId: id,
    limit: readLimit(searchParams),
    scenario: searchParams.get("scenario"),
  };
  const recommendationService = createEventRecommendationService();
  const result = await recommendationService.listEventRecommendations(input);

  if (result.success === false) {
    // event recommendation failure 统一映射成 AppError/envelope。
    const appError = eventRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventRecommendationFailureContext(result, mode)),
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
