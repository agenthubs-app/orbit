import { NextResponse } from "next/server";

import { agentRunProgress } from "../../../../../features/agent/runtime/service";
import {
  aiProviderFailureContext,
  aiProviderFailureToAppError,
  type AiProviderRunResult,
} from "../../../../../shared/ai/provider";
import { createAiProviderService } from "../../../../../shared/ai/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
  type AgentRequestContextDependencies,
} from "../../../_shared/agent-request-context";

interface AiProviderRunRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export interface AiProviderRunRouteDependencies {
  agentContext?: AgentRequestContextDependencies;
}

function responseForResult(
  result: AiProviderRunResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
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

export function createAiProviderRunGetHandler(
  dependencies: AiProviderRunRouteDependencies = {},
) {
  return async function getAiProviderRun(
    request: Request,
    context: AiProviderRunRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const agentContext = await resolveAgentRequestContext(
      mode,
      dependencies.agentContext,
    );
    if (!agentContext) return agentRequestUnauthorizedResponse();
    const { id } = await context.params;
    const scenario = new URL(request.url).searchParams.get("scenario");

    try {
      const agentRun = await agentContext.runtime.getRun(id);
      if (agentRun) {
        return NextResponse.json(
          success({
            ...agentRun,
            progress: agentRunProgress(agentRun),
            runKind: "agent" as const,
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      }
    } catch {
      // Agent runtime is optional for legacy provider-run lookups.
    }

    const service = createAiProviderService();
    const result = service.getRun({
      runId: id,
      scenario,
    });

    return responseForResult(result, mode);
  };
}
