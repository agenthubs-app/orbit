import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalContactsImportFailureContext,
  externalContactsImportFailureToAppError,
} from "../../../../../features/acquisition/external-import-contract";
import { createExternalContactsImportService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const candidatesService = createExternalContactsImportService();
  const result = candidatesService.listExternalContactCandidates({
    sourceKind: searchParams.get("sourceKind"),
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = externalContactsImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalContactsImportFailureContext(result, mode)),
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
