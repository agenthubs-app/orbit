import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  chatConversationMockFailureContext,
  chatConversationMockFailureToAppError,
  type ChatConversationListInput,
  type ChatConversationListResult,
} from "../../../../features/chat/service";
import { createChatConversationMessageService } from "../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

function readInput(request: Request): ChatConversationListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

function responseForResult(
  result: ChatConversationListResult,
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

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = createChatConversationMessageService();
  const result = service.listConversations(readInput(request));

  return responseForResult(result, mode);
}
