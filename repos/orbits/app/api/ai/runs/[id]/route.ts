import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createAiProviderService } from "../../../../../shared/ai/service-factory";
import {
  aiProviderFailureContext,
  aiProviderFailureToAppError,
  type AiProviderRunResult,
} from "../../../../../shared/ai/provider";

export const dynamic = "force-dynamic";

// AI run detail route 用于读取一次 provider run 的状态。
// route 只把 path id 和 scenario 转成 service input，不直接访问 provider 日志存储。
interface AiProviderRunRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForResult(
  result: AiProviderRunResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // run 查询失败同样走共享 AI provider 错误映射。
  if (result.success === false) {
    const appError = aiProviderFailureToAppError(result);

    return NextResponse.json(
      failure(appError, aiProviderFailureContext(result, mode)),
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
  context: AiProviderRunRouteContext,
): Promise<Response> {
  // 动态 params 解析后交给 provider service；scenario 只用于 mock 状态切换。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const service = createAiProviderService();
  const result = service.getRun({
    runId: id,
    scenario,
  });

  return responseForResult(result, mode);
}
