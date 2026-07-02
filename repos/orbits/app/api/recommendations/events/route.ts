import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  eventValueRecommendationFailureContext,
  eventValueRecommendationFailureToAppError,
  type EventValueRecommendationInput,
} from "../../../../features/recommendations/event-value-contract";
import { createEventValueRecommendationService } from "../../../../features/recommendations/service-factory";

export const dynamic = "force-dynamic";

// recommendations/events route 返回适合用户目标的活动推荐。
// route 只读取筛选参数；推荐评分、排序和来源解释由 event value service 负责。
function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  // 非法 limit 交给 service 默认行为处理，而不是在 route 层抛错。
  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

export async function GET(request: Request): Promise<Response> {
  // query 参数直接映射为 recommendation input，不在 route 层做推荐计算。
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const input: EventValueRecommendationInput = {
    calendarFit: searchParams.get("calendarFit"),
    industryPreference: searchParams.get("industryPreference"),
    limit: readLimit(searchParams),
    location: searchParams.get("location"),
    profileGoal: searchParams.get("profileGoal"),
    scenario: searchParams.get("scenario"),
  };
  const eventValueService = createEventValueRecommendationService();
  const result = await eventValueService.listRecommendedEvents(input);

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
