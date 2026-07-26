import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import type { AgentSignalService } from "../../../../features/agent/signals/contract";
import { createAgentSignalService } from "../../../../features/agent/signals/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";

export interface AgentSignalRequestContext {
  actorId: string;
  service: AgentSignalService;
}

export async function resolveAgentSignalRequest(): Promise<AgentSignalRequestContext | null> {
  const session = await auth();
  const actorId = session?.user?.id?.trim();
  if (!actorId) return null;
  return {
    actorId,
    service: createAgentSignalService({
      actorId,
      mode: resolveModuleMode(),
    }),
  };
}

export function agentSignalUnauthorizedResponse(): Response {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in is required for Agent signals.",
      },
    },
    { status: 401 },
  );
}

export function agentSignalErrorResponse(error: unknown): Response {
  const notFound =
    error instanceof Error && error.message.includes("was not found");
  return NextResponse.json(
    {
      error: {
        code: notFound ? "NOT_FOUND" : "AGENT_SIGNALS_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "Agent signals are unavailable.",
      },
    },
    { status: notFound ? 404 : 503 },
  );
}
