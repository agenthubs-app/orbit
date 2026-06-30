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

// search suggestions route 返回关系搜索的建议查询和过滤提示。
// route 只读取 scenario；建议内容和排序由 relationship search service 负责。
function responseForResult(
  result: RelationshipNaturalSearchSuggestionsResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // suggestions failure 复用 search contract 的错误映射。
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
  // GET 是只读建议入口，不执行实际搜索。
  const mode = resolveFeatureMode();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const searchService = createRelationshipNaturalSearchService();

  return responseForResult(searchService.getSearchSuggestions({ scenario }), mode);
}
