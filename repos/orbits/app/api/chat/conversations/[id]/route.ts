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

// conversation detail route 返回旧 Chat 的消息线程。
// 这里只读 conversationId/scenario；消息构造、权限和 mock 场景在 chat service 中完成。
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

  // conversationId 来自 path param，scenario 来自 query，保持目标资源和演示状态分离。
  return {
    conversationId,
    scenario: searchParams.get("scenario"),
  };
}

function responseForResult(
  result: ChatMessageThreadResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // thread failure 统一走 chat conversation contract 的错误映射。
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
  // 动态 params 先 await，再用统一 service 读取消息线程。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatConversationMessageService();
  const result = await service.getMessageThread(readInput(request, id));

  return responseForResult(result, mode);
}
