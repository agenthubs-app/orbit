import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  chatPrivacyControlsFailureContext,
  chatPrivacyControlsFailureToAppError,
  type ChatPrivacyControlsInput,
  type ChatPrivacyControlsResult,
} from "../../../../features/chat/privacy-contract";
import { createChatPrivacyControlsService } from "../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

// privacy controls 是聊天隐私状态的读取入口。
// route 只解析 conversationId/scenario；隐私默认值和可见文案由 chat privacy service 提供。
function readInput(request: Request): ChatPrivacyControlsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    conversationId: searchParams.get("conversationId"),
    scenario: searchParams.get("scenario"),
  };
}

function responseForResult(
  result: ChatPrivacyControlsResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // privacy contract 的失败统一映射到 AppError，避免 UI 依赖底层 mock/live 差异。
  if (result.success === false) {
    const appError = chatPrivacyControlsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatPrivacyControlsFailureContext(result, mode)),
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
  // GET 不改变任何隐私设置，只返回当前 conversation 的控制面板状态。
  const mode = resolveFeatureMode();
  const service = createChatPrivacyControlsService();
  const result = await service.getPrivacyControls(readInput(request));

  return responseForResult(result, mode);
}
