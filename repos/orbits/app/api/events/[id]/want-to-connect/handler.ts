import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import {
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "../../../../../features/events/event-crud-and-import/service";
import {
  wantConnectFailureContext,
  wantConnectFailureToAppError,
  type WantConnectIntentInput,
} from "../../../../../features/events/want-connect/contract";
import {
  createEventCrudAndImportService,
  createWantConnectService,
} from "../../../../../features/events/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

interface WantConnectRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type WantConnectRequestInput = Pick<
  WantConnectIntentInput,
  "scenario" | "targetContactId"
>;

interface WantConnectPostHandlerDependencies {
  createEventService?: typeof createEventCrudAndImportService;
  createWantConnectService?: typeof createWantConnectService;
  resolveActor?: ResolveAuthenticatedApiActor;
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

async function readWantConnectInput(
  request: Request,
): Promise<WantConnectRequestInput> {
  const url = new URL(request.url);
  const queryInput: WantConnectRequestInput = {
    scenario: url.searchParams.get("scenario"),
    targetContactId: url.searchParams.get("targetContactId"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      targetContactId:
        readFormText(formData, "targetContactId") ??
        queryInput.targetContactId,
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

  // Actor 和 event identity 都来自服务端会话及 path；请求体只能选当前活动的目标。
  return {
    ...queryInput,
    targetContactId:
      typeof body.targetContactId === "string"
        ? body.targetContactId
        : queryInput.targetContactId,
  };
}

function targetValidationResponse(mode: ReturnType<typeof resolveFeatureMode>) {
  const appError = new AppError(
    "VALIDATION_ERROR",
    "Choose a source-backed match from this event before recording an intent.",
  );

  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      mode,
      privacy: "event-match-target-required",
      provenance:
        "The write was rejected before the want-connect intent service ran.",
      service: "event-want-connect",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

export function createWantConnectPostHandler({
  createEventService = createEventCrudAndImportService,
  createWantConnectService: createWantConnect = createWantConnectService,
  resolveActor = resolveAuthenticatedApiActor,
}: WantConnectPostHandlerDependencies = {}) {
  return async function POST(
    request: Request,
    context: WantConnectRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const { id } = await context.params;
    const input = await readWantConnectInput(request);
    const eventResult = await createEventService(mode).getEvent({
      actorId: actor.id,
      eventId: id,
    });

    if (eventResult.success === false) {
      const appError = eventCrudImportFailureToAppError(eventResult);

      return NextResponse.json(
        failure(appError, eventCrudImportFailureContext(eventResult, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    const wantConnectService = createWantConnect(mode);
    const matchesResult = await wantConnectService.listMatches({
      eventId: id,
      scenario: input.scenario,
    });

    if (matchesResult.success === false) {
      const appError = wantConnectFailureToAppError(matchesResult);

      return NextResponse.json(
        failure(appError, wantConnectFailureContext(matchesResult, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    const targetContactId = input.targetContactId?.trim();
    const allowedTargetContactIds = new Set(
      matchesResult.data.matches.flatMap((match) =>
        match.participantContactIds.filter(
          (contactId) =>
            contactId !== actor.id && contactId !== "contact:operator",
        ),
      ),
    );

    if (!targetContactId || !allowedTargetContactIds.has(targetContactId)) {
      return targetValidationResponse(mode);
    }

    const result = await wantConnectService.createWantToConnectIntent({
      actorContactId: actor.id,
      eventId: id,
      scenario: input.scenario,
      targetContactId,
    });

    if (result.success === false) {
      const appError = wantConnectFailureToAppError(result);

      return NextResponse.json(
        failure(appError, wantConnectFailureContext(result, mode)),
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
  };
}
