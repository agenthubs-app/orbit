import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
} from "../../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// PATCH /api/agent/ledger/[id]/draft 编辑消息草稿。
// 草稿永远只是草稿：这里不存在任何发送路径。
interface AgentLedgerDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function PATCH(
  request: Request,
  context: AgentLedgerDraftRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }
  const service = createAgentLedgerService();
  const result = await service.updateDraft({
    draftText: readString(body.draftText),
    entryId: id,
    field: readString(body.field),
    operationId: readString(body.operationId),
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
