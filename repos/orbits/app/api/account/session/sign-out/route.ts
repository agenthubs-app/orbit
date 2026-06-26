import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  accountSessionFailureContext,
  accountSessionFailureToAppError,
} from "../../../../../features/account/service";
import { createAccountSessionService } from "../../../../../features/account/service-factory";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

export function POST(request: Request): Response {
  const mode = resolveFeatureMode();
  const accountService = createAccountSessionService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result =
    scenario === "require-account"
      ? accountService.requireAccount("signed-out")
      : accountService.signOut();

  if (result.success === false) {
    const appError = accountSessionFailureToAppError(result);

    return NextResponse.json(
      failure(appError, accountSessionFailureContext(result, mode)),
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
