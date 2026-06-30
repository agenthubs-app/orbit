import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalActionSandboxFailureContext,
  externalActionSandboxFailureToAppError,
  type ExternalActionAuditListInput,
} from "../../../../../features/agent/external-action-contract";
import { createExternalActionSandboxService } from "../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// sandbox external action audit route 返回沙箱外部动作审计记录。
// route 只读取 scenario；审计记录生成和排序由 external action sandbox service 负责。
function readInput(request: Request): ExternalActionAuditListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // GET 是只读审计视图，不发送任何外部消息。
  const mode = resolveFeatureMode();
  const service = createExternalActionSandboxService();
  const result = service.listAuditRecords(readInput(request));

  if (result.success === false) {
    // sandbox failure 统一映射成 AppError/envelope。
    const appError = externalActionSandboxFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalActionSandboxFailureContext(result, mode)),
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
