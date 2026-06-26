import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { createConnectionEvidenceService } from "../../../../features/connections/service-factory";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
} from "../../../../features/connections/service";
import type { ConnectionEvidenceDetailResult } from "../../../../features/connections/contract";

export const dynamic = "force-dynamic";

interface ConnectionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForResult(
  result: ConnectionEvidenceDetailResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
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

export async function GET(
  request: Request,
  context: ConnectionRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const connectionService = createConnectionEvidenceService();
  const result = connectionService.getConnection({
    connectionId: id,
    scenario,
  });

  return responseForResult(result, mode);
}
