import { NextResponse } from "next/server";
import { createOrbitAgentRuntimeService } from "../../../../../features/agent/runtime/service-factory";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const configuredSecret = process.env.ORBIT_AGENT_WORKER_SECRET?.trim();
  if (!configuredSecret) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${configuredSecret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Worker secret is invalid." } },
      { status: 401 },
    );
  }

  const actorId = request.headers.get("x-orbit-actor-id")?.trim();
  if (!actorId) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authenticated worker actor is required.",
        },
      },
      { status: 401 },
    );
  }

  try {
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
            message: "Worker identity comes from the authenticated boundary.",
          },
        },
        { status: 400 },
      );
    }
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.min(100, Math.max(1, Math.floor(body.limit)))
        : 20;
    const workerId =
      typeof body.workerId === "string" && body.workerId.trim()
        ? body.workerId.trim().slice(0, 120)
        : "internal-scheduler";
    const runtime = createOrbitAgentRuntimeService("live", {
      actorId: actorId.slice(0, 240),
    });
    const result = await runtime.processOutbox({ limit, workerId });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_WORKER_UNAVAILABLE",
          message:
            error instanceof Error ? error.message : "Agent worker failed.",
        },
      },
      { status: 503 },
    );
  }
}
