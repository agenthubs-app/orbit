import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import type { FeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type {
  ProfileDocumentExtractionInput,
  ProfileDocumentExtractionResult,
} from "../../../../features/profile/extraction-contract";
import {
  profileDocumentExtractionFailureContext,
  profileDocumentExtractionFailureToAppError,
} from "../../../../features/profile/service-factory";

export async function readProfileExtractionInput(
  request: Request,
): Promise<ProfileDocumentExtractionInput> {
  const scenario = new URL(request.url).searchParams.get("scenario");

  try {
    const body = (await request.json()) as ProfileDocumentExtractionInput;
    const safeBody = body && typeof body === "object" ? body : {};

    return {
      ...safeBody,
      scenario: scenario ?? safeBody.scenario,
    };
  } catch {
    return { scenario };
  }
}

export function profileExtractionResponse(
  result: ProfileDocumentExtractionResult,
  mode: FeatureMode,
): Response {
  if (result.success === false) {
    const appError = profileDocumentExtractionFailureToAppError(result);

    return NextResponse.json(
      failure(appError, profileDocumentExtractionFailureContext(result, mode)),
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
