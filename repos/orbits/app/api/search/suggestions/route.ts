import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { createRelationshipNaturalSearchService } from "../../../../features/search/service-factory";
import {
  relationshipNaturalSearchFailureContext,
  relationshipNaturalSearchFailureToAppError,
} from "../../../../features/search/service";
import type { RelationshipNaturalSearchSuggestionsResult } from "../../../../features/search/contract";

export const dynamic = "force-dynamic";

function responseForResult(
  result: RelationshipNaturalSearchSuggestionsResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = relationshipNaturalSearchFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipNaturalSearchFailureContext(result, mode)),
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

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const searchService = createRelationshipNaturalSearchService();

  return responseForResult(searchService.getSearchSuggestions({ scenario }), mode);
}
