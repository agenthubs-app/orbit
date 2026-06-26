import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createRelationshipValueScoringService } from "../../../../../features/analysis/service-factory";
import {
  relationshipValueFailureContext,
  relationshipValueFailureToAppError,
} from "../../../../../features/analysis/service-factory";
import type { RelationshipValueResult } from "../../../../../features/analysis/value-contract";

export const dynamic = "force-dynamic";

interface RelationshipValueRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForResult(
  result: RelationshipValueResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = relationshipValueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipValueFailureContext(result, mode)),
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

export async function GET(
  request: Request,
  context: RelationshipValueRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const relationshipValueService =
    createRelationshipValueScoringService();
  const result = relationshipValueService.getRelationshipValue({
    connectionId: id,
    scenario,
  });

  return responseForResult(result, mode);
}
