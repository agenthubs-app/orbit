import { NextResponse } from "next/server";
import { createInputFromForm } from "../../../../features/agent/automations/task-form";
import { listScheduledTasks, scheduledTaskView } from "../../../../features/agent/automations/task-view";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  parseCreateAgentAutomationInput,
  languageOf,
  resolveAgentAutomationRequest,
  taskFormErrorResponse,
  taskFormFrom,
} from "./request";

export const dynamic = "force-dynamic";

export async function GET(request?: Request): Promise<Response> {
  try {
    const context = await resolveAgentAutomationRequest();
    if (!context) return agentAutomationUnauthorizedResponse();
    // AG15: `tasks` is what "my scheduled tasks" shows (the card's rows, the next expected run, the latest run).
    const [automations, tasks] = await Promise.all([
      context.service.list(),
      listScheduledTasks({ now: new Date().toISOString(), ownerId: context.actorId, service: context.service, storage: context.storage, ...languageOf(request) }),
    ]);
    return NextResponse.json({ success: true, data: { automations, tasks } }, { headers: { "cache-control": "no-store" } });
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
  // AG15 interface: 「用表单新建」 sends the form; the rule fields are written by code.
  const fromForm = await taskFormFrom(body, context.actorId);
  if (fromForm && "error" in fromForm) return taskFormErrorResponse(fromForm.error);
  if (fromForm && "form" in fromForm) {
    try {
      const automation = await context.service.create(createInputFromForm(fromForm.form, fromForm.language));
      return NextResponse.json({ success: true, data: { automation, task: scheduledTaskView(automation, null, new Date().toISOString(), fromForm.language) } }, { status: 201 });
    } catch (error) {
      return agentAutomationErrorResponse(error);
    }
  }
  const input = parseCreateAgentAutomationInput(body);
  if (!input) {
    return NextResponse.json(
      {
        success: false,
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
    return NextResponse.json({ success: true, data: { automation } }, { status: 201 });
  } catch (error) {
    return agentAutomationErrorResponse(error);
  }
}
