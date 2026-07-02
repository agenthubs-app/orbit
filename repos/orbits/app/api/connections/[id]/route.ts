import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { createConnectionEvidenceService } from "../../../../features/connections/service-factory";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
} from "../../../../features/connections/service";
import type { ConnectionEvidenceDetailResult } from "../../../../features/connections/contract";

export const dynamic = "force-dynamic";

// connection detail route 用于查看一条关系证据链。
// HTTP 层只负责读取 connectionId/scenario；证据组装和错误判断在 service 中完成。
interface ConnectionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForResult(
  result: ConnectionEvidenceDetailResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // responseForResult 把连接详情的成功/失败响应集中在一个地方，便于其他方法复用。
  if (result.success === false) {
    const appError = connectionEvidenceFailureToAppError(result);

    return NextResponse.json(
      failure(appError, connectionEvidenceFailureContext(result, mode)),
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
  context: ConnectionRouteContext,
): Promise<Response> {
  // scenario 支持演示缺失、pending 或失败状态，默认由 service 决定正常数据。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const connectionService = createConnectionEvidenceService();
  const result = await connectionService.getConnection({
    connectionId: id,
    scenario,
  });

  return responseForResult(result, mode);
}
