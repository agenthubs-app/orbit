import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalActionSandboxFailureContext,
  externalActionSandboxFailureToAppError,
  type ExternalActionAuditListInput,
} from "../../../../../features/agent/external-action-contract";
import { createExternalActionSandboxService } from "../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

function readInput(request: Request): ExternalActionAuditListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = createExternalActionSandboxService();
  const result = service.listAuditRecords(readInput(request));

  if (result.success === false) {
    const appError = externalActionSandboxFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalActionSandboxFailureContext(result, mode)),
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
