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

// extractions route 返回旧 Chat 会话中提取出的关系信号。
// route 不直接分析消息文本，只调用 summary extraction service 的信号提取能力。
interface ChatExtractionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readInput(
  request: Request,
  conversationId: string,
): ChatSummaryExtractionInput {
  const searchParams = new URL(request.url).searchParams;

  // GET 的资源目标来自 path，scenario 只用于 mock 提取状态切换。
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

export async function GET(
  request: Request,
  context: ChatExtractionRouteContext,
): Promise<Response> {
  // 提取关系信号的具体规则在 service 中；route 只返回标准 success/failure envelope。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatSummaryExtractionService();
  const result = await service.extractConversationSignals(readInput(request, id));

  return responseForResult(result, mode);
}
