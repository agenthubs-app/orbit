import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { AppBootstrapInput } from "../../../../features/bootstrap/service";
import {
  appBootstrapFailureContext,
  appBootstrapFailureToAppError,
} from "../../../../features/bootstrap/service";
import {
  createActorScopedAppBootstrapService,
  createAppBootstrapService,
} from "../../../../features/bootstrap/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

function readTaskLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("taskLimit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

function readInput(request: Request): AppBootstrapInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
    taskLimit: readTaskLimit(searchParams),
  };
}

export function createAppBootstrapGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function appBootstrapGet(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const bootstrapService =
      mode === "live" && actor
        ? createActorScopedAppBootstrapService(actor.id)
        : createAppBootstrapService(mode);
    const result = await bootstrapService.getAppBootstrap(readInput(request));

    if (result.success === false) {
      const appError = appBootstrapFailureToAppError(result);

      return NextResponse.json(
        failure(appError, appBootstrapFailureContext(result, mode)),
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
