import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createContactAcquisitionDraftService } from "../../../features/acquisition/service-factory";
import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
} from "../../../features/acquisition/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const draftService = createContactAcquisitionDraftService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = draftService.listContactDrafts({ scenario });

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
