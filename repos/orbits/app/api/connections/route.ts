import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createConnectionEvidenceService } from "../../../features/connections/service-factory";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
} from "../../../features/connections/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const connectionService = createConnectionEvidenceService();
  const result = connectionService.listConnections({ scenario });

  if (result.success === false) {
    const appError = connectionEvidenceFailureToAppError(result);

    return NextResponse.json(
      failure(appError, connectionEvidenceFailureContext(result, mode)),
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
