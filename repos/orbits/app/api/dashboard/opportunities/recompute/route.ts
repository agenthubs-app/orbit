import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { OpportunityReminderAnalyticsInput } from "../../../../../features/dashboard/opportunity-contract";
import {
  opportunityReminderAnalyticsFailureContext,
  opportunityReminderAnalyticsFailureToAppError,
} from "../../../../../features/dashboard/opportunity-contract";
import { createOpportunityReminderAnalyticsService } from "../../../../../features/dashboard/service-factory";

export const dynamic = "force-dynamic";

// opportunities recompute route 触发机会提醒分析重新计算。
// route 只读取 scenario；重算逻辑、缓存/状态语义和 provenance 都在 opportunity service 中。
function readInput(request: Request): OpportunityReminderAnalyticsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function POST(request: Request): Promise<Response> {
  // POST 表达“触发重算”，但 route 本身不直接计算或写入分析结果。
  const mode = resolveFeatureMode();
  const opportunityService = createOpportunityReminderAnalyticsService();
  const result = opportunityService.recomputeOpportunityReminderAnalytics(
    readInput(request),
  );

  if (result.success === false) {
    // opportunity analytics failure 统一映射成 AppError/envelope。
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
