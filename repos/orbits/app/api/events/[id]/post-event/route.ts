import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  postEventReviewFailureContext,
  postEventReviewFailureToAppError,
  type PostEventReviewInput,
} from "../../../../../features/events/post-event-review/contract";
import { createPostEventContactReviewService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// post-event review route 返回活动结束后的联系人复核视图。
// route 只读取 eventId/scenario；复核列表、建议和来源说明由 post-event service 生成。
interface PostEventReviewRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readPostEventReviewInput(
  request: Request,
  eventId: string,
): PostEventReviewInput {
  const url = new URL(request.url);

  // eventId 来自 path，scenario 用于 mock 状态切换。
  return {
    eventId,
    scenario: url.searchParams.get("scenario"),
  };
}

export async function GET(
  request: Request,
  context: PostEventReviewRouteContext,
): Promise<Response> {
  // GET 是只读复核视图，不确认联系人草稿。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const postEventReviewService = createPostEventContactReviewService();
  const result = await postEventReviewService.getPostEventReview(
    readPostEventReviewInput(request, id),
  );

  if (result.success === false) {
    // post-event failure 统一映射成 AppError/envelope。
    const appError = postEventReviewFailureToAppError(result);

    return NextResponse.json(
      failure(appError, postEventReviewFailureContext(result, mode)),
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
