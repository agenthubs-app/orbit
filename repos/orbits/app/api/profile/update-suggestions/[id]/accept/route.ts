import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  createProfileSignalReviewQueueService,
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "../../../../../../features/profile/service-factory";

export const dynamic = "force-dynamic";

// accept update suggestion route 用于接受一条 profile 更新建议。
// route 只使用 path 中的 suggestion id；应用规则和状态变更在 signal review service 中。
interface AcceptSuggestionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  _request: Request,
  context: AcceptSuggestionRouteContext,
): Promise<Response> {
  // 这里不解析 body，避免调用方通过 body 改写要接受的建议。
  const mode = resolveFeatureMode();
  const signalService = createProfileSignalReviewQueueService();
  const { id } = await context.params;
  const result = await signalService.acceptUpdateSuggestion(id);

  if (result.success === false) {
    // accept failure 统一映射成 AppError/envelope。
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
