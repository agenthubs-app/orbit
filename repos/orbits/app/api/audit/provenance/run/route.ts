import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { SourceConsistencyProvenanceAuditInput } from "../../../../../features/audit/provenance-contract";
import {
  sourceConsistencyProvenanceAuditFailureContext,
  sourceConsistencyProvenanceAuditFailureToAppError,
} from "../../../../../features/audit/provenance-contract";
import { createSourceConsistencyProvenanceAuditService } from "../../../../../features/audit/service-factory";

export const dynamic = "force-dynamic";

// provenance audit run 是触发一次来源一致性审计的入口。
// route 不直接扫描数据源，只把请求转给 audit service 并返回标准 envelope。
function readInput(request: Request): SourceConsistencyProvenanceAuditInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function POST(request: Request): Promise<Response> {
  // POST 表示“执行审计动作”，但具体执行范围和副作用边界仍在 service 中。
  const mode = resolveFeatureMode();
  const auditService = createSourceConsistencyProvenanceAuditService();
  const result = auditService.runAudit(readInput(request));

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
