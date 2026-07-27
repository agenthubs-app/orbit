import { NextResponse } from "next/server";

import {
  emailCalendarSignalFailureContext,
  emailCalendarSignalFailureToAppError,
} from "../../../../features/acquisition/email-calendar-contract";
import { createEmailCalendarSignalServiceForActor } from "../../../../features/acquisition/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export function createEmailCalendarSignalsGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const searchParams = new URL(request.url).searchParams;
    const service = createEmailCalendarSignalServiceForActor(actor.id, mode);
    const result = await service.listEmailCalendarSignals({
      sourceKind: searchParams.get("sourceKind"),
      scenario: searchParams.get("scenario"),
    });

    if (result.success === false) {
      const appError = emailCalendarSignalFailureToAppError(result);

      return NextResponse.json(
        failure(appError, emailCalendarSignalFailureContext(result, mode)),
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
