import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { SourceConsistencyProvenanceAuditInput } from "../../../../features/audit/provenance-contract";
import {
  sourceConsistencyProvenanceAuditFailureContext,
  sourceConsistencyProvenanceAuditFailureToAppError,
} from "../../../../features/audit/provenance-contract";
import { createSourceConsistencyProvenanceAuditService } from "../../../../features/audit/service-factory";

export const dynamic = "force-dynamic";

function readInput(request: Request): SourceConsistencyProvenanceAuditInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const auditService = createSourceConsistencyProvenanceAuditService();
  const result = auditService.getAuditSnapshot(readInput(request));

  if (result.success === false) {
    const appError = sourceConsistencyProvenanceAuditFailureToAppError(result);

    return NextResponse.json(
      failure(appError, sourceConsistencyProvenanceAuditFailureContext(result, mode)),
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
