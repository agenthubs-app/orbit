import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventEncounterNoteFailureContext,
  eventEncounterNoteFailureToAppError,
  type EventEncounterNoteInput,
} from "../../../../../features/events/encounter-contract";
import { createEventEncounterNoteService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface EventEncounterNoteRouteContext {
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

async function readEncounterNoteInput(
  request: Request,
  eventId: string,
): Promise<EventEncounterNoteInput> {
  const url = new URL(request.url);
  const queryInput: EventEncounterNoteInput = {
    contactId: url.searchParams.get("contactId") ?? "contact:priya-shah",
    eventId,
    noteText:
      url.searchParams.get("noteText") ??
      "Priya asked for a storage pilot introduction.",
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      contactId: readFormText(formData, "contactId") ?? queryInput.contactId,
      noteText: readFormText(formData, "noteText") ?? queryInput.noteText,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
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
    contactId:
      typeof body.contactId === "string"
        ? body.contactId
        : queryInput.contactId,
    noteText:
      typeof body.noteText === "string" ? body.noteText : queryInput.noteText,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: EventEncounterNoteRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const encounterNoteService = createEventEncounterNoteService();
  const result = encounterNoteService.createEncounterNote(
    await readEncounterNoteInput(request, id),
  );

  if (result.success === false) {
    const appError = eventEncounterNoteFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventEncounterNoteFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: result.data.state === "success" ? 201 : 200,
  });
}
