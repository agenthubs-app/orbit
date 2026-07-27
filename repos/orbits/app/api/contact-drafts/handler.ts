import { NextResponse } from "next/server";

import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
} from "../../../features/acquisition/service";
import { createContactAcquisitionDraftServiceForActor } from "../../../features/acquisition/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

export function createContactDraftsGetHandler(
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

    const draftService = createContactAcquisitionDraftServiceForActor(
      actor.id,
      mode,
    );
    const scenario = new URL(request.url).searchParams.get("scenario");
    const result = await draftService.listContactDrafts({ scenario });

    if (result.success === false) {
      const appError = contactAcquisitionDraftFailureToAppError(result);

      return NextResponse.json(
        failure(appError, contactAcquisitionDraftFailureContext(result, mode)),
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
