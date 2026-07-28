import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { OpportunityReminderAnalyticsInput } from "../../../../features/dashboard/opportunity-contract";
import {
  opportunityReminderAnalyticsFailureContext,
  opportunityReminderAnalyticsFailureToAppError,
} from "../../../../features/dashboard/opportunity-contract";
import {
  createActorScopedOpportunityReminderAnalyticsService,
  createOpportunityReminderAnalyticsService,
} from "../../../../features/dashboard/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export const dynamic = "force-dynamic";

// opportunities 是 Dashboard 中“可能错过的关系机会”分析入口。
// HTTP 层只读取 scenario；计算、排序和来源说明都由 opportunity analytics service 提供。
function readInput(request: Request): OpportunityReminderAnalyticsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // GET 返回当前机会提醒分析，不在 route 层重新计算或写入状态。
  const mode = resolveFeatureMode();
  const actor = mode === "mock" ? null : await resolveAuthenticatedApiActor();

  if (mode !== "mock" && !actor) {
    return authenticatedApiActorRequiredResponse(mode);
  }

  const opportunityService =
    mode === "live" && actor
      ? createActorScopedOpportunityReminderAnalyticsService(actor.id)
      : createOpportunityReminderAnalyticsService(mode);
  const result = await opportunityService.getOpportunityReminderAnalytics(
    readInput(request),
  );

  if (result.success === false) {
    // analytics failure 映射为共享 AppError，保持 dashboard 子接口错误格式一致。
    const appError = opportunityReminderAnalyticsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, opportunityReminderAnalyticsFailureContext(result, mode)),
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
