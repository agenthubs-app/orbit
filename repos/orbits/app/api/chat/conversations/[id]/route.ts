import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  chatConversationMockFailureContext,
  chatConversationMockFailureToAppError,
  type ChatMessageThreadInput,
  type ChatMessageThreadResult,
} from "../../../../../features/chat/service";
import { createChatConversationMessageService } from "../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

interface ChatConversationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readInput(
  request: Request,
  conversationId: string,
): ChatMessageThreadInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    conversationId,
    scenario: searchParams.get("scenario"),
  };
}

function responseForResult(
  result: ChatMessageThreadResult,
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
    status: 200,
  });
}

export async function GET(
  request: Request,
  context: ChatConversationRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatConversationMessageService();
  const result = service.getMessageThread(readInput(request, id));

  return responseForResult(result, mode);
}
