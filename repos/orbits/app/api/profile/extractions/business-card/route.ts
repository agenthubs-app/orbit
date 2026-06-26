import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { ProfileDocumentExtractionInput } from "../../../../../features/profile/extraction-contract";
import {
  createProfileDocumentExtractionService,
  profileDocumentExtractionFailureContext,
  profileDocumentExtractionFailureToAppError,
} from "../../../../../features/profile/service-factory";

export const dynamic = "force-dynamic";

async function readExtractionInput(
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
    return {
      scenario,
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const extractionService = createProfileDocumentExtractionService();
  const result = extractionService.extractBusinessCardDraft(
    await readExtractionInput(request),
  );

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
