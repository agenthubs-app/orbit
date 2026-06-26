import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import type { FollowupTaskGenerationListInput } from "../../../features/followups/contract";
import { createFollowupTaskGenerationService } from "../../../features/followups/service-factory";
import {
  followupTaskGenerationFailureContext,
  followupTaskGenerationFailureToAppError,
} from "../../../features/followups/service";

export const dynamic = "force-dynamic";

function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

function readInput(request: Request): FollowupTaskGenerationListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    limit: readLimit(searchParams),
    scenario: searchParams.get("scenario"),
    triggerKind: searchParams.get("triggerKind"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const taskService = createFollowupTaskGenerationService();
  const result = taskService.listTasks(readInput(request));

  if (result.success === false) {
    const appError = followupTaskGenerationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, followupTaskGenerationFailureContext(result, mode)),
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
