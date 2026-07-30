import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
  RUNTIME_BOUNDARY_HEADER_VALUES,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";
import type {
  AsyncConversationCreateFromDraftInput,
  AsyncConversationCreateResult,
  AsyncConversationInput,
  AsyncConversationWorkspaceResult,
} from "../../../../features/chat/service";
import { createAsyncRelationshipConversationService } from "../../../../features/chat/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

function readInput(request: Request): AsyncConversationInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    conversationId: searchParams.get("conversationId"),
  };
}

function responseForResult(
  result: AsyncConversationWorkspaceResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = new AppError(
      result.error.appCode,
      result.error.message,
    );

    return NextResponse.json(
      failure(appError, {
        boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
        asyncConversationErrorCode: result.error.code,
        mode,
        privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
        provenance:
          "Async relationship conversation failure came from the selected actor-scoped service boundary.",
        service: `async-relationship-conversation-${mode}`,
      }),
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

export function createRelationshipInboxGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const service = createAsyncRelationshipConversationService(mode);
    const result = await service.getCorrespondenceWorkspace({
      ...readInput(request),
      actorDisplayName: actor?.name,
      actorId: actor?.id,
    });

    return responseForResult(result, mode);
  };
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function createResponseForResult(
  result: AsyncConversationCreateResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = new AppError(result.error.appCode, result.error.message);

    return NextResponse.json(
      failure(appError, {
        boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
        asyncConversationErrorCode: result.error.code,
        mode,
        privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
        provenance:
          "Async relationship conversation creation failed inside the selected actor-scoped service boundary.",
        service: `async-relationship-conversation-${mode}`,
      }),
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

export function createRelationshipInboxPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const body = await readJsonBody(request);
    const input: AsyncConversationCreateFromDraftInput = {
      actorDisplayName: actor?.name,
      actorId: actor?.id,
      requestId: readString(body.requestId),
      contactId: readString(body.contactId),
      participantName: readString(body.participantName),
      organization: readString(body.organization),
      subject: readString(body.subject),
      body: readString(body.body),
      sourceLabel: readString(body.sourceLabel),
      stagedAt: new Date().toISOString(),
    };
    const service = createAsyncRelationshipConversationService(mode);
    const result = await service.createConversationFromDraft(input);

    return createResponseForResult(result, mode);
  };
}
