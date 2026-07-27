import { NextResponse } from "next/server";

import {
  eventAttendeeImportFailureContext,
  eventAttendeeImportFailureToAppError,
} from "../../../../../features/acquisition/event-attendee-contract";
import { createEventAttendeeImportService } from "../../../../../features/acquisition/service-factory";
import {
  eventAttendeeRosterFailureContext,
  eventAttendeeRosterFailureToAppError,
  type EventAttendeeRosterInput,
} from "../../../../../features/events/attendee-roster/contract";
import { createEventAttendeeRosterService } from "../../../../../features/events/service-factory";
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

interface EventAttendeeRouteContext {
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

async function readEventAttendeeRosterImportInput(
  request: Request,
  eventId: string,
): Promise<EventAttendeeRosterInput> {
  const url = new URL(request.url);
  const queryInput: EventAttendeeRosterInput = {
    eventId,
    eligibleOnly: url.searchParams.get("eligibleOnly"),
    knownContactOnly: url.searchParams.get("knownContactOnly"),
    scenario: url.searchParams.get("scenario"),
    tagFilter: url.searchParams.get("tagFilter"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      eligibleOnly:
        readFormText(formData, "eligibleOnly") ?? queryInput.eligibleOnly,
      knownContactOnly:
        readFormText(formData, "knownContactOnly") ??
        queryInput.knownContactOnly,
      tagFilter: readFormText(formData, "tagFilter") ?? queryInput.tagFilter,
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
    eligibleOnly:
      typeof body.eligibleOnly === "boolean" ||
      typeof body.eligibleOnly === "string"
        ? body.eligibleOnly
        : queryInput.eligibleOnly,
    knownContactOnly:
      typeof body.knownContactOnly === "boolean" ||
      typeof body.knownContactOnly === "string"
        ? body.knownContactOnly
        : queryInput.knownContactOnly,
    tagFilter:
      typeof body.tagFilter === "string"
        ? body.tagFilter
        : queryInput.tagFilter,
  };
}

export function createEventAttendeesGetHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function getEventAttendees(
    request: Request,
    _context: EventAttendeeRouteContext,
    access,
  ): Promise<Response> {
    const searchParams = new URL(request.url).searchParams;
    const result = await createEventAttendeeImportService().listEventAttendees({
      eventId: access.eventId,
      relationshipStatusFilter: searchParams.get("relationshipStatusFilter"),
      scenario: searchParams.get("scenario"),
    });

    if (result.success === false) {
      const appError = eventAttendeeImportFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          eventAttendeeImportFailureContext(result, access.mode),
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

export function createEventAttendeeImportPostHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function importEventAttendees(
    request: Request,
    _context: EventAttendeeRouteContext,
    access,
  ): Promise<Response> {
    const result =
      await createEventAttendeeRosterService().importAttendeeRoster(
        await readEventAttendeeRosterImportInput(request, access.eventId),
      );

    if (result.success === false) {
      const appError = eventAttendeeRosterFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          eventAttendeeRosterFailureContext(result, access.mode),
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
