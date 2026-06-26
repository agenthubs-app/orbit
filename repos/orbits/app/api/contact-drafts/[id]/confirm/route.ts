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
  qrScanConnectFailureContext,
  qrScanConnectFailureToAppError,
} from "../../../../../features/acquisition/qr-contract";
import {
  businessCardReviewFailureContext,
  businessCardReviewFailureToAppError,
} from "../../../../../features/acquisition/business-card-review-contract";
import { createBusinessCardReviewService } from "../../../../../features/acquisition/service-factory";
import { createManualContactCreationService } from "../../../../../features/acquisition/service-factory";
import { createQrScanConnectService } from "../../../../../features/acquisition/service-factory";
import { createContactAcquisitionDraftService } from "../../../../../features/acquisition/service-factory";
import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
} from "../../../../../features/acquisition/service";

export const dynamic = "force-dynamic";

interface ConfirmContactDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  context: ConfirmContactDraftRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");

  if (id === "demo-qr-draft") {
    const qrService = createQrScanConnectService();
    const result = qrService.confirmQrConnectionDraft({
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

  if (id === "demo-business-card-draft") {
    const reviewService = createBusinessCardReviewService();
    const result = reviewService.confirmReviewedDraft({
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

  if (id === "demo-manual-draft") {
    const manualService = createManualContactCreationService();
    const result = manualService.confirmManualContactDraft({
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

  const draftService = createContactAcquisitionDraftService();
  const result = draftService.confirmContactDraft({
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
}
