import { NextResponse } from "next/server";

import { createWantConnectService } from "../../../../../features/events/service-factory";
import {
  wantConnectFailureContext,
  wantConnectFailureToAppError,
} from "../../../../../features/events/want-connect/contract";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  withOwnedEventAccess,
  type OwnedEventAccessDependencies,
} from "../owned-event-access";

interface WantConnectMatchesRouteContext {
  params: Promise<{ id: string }>;
}

export function createEventMatchesGetHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function getEventMatches(
    request: Request,
    _context: WantConnectMatchesRouteContext,
    access,
  ): Promise<Response> {
    const searchParams = new URL(request.url).searchParams;
    const result = await createWantConnectService().listMatches({
      eventId: access.eventId,
      scenario: searchParams.get("scenario"),
    });

    if (result.success === false) {
      const appError = wantConnectFailureToAppError(result);

      return NextResponse.json(
        failure(appError, wantConnectFailureContext(result, access.mode)),
        {
          headers: runtimeBoundaryHeaders(access.mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(access.mode),
      status: 200,
    });
  }, dependencies);
}
