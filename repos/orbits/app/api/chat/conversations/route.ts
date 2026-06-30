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

// 传统 chat conversation 列表 route。
// 注意它不同于 Orbit Agent 的 `/api/ai/conversations`，这里仍是 chat mock capability。
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
  // feature failure 在 route 层统一转成 shared API envelope 和 HTTP status。
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
