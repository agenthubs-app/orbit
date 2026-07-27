import { NextResponse } from "next/server";

import {
  postEventReviewFailureContext,
  postEventReviewFailureToAppError,
  type PostEventReviewInput,
} from "../../../../../features/events/post-event-review/contract";
import { createPostEventContactReviewService } from "../../../../../features/events/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  withOwnedEventAccess,
  type OwnedEventAccessDependencies,
} from "../owned-event-access";

interface PostEventReviewRouteContext {
  params: Promise<{ id: string }>;
}

function readPostEventReviewInput(
  request: Request,
  eventId: string,
): PostEventReviewInput {
  return {
    eventId,
    scenario: new URL(request.url).searchParams.get("scenario"),
  };
}

export function createPostEventReviewGetHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function getPostEventReview(
    request: Request,
    _context: PostEventReviewRouteContext,
    access,
  ): Promise<Response> {
    const result =
      await createPostEventContactReviewService().getPostEventReview(
        readPostEventReviewInput(request, access.eventId),
      );

    if (result.success === false) {
      const appError = postEventReviewFailureToAppError(result);

      return NextResponse.json(
        failure(appError, postEventReviewFailureContext(result, access.mode)),
        {
          headers: runtimeBoundaryHeaders(access.mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(access.mode),
      status: 200,
    });
  }, dependencies);
}
