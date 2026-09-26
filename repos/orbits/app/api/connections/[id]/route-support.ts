import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import type { FeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  relationshipProfileFailureContext,
  relationshipProfileFailureToAppError,
} from "../../../../features/connections/service-factory";
import type { RelationshipProfileResult } from "../../../../features/connections/profile-contract";

export function isConnectionPatchRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readConnectionPatchString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function connectionPatchHasBody(request: Request): boolean {
  return request.body !== null && request.headers.get("content-length") !== "0";
}

export function relationshipProfileResponseForResult(
  result: RelationshipProfileResult,
  mode: FeatureMode,
): Response {
  if (result.success === false) {
    const appError = relationshipProfileFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipProfileFailureContext(result, mode)),
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
