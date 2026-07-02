import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  duplicateMergeFailureContext,
  duplicateMergeFailureToAppError,
} from "../../../../features/acquisition/merge-contract";
import { createDuplicateMergeService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// merge-suggestions route 返回潜在重复联系人合并建议。
// route 只读取 scenario；重复检测、证据和建议排序由 duplicate merge service 负责。
export async function GET(request: Request): Promise<Response> {
  // 该接口只读，不执行合并动作。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const searchParams = new URL(request.url).searchParams;
  const mergeService = createDuplicateMergeService();
  const result = await mergeService.listMergeSuggestions({
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // merge failure 使用 acquisition merge contract 的上下文。
    const appError = duplicateMergeFailureToAppError(result);

    return NextResponse.json(
      failure(appError, duplicateMergeFailureContext(result, mode)),
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
