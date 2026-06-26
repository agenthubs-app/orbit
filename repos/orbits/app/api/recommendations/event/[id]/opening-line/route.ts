import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import { createEventRecommendationService } from "../../../../../../features/recommendations/service-factory";
import {
  eventRecommendationFailureContext,
  eventRecommendationFailureToAppError,
} from "../../../../../../features/recommendations/service";
import type { EventOpeningLineInput } from "../../../../../../features/recommendations/contract";

export const dynamic = "force-dynamic";

interface EventOpeningLineRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

async function readOpeningLineInput(
  request: Request,
  eventId: string,
): Promise<EventOpeningLineInput> {
  const url = new URL(request.url);
  const queryInput: EventOpeningLineInput = {
    attendeeId: url.searchParams.get("attendeeId"),
    eventId,
    scenario: url.searchParams.get("scenario"),
    style: url.searchParams.get("style"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      attendeeId:
        readFormText(formData, "attendeeId") ?? queryInput.attendeeId,
      style: readFormText(formData, "style") ?? queryInput.style,
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    ...queryInput,
    attendeeId:
      typeof body.attendeeId === "string"
        ? body.attendeeId
        : queryInput.attendeeId,
    style: typeof body.style === "string" ? body.style : queryInput.style,
  };
}

export async function POST(
  request: Request,
  context: EventOpeningLineRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const recommendationService = createEventRecommendationService();
  const result = recommendationService.composeOpeningLine(
    await readOpeningLineInput(request, id),
  );

  if (result.success === false) {
    const appError = eventRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventRecommendationFailureContext(result, mode)),
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
