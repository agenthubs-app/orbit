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
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

// update-suggestions route 返回从信号/文档中提取出的 profile 更新建议。
// route 只读取 scenario；建议排序、证据和状态由 profile signal review service 负责。
export function createProfileSuggestionGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const signalService = createProfileSignalReviewQueueService();
    const url = new URL(request.url);
    const scenario = url.searchParams.get("scenario");
    // Composed rule copy follows the caller's account language; unknown values fall back to zh.
    const language = url.searchParams.get("language");
    const result = await signalService.listUpdateSuggestions({
      actorId: actor.id,
      scenario,
      language,
    });

    if (result.success === false) {
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
  };
}
