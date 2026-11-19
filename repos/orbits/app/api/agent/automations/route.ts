import { NextResponse } from "next/server";
import { listScheduledTasks } from "../../../../features/agent/automations/task-view";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  parseCreateAgentAutomationInput,
  resolveAgentAutomationRequest,
} from "./request";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const context = await resolveAgentAutomationRequest();
    if (!context) return agentAutomationUnauthorizedResponse();
    // AG15: `tasks` is what "my scheduled tasks" shows (the card's rows, the next expected run, the latest run).
    const [automations, tasks] = await Promise.all([
      context.service.list(),
      listScheduledTasks({ now: new Date().toISOString(), ownerId: context.actorId, service: context.service, storage: context.storage }),
    ]);
    return NextResponse.json({ data: { automations, tasks } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return agentAutomationErrorResponse(error, {
      code: "AGENT_AUTOMATIONS_UNAVAILABLE",
      fallback: "Agent automations are unavailable.",
      status: 503,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const context = await resolveAgentAutomationRequest();
  if (!context) return agentAutomationUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as unknown;
  const input = parseCreateAgentAutomationInput(body);
  if (!input) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "capabilityId, title, instruction, schedule, and delivery are required.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const automation = await context.service.create(input);
    return NextResponse.json({ data: { automation } }, { status: 201 });
  } catch (error) {
    return agentAutomationErrorResponse(error);
  }
}
