import { NextResponse } from "next/server";

import type { AgentRuntimeService } from "../../../../../features/agent/runtime/service";
import {
  eventEncounterNoteFailureContext,
  eventEncounterNoteFailureToAppError,
  type EventEncounterEvidenceInput,
  type EventEncounterNoteInput,
  type EventEncounterNotePayload,
} from "../../../../../features/events/encounter-note/contract";
import { createEventEncounterNoteService } from "../../../../../features/events/service-factory";
import { createPostEventFollowupWorkflow } from "../../../../../features/orbit-ai/workflows/post-event-followup-v1";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../_shared/agent-request-context";
import {
  withOwnedEventAccess,
  type OwnedEventAccessDependencies,
} from "../owned-event-access";

interface EventEncounterRouteContext {
  params: Promise<{ id: string }>;
}

interface EventEncounterEvidenceRouteContext {
  params: Promise<{ id: string; encounterId: string }>;
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
    contactId: url.searchParams.get("contactId"),
    eventId,
    noteText: url.searchParams.get("noteText"),
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

async function triggerPostEventFollowup(
  payload: EventEncounterNotePayload,
  runtime: AgentRuntimeService,
): Promise<void> {
  if (
    payload.state !== "success" ||
    !payload.participant ||
    !payload.encounter ||
    !payload.note
  ) {
    return;
  }

  const evidenceIds = Array.from(
    new Set([
      ...payload.participant.evidenceIds,
      ...payload.encounter.evidenceIds,
      ...payload.note.evidenceIds,
      ...(payload.evidenceDraft?.evidenceId
        ? [payload.evidenceDraft.evidenceId]
        : []),
    ]),
  );
  await createPostEventFollowupWorkflow(runtime).run({
    eventId: payload.event.id,
    eventTitle: payload.event.name,
    contactId: payload.participant.contactId,
    contactName: payload.participant.displayName,
    organization: payload.participant.organization,
    encounterId: payload.encounter.encounterId,
    noteText: payload.note.text,
    noteSource: "typed",
    noteAlreadyPersisted: true,
    relationshipContext: payload.participant.eventContext,
    evidenceIds,
    trigger: "domain_signal",
  });
}

export function createEventEncounterPostHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function createEventEncounter(
    request: Request,
    _context: EventEncounterRouteContext,
    access,
  ): Promise<Response> {
    const agentContext = await resolveAgentRequestContext(access.mode, {
      authenticate: async () => ({ user: { id: access.actor.id } }),
    });
    if (!agentContext) return agentRequestUnauthorizedResponse();

    const result = await createEventEncounterNoteService().createEncounterNote(
      await readEncounterNoteInput(request, access.eventId),
    );

    if (result.success === false) {
      const appError = eventEncounterNoteFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          eventEncounterNoteFailureContext(result, access.mode),
        ),
        {
          headers: runtimeBoundaryHeaders(access.mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    await triggerPostEventFollowup(result.data, agentContext.runtime).catch(
      (error) => {
        console.error(
          "post-event Agent trigger failed after encounter note write",
          error,
        );
      },
    );

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(access.mode),
      status: result.data.state === "success" ? 201 : 200,
    });
  }, dependencies);
}

export function createEventEncounterEvidencePostHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function createEventEncounterEvidence(
    request: Request,
    context: EventEncounterEvidenceRouteContext,
    access,
  ): Promise<Response> {
    const { encounterId } = await context.params;
    const result =
      await createEventEncounterNoteService().createEncounterEvidence(
        await readEncounterEvidenceInput(request, access.eventId, encounterId),
      );

    if (result.success === false) {
      const appError = eventEncounterNoteFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          eventEncounterNoteFailureContext(result, access.mode),
        ),
        {
          headers: runtimeBoundaryHeaders(access.mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(access.mode),
      status: 201,
    });
  }, dependencies);
}
