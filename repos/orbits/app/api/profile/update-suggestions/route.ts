import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  createProfileSignalReviewQueueService,
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "../../../../features/profile/service-factory";

export const dynamic = "force-dynamic";

// update-suggestions route 返回从信号/文档中提取出的 profile 更新建议。
// route 只读取 scenario；建议排序、证据和状态由 profile signal review service 负责。
export async function GET(request: Request): Promise<Response> {
  // GET 是只读 review queue，不接受或应用任何建议。
  const mode = resolveFeatureMode();
  const signalService = createProfileSignalReviewQueueService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = await signalService.listUpdateSuggestions({ scenario });

  if (result.success === false) {
    // review queue failure 统一映射成 AppError/envelope。
    const appError = profileSignalReviewQueueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, profileSignalReviewQueueFailureContext(result, mode)),
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
