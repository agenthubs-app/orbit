import { NextResponse } from "next/server";

import { auth } from "../../../auth";
import { createLedgerAgentActionQueueAdapter } from "../../../features/agent/ledger/queue-adapter";
import { createLiveAgentLedgerService } from "../../../features/agent/ledger/live-service";
import type { AgentLedgerService } from "../../../features/agent/ledger/service";
import type { AgentRuntimeService } from "../../../features/agent/runtime/service";
import { createOrbitAgentRuntimeService } from "../../../features/agent/runtime/service-factory";
import type { AgentActionQueueService } from "../../../features/agent/service";
import {
  createAgentActionQueueService,
  createAgentLedgerService,
} from "../../../features/agent/service-factory";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../shared/services/module-mode";

export interface AgentRequestContext {
  actorId: string | null;
  mode: ModuleMode;
  runtime: AgentRuntimeService;
}

export interface AgentRequestContextDependencies {
  authenticate?: () => Promise<{ user?: { id?: string | null } } | null>;
  runtimeForActor?: (
    mode: ModuleMode,
    actorId: string | null,
  ) => AgentRuntimeService;
}

/**
 * Resolves identity only on the server. Live mode requires Auth.js to provide
 * the actor; request bodies, query parameters, and client headers are never
 * considered identity sources. Mock/hybrid retain the shared deterministic
 * runtime used by existing local fixtures.
 */
export async function resolveAgentRequestContext(
  requestedMode?: ModuleMode | string,
  dependencies: AgentRequestContextDependencies = {},
): Promise<AgentRequestContext | null> {
  const mode = resolveModuleMode(requestedMode);
  const authenticate = dependencies.authenticate ?? auth;
  const session = mode === "live" ? await authenticate() : null;
  const actorId = session?.user?.id?.trim() || null;
  if (mode === "live" && !actorId) return null;

  const runtimeForActor =
    dependencies.runtimeForActor ??
    ((resolvedMode, resolvedActorId) =>
      createOrbitAgentRuntimeService(
        resolvedMode,
        resolvedActorId ? { actorId: resolvedActorId } : undefined,
      ));
  return {
    actorId,
    mode,
    runtime: runtimeForActor(mode, actorId),
  };
}

export function agentRequestUnauthorizedResponse(): Response {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in is required for Agent actions.",
      },
    },
    { status: 401 },
  );
}

export function createAgentLedgerForRequest(
  context: AgentRequestContext,
): AgentLedgerService {
  return context.mode === "live"
    ? createLiveAgentLedgerService({ runtime: context.runtime })
    : createAgentLedgerService(context.mode);
}

export function createAgentActionQueueForRequest(
  context: AgentRequestContext,
): AgentActionQueueService {
  return context.mode === "live"
    ? createLedgerAgentActionQueueAdapter({
        ledger: createLiveAgentLedgerService({ runtime: context.runtime }),
      })
    : createAgentActionQueueService(context.mode);
}
