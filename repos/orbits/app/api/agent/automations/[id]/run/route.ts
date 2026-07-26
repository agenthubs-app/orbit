import { NextResponse } from "next/server";
import { runAgentAutomation } from "../../../../../../features/agent/automations/runner";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  resolveAgentAutomationRequest,
} from "../../request";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentAutomationRequest();
  if (!requestContext) return agentAutomationUnauthorizedResponse();

  try {
    const { id } = await context.params;
    const automation = await runAgentAutomation(requestContext.service, id, {
      workerId: `manual:${requestContext.actorId.slice(0, 80)}`,
    });
    return NextResponse.json({ data: { automation } });
  } catch (error) {
    return agentAutomationErrorResponse(error, {
      code: "AGENT_AUTOMATION_RUN_FAILED",
      fallback: "Agent automation could not run.",
      status: 409,
    });
  }
}
