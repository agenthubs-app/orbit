import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import { agentRunProgress } from "../../../../../../features/agent/runtime/service";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";

interface AgentRunTransitionRouteContext {
  params: Promise<{ id: string }>;
}

function errorResponse(
  message: string,
  mode: ReturnType<typeof resolveFeatureMode>,
  status: number,
): Response {
  return NextResponse.json(
    failure(
      new AppError(
        status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
        message,
      ),
    ),
    {
      headers: runtimeBoundaryHeaders(mode),
      status,
    },
  );
}

export async function POST(
  request: Request,
  context: AgentRunTransitionRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  if (body?.action !== "cancel") {
    return errorResponse(
      "Agent run transition action must be cancel.",
      mode,
      400,
    );
  }
  const { id } = await context.params;
  try {
    const detail = await agentContext.runtime.cancelRun(id);
    return NextResponse.json(
      success({
        ...detail,
        progress: agentRunProgress(detail),
        runKind: "agent" as const,
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent run transition failed.";
    return errorResponse(
      message,
      mode,
      message.includes("was not found") ? 404 : 400,
    );
  }
}
