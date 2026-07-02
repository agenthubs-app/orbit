import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  chatSummaryExtractionFailureContext,
  chatSummaryExtractionFailureToAppError,
  type ChatSummaryExtractionInput,
  type ChatSummaryExtractionResult,
} from "../../../../../../features/chat/summary-contract";
import { createChatSummaryExtractionService } from "../../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

// summary route 触发旧 Chat 会话摘要提取。
// route 不直接跑摘要模型，只把 conversationId/scenario 交给 summary extraction service。
interface ChatSummaryRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readInput(
  request: Request,
  conversationId: string,
): ChatSummaryExtractionInput {
  const searchParams = new URL(request.url).searchParams;

  // POST 的资源目标来自 path，scenario 只用于 mock 摘要状态切换。
  return {
    conversationId,
    scenario: searchParams.get("scenario"),
  };
}

function responseForResult(
  result: ChatSummaryExtractionResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // summary/extraction 共享同一套失败映射，保持 Chat 分析接口一致。
  if (result.success === false) {
    const appError = chatSummaryExtractionFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatSummaryExtractionFailureContext(result, mode)),
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

export async function POST(
  request: Request,
  context: ChatSummaryRouteContext,
): Promise<Response> {
  // 生成摘要是 service 的职责，route 只处理 HTTP 边界和 envelope。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatSummaryExtractionService();
  const result = await service.summarizeConversation(readInput(request, id));

  return responseForResult(result, mode);
}
