import { NextResponse } from "next/server";
import type { AgentSignalService } from "../../../../features/agent/signals/contract";
import { createAgentSignalService } from "../../../../features/agent/signals/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import {
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export interface AgentSignalRequestContext {
  actorId: string;
  service: AgentSignalService;
}

export interface AgentSignalRequestDependencies {
  resolveActor?: () => Promise<Pick<AuthenticatedApiActor, "id"> | null>;
  serviceForActor?: (actorId: string) => AgentSignalService;
}

export async function resolveAgentSignalRequest(
  dependencies: AgentSignalRequestDependencies = {},
): Promise<AgentSignalRequestContext | null> {
  const actor = await (
    dependencies.resolveActor ?? resolveAuthenticatedApiActor
  )();
  const actorId = actor?.id.trim();
  if (!actorId) return null;
  return {
    actorId,
    service:
      dependencies.serviceForActor?.(actorId) ??
      createAgentSignalService({
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
