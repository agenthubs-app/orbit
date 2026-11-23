import { NextResponse } from "next/server";
import { scheduledTaskHistory } from "../../../../../../features/agent/automations/task-view";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  languageOf,
  resolveAgentAutomationRequest,
} from "../../request";

export const dynamic = "force-dynamic";

/**
 * agent-design AG15: one scheduled task with its run history (newest period first) — what the task's page and an inbox
 * entry's detail read. Only the signed-in account's own task resolves.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentAutomationRequest();
  if (!requestContext) return agentAutomationUnauthorizedResponse();
  try {
    const { id } = await context.params;
    const history = await scheduledTaskHistory({
      automationId: id,
      ...languageOf(request),
      now: new Date().toISOString(),
      ownerId: requestContext.actorId,
      service: requestContext.service,
      storage: requestContext.storage,
    });
    if (!history) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "No scheduled task matches that id." } }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: history }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return agentAutomationErrorResponse(error, {
      code: "AGENT_AUTOMATIONS_UNAVAILABLE",
      fallback: "Agent automations are unavailable.",
      status: 503,
    });
  }
}
