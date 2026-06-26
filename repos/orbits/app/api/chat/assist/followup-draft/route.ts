import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  chatWritingAssistFailureContext,
  chatWritingAssistFailureToAppError,
  type ChatWritingAssistInput,
  type ChatWritingAssistResult,
} from "../../../../../features/chat/assist-contract";
import { createChatWritingAssistService } from "../../../../../features/chat/service-factory";

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

async function readInput(request: Request): Promise<ChatWritingAssistInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    contextNote: readString(body.contextNote) ?? readString(body.note),
    conversationId: readString(body.conversationId),
    organization: readString(body.organization),
    participantName: readString(body.participantName),
    preferredWindow: readString(body.preferredWindow),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    sourceText: readString(body.sourceText),
  };
}

function responseForResult(
  result: ChatWritingAssistResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = chatWritingAssistFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatWritingAssistFailureContext(result, mode)),
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
  const service = createChatWritingAssistService();
  const result = service.draftFollowup(await readInput(request));

  return responseForResult(result, mode);
}
