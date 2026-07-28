import { NextResponse } from "next/server";
import { runDueAgentAutomations } from "../../../../../features/agent/automations/runner";
import { createAgentAutomationService } from "../../../../../features/agent/automations/service-factory";
import { createAgentMemoryService } from "../../../../../features/agent/memory/service-factory";
import { createAgentOperationsService } from "../../../../../features/agent/operations/service-factory";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.ORBIT_AGENT_WORKER_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Automation worker secret is invalid.",
        },
      },
      { status: 401 },
    );
  }
  const actorId = request.headers.get("x-orbit-actor-id")?.trim();
  if (!actorId) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authenticated automation actor is required.",
        },
      },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as {
    actorId?: unknown;
    limit?: unknown;
    workspaceId?: unknown;
    workerId?: unknown;
  };
  if (body.actorId !== undefined || body.workspaceId !== undefined) {
    return NextResponse.json(
      {
        error: {
          code: "CLIENT_WORKER_IDENTITY_FORBIDDEN",
          message: "Automation worker identity comes from the server boundary.",
        },
      },
      { status: 400 },
    );
  }
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(50, Math.max(1, Math.floor(body.limit)))
      : 10;
  const workerId =
    typeof body.workerId === "string" && body.workerId.trim()
      ? body.workerId.trim().slice(0, 120)
      : "scheduled-automation-worker";

  try {
    const service = createAgentAutomationService({
      actorId: actorId.slice(0, 240),
      mode: resolveModuleMode(),
    });
    const memory = await createAgentMemoryService({
      actorId: actorId.slice(0, 240),
      mode: resolveModuleMode(),
    }).context();
    const automations = await runDueAgentAutomations(
      service,
      {
        limit,
        now: new Date().toISOString(),
        workerId,
      },
      { actorId, memory },
    );
    await createAgentOperationsService({ actorId }).recordHeartbeat({
      automationRuns: automations.length,
      outboxProcessed: 0,
      recordedAt: new Date().toISOString(),
      signalAutomationRuns: 0,
      workerId,
    });
    return NextResponse.json({ data: { automations } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_AUTOMATION_WORKER_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Automation worker failed.",
        },
      },
      { status: 503 },
    );
  }
}
