import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { SourceConsistencyProvenanceAuditInput } from "../../../../features/audit/provenance-contract";
import {
  sourceConsistencyProvenanceAuditFailureContext,
  sourceConsistencyProvenanceAuditFailureToAppError,
} from "../../../../features/audit/provenance-contract";
import { createSourceConsistencyProvenanceAuditService } from "../../../../features/audit/service-factory";

export const dynamic = "force-dynamic";

// provenance audit snapshot 是只读审计入口。
// route 只读取 scenario；一致性检查、证据列表和问题分组由 audit service 生成。
function readInput(request: Request): SourceConsistencyProvenanceAuditInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // GET 读取最近一次/当前 mock 审计快照，不触发重新运行。
  const mode = resolveFeatureMode();
  const auditService = createSourceConsistencyProvenanceAuditService();
  const result = await auditService.getAuditSnapshot(readInput(request));

  if (result.success === false) {
    // audit failure 使用 provenance contract 的上下文，保留运行模式和 evidence 信息。
    const appError = sourceConsistencyProvenanceAuditFailureToAppError(result);

    return NextResponse.json(
      failure(appError, sourceConsistencyProvenanceAuditFailureContext(result, mode)),
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
