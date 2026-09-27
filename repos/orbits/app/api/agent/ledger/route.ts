import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { isAgentActionCursor } from "../../../../features/agent/runtime/repository";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
} from "../../../../features/agent/ledger/contract";
import {
  agentRequestUnauthorizedResponse,
  createAgentLedgerForRequest,
  resolveAgentRequestContext,
} from "../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// GET /api/agent/ledger 返回操作账本列表；只读，不触发任何执行。
export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const service = createAgentLedgerForRequest(agentContext);
  const cursor = searchParams.get("cursor");
  if (cursor !== null && !isAgentActionCursor(cursor)) {
    const appError = new AppError("VALIDATION_ERROR", "The ledger cursor is not valid.");
    return NextResponse.json(failure(appError, { mode }), {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    });
  }
  const result = await service.listEntries({
    cursor,
    limit: searchParams.get("limit"),
    createdAfter: searchParams.get("createdAfter"),
    createdBefore: searchParams.get("createdBefore"),
    scenario: searchParams.get("scenario"),
    status: searchParams.get("status"),
    workflowKey: searchParams.get("workflow"),
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
