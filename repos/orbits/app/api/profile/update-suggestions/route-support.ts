import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import type { FeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "../../../../features/profile/service-factory";
import type {
  ProfileSignalReviewQueueFailure,
  ProfileSignalSuggestionAcceptResult,
  ProfileSignalSuggestionDismissResult,
} from "../../../../features/profile/signal-contract";

type ProfileSuggestionDecisionResult =
  | ProfileSignalSuggestionAcceptResult
  | ProfileSignalSuggestionDismissResult;

export async function readProfileSuggestionMutationId(
  request: Request,
): Promise<string | undefined> {
  if (!request.headers.get("content-type") && !request.headers.get("content-length")) {
    return undefined;
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "A valid mutationId is required.");
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !== 1
  ) {
    throw new AppError("VALIDATION_ERROR", "A valid mutationId is required.");
  }

  const mutationId = (value as Record<string, unknown>).mutationId;
  if (typeof mutationId !== "string" || !mutationId.trim()) {
    throw new AppError("VALIDATION_ERROR", "A valid mutationId is required.");
  }

  return mutationId.trim();
}

export function profileSuggestionValidationErrorResponse(
  error: unknown,
  mode: FeatureMode,
): Response {
  return NextResponse.json(
    failure(error, {
      boundary: "developer-admin",
      mode,
      privacy: "actor-scoped-profile-signals",
      provenance: "Profile suggestion decision request validation",
      service: "profile-signal-review-queue",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 400,
    },
  );
}

export function profileSuggestionDecisionResponse(
  result: ProfileSuggestionDecisionResult,
  mode: FeatureMode,
): Response {
  if (result.success === false) {
    const appError = profileSignalReviewQueueFailureToAppError(
      result as ProfileSignalReviewQueueFailure,
    );

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
