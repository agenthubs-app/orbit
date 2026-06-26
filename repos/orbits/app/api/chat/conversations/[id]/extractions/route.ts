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

  return {
    conversationId,
    scenario: searchParams.get("scenario"),
  };
}

function responseForResult(
  result: ChatSummaryExtractionResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
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
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatSummaryExtractionService();
  const result = service.extractConversationSignals(readInput(request, id));

  return responseForResult(result, mode);
}
