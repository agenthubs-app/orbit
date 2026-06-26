import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  messageDraftGeneratorFailureContext,
  messageDraftGeneratorFailureToAppError,
  type MessageDraftGeneratorResult,
  type MessageDraftGeneratorUpdateInput,
} from "../../../../features/followups/message-draft-contract";
import { createMessageDraftGeneratorService } from "../../../../features/followups/service-factory";

export const dynamic = "force-dynamic";

interface MessageDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
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

async function readInput(
  request: Request,
  draftId: string,
): Promise<MessageDraftGeneratorUpdateInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    draftId,
    reviewerLabel: readString(body.reviewerLabel),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    status: readString(body.status),
    userEdits: readString(body.userEdits),
  };
}

function responseForResult(
  result: MessageDraftGeneratorResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = messageDraftGeneratorFailureToAppError(result);

    return NextResponse.json(
      failure(appError, messageDraftGeneratorFailureContext(result, mode)),
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

export async function PATCH(
  request: Request,
  context: MessageDraftRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const draftService = createMessageDraftGeneratorService();
  const result = draftService.updateDraft(await readInput(request, id));

  return responseForResult(result, mode);
}
