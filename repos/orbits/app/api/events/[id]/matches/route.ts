import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  wantConnectFailureContext,
  wantConnectFailureToAppError,
} from "../../../../../features/events/want-connect/contract";
import { createWantConnectService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// matches route 返回活动中的想认识匹配结果。
// route 只读取 eventId/scenario；匹配算法和候选解释在 want-connect service 中。
interface WantConnectMatchesRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: WantConnectMatchesRouteContext,
): Promise<Response> {
  // GET 是只读匹配视图，不创建 want-to-connect intent。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const wantConnectService = createWantConnectService();
  const result = await wantConnectService.listMatches({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // want-connect failure 统一映射成 AppError/envelope。
    const appError = wantConnectFailureToAppError(result);

    return NextResponse.json(
      failure(appError, wantConnectFailureContext(result, mode)),
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
