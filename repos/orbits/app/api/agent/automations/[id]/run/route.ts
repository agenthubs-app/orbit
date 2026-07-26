import { NextResponse } from "next/server";
import { runAgentAutomation } from "../../../../../../features/agent/automations/runner";
import { createAgentMemoryService } from "../../../../../../features/agent/memory/service-factory";
import { resolveModuleMode } from "../../../../../../shared/services/module-mode";
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
    const memory = await createAgentMemoryService({
      actorId: requestContext.actorId,
      mode: resolveModuleMode(),
    }).context();
    const automation = await runAgentAutomation(requestContext.service, id, {
      memory,
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
