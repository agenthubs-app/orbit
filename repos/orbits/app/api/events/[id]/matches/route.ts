import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  wantConnectFailureContext,
  wantConnectFailureToAppError,
} from "../../../../../features/events/want-connect-contract";
import { createWantConnectService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface WantConnectMatchesRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: WantConnectMatchesRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const wantConnectService = createWantConnectService();
  const result = wantConnectService.listMatches({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = wantConnectFailureToAppError(result);

    return NextResponse.json(
      failure(appError, wantConnectFailureContext(result, mode)),
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
