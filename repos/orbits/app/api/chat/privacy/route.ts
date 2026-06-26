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
  const mode = resolveFeatureMode();
  const service = createChatPrivacyControlsService();
  const result = service.getPrivacyControls(readInput(request));

  return responseForResult(result, mode);
}
