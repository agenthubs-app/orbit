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

// relationship-value detail route 返回单条关系的价值评分视图。
// 评分计算和 evidence 汇总在 analysis service；route 只做 id/scenario 适配。
interface RelationshipValueRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForResult(
  result: RelationshipValueResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // analysis failure 在 HTTP 层统一变成 AppError/envelope，便于页面复用错误处理。
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
  // path id 在业务层是 connectionId，不在 route 里解释或校验关系数据。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const relationshipValueService =
    createRelationshipValueScoringService();
  const result = await relationshipValueService.getRelationshipValue({
    connectionId: id,
    scenario,
  });

  return responseForResult(result, mode);
}
