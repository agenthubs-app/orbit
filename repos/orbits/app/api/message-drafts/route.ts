import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import {
  messageDraftGeneratorFailureContext,
  messageDraftGeneratorFailureToAppError,
  type MessageDraftGeneratorCreateInput,
  type MessageDraftGeneratorResult,
} from "../../../features/followups/message-draft-contract";
import { createMessageDraftGeneratorService } from "../../../features/followups/service-factory";

export const dynamic = "force-dynamic";

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
): Promise<MessageDraftGeneratorCreateInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    channel: readString(body.channel),
    contextNote: readString(body.contextNote),
    draftKind: readString(body.draftKind),
    organization: readString(body.organization),
    recipientName: readString(body.recipientName),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
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

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const draftService = createMessageDraftGeneratorService();
  const result = draftService.createDraft(await readInput(request));

  return responseForResult(result, mode);
}
