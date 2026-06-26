import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  accountSessionFailureContext,
  accountSessionFailureToAppError,
} from "../../../../features/account/service";
import { createAccountSessionService } from "../../../../features/account/service-factory";
import type { AccountSessionScenario } from "../../../../features/account/contract";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

function getScenario(request: Request): AccountSessionScenario | undefined {
  const scenario = new URL(request.url).searchParams.get("scenario");

  if (
    scenario === "demo-sign-in" ||
    scenario === "signed-out" ||
    scenario === "pending" ||
    scenario === "require-account"
  ) {
    return scenario;
  }

  return undefined;
}

export function GET(request: Request): Response {
  const mode = resolveFeatureMode();
  const accountService = createAccountSessionService();
  const result = accountService.getCurrentSession({
    scenario: getScenario(request),
  });

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
