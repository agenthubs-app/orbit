import { NextResponse } from "next/server";

import {
  eventGoalReadinessFailureContext,
  eventGoalReadinessFailureToAppError,
  type EventGoalSetInput,
} from "../../../../features/events/goal-readiness/contract";
import { createEventGoalAndReadinessService } from "../../../../features/events/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  withOwnedEventAccess,
  type OwnedEventAccessDependencies,
} from "./owned-event-access";

interface EventRouteContext {
  params: Promise<{ id: string }>;
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

export function createEventGoalPutHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function putEventGoal(
    request: Request,
    _context: EventRouteContext,
    access,
  ): Promise<Response> {
    const result = await createEventGoalAndReadinessService().setGoal(
      await readGoalInput(request, access.eventId),
    );

    if (result.success === false) {
      const appError = eventGoalReadinessFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          eventGoalReadinessFailureContext(result, access.mode),
        ),
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

export function createEventReadinessGetHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function getEventReadiness(
    request: Request,
    _context: EventRouteContext,
    access,
  ): Promise<Response> {
    const searchParams = new URL(request.url).searchParams;
    const result = await createEventGoalAndReadinessService().getReadiness({
      eventId: access.eventId,
      scenario: searchParams.get("scenario"),
    });

    if (result.success === false) {
      const appError = eventGoalReadinessFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          eventGoalReadinessFailureContext(result, access.mode),
        ),
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
