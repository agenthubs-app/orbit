import { NextResponse } from "next/server";

import { withConversationTurnSteps } from "../../../../../features/agent/runtime/conversation-run-steps";
import { agentRunProgress } from "../../../../../features/agent/runtime/service";
import type { OrbitAgentChatRequestStore } from "../../../../../features/orbit-ai/reliable-send-service";
import { createOrbitAgentChatRequestStore } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-request-store";
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
  requestStoreForActor?: (
    mode: ReturnType<typeof resolveFeatureMode>,
    actorId: string,
  ) => Pick<OrbitAgentChatRequestStore, "findByRunId"> | null;
}

type TurnLookup = Awaited<ReturnType<NonNullable<OrbitAgentChatRequestStore["findByRunId"]>>>;

/**
 * The conversation turn that produced this run (0103): its request record
 * holds the timing spans the run's steps are derived from. A failed lookup
 * is logged and leaves only the stored steps; it never hides the run.
 */
async function conversationTurnFor(
  dependencies: AiProviderRunRouteDependencies,
  mode: ReturnType<typeof resolveFeatureMode>,
  actorId: string | null,
  runId: string,
): Promise<TurnLookup> {
  try {
    const store = (dependencies.requestStoreForActor ?? createOrbitAgentChatRequestStore)(
      mode,
      actorId ?? "mock:anonymous",
    );
    return (await store?.findByRunId?.(runId)) ?? null;
  } catch (error) {
    console.warn(JSON.stringify({
      event: "agent_run_turn_lookup_failed",
      message: error instanceof Error ? error.message : "unknown",
    }));
    return null;
  }
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
      const storedRun = await agentContext.runtime.getRun(id);
      if (storedRun) {
        const agentRun = withConversationTurnSteps(
          storedRun,
          await conversationTurnFor(dependencies, mode, agentContext.actorId, id),
        );
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
