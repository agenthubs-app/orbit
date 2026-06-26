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

export const dynamic = "force-dynamic";

function readInput(request: Request): AgentActionQueueListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    actionType: searchParams.get("actionType"),
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const agentActionService = createAgentActionQueueService();
  const result = agentActionService.listActions(readInput(request));

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
