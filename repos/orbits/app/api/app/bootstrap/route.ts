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
import { createAppBootstrapService } from "../../../../features/bootstrap/service-factory";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const bootstrapService = createAppBootstrapService();
  const result = bootstrapService.getAppBootstrap(readInput(request));

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
}
