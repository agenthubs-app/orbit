import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  orbitAgentConversationFailureContext,
  orbitAgentConversationFailureToAppError,
  type OrbitAgentConversationInput,
  type OrbitAgentConversationResult,
  type OrbitAgentSendMessageInput,
} from "../../../../features/orbit-ai/conversation-contract";
import { createOrbitAgentConversationService } from "../../../../features/orbit-ai/service-factory";

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

function readListInput(request: Request): OrbitAgentConversationInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

async function readSendInput(
  request: Request,
): Promise<OrbitAgentSendMessageInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    conversationId: readString(body.conversationId),
    locale: readString(body.locale),
    message: readString(body.message) ?? readString(body.prompt),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

function responseForResult(
  result: OrbitAgentConversationResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = orbitAgentConversationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, orbitAgentConversationFailureContext(result, mode)),
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

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = createOrbitAgentConversationService();
  const result = await service.listConversations(readListInput(request));

  return responseForResult(result, mode);
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = createOrbitAgentConversationService();
  const result = await service.sendMessage(await readSendInput(request));

  return responseForResult(result, mode);
}
