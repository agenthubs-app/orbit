import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  createProfileSignalReviewQueueService,
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "../../../../../../features/profile/service-factory";

export const dynamic = "force-dynamic";

interface AcceptSuggestionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  _request: Request,
  context: AcceptSuggestionRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const signalService = createProfileSignalReviewQueueService();
  const { id } = await context.params;
  const result = signalService.acceptUpdateSuggestion(id);

  if (result.success === false) {
    const appError = profileSignalReviewQueueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, profileSignalReviewQueueFailureContext(result, mode)),
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
