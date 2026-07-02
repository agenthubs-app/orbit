import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventGoalReadinessFailureContext,
  eventGoalReadinessFailureToAppError,
} from "../../../../../features/events/goal-readiness/contract";
import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// readiness route 返回活动准备度状态。
// route 只读取 eventId/scenario；准备度计算和缺口说明由 goal/readiness service 负责。
interface EventReadinessRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: EventReadinessRouteContext,
): Promise<Response> {
  // GET 是只读 readiness 视图，不设置目标。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const goalService = createEventGoalAndReadinessService();
  const result = await goalService.getReadiness({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // goal/readiness failure 统一映射成 AppError/envelope。
    const appError = eventGoalReadinessFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventGoalReadinessFailureContext(result, mode)),
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
