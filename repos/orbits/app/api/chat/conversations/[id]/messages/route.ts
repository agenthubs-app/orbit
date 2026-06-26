import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  chatConversationMockFailureContext,
  chatConversationMockFailureToAppError,
  type ChatSendMessageInput,
  type ChatSendMessageResult,
} from "../../../../../../features/chat/service";
import {
  CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY,
} from "../../../../../../features/chat/contract";
import { createChatConversationMessageService } from "../../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

interface ChatConversationMessagesRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

interface JsonBodyRead {
  hasBody: boolean;
  value: JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonBodyRead> {
  const text = await request.text();

  if (!text.trim()) {
    return {
      hasBody: false,
      value: {},
    };
  }

  try {
    const body = JSON.parse(text) as unknown;

    return {
      hasBody: true,
      value: isRecord(body) ? body : {},
    };
  } catch {
    return {
      hasBody: true,
      value: {},
    };
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readInput(
  request: Request,
  conversationId: string,
): Promise<ChatSendMessageInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;
  const messageBody = readString(body.value.body);

  return {
    body:
      messageBody ??
      (body.hasBody ? null : CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY),
    conversationId,
    scenario: searchParams.get("scenario") ?? readString(body.value.scenario),
  };
}

function responseForResult(
  result: ChatSendMessageResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = chatConversationMockFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatConversationMockFailureContext(result, mode)),
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

export async function POST(
  request: Request,
  context: ChatConversationMessagesRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatConversationMessageService();
  const result = service.sendMessage(await readInput(request, id));

  return responseForResult(result, mode);
}
