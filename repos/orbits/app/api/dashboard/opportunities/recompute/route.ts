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

function readInput(request: Request): OpportunityReminderAnalyticsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const opportunityService = createOpportunityReminderAnalyticsService();
  const result = opportunityService.recomputeOpportunityReminderAnalytics(
    readInput(request),
  );

  if (result.success === false) {
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
