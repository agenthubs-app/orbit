import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  manualContactCreationFailureContext,
  manualContactCreationFailureToAppError,
} from "../../../../../features/acquisition/manual-contract";
import {
  QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX,
  qrScanConnectFailureContext,
  qrScanConnectFailureToAppError,
} from "../../../../../features/acquisition/qr-contract";
import {
  BUSINESS_CARD_REVIEW_CLOUD_DRAFT_ID_PREFIX,
  BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX,
  businessCardReviewFailureContext,
  businessCardReviewFailureToAppError,
} from "../../../../../features/acquisition/business-card-review-contract";
import {
  createBusinessCardReviewService,
  createContactAcquisitionDraftServiceForActor,
  createManualContactCreationServiceForActor,
  createQrScanConnectServiceForActor,
} from "../../../../../features/acquisition/service-factory";
import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
} from "../../../../../features/acquisition/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

export interface ConfirmContactDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function actorLabel(actor: AuthenticatedApiActor): string {
  return actor.name?.trim() || actor.email?.trim() || actor.id;
}

export function createConfirmContactDraftHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(
    request: Request,
    context: ConfirmContactDraftRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const { id } = await context.params;
    const scenario = new URL(request.url).searchParams.get("scenario");

    if (
      id === "demo-qr-draft" ||
      id.startsWith(QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX)
    ) {
      const qrService = createQrScanConnectServiceForActor(
        actor.id,
        id.startsWith(QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX) ? mode : "mock",
      );
      const result = await qrService.confirmQrConnectionDraft({
        ...(mode === "live" ? { actorLabel: actorLabel(actor) } : {}),
        draftId: id,
        scenario,
      });

      if (result.success === false) {
        const appError = qrScanConnectFailureToAppError(result);

        return NextResponse.json(
          failure(appError, qrScanConnectFailureContext(result, mode)),
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

    if (
      id === "demo-business-card-draft" ||
      id.startsWith(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX) ||
      id.startsWith(BUSINESS_CARD_REVIEW_CLOUD_DRAFT_ID_PREFIX)
    ) {
      const isLiveDraft =
        id.startsWith(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX) ||
        id.startsWith(BUSINESS_CARD_REVIEW_CLOUD_DRAFT_ID_PREFIX);
      const reviewService = createBusinessCardReviewService(
        isLiveDraft ? mode : "mock",
      );
      const result = await reviewService.confirmReviewedDraft({
        ...(isLiveDraft ? { actorId: actor.id } : {}),
        actorLabel: actorLabel(actor),
        draftId: id,
        scenario,
      });

      if (result.success === false) {
        const appError = businessCardReviewFailureToAppError(result);

        return NextResponse.json(
          failure(appError, businessCardReviewFailureContext(result, mode)),
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

    if (id === "demo-manual-draft" || id.startsWith("manual-draft:live:")) {
      const manualService = createManualContactCreationServiceForActor(
        actor.id,
        mode,
      );
      const result = await manualService.confirmManualContactDraft({
        ...(mode === "live" ? { actorLabel: actorLabel(actor) } : {}),
        draftId: id,
        scenario,
      });

      if (result.success === false) {
        const appError = manualContactCreationFailureToAppError(result);

        return NextResponse.json(
          failure(appError, manualContactCreationFailureContext(result, mode)),
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

    const draftService = createContactAcquisitionDraftServiceForActor(
      actor.id,
      mode,
    );
    const result = await draftService.confirmContactDraft({
      ...(mode === "live" ? { actorLabel: actorLabel(actor) } : {}),
      draftId: id,
      scenario,
    });

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
