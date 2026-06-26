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
} from "../../../../../features/events/post-event-contract";
import { createPostEventContactReviewService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

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

  return {
    eventId,
    scenario: url.searchParams.get("scenario"),
  };
}

export async function GET(
  request: Request,
  context: PostEventReviewRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const postEventReviewService = createPostEventContactReviewService();
  const result = postEventReviewService.getPostEventReview(
    readPostEventReviewInput(request, id),
  );

  if (result.success === false) {
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
