import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
} from "../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// GET /api/agent/ledger 返回操作账本列表；只读，不触发任何执行。
export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const service = createAgentLedgerService();
  const result = await service.listEntries({
    scenario: searchParams.get("scenario"),
    status: searchParams.get("status"),
  });

  if (result.success === false) {
    const appError = agentLedgerFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentLedgerFailureContext(result, mode)),
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
