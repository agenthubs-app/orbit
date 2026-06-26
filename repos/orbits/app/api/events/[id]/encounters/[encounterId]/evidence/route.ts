import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../../shared/errors/app-error";
import {
  eventEncounterNoteFailureContext,
  eventEncounterNoteFailureToAppError,
  type EventEncounterEvidenceInput,
} from "../../../../../../../features/events/encounter-contract";
import { createEventEncounterNoteService } from "../../../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface EventEncounterEvidenceRouteContext {
  params: Promise<{
    id: string;
    encounterId: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readEncounterEvidenceInput(
  request: Request,
  eventId: string,
  encounterId: string,
): Promise<EventEncounterEvidenceInput> {
  const url = new URL(request.url);
  const queryInput: EventEncounterEvidenceInput = {
    encounterId,
    eventId,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

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
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: EventEncounterEvidenceRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { encounterId, id } = await context.params;
  const encounterNoteService = createEventEncounterNoteService();
  const result = encounterNoteService.createEncounterEvidence(
    await readEncounterEvidenceInput(request, id, encounterId),
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
    status: 201,
  });
}
