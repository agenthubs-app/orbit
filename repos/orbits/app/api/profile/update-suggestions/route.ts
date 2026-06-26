import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  createProfileSignalReviewQueueService,
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "../../../../features/profile/service-factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const signalService = createProfileSignalReviewQueueService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = signalService.listUpdateSuggestions({ scenario });

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
