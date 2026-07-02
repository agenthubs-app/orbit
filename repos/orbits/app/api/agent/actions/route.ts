import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { AgentActionQueueListInput } from "../../../../features/agent/service";
import {
  agentActionQueueFailureContext,
  agentActionQueueFailureToAppError,
} from "../../../../features/agent/service";
import { createAgentActionQueueService } from "../../../../features/agent/service-factory";

// Agent actions route 暴露待确认的 agent 动作队列。
// 它只列出可复核动作，不执行外部发送、排程或写入。
export const dynamic = "force-dynamic";

function readInput(request: Request): AgentActionQueueListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    actionType: searchParams.get("actionType"),
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // actionType/scenario 用于筛选 mock 队列和测试失败/空态。
  const mode = resolveFeatureMode();
  const agentActionService = createAgentActionQueueService();
  const result = await agentActionService.listActions(readInput(request));

  if (result.success === false) {
    const appError = agentActionQueueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentActionQueueFailureContext(result, mode)),
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
