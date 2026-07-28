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
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

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

export function createAccountMeGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function accountMeGet(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const accountService = createAccountSessionService(mode);
    const result = await accountService.getCurrentSession({
      accountId: actor?.accountId ?? actor?.id,
      profileId: actor?.profileId,
      scenario: getScenario(request),
      userId: actor?.userId,
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
  };
}
