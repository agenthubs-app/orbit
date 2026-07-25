import { NextResponse } from "next/server";
import { createOrbitAgentRuntimeService } from "../../../../../features/agent/runtime/service-factory";
import { createConfiguredExpoPushAdapter } from "../../../../../features/notifications/push-adapter";
import { createAgentWorkflowScheduler, type ScheduledBriefCandidate } from "../../../../../features/orbit-ai/workflows/scheduler";
import { createAgentPreferencesService } from "../../../../../features/agent/preferences";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.ORBIT_AGENT_WORKER_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Scheduler secret invalid." } },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as {
    candidates?: unknown;
  };
  if (!Array.isArray(body.candidates)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "candidates array required.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const preferences = await createAgentPreferencesService().get();
    const scheduler = createAgentWorkflowScheduler({
      runtime: createOrbitAgentRuntimeService(),
      push: createConfiguredExpoPushAdapter(),
      preferences,
    });
    const result = await scheduler.tick(
      body.candidates as ScheduledBriefCandidate[],
    );
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_SCHEDULER_FAILED",
          message:
            error instanceof Error ? error.message : "Scheduler tick failed.",
        },
      },
      { status: 503 },
    );
  }
}
