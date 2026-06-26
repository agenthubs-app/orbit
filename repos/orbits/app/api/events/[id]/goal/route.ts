import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventGoalReadinessFailureContext,
  eventGoalReadinessFailureToAppError,
  type EventGoalSetInput,
} from "../../../../../features/events/goal-contract";
import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface EventGoalRouteContext {
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

async function readGoalInput(
  request: Request,
  eventId: string,
): Promise<EventGoalSetInput> {
  const url = new URL(request.url);
  const queryInput: EventGoalSetInput = {
    eventId,
    scenario: url.searchParams.get("scenario"),
    selectedSuggestionId: url.searchParams.get("selectedSuggestionId"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      goalText: readFormText(formData, "goalText"),
      selectedSuggestionId:
        readFormText(formData, "selectedSuggestionId") ??
        queryInput.selectedSuggestionId,
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
    goalText: typeof body.goalText === "string" ? body.goalText : undefined,
    selectedSuggestionId:
      typeof body.selectedSuggestionId === "string"
        ? body.selectedSuggestionId
        : queryInput.selectedSuggestionId,
  };
}

export async function PUT(
  request: Request,
  context: EventGoalRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const goalService = createEventGoalAndReadinessService();
  const result = goalService.setGoal(await readGoalInput(request, id));

  if (result.success === false) {
    const appError = eventGoalReadinessFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventGoalReadinessFailureContext(result, mode)),
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
