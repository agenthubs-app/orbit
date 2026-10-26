import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import { createContactAcquisitionDraftServiceForActor } from "../../../../../features/acquisition/service-factory";
import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
  type ContactAcquisitionDraftService,
} from "../../../../../features/acquisition/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

export interface DiscardContactDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * QA-C2: POST /api/contact-drafts/[id]/discard — 破棄 a pending draft for every
 * device (the queue no longer lists it and the count drops).
 */
export function createDiscardContactDraftHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  createService: (
    actorId: string,
    mode: string,
  ) => ContactAcquisitionDraftService = createContactAcquisitionDraftServiceForActor,
) {
  return async function POST(
    _request: Request,
    context: DiscardContactDraftRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const { id } = await context.params;
    const service = createService(actor.id, mode);

    if (!service.discardContactDraft) {
      const appError = new AppError(
        "NOT_FOUND",
        "Contact drafts cannot be set aside in this mode.",
      );

      return NextResponse.json(failure(appError), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      });
    }

    const result = await service.discardContactDraft({ draftId: id });

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
