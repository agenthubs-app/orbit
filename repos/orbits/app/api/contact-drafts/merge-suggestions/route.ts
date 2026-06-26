import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  duplicateMergeFailureContext,
  duplicateMergeFailureToAppError,
} from "../../../../features/acquisition/merge-contract";
import { createDuplicateMergeService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const mergeService = createDuplicateMergeService();
  const result = mergeService.listMergeSuggestions({
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = duplicateMergeFailureToAppError(result);

    return NextResponse.json(
      failure(appError, duplicateMergeFailureContext(result, mode)),
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
